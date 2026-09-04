import { env } from "cloudflare:workers";
import { OPERATOR_ACTOR, requireOperatorApi } from "../../../lib/operator-session";

type ArrivalPayload = { workItemId?: string; orderId?: string };
type WorkItemRow = {
  id: string;
  order_id: string;
  customer_arrived_at: string | null;
};

const runtimeEnv = env as typeof env & { DB: D1Database };

export async function PATCH(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as ArrivalPayload;
    const workItemId = payload.workItemId?.trim() ?? "";
    const orderId = payload.orderId?.trim() ?? "";
    if (!workItemId && !orderId) {
      return Response.json({ error: "작업 또는 주문 ID가 필요합니다." }, { status: 400 });
    }
    const current = workItemId
      ? await runtimeEnv.DB.prepare(`
        SELECT w.id,w.order_id,o.customer_arrived_at
        FROM work_items w
        JOIN orders o ON o.id=w.order_id
        WHERE w.id=? AND w.delivery_method='onsite_reservation' AND w.work_status!='cancelled'
      `).bind(workItemId).all<WorkItemRow>()
      : await runtimeEnv.DB.prepare(`
        SELECT w.id,w.order_id,o.customer_arrived_at
        FROM work_items w
        JOIN orders o ON o.id=w.order_id
        WHERE w.order_id=? AND w.delivery_method='onsite_reservation' AND w.work_status!='cancelled'
      `).bind(orderId).all<WorkItemRow>();
    if (!current.results.length) {
      return Response.json({ error: "방문수령 작업을 찾을 수 없습니다." }, { status: 404 });
    }
    if (current.results[0].customer_arrived_at) {
      return Response.json({ ok: true, alreadyArrived: true });
    }

    const now = new Date().toISOString();
    const targetOrderId = current.results[0].order_id;
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`
        UPDATE orders
        SET customer_arrived_at=?,version=version+1,updated_at=?
        WHERE id=? AND customer_arrived_at IS NULL
      `).bind(now, now, targetOrderId),
      ...current.results.map((item) =>
        runtimeEnv.DB.prepare(`
          INSERT INTO work_item_events(
            id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at
          ) VALUES(?,?,?,'customer_arrived',NULL,?,?,?)
        `).bind(
          crypto.randomUUID(),
          item.id,
          item.order_id,
          JSON.stringify({ customerArrivedAt: now }),
          OPERATOR_ACTOR,
          now,
        )),
    ]);
    return Response.json({ ok: true, alreadyArrived: false });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "주문 도착을 기록하지 못했습니다." },
      { status: 500 },
    );
  }
}
