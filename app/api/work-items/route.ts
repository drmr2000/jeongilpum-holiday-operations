import { env } from "cloudflare:workers";
import { OPERATOR_ACTOR, requireOperatorApi } from "../../lib/operator-session";
import { workItemEventType } from "../../lib/work-item-events";
import {
  PIPELINE_WORK_STATUSES,
  prepareWorkStatusTransition,
  type PipelineWorkStatus,
  type WorkStatus,
} from "../../lib/work-status";

type DeliveryMethod = "onsite_sale" | "onsite_reservation" | "delivery";
type WorkView = "work" | "customers";

type WorkItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  delivery_method: DeliveryMethod;
  due_at: string;
  work_status: WorkStatus;
  recipient_name: string | null;
  recipient_phone: string | null;
  postal_code: string | null;
  road_addr: string | null;
  road_addr_reference: string | null;
  jibun_addr: string | null;
  detail_addr: string | null;
  customization_json: string | null;
  note: string;
  version: number;
  created_at: string;
  updated_at: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  total_amount: number;
  customer_arrived_at: string | null;
  customer_note: string;
  order_version: number;
  product_daily_limit: number | null;
  daily_reserved_quantity: number;
};

type ProductRow = {
  id: string;
  name: string;
  price: number;
};

type CustomerOrderRow = {
  id: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  total_amount: number;
  version: number;
  created_at: string;
};

type DashboardRow = {
  work_status: WorkStatus;
  delivery_method: DeliveryMethod;
  count: number;
};

type CurrentWorkItem = Pick<
  WorkItemRow,
  | "id"
  | "order_id"
  | "product_id"
  | "product_name_snapshot"
  | "unit_price_snapshot"
  | "quantity"
  | "line_total"
  | "delivery_method"
  | "due_at"
  | "work_status"
  | "recipient_name"
  | "recipient_phone"
  | "postal_code"
  | "road_addr"
  | "road_addr_reference"
  | "jibun_addr"
  | "detail_addr"
  | "customization_json"
  | "note"
  | "version"
  | "customer_arrived_at"
  | "order_version"
>;

type Dashboard = Record<PipelineWorkStatus, Record<DeliveryMethod, number>>;

const runtimeEnv = env as typeof env & { DB: D1Database };
const WORK_STATUSES: WorkStatus[] = ["received", "confirmed", "in_progress", "ready", "completed", "cancelled"];
const DELIVERY_METHODS: DeliveryMethod[] = ["onsite_sale", "onsite_reservation", "delivery"];
const EDITABLE_FIELDS = new Set([
  "productId",
  "unitPrice",
  "quantity",
  "deliveryMethod",
  "dueAt",
  "recipientName",
  "recipientPhone",
  "postalCode",
  "roadAddr",
  "roadAddrReference",
  "jibunAddr",
  "detailAddr",
  "customizationJson",
  "note",
  "workStatus",
  "customerArrivedAt",
]);
const SENSITIVE_FIELDS = new Set([
  "recipientName",
  "recipientPhone",
  "postalCode",
  "roadAddr",
  "roadAddrReference",
  "jibunAddr",
  "detailAddr",
  "note",
]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const WORK_ITEM_SELECT = `
  SELECT
    w.id,w.order_id,w.product_id,w.product_name_snapshot,w.unit_price_snapshot,w.quantity,w.line_total,
    w.delivery_method,w.due_at,w.work_status,w.recipient_name,w.recipient_phone,w.postal_code,
    w.road_addr,w.road_addr_reference,w.jibun_addr,w.detail_addr,w.customization_json,w.note,
    w.version,w.created_at,w.updated_at,
    o.order_no,o.buyer_name,o.buyer_phone,o.payment_status,o.paid_amount,o.total_amount,
    o.customer_arrived_at,o.customer_note,o.version AS order_version,
    p.daily_limit AS product_daily_limit,
    COALESCE((
      SELECT SUM(reserved.quantity)
      FROM work_items reserved
      WHERE reserved.product_id=w.product_id
        AND substr(reserved.due_at,1,10)=substr(w.due_at,1,10)
        AND reserved.work_status!='cancelled'
    ),0) AS daily_reserved_quantity
  FROM work_items w
  JOIN orders o ON o.id=w.order_id
  JOIN products p ON p.id=w.product_id
`;

class RequestError extends Error {}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validDueAt(value: string) {
  return isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
}

function seoulDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}+09:00`;
}

function nullableText(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function valueForArrival(value: unknown, now: string) {
  if (value === null || value === false) return null;
  if (value === true) return now;
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function createDashboard(rows: DashboardRow[]): Dashboard {
  const dashboard = Object.fromEntries(
    PIPELINE_WORK_STATUSES.map((status) => [
      status,
      {
        onsite_sale: 0,
        onsite_reservation: 0,
        delivery: 0,
      },
    ]),
  ) as Dashboard;

  for (const row of rows) {
    if (row.work_status === "cancelled") continue;
    dashboard[row.work_status][row.delivery_method] += Number(row.count);
  }
  return dashboard;
}

function workItemRecord(row: WorkItemRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name_snapshot,
    unitPrice: row.unit_price_snapshot,
    quantity: row.quantity,
    lineTotal: row.line_total,
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
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderNo: row.order_no,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    paymentStatus: row.payment_status,
    paidAmount: row.paid_amount,
    totalAmount: row.total_amount,
    customerArrivedAt: row.customer_arrived_at,
    orderVersion: row.order_version,
    productDailyLimit: row.product_daily_limit,
    productScheduledQuantity: Number(row.daily_reserved_quantity),
  };
}

function customerRecords(orderRows: CustomerOrderRow[], workItemRows: WorkItemRow[]) {
  const workItemsByOrder = new Map<string, ReturnType<typeof workItemRecord>[]>();
  for (const row of workItemRows) {
    const items = workItemsByOrder.get(row.order_id) ?? [];
    items.push(workItemRecord(row));
    workItemsByOrder.set(row.order_id, items);
  }
  const customers = new Map<string, {
    normalizedName: string;
    normalizedPhone: string;
    buyerName: string;
    buyerPhone: string;
    outstandingAmount: number;
    orders: Map<string, {
      id: string;
      orderNo: string;
      paymentStatus: "unpaid" | "partial" | "paid";
      paidAmount: number;
      totalAmount: number;
      balance: number;
      version: number;
      workItems: ReturnType<typeof workItemRecord>[];
    }>;
  }>();

  for (const row of orderRows) {
    const normalizedName = row.buyer_name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
    const normalizedPhone = row.buyer_phone.replace(/\D/g, "");
    const key = `${normalizedName}\u0000${normalizedPhone}`;
    const customer = customers.get(key) ?? {
      normalizedName,
      normalizedPhone,
      buyerName: row.buyer_name,
      buyerPhone: row.buyer_phone,
      outstandingAmount: 0,
      orders: new Map(),
    };
    if (!customers.has(key)) customers.set(key, customer);

    const order = {
      id: row.id,
      orderNo: row.order_no,
      paymentStatus: row.payment_status,
      paidAmount: row.paid_amount,
      totalAmount: row.total_amount,
      balance: row.total_amount - row.paid_amount,
      version: row.version,
      workItems: workItemsByOrder.get(row.id) ?? [],
    };
    customer.orders.set(row.id, order);
    customer.outstandingAmount += row.total_amount - row.paid_amount;
  }

  return [...customers.values()].map((customer) => ({
    id: `${customer.normalizedName}\u0000${customer.normalizedPhone}`,
    buyerName: customer.buyerName,
    buyerPhone: customer.buyerPhone,
    balance: customer.outstandingAmount,
    orders: [...customer.orders.values()],
  }));
}

function queryFilters(params: URLSearchParams) {
  const view = clean(params.get("view") ?? "work") || "work";
  if (view !== "work" && view !== "customers") throw new RequestError("조회 화면을 확인해주세요.");

  const workStatus = clean(params.get("workStatus"));
  const deliveryMethod = clean(params.get("deliveryMethod"));
  const dateFrom = clean(params.get("dateFrom"));
  const dateTo = clean(params.get("dateTo"));
  const query = clean(params.get("q"));
  const sort = clean(params.get("sort")) || "createdAtDesc";

  if (workStatus && !WORK_STATUSES.includes(workStatus as WorkStatus)) {
    throw new RequestError("작업 상태 필터를 확인해주세요.");
  }
  if (deliveryMethod && !DELIVERY_METHODS.includes(deliveryMethod as DeliveryMethod)) {
    throw new RequestError("수령방법 필터를 확인해주세요.");
  }
  if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    throw new RequestError("조회 날짜 범위를 확인해주세요.");
  }
  if (!["urgency", "dueAtAsc", "dueAtDesc", "createdAtDesc"].includes(sort)) {
    throw new RequestError("정렬 기준을 확인해주세요.");
  }

  const predicates = ["1=1"];
  const values: string[] = [];
  if (workStatus) {
    predicates.push("w.work_status=?");
    values.push(workStatus);
  }
  if (deliveryMethod) {
    predicates.push("w.delivery_method=?");
    values.push(deliveryMethod);
  }
  if (dateFrom) {
    predicates.push("substr(w.due_at,1,10)>=?");
    values.push(dateFrom);
  }
  if (dateTo) {
    predicates.push("substr(w.due_at,1,10)<=?");
    values.push(dateTo);
  }
  if (query) {
    const like = `%${query}%`;
    predicates.push("(o.buyer_name LIKE ? OR o.buyer_phone LIKE ? OR w.recipient_name LIKE ? OR w.recipient_phone LIKE ? OR o.order_no LIKE ? OR w.product_name_snapshot LIKE ?)");
    values.push(like, like, like, like, like, like);
  }

  const orderBy = sort === "dueAtAsc"
    ? { sql: "w.due_at ASC,w.created_at ASC,w.id ASC", values: [] as string[] }
    : sort === "dueAtDesc"
      ? { sql: "w.due_at DESC,w.created_at DESC,w.id DESC", values: [] as string[] }
      : sort === "createdAtDesc"
        ? { sql: "w.created_at DESC,w.id DESC", values: [] as string[] }
        : {
          sql: `
            CASE
              WHEN o.customer_arrived_at IS NOT NULL AND w.work_status NOT IN ('completed','cancelled') THEN 0
              WHEN w.work_status NOT IN ('completed','cancelled') AND w.due_at<=? THEN 1
              WHEN w.work_status='completed' THEN 3
              WHEN w.work_status='cancelled' THEN 4
              ELSE 2
            END,
            CASE WHEN o.payment_status='paid' THEN 1 ELSE 0 END,
            w.due_at ASC,w.created_at ASC,w.id ASC
          `,
          values: [seoulDateTime(new Date(Date.now() + 30 * 60_000))],
        };

  return {
    view: view as WorkView,
    predicates,
    values,
    orderBy,
    workStatus,
    deliveryMethod,
    dateFrom,
    dateTo,
    query,
  };
}

function customerOrderFilters(filters: ReturnType<typeof queryFilters>) {
  const predicates = ["1=1"];
  const values: string[] = [];
  const workPredicates = ["w.order_id=o.id"];
  const workValues: string[] = [];
  if (filters.workStatus) {
    workPredicates.push("w.work_status=?");
    workValues.push(filters.workStatus);
  }
  if (filters.deliveryMethod) {
    workPredicates.push("w.delivery_method=?");
    workValues.push(filters.deliveryMethod);
  }
  if (filters.dateFrom) {
    workPredicates.push("substr(w.due_at,1,10)>=?");
    workValues.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    workPredicates.push("substr(w.due_at,1,10)<=?");
    workValues.push(filters.dateTo);
  }
  if (workPredicates.length > 1) {
    predicates.push(`EXISTS(SELECT 1 FROM work_items w WHERE ${workPredicates.join(" AND ")})`);
    values.push(...workValues);
  }
  if (filters.query) {
    const like = `%${filters.query}%`;
    predicates.push(`
      (
        o.buyer_name LIKE ? OR o.buyer_phone LIKE ? OR o.order_no LIKE ?
        OR EXISTS(
          SELECT 1 FROM work_items w
          WHERE w.order_id=o.id
            AND (w.recipient_name LIKE ? OR w.recipient_phone LIKE ? OR w.product_name_snapshot LIKE ?)
        )
      )
    `);
    values.push(like, like, like, like, like, like);
  }
  return { where: predicates.join(" AND "), values };
}

async function findWorkItem(id: string) {
  return runtimeEnv.DB.prepare(`${WORK_ITEM_SELECT} WHERE w.id=?`).bind(id).first<WorkItemRow>();
}

async function findCreatedWorkItem(idempotencyKey: string) {
  return runtimeEnv.DB.prepare(`
    ${WORK_ITEM_SELECT}
    JOIN work_item_events e ON e.work_item_id=w.id
    WHERE e.event_type='work_item_created'
      AND json_extract(e.to_value,'$.idempotencyKey')=?
    ORDER BY e.created_at DESC,e.id DESC
    LIMIT 1
  `).bind(idempotencyKey).first<WorkItemRow>();
}

function createNullableText(payload: Record<string, unknown>, key: string) {
  if (!hasOwn(payload, key)) return null;
  const value = nullableText(payload[key]);
  if (value === undefined) throw new RequestError(`${key} 값을 확인해주세요.`);
  return value;
}

function auditPayload(
  current: CurrentWorkItem,
  next: {
    productId: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    deliveryMethod: DeliveryMethod;
    dueAt: string;
    workStatus: WorkStatus;
    customerArrivedAt: string | null;
  },
  changedFields: string[],
) {
  const fromValue: Record<string, unknown> = { changedFields };
  const toValue: Record<string, unknown> = { changedFields };
  const safeFields = new Set(["productId", "quantity", "deliveryMethod", "dueAt", "workStatus", "customerArrivedAt"]);

  if (changedFields.includes("productId")) {
    fromValue.productId = current.product_id;
    fromValue.unitPrice = current.unit_price_snapshot;
    toValue.productId = next.productId;
    toValue.unitPrice = next.unitPrice;
  }
  if (changedFields.includes("unitPrice") && !changedFields.includes("productId")) {
    fromValue.unitPrice = current.unit_price_snapshot;
    toValue.unitPrice = next.unitPrice;
  }
  if (changedFields.includes("quantity")) {
    fromValue.quantity = current.quantity;
    fromValue.lineTotal = current.line_total;
    toValue.quantity = next.quantity;
    toValue.lineTotal = next.lineTotal;
  }
  if (changedFields.includes("deliveryMethod")) {
    fromValue.deliveryMethod = current.delivery_method;
    toValue.deliveryMethod = next.deliveryMethod;
  }
  if (changedFields.includes("dueAt")) {
    fromValue.dueAt = current.due_at;
    toValue.dueAt = next.dueAt;
  }
  if (changedFields.includes("workStatus")) {
    fromValue.workStatus = current.work_status;
    toValue.workStatus = next.workStatus;
  }
  if (changedFields.includes("customerArrivedAt")) {
    fromValue.customerArrivedAt = current.customer_arrived_at;
    toValue.customerArrivedAt = next.customerArrivedAt;
  }
  const redactedFields = changedFields.filter((field) => SENSITIVE_FIELDS.has(field) && !safeFields.has(field));
  if (redactedFields.length) {
    fromValue.redactedFields = redactedFields;
    toValue.redactedFields = redactedFields;
  }
  return { fromValue: JSON.stringify(fromValue), toValue: JSON.stringify(toValue) };
}

export async function GET(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const filters = queryFilters(new URL(request.url).searchParams);
    const where = filters.predicates.join(" AND ");
    if (filters.view === "customers") {
      const customerFilters = customerOrderFilters(filters);
      const [orders, dashboardRows] = await Promise.all([
        runtimeEnv.DB.prepare(`
          SELECT o.id,o.order_no,o.buyer_name,o.buyer_phone,o.payment_status,
            o.paid_amount,o.total_amount,o.version,o.created_at
          FROM orders o
          WHERE ${customerFilters.where}
          ORDER BY o.created_at DESC,o.id DESC
        `).bind(...customerFilters.values).all<CustomerOrderRow>(),
        runtimeEnv.DB.prepare(`
          SELECT w.work_status,w.delivery_method,COUNT(*) AS count
          FROM work_items w
          JOIN orders o ON o.id=w.order_id
          WHERE ${where}
          GROUP BY w.work_status,w.delivery_method
        `).bind(...filters.values).all<DashboardRow>(),
      ]);
      const orderIds = orders.results.map((order) => order.id);
      const workItems = orderIds.length
        ? await runtimeEnv.DB.prepare(`
          ${WORK_ITEM_SELECT}
          WHERE w.order_id IN (${orderIds.map(() => "?").join(",")})
          ORDER BY w.created_at DESC,w.id DESC
        `).bind(...orderIds).all<WorkItemRow>()
        : { results: [] as WorkItemRow[] };
      return Response.json(
        { customers: customerRecords(orders.results, workItems.results), dashboard: createDashboard(dashboardRows.results) },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
      );
    }

    const itemQuery = `
        ${WORK_ITEM_SELECT}
        WHERE ${where}
        ORDER BY ${filters.orderBy.sql}
        LIMIT 500
      `;
    const [items, dashboardRows] = await Promise.all([
      runtimeEnv.DB.prepare(itemQuery).bind(...filters.values, ...filters.orderBy.values).all<WorkItemRow>(),
      runtimeEnv.DB.prepare(`
        SELECT w.work_status,w.delivery_method,COUNT(*) AS count
        FROM work_items w
        JOIN orders o ON o.id=w.order_id
        WHERE ${where}
        GROUP BY w.work_status,w.delivery_method
      `).bind(...filters.values).all<DashboardRow>(),
    ]);
    return Response.json(
      { workItems: items.results.map(workItemRecord), dashboard: createDashboard(dashboardRows.results) },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    const status = error instanceof RequestError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "작업 목록을 불러오지 못했습니다." },
      { status },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as unknown;
    if (!isRecord(payload) || !isRecord(payload.changes)) {
      throw new RequestError("작업 수정 정보를 확인해주세요.");
    }
    const id = clean(payload.id);
    const expectedVersion = payload.expectedVersion;
    const changes = payload.changes;
    if (!id || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
      throw new RequestError("작업 수정 정보를 확인해주세요.");
    }
    const changedFields = Object.keys(changes);
    if (!changedFields.length || changedFields.some((field) => !EDITABLE_FIELDS.has(field))) {
      throw new RequestError("수정할 작업 항목을 확인해주세요.");
    }

    const current = await findWorkItem(id) as CurrentWorkItem | null;
    if (!current) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    if (current.version !== expectedVersion) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.", latestVersion: current.version }, { status: 409 });
    }

    let productId = current.product_id;
    let productName = current.product_name_snapshot;
    let unitPrice = current.unit_price_snapshot;
    let quantity = current.quantity;
    let deliveryMethod = current.delivery_method;
    let dueAt = current.due_at;
    let workStatus = current.work_status;
    let recipientName = current.recipient_name;
    let recipientPhone = current.recipient_phone;
    let postalCode = current.postal_code;
    let roadAddr = current.road_addr;
    let roadAddrReference = current.road_addr_reference;
    let jibunAddr = current.jibun_addr;
    let detailAddr = current.detail_addr;
    let customizationJson = current.customization_json;
    let note = current.note;
    let customerArrivedAt = current.customer_arrived_at;
    const now = new Date().toISOString();

    if (hasOwn(changes, "productId")) {
      productId = clean(changes.productId);
      if (!productId) throw new RequestError("상품을 확인해주세요.");
      const product = await runtimeEnv.DB.prepare(
        "SELECT id,name,price FROM products WHERE id=?",
      ).bind(productId).first<ProductRow>();
      if (!product) return Response.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
      if (!Number.isInteger(product.price) || product.price < 0) {
        throw new RequestError("상품 가격 정보를 확인해주세요.");
      }
      productName = product.name;
      unitPrice = product.price;
    }
    if (hasOwn(changes, "unitPrice")) {
      if (!Number.isInteger(changes.unitPrice) || Number(changes.unitPrice) < 0) {
        throw new RequestError("상품 단가는 0 이상의 정수여야 합니다.");
      }
      unitPrice = Number(changes.unitPrice);
    }
    if (hasOwn(changes, "quantity")) {
      if (!Number.isInteger(changes.quantity) || Number(changes.quantity) < 0) {
        throw new RequestError("수량은 0 이상의 정수여야 합니다.");
      }
      quantity = Number(changes.quantity);
    }
    if (hasOwn(changes, "deliveryMethod")) {
      if (typeof changes.deliveryMethod !== "string" || !DELIVERY_METHODS.includes(changes.deliveryMethod as DeliveryMethod)) {
        throw new RequestError("수령방법을 확인해주세요.");
      }
      deliveryMethod = changes.deliveryMethod as DeliveryMethod;
    }
    if (hasOwn(changes, "dueAt")) {
      dueAt = clean(changes.dueAt);
      if (!validDueAt(dueAt)) throw new RequestError("수령일시 형식을 확인해주세요.");
    }
    if (hasOwn(changes, "workStatus")) {
      if (typeof changes.workStatus !== "string" || !WORK_STATUSES.includes(changes.workStatus as WorkStatus)) {
        throw new RequestError("작업 상태를 확인해주세요.");
      }
      workStatus = changes.workStatus as WorkStatus;
    }

    const nullableFields = [
      ["recipientName", (value: string | null) => { recipientName = value; }],
      ["recipientPhone", (value: string | null) => { recipientPhone = value; }],
      ["postalCode", (value: string | null) => { postalCode = value; }],
      ["roadAddr", (value: string | null) => { roadAddr = value; }],
      ["roadAddrReference", (value: string | null) => { roadAddrReference = value; }],
      ["jibunAddr", (value: string | null) => { jibunAddr = value; }],
      ["detailAddr", (value: string | null) => { detailAddr = value; }],
    ] as const;
    for (const [field, assign] of nullableFields) {
      if (!hasOwn(changes, field)) continue;
      const value = nullableText(changes[field]);
      if (value === undefined) throw new RequestError(`${field} 값을 확인해주세요.`);
      assign(value);
    }
    if (hasOwn(changes, "customizationJson")) {
      if (changes.customizationJson !== null && typeof changes.customizationJson !== "string") {
        throw new RequestError("구성 정보 값을 확인해주세요.");
      }
      const value = nullableText(changes.customizationJson);
      if (value === undefined) throw new RequestError("구성 정보 값을 확인해주세요.");
      customizationJson = value;
    }
    if (hasOwn(changes, "note")) {
      if (typeof changes.note !== "string") throw new RequestError("메모 값을 확인해주세요.");
      note = changes.note.trim();
    }
    if (hasOwn(changes, "customerArrivedAt")) {
      const value = valueForArrival(changes.customerArrivedAt, now);
      if (value === undefined) throw new RequestError("주문 도착 상태를 확인해주세요.");
      customerArrivedAt = value;
    }

    const lineTotal = unitPrice * quantity;
    if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) {
      throw new RequestError("상품 금액과 수량을 확인해주세요.");
    }
    const lineTotalChanged = lineTotal !== current.line_total;
    const customerArrivedChanged = hasOwn(changes, "customerArrivedAt")
      && customerArrivedAt !== current.customer_arrived_at;
    const requiresOrderUpdate = lineTotalChanged || customerArrivedChanged;
    const statusTransition = hasOwn(changes, "workStatus")
      ? prepareWorkStatusTransition(runtimeEnv.DB, {
        nextStatus: workStatus,
        now,
        whereSql: `id=? AND version=? ${requiresOrderUpdate ? "AND EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)" : ""}`,
        whereBindings: [
          id,
          expectedVersion,
          ...(requiresOrderUpdate ? [current.order_id, current.order_version] : []),
        ],
      })
      : null;
    const workStatusChanged = Boolean(statusTransition && workStatus !== current.work_status);
    const audit = auditPayload(
      current,
      { productId, unitPrice, quantity, lineTotal, deliveryMethod, dueAt, workStatus, customerArrivedAt },
      changedFields,
    );
    const eventType = workStatusChanged
      ? workItemEventType("work_status_changed", clean(payload.idempotencyKey) || crypto.randomUUID())
      : changedFields.length === 1 && changedFields[0] === "customerArrivedAt"
        ? workItemEventType("customer_arrival_changed")
        : workItemEventType("work_item_updated");
    const statements: D1PreparedStatement[] = [
      runtimeEnv.DB.prepare(`
        UPDATE work_items
        SET product_id=?,product_name_snapshot=?,unit_price_snapshot=?,quantity=?,line_total=?,
          delivery_method=?,due_at=?,recipient_name=?,recipient_phone=?,postal_code=?,
          road_addr=?,road_addr_reference=?,jibun_addr=?,detail_addr=?,customization_json=?,note=?,
          updated_at=?${statusTransition ? "" : ",version=version+1"}
        WHERE id=? AND version=?
          ${requiresOrderUpdate ? "AND EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)" : ""}
      `).bind(
        productId,
        productName,
        unitPrice,
        quantity,
        lineTotal,
        deliveryMethod,
        dueAt,
        recipientName,
        recipientPhone,
        postalCode,
        roadAddr,
        roadAddrReference,
        jibunAddr,
        detailAddr,
        customizationJson,
        note,
        now,
        id,
        expectedVersion,
        ...(requiresOrderUpdate ? [current.order_id, current.order_version] : []),
      ),
    ];
    if (statusTransition) {
      statements.push(statusTransition);
    }
    if (requiresOrderUpdate) {
      statements.push(runtimeEnv.DB.prepare(`
        UPDATE orders
        SET total_amount=total_amount+?
          ${customerArrivedChanged ? ",customer_arrived_at=?" : ""},
          version=version+1,updated_at=?
        WHERE id=? AND version=?
          AND EXISTS(SELECT 1 FROM work_items WHERE id=? AND version=?)
      `).bind(
        lineTotal - current.line_total,
        ...(customerArrivedChanged ? [customerArrivedAt] : []),
        now,
        current.order_id,
        current.order_version,
        id,
        expectedVersion + 1,
      ));
    }
    statements.push(
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
        SELECT ?,?,?,?,?,?,?,?
        WHERE EXISTS(SELECT 1 FROM work_items WHERE id=? AND version=?)
          ${requiresOrderUpdate ? "AND EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)" : ""}
      `).bind(
        crypto.randomUUID(),
        id,
        current.order_id,
        eventType,
        audit.fromValue,
        audit.toValue,
        OPERATOR_ACTOR,
        now,
        id,
        expectedVersion + 1,
        ...(requiresOrderUpdate ? [current.order_id, current.order_version + 1] : []),
      ),
    );
    const results = await runtimeEnv.DB.batch(statements);
    if (!results[0].meta.changes) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }
    if (requiresOrderUpdate && !results[statusTransition ? 2 : 1].meta.changes) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }
    const workItem = await findWorkItem(id);
    return Response.json({ workItem: workItem ? workItemRecord(workItem) : null });
  } catch (error) {
    const status = error instanceof RequestError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "작업을 저장하지 못했습니다." },
      { status },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as unknown;
    if (!isRecord(payload)) throw new RequestError("복제할 작업을 확인해주세요.");
    if (clean(payload.action) === "create") {
      const orderId = clean(payload.orderId);
      const productId = clean(payload.productId);
      const dueAt = clean(payload.dueAt);
      const idempotencyKey = clean(payload.idempotencyKey);
      const expectedOrderVersion = payload.expectedOrderVersion;
      const quantity = payload.quantity;
      const unitPrice = payload.unitPrice;
      const deliveryMethod = payload.deliveryMethod;
      const workStatus = payload.workStatus ?? "received";
      if (
        !orderId
        || !productId
        || !idempotencyKey
        || !validDueAt(dueAt)
        || !Number.isInteger(expectedOrderVersion)
        || !Number.isInteger(quantity)
        || Number(quantity) < 0
        || !Number.isInteger(unitPrice)
        || Number(unitPrice) < 0
        || typeof deliveryMethod !== "string"
        || !DELIVERY_METHODS.includes(deliveryMethod as DeliveryMethod)
        || typeof workStatus !== "string"
        || !WORK_STATUSES.includes(workStatus as WorkStatus)
      ) {
        throw new RequestError("새 작업 정보를 확인해주세요.");
      }
      const existing = await findCreatedWorkItem(idempotencyKey);
      if (existing) return Response.json({ workItem: workItemRecord(existing), idempotent: true });

      const product = await runtimeEnv.DB.prepare(
        "SELECT id,name FROM products WHERE id=?",
      ).bind(productId).first<Pick<ProductRow, "id" | "name">>();
      if (!product) return Response.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });

      const recipientName = createNullableText(payload, "recipientName");
      const recipientPhone = createNullableText(payload, "recipientPhone");
      const postalCode = createNullableText(payload, "postalCode");
      const roadAddr = createNullableText(payload, "roadAddr");
      const roadAddrReference = createNullableText(payload, "roadAddrReference");
      const jibunAddr = createNullableText(payload, "jibunAddr");
      const detailAddr = createNullableText(payload, "detailAddr");
      const customizationJson = createNullableText(payload, "customizationJson");
      if (hasOwn(payload, "note") && typeof payload.note !== "string") {
        throw new RequestError("메모 값을 확인해주세요.");
      }
      const note = typeof payload.note === "string" ? payload.note.trim() : "";
      const lineTotal = Number(unitPrice) * Number(quantity);
      if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) {
        throw new RequestError("상품 금액과 수량을 확인해주세요.");
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const results = await runtimeEnv.DB.batch([
        runtimeEnv.DB.prepare(`
          INSERT INTO work_items(
            id,order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total,
            delivery_method,due_at,work_status,recipient_name,recipient_phone,postal_code,
            road_addr,road_addr_reference,jibun_addr,detail_addr,customization_json,note,
            version,created_at,updated_at
          )
          SELECT ?,o.id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?
          FROM orders o
          WHERE o.id=? AND o.version=?
        `).bind(
          id,
          product.id,
          product.name,
          Number(unitPrice),
          Number(quantity),
          lineTotal,
          deliveryMethod,
          dueAt,
          workStatus,
          recipientName,
          recipientPhone,
          postalCode,
          roadAddr,
          roadAddrReference,
          jibunAddr,
          detailAddr,
          customizationJson,
          note,
          now,
          now,
          orderId,
          Number(expectedOrderVersion),
        ),
        runtimeEnv.DB.prepare(`
          UPDATE orders
          SET total_amount=total_amount+?,version=version+1,updated_at=?
          WHERE id=? AND version=?
            AND EXISTS(SELECT 1 FROM work_items WHERE id=?)
        `).bind(lineTotal, now, orderId, Number(expectedOrderVersion), id),
        runtimeEnv.DB.prepare(`
          INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
          SELECT ?,?,?,?,NULL,?,?,?
          WHERE EXISTS(SELECT 1 FROM work_items WHERE id=?)
            AND EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)
        `).bind(
          crypto.randomUUID(),
          id,
          orderId,
          "work_item_created",
          JSON.stringify({ idempotencyKey, manual: true }),
          OPERATOR_ACTOR,
          now,
          id,
          orderId,
          Number(expectedOrderVersion) + 1,
        ),
      ]);
      if (results.some((result) => result.meta.changes !== 1)) {
        return Response.json({ error: "다른 화면에서 주문이 먼저 수정되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      const workItem = await findWorkItem(id);
      return Response.json({ workItem: workItem ? workItemRecord(workItem) : null }, { status: 201 });
    }

    const sourceId = clean(payload.sourceId);
    const expectedVersion = payload.expectedVersion;
    if (!sourceId || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
      throw new RequestError("복제할 작업을 확인해주세요.");
    }

    const source = await findWorkItem(sourceId) as CurrentWorkItem | null;
    if (!source) return Response.json({ error: "복제할 작업을 찾을 수 없습니다." }, { status: 404 });
    if (source.version !== expectedVersion) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.", latestVersion: source.version }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const results = await runtimeEnv.DB.batch([
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
      `).bind(id, now, now, sourceId, expectedVersion),
      runtimeEnv.DB.prepare(`
        UPDATE orders
        SET total_amount=total_amount+(SELECT line_total FROM work_items WHERE id=?),
          version=version+1,updated_at=?
        WHERE id=? AND version=?
          AND EXISTS(SELECT 1 FROM work_items WHERE id=?)
      `).bind(id, now, source.order_id, source.order_version, id),
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
        SELECT ?,?,?,?,NULL,?,?,?
        WHERE EXISTS(SELECT 1 FROM work_items WHERE id=?)
          AND EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)
      `).bind(
        crypto.randomUUID(),
        id,
        source.order_id,
        "work_item_duplicated",
        JSON.stringify({ sourceId }),
        OPERATOR_ACTOR,
        now,
        id,
        source.order_id,
        source.order_version + 1,
      ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      return Response.json({ error: "복제 원본이 변경되었습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }
    const workItem = await findWorkItem(id);
    return Response.json({ workItem: workItem ? workItemRecord(workItem) : null }, { status: 201 });
  } catch (error) {
    const status = error instanceof RequestError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "작업을 복제하지 못했습니다." },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as unknown;
    if (!isRecord(payload)) throw new RequestError("삭제할 작업을 확인해주세요.");
    const id = clean(payload.id);
    const expectedVersion = payload.expectedVersion;
    if (!id || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
      throw new RequestError("삭제할 작업을 확인해주세요.");
    }

    const current = await findWorkItem(id) as CurrentWorkItem | null;
    if (!current) return Response.json({ error: "삭제할 작업을 찾을 수 없습니다." }, { status: 404 });
    if (current.version !== expectedVersion) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.", latestVersion: current.version }, { status: 409 });
    }

    const now = new Date().toISOString();
    const matchesCurrent = "EXISTS(SELECT 1 FROM work_items WHERE id=? AND version=?)";
    const matchesUpdatedOrder = "EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)";
    const results = await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`
        UPDATE orders
        SET total_amount=total_amount-?,version=version+1,updated_at=?
        WHERE id=? AND version=? AND ${matchesCurrent}
      `).bind(current.line_total, now, current.order_id, current.order_version, id, expectedVersion),
      runtimeEnv.DB.prepare(`
        UPDATE skin_packs
        SET status='available',assigned_at=NULL,updated_at=?
        WHERE status='assigned' AND id IN (
          SELECT package_skin_packs.skin_pack_id
          FROM package_skin_packs
          JOIN packages ON packages.id=package_skin_packs.package_id
          WHERE packages.work_item_id=?
        ) AND ${matchesCurrent}
          AND ${matchesUpdatedOrder}
      `).bind(now, id, id, expectedVersion, current.order_id, current.order_version + 1),
      runtimeEnv.DB.prepare(`
        DELETE FROM package_skin_packs
        WHERE package_id IN (SELECT id FROM packages WHERE work_item_id=?)
          AND ${matchesCurrent}
          AND ${matchesUpdatedOrder}
      `).bind(id, id, expectedVersion, current.order_id, current.order_version + 1),
      runtimeEnv.DB.prepare(`
        DELETE FROM packages
        WHERE work_item_id=? AND ${matchesCurrent}
          AND ${matchesUpdatedOrder}
      `).bind(id, id, expectedVersion, current.order_id, current.order_version + 1),
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at)
        SELECT ?,?,?,'work_item_deleted',?,NULL,?,?
        WHERE ${matchesCurrent}
          AND ${matchesUpdatedOrder}
      `).bind(
        crypto.randomUUID(),
        id,
        current.order_id,
        JSON.stringify(current),
        OPERATOR_ACTOR,
        now,
        id,
        expectedVersion,
        current.order_id,
        current.order_version + 1,
      ),
      runtimeEnv.DB.prepare(`
        DELETE FROM work_items
        WHERE id=? AND version=?
          AND ${matchesUpdatedOrder}
      `).bind(id, expectedVersion, current.order_id, current.order_version + 1),
    ]);
    if (!results[0].meta.changes || !results[5].meta.changes) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }
    return Response.json({ deletedId: id });
  } catch (error) {
    const status = error instanceof RequestError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "작업을 삭제하지 못했습니다." },
      { status },
    );
  }
}
