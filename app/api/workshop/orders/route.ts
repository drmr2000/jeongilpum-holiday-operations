import { env } from "cloudflare:workers";
import { requireOperatorApi } from "../../../lib/operator-session";

type WorkStatus = "received" | "confirmed" | "in_progress" | "ready" | "completed" | "cancelled";
type DeliveryMethod = "onsite_reservation" | "delivery";

type WorkItemRow = {
  id: string;
  order_id: string;
  order_no: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  delivery_method: DeliveryMethod;
  due_at: string;
  work_status: WorkStatus;
  note: string;
  road_addr: string | null;
  road_addr_reference: string | null;
  jibun_addr: string | null;
  detail_addr: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  postal_code: string | null;
  customization_json: string | null;
  buyer_name: string;
  buyer_phone: string;
  product_daily_limit: number | null;
  product_scheduled_quantity: number;
  version: number;
};

type ProductTotalRow = {
  product_id: string;
  product_name_snapshot: string;
  total_quantity: number;
  completed_quantity: number;
  pending_quantity: number;
  daily_limit: number | null;
};

type EventRow = {
  id: string;
  work_item_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
};

const runtimeEnv = env as typeof env & { DB: D1Database };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const TODAY_ONSITE_WORK_ITEMS_SQL = `
  SELECT
    w.id,w.order_id,o.order_no,o.buyer_name,o.buyer_phone,w.product_id,w.product_name_snapshot,
    w.unit_price_snapshot,w.quantity,w.delivery_method,w.due_at,w.work_status,w.note,
    w.recipient_name,w.recipient_phone,w.postal_code,w.road_addr,w.road_addr_reference,w.jibun_addr,
    w.detail_addr,w.customization_json,w.version,p.daily_limit AS product_daily_limit,
    COALESCE((SELECT SUM(reserved.quantity) FROM work_items reserved WHERE reserved.product_id=w.product_id AND substr(reserved.due_at,1,10)=substr(w.due_at,1,10) AND reserved.work_status!='cancelled'),0) AS product_scheduled_quantity
  FROM work_items w
  JOIN orders o ON o.id=w.order_id
  JOIN products p ON p.id=w.product_id
  WHERE w.delivery_method='onsite_reservation'
    AND substr(w.due_at,1,10)=?
    AND w.work_status!='cancelled'
  ORDER BY CASE WHEN o.payment_status='paid' THEN 1 ELSE 0 END,w.due_at ASC,w.created_at ASC,w.id ASC
  LIMIT 500
`;

export const TODAY_DELIVERY_WORK_ITEMS_SQL = `
  SELECT
    w.id,w.order_id,o.order_no,o.buyer_name,o.buyer_phone,w.product_id,w.product_name_snapshot,
    w.unit_price_snapshot,w.quantity,w.delivery_method,w.due_at,w.work_status,w.note,
    w.recipient_name,w.recipient_phone,w.postal_code,w.road_addr,w.road_addr_reference,w.jibun_addr,
    w.detail_addr,w.customization_json,w.version,p.daily_limit AS product_daily_limit,
    COALESCE((SELECT SUM(reserved.quantity) FROM work_items reserved WHERE reserved.product_id=w.product_id AND substr(reserved.due_at,1,10)=substr(w.due_at,1,10) AND reserved.work_status!='cancelled'),0) AS product_scheduled_quantity
  FROM work_items w
  JOIN orders o ON o.id=w.order_id
  JOIN products p ON p.id=w.product_id
  WHERE w.delivery_method='delivery'
    AND substr(w.due_at,1,10)=?
    AND w.work_status!='cancelled'
  ORDER BY CASE WHEN o.payment_status='paid' THEN 1 ELSE 0 END,w.due_at ASC,w.created_at ASC,w.id ASC
  LIMIT 500
`;

export const TODAY_PRODUCT_TOTALS_SQL = `
  SELECT
    w.product_id,
    w.product_name_snapshot,
    SUM(w.quantity) AS total_quantity,
    SUM(CASE WHEN w.work_status IN ('ready','completed') THEN w.quantity ELSE 0 END) AS completed_quantity,
    SUM(CASE WHEN w.work_status IN ('ready','completed') THEN 0 ELSE w.quantity END) AS pending_quantity,
    MAX(p.daily_limit) AS daily_limit
  FROM work_items w
  LEFT JOIN products p ON p.id=w.product_id
  WHERE substr(w.due_at,1,10)=?
    AND w.work_status!='cancelled'
  GROUP BY w.product_id,w.product_name_snapshot
  ORDER BY pending_quantity DESC,w.product_name_snapshot COLLATE NOCASE,w.product_id
  LIMIT 500
`;

function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function toWorkItem(row: WorkItemRow, events: EventRow[]) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNo: row.order_no,
    productId: row.product_id,
    productName: row.product_name_snapshot,
    unitPrice: Number(row.unit_price_snapshot),
    quantity: Number(row.quantity),
    deliveryMethod: row.delivery_method,
    dueAt: row.due_at,
    workStatus: row.work_status,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    postalCode: row.postal_code,
    roadAddr: row.road_addr,
    roadAddrReference: row.road_addr_reference,
    jibunAddr: row.jibun_addr,
    detailAddr: row.detail_addr,
    customizationJson: row.customization_json,
    note: row.note,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    productDailyLimit: row.product_daily_limit === null ? null : Number(row.product_daily_limit),
    productScheduledQuantity: Number(row.product_scheduled_quantity),
    address: row.delivery_method === "delivery"
      ? [row.road_addr, row.detail_addr].filter(Boolean).join(" ")
      : "",
    version: row.version,
    events: events.map((event) => ({
      id: event.id,
      type: event.event_type,
      fromValue: event.from_value,
      toValue: event.to_value,
      createdAt: event.created_at,
    })),
  };
}

export async function GET(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const date = new URL(request.url).searchParams.get("date")?.trim() ?? "";
  if (!validDate(date)) return Response.json({ error: "조회 날짜 형식을 확인해주세요." }, { status: 400 });

  try {
    const [onsiteResult, deliveryResult, productResult] = await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(TODAY_ONSITE_WORK_ITEMS_SQL).bind(date),
      runtimeEnv.DB.prepare(TODAY_DELIVERY_WORK_ITEMS_SQL).bind(date),
      runtimeEnv.DB.prepare(TODAY_PRODUCT_TOTALS_SQL).bind(date),
    ]);
    const rows = [
      ...(onsiteResult.results as WorkItemRow[]),
      ...(deliveryResult.results as WorkItemRow[]),
    ];
    const ids = rows.map((row) => row.id);
    const events = ids.length
      ? await runtimeEnv.DB.prepare(`
        SELECT id,work_item_id,event_type,from_value,to_value,created_at
        FROM work_item_events
        WHERE work_item_id IN (${ids.map(() => "?").join(",")})
        ORDER BY created_at DESC,id DESC
      `).bind(...ids).all<EventRow>()
      : { results: [] as EventRow[] };

    const eventByWorkItem = new Map<string, EventRow[]>();
    for (const event of events.results) {
      const values = eventByWorkItem.get(event.work_item_id) ?? [];
      values.push(event);
      eventByWorkItem.set(event.work_item_id, values);
    }

    return Response.json({
      onsite: (onsiteResult.results as WorkItemRow[]).map((row) => toWorkItem(row, eventByWorkItem.get(row.id) ?? [])),
      delivery: (deliveryResult.results as WorkItemRow[]).map((row) => toWorkItem(row, eventByWorkItem.get(row.id) ?? [])),
      products: (productResult.results as ProductTotalRow[]).map((row) => ({
        productId: row.product_id,
        productName: row.product_name_snapshot,
        totalQuantity: Number(row.total_quantity),
        completedQuantity: Number(row.completed_quantity),
        pendingQuantity: Number(row.pending_quantity),
        dailyLimit: row.daily_limit === null ? null : Number(row.daily_limit),
      })),
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "작업 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
