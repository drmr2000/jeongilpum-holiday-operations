import { env } from "cloudflare:workers";
import { OPERATOR_ACTOR, requireOperatorApi } from "../../../lib/operator-session";
import { workItemEventType } from "../../../lib/work-item-events";
import {
  WORK_STATUS_OPTIONS,
  prepareWorkStatusTransition,
  type WorkStatus,
} from "../../../lib/work-status";

type Payload = {
  workItemId?: string;
  status?: string;
  expectedVersion?: number;
  idempotencyKey?: string;
};
type Current = {
  id: string;
  order_id: string;
  work_status: WorkStatus;
  version: number;
};

const runtimeEnv = env as typeof env & { DB: D1Database };

function eventStatusMatches(value: string | null, status: WorkStatus) {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as { workStatus?: unknown };
    return parsed.workStatus === status;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as Payload;
    const workItemId = payload.workItemId?.trim() ?? "";
    const status = payload.status?.trim() ?? "";
    const idempotencyKey = payload.idempotencyKey?.trim() ?? "";
    if (!workItemId || !WORK_STATUS_OPTIONS.includes(status as WorkStatus) || !Number.isInteger(payload.expectedVersion) || !idempotencyKey) {
      return Response.json({ error: "작업 상태와 중복방지 키를 확인해주세요." }, { status: 400 });
    }
    const nextStatus = status as WorkStatus;

    const eventType = workItemEventType("work_status_changed", idempotencyKey);
    const prior = await runtimeEnv.DB.prepare(`
      SELECT to_value
      FROM work_item_events
      WHERE work_item_id=? AND event_type=?
      LIMIT 1
    `).bind(workItemId, eventType).first<{ to_value: string | null }>();
    if (prior) {
      if (eventStatusMatches(prior.to_value, nextStatus)) {
        return Response.json({ ok: true, alreadyApplied: true, status: nextStatus });
      }
      return Response.json({ error: "같은 중복방지 키에 다른 작업 상태를 사용할 수 없습니다." }, { status: 409 });
    }

    const current = await runtimeEnv.DB.prepare(`
      SELECT id,order_id,work_status,version
      FROM work_items
      WHERE id=?
    `).bind(workItemId).first<Current>();
    if (!current) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    if (current.version !== payload.expectedVersion) {
      return Response.json({
        error: "다른 작업자가 먼저 수정했습니다. 최신 내용을 다시 확인해주세요.",
        latestVersion: current.version,
      }, { status: 409 });
    }
    const now = new Date().toISOString();
    const transition = prepareWorkStatusTransition(runtimeEnv.DB, {
      nextStatus,
      now,
      whereSql: "id=? AND version=?",
      whereBindings: [current.id, current.version],
    });
    const results = await runtimeEnv.DB.batch([
      transition,
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(
          id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at
        )
        SELECT ?,?,?,?,?,?,?,?
        WHERE EXISTS(
          SELECT 1
          FROM work_items
          WHERE id=? AND version=? AND work_status=?
        )
        AND NOT EXISTS(
          SELECT 1
          FROM work_item_events
          WHERE work_item_id=? AND event_type=?
        )
      `).bind(
        crypto.randomUUID(),
        current.id,
        current.order_id,
        eventType,
        JSON.stringify({ workStatus: current.work_status }),
        JSON.stringify({ workStatus: nextStatus, idempotencyKey }),
        OPERATOR_ACTOR,
        now,
        current.id,
        current.version + 1,
        nextStatus,
        current.id,
        eventType,
      ),
    ]);
    if (!results[0].meta.changes || !results[1].meta.changes) {
      const applied = await runtimeEnv.DB.prepare(`
        SELECT id
        FROM work_item_events
        WHERE work_item_id=? AND event_type=?
        LIMIT 1
      `).bind(workItemId, eventType).first<{ id: string }>();
      if (applied) return Response.json({ ok: true, alreadyApplied: true, status: nextStatus });
      return Response.json({ error: "작업 상태가 변경되었습니다. 최신 내용을 다시 확인해주세요." }, { status: 409 });
    }

    return Response.json({
      ok: true,
      status: nextStatus,
      version: current.version + 1,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "작업 상태를 변경하지 못했습니다." },
      { status: 500 },
    );
  }
}
