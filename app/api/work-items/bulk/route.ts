import { env } from "cloudflare:workers";
import { OPERATOR_ACTOR, requireOperatorApi } from "../../../lib/operator-session";
import { workItemEventType } from "../../../lib/work-item-events";
import {
  prepareWorkStatusTransition,
  type WorkStatus,
} from "../../../lib/work-status";

type PaymentStatus = "unpaid" | "partial" | "paid";

type Selection = {
  id: string;
  expectedVersion: number;
};

type CurrentWorkItem = {
  id: string;
  order_id: string;
  version: number;
  work_status: WorkStatus;
  due_at: string;
  line_total: number;
  payment_status: PaymentStatus;
  paid_amount: number;
  order_version: number;
};

const runtimeEnv = env as typeof env & { DB: D1Database };
const WORK_STATUSES: WorkStatus[] = ["received", "confirmed", "in_progress", "ready", "completed", "cancelled"];
const PAYMENT_STATUSES: PaymentStatus[] = ["unpaid", "partial", "paid"];
const MAX_BULK_ITEMS = 100;
const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

class RequestError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDueAt(value: string) {
  return isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
}

function parseSelection(value: unknown): Selection[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_BULK_ITEMS) {
    throw new RequestError(`작업은 한 번에 1개부터 ${MAX_BULK_ITEMS}개까지 선택할 수 있습니다.`);
  }
  const selection = value.map((item) => {
    if (!isRecord(item)) throw new RequestError("선택한 작업 정보를 확인해주세요.");
    const id = clean(item.id);
    const expectedVersion = item.expectedVersion;
    if (!id || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
      throw new RequestError("선택한 작업 정보를 확인해주세요.");
    }
    return { id, expectedVersion: Number(expectedVersion) };
  });
  if (new Set(selection.map((item) => item.id)).size !== selection.length) {
    throw new RequestError("같은 작업을 중복 선택할 수 없습니다.");
  }
  return selection;
}

function selectionPredicate(selection: Selection[], table = "") {
  const prefix = table ? `${table}.` : "";
  return selection.map(() => `(${prefix}id=? AND ${prefix}version=?)`).join(" OR ");
}

function selectionBindings(selection: Selection[]) {
  return selection.flatMap((item) => [item.id, item.expectedVersion]);
}

function allSelectionMatches(selection: Selection[]) {
  return `(SELECT COUNT(*) FROM work_items WHERE ${selectionPredicate(selection)})=?`;
}

function allSelectionBindings(selection: Selection[]) {
  return [...selectionBindings(selection), selection.length];
}

async function selectedWorkItems(selection: Selection[]) {
  const ids = selection.map((item) => item.id);
  const rows = await runtimeEnv.DB.prepare(`
    SELECT w.id,w.order_id,w.version,w.work_status,w.due_at,w.line_total,
      o.payment_status,o.paid_amount,o.version AS order_version
    FROM work_items w
    JOIN orders o ON o.id=w.order_id
    WHERE w.id IN (${ids.map(() => "?").join(",")})
  `).bind(...ids).all<CurrentWorkItem>();
  if (rows.results.length !== selection.length) return null;
  const byId = new Map(rows.results.map((row) => [row.id, row]));
  const ordered = selection.map((item) => byId.get(item.id));
  if (ordered.some((item) => !item)) return null;
  if (ordered.some((item, index) => item!.version !== selection[index].expectedVersion)) return null;
  return ordered as CurrentWorkItem[];
}

function safeEventValue(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function orderIds(rows: CurrentWorkItem[]) {
  return [...new Set(rows.map((row) => row.order_id))];
}

function orderVersionRows(rows: CurrentWorkItem[]) {
  const versions = new Map<string, number>();
  for (const row of rows) versions.set(row.order_id, row.order_version);
  return [...versions.entries()].map(([id, version]) => ({ id, version }));
}

function orderVersionPredicate(rows: { id: string; version: number }[]) {
  return rows.map(() => "(id=? AND version=?)").join(" OR ");
}

function orderVersionBindings(rows: { id: string; version: number }[]) {
  return rows.flatMap((row) => [row.id, row.version]);
}

function allOrderVersionsMatch(rows: { id: string; version: number }[]) {
  return `(SELECT COUNT(*) FROM orders WHERE ${orderVersionPredicate(rows)})=?`;
}

export async function PATCH(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as unknown;
    if (!isRecord(payload)) throw new RequestError("일괄 처리 정보를 확인해주세요.");
    const action = clean(payload.action);
    const selection = parseSelection(payload.items);
    const current = await selectedWorkItems(selection);
    if (!current) {
      return Response.json({ error: "다른 화면에서 작업이 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }

    if (action === "status") {
      if (typeof payload.workStatus !== "string" || !WORK_STATUSES.includes(payload.workStatus as WorkStatus)) {
        throw new RequestError("작업 상태를 확인해주세요.");
      }
      const workStatus = payload.workStatus as WorkStatus;
      const changed = current.filter((row) => row.work_status !== workStatus);
      if (!changed.length) {
        return Response.json({
          action,
          affected: 0,
          workItemVersions: [],
        });
      }
      const changedSelection = changed.map((row) => ({
        id: row.id,
        expectedVersion: row.version,
      }));
      const now = new Date().toISOString();
      const transition = prepareWorkStatusTransition(runtimeEnv.DB, {
        nextStatus: workStatus,
        now,
        whereSql: `(${selectionPredicate(changedSelection)}) AND ${allSelectionMatches(changedSelection)}`,
        whereBindings: [...selectionBindings(changedSelection), ...allSelectionBindings(changedSelection)],
      });
      const idempotencyKey = clean(payload.idempotencyKey) || crypto.randomUUID();
      const eventType = workItemEventType("work_status_changed", idempotencyKey);
      const results = await runtimeEnv.DB.batch([
        transition,
        ...changed.map((row) =>
          runtimeEnv.DB.prepare(`
            INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
            SELECT ?,?,?,?, ?,?,?,?
            WHERE EXISTS(SELECT 1 FROM work_items WHERE id=? AND version=?)
          `).bind(
            crypto.randomUUID(),
            row.id,
            row.order_id,
            eventType,
            safeEventValue({ workStatus: row.work_status }),
            safeEventValue({
              workStatus,
              bulk: true,
              idempotencyKey,
            }),
            OPERATOR_ACTOR,
            now,
            row.id,
            row.version + 1,
          )),
      ]);
      if (results[0].meta.changes !== changed.length) {
        return Response.json({ error: "다른 화면에서 작업이 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      return Response.json({
        action,
        affected: changed.length,
        workItemVersions: changed.map((row) => ({ id: row.id, version: row.version + 1 })),
      });
    }

    if (action === "due_at") {
      const dueAt = clean(payload.dueAt);
      if (!validDueAt(dueAt)) throw new RequestError("수령일시 형식을 확인해주세요.");
      const now = new Date().toISOString();
      const results = await runtimeEnv.DB.batch([
        runtimeEnv.DB.prepare(`
          UPDATE work_items
          SET due_at=?,version=version+1,updated_at=?
          WHERE (${selectionPredicate(selection)}) AND ${allSelectionMatches(selection)}
        `).bind(dueAt, now, ...selectionBindings(selection), ...allSelectionBindings(selection)),
        ...current.map((row) =>
          runtimeEnv.DB.prepare(`
            INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
            SELECT ?,?,?,?, ?,?,?,?
            WHERE EXISTS(SELECT 1 FROM work_items WHERE id=? AND version=?)
          `).bind(
            crypto.randomUUID(),
            row.id,
            row.order_id,
            "work_item_due_at_changed",
            safeEventValue({ dueAt: row.due_at }),
            safeEventValue({ dueAt, bulk: true }),
            OPERATOR_ACTOR,
            now,
            row.id,
            row.version + 1,
          )),
      ]);
      if (results[0].meta.changes !== selection.length) {
        return Response.json({ error: "다른 화면에서 작업이 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      return Response.json({
        action,
        affected: selection.length,
        workItemVersions: current.map((row) => ({ id: row.id, version: row.version + 1 })),
      });
    }

    if (action === "payment") {
      if (typeof payload.paymentStatus !== "string" || !PAYMENT_STATUSES.includes(payload.paymentStatus as PaymentStatus)) {
        throw new RequestError("결제 상태를 확인해주세요.");
      }
      if (!Number.isInteger(payload.paidAmount) || Number(payload.paidAmount) < 0) {
        throw new RequestError("결제 금액은 0 이상의 정수여야 합니다.");
      }
      const paymentStatus = payload.paymentStatus as PaymentStatus;
      const paidAmount = Number(payload.paidAmount);
      const orders = orderVersionRows(current);
      const updatedOrders = orders.map((order) => ({ id: order.id, version: order.version + 1 }));
      const now = new Date().toISOString();
      const results = await runtimeEnv.DB.batch([
        ...orders.map((order) =>
          runtimeEnv.DB.prepare(`
            UPDATE orders
            SET payment_status=?,paid_amount=?,version=version+1,updated_at=?
            WHERE id=? AND version=?
              AND ${allSelectionMatches(selection)}
          `).bind(
            paymentStatus,
            paidAmount,
            now,
            order.id,
            order.version,
            ...allSelectionBindings(selection),
          )),
        runtimeEnv.DB.prepare(`
          UPDATE work_items
          SET version=version+1,updated_at=?
          WHERE (${selectionPredicate(selection)})
            AND ${allSelectionMatches(selection)}
            AND ${allOrderVersionsMatch(updatedOrders)}
        `).bind(
          now,
          ...selectionBindings(selection),
          ...allSelectionBindings(selection),
          ...orderVersionBindings(updatedOrders),
          updatedOrders.length,
        ),
        ...current.map((row) =>
          runtimeEnv.DB.prepare(`
            INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
            SELECT ?,?,?,?, ?,?,?,?
            WHERE EXISTS(SELECT 1 FROM work_items WHERE id=? AND version=?)
          `).bind(
            crypto.randomUUID(),
            row.id,
            row.order_id,
            "payment_changed",
            safeEventValue({ paymentStatus: row.payment_status, paidAmount: row.paid_amount }),
            safeEventValue({ paymentStatus, paidAmount, bulk: true }),
            OPERATOR_ACTOR,
            now,
            row.id,
            row.version + 1,
          )),
      ]);
      if (
        results.slice(0, orders.length).some((result) => result.meta.changes !== 1)
        || results[orders.length].meta.changes !== selection.length
      ) {
        return Response.json({ error: "다른 화면에서 작업 또는 결제 정보가 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      return Response.json({
        action,
        affected: selection.length,
        orderIds: orders.map((order) => order.id),
        workItemVersions: current.map((row) => ({ id: row.id, version: row.version + 1 })),
      });
    }

    if (action === "duplicate") {
      const created = current.map((row) => ({ source: row, id: crypto.randomUUID() }));
      const createdIds = created.map((item) => item.id);
      const affectedOrderIds = orderIds(current);
      const orders = orderVersionRows(current);
      const now = new Date().toISOString();
      const results = await runtimeEnv.DB.batch([
        ...created.map((item) =>
          runtimeEnv.DB.prepare(`
            INSERT INTO work_items(
              id,order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total,
              delivery_method,due_at,work_status,recipient_name,recipient_phone,postal_code,
              road_addr,road_addr_reference,jibun_addr,detail_addr,customization_json,note,
              version,created_at,updated_at
            )
            SELECT ?,order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total,
              delivery_method,due_at,work_status,recipient_name,recipient_phone,postal_code,
              road_addr,road_addr_reference,jibun_addr,detail_addr,customization_json,note,
              1,?,?
            FROM work_items
            WHERE id=? AND version=?
              AND ${allSelectionMatches(selection)}
              AND ${allOrderVersionsMatch(orders)}
          `).bind(
            item.id,
            now,
            now,
            item.source.id,
            item.source.version,
            ...allSelectionBindings(selection),
            ...orderVersionBindings(orders),
            orders.length,
          )),
        runtimeEnv.DB.prepare(`
          UPDATE orders
          SET total_amount=total_amount+COALESCE((
            SELECT SUM(work_items.line_total)
            FROM work_items
            WHERE work_items.id IN (${createdIds.map(() => "?").join(",")})
              AND work_items.order_id=orders.id
          ),0),version=version+1,updated_at=?
          WHERE id IN (${affectedOrderIds.map(() => "?").join(",")})
            AND (SELECT COUNT(*) FROM work_items WHERE id IN (${createdIds.map(() => "?").join(",")}))=?
        `).bind(...createdIds, now, ...affectedOrderIds, ...createdIds, createdIds.length),
        ...created.map((item) =>
          runtimeEnv.DB.prepare(`
            INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
            SELECT ?,?,?,?,NULL,?,?,?
            WHERE EXISTS(SELECT 1 FROM work_items WHERE id=?)
          `).bind(
            crypto.randomUUID(),
            item.id,
            item.source.order_id,
            "work_item_duplicated",
            safeEventValue({ sourceId: item.source.id, bulk: true }),
            OPERATOR_ACTOR,
            now,
            item.id,
          )),
      ]);
      if (results.slice(0, created.length).some((result) => result.meta.changes !== 1)) {
        return Response.json({ error: "다른 화면에서 작업이 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      return Response.json({ action, affected: selection.length, createdIds });
    }

    if (action === "delete") {
      const ids = selection.map((item) => item.id);
      const affectedOrderIds = orderIds(current);
      const orders = orderVersionRows(current);
      const updatedOrders = orders.map((order) => ({ id: order.id, version: order.version + 1 }));
      const now = new Date().toISOString();
      const results = await runtimeEnv.DB.batch([
        runtimeEnv.DB.prepare(`
          UPDATE orders
          SET total_amount=total_amount-COALESCE((
            SELECT SUM(work_items.line_total)
            FROM work_items
            WHERE work_items.id IN (${ids.map(() => "?").join(",")})
              AND work_items.order_id=orders.id
          ),0),version=version+1,updated_at=?
          WHERE id IN (${affectedOrderIds.map(() => "?").join(",")})
            AND ${allSelectionMatches(selection)}
            AND ${allOrderVersionsMatch(orders)}
        `).bind(
          ...ids,
          now,
          ...affectedOrderIds,
          ...allSelectionBindings(selection),
          ...orderVersionBindings(orders),
          orders.length,
        ),
        runtimeEnv.DB.prepare(`
          UPDATE skin_packs
          SET status='available',assigned_at=NULL,updated_at=?
          WHERE status='assigned' AND id IN (
            SELECT package_skin_packs.skin_pack_id
            FROM package_skin_packs
            JOIN packages ON packages.id=package_skin_packs.package_id
            WHERE packages.work_item_id IN (${ids.map(() => "?").join(",")})
          ) AND ${allSelectionMatches(selection)}
            AND ${allOrderVersionsMatch(updatedOrders)}
        `).bind(
          now,
          ...ids,
          ...allSelectionBindings(selection),
          ...orderVersionBindings(updatedOrders),
          updatedOrders.length,
        ),
        runtimeEnv.DB.prepare(`
          DELETE FROM package_skin_packs
          WHERE package_id IN (
            SELECT id FROM packages WHERE work_item_id IN (${ids.map(() => "?").join(",")})
          ) AND ${allSelectionMatches(selection)}
            AND ${allOrderVersionsMatch(updatedOrders)}
        `).bind(
          ...ids,
          ...allSelectionBindings(selection),
          ...orderVersionBindings(updatedOrders),
          updatedOrders.length,
        ),
        runtimeEnv.DB.prepare(`
          DELETE FROM packages
          WHERE work_item_id IN (${ids.map(() => "?").join(",")})
            AND ${allSelectionMatches(selection)}
            AND ${allOrderVersionsMatch(updatedOrders)}
        `).bind(
          ...ids,
          ...allSelectionBindings(selection),
          ...orderVersionBindings(updatedOrders),
          updatedOrders.length,
        ),
        ...ids.map((id, index) =>
          runtimeEnv.DB.prepare(`
            INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
            SELECT ?,?,?,'work_item_deleted',?,NULL,?,?
            WHERE ${allSelectionMatches(selection)}
              AND ${allOrderVersionsMatch(updatedOrders)}
          `).bind(
            crypto.randomUUID(),
            id,
            current[index].order_id,
            JSON.stringify(current[index]),
            OPERATOR_ACTOR,
            now,
            ...allSelectionBindings(selection),
            ...orderVersionBindings(updatedOrders),
            updatedOrders.length,
          )),
        runtimeEnv.DB.prepare(`
          DELETE FROM work_items
          WHERE (${selectionPredicate(selection)})
            AND ${allSelectionMatches(selection)}
            AND ${allOrderVersionsMatch(updatedOrders)}
        `).bind(
          ...selectionBindings(selection),
          ...allSelectionBindings(selection),
          ...orderVersionBindings(updatedOrders),
          updatedOrders.length,
        ),
      ]);
      if (results[0].meta.changes !== affectedOrderIds.length || results[results.length - 1].meta.changes !== selection.length) {
        return Response.json({ error: "다른 화면에서 작업이 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      return Response.json({ action, affected: selection.length, deletedIds: ids });
    }

    throw new RequestError("일괄 처리 종류를 확인해주세요.");
  } catch (error) {
    const status = error instanceof RequestError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "작업 일괄 처리를 저장하지 못했습니다." },
      { status },
    );
  }
}
