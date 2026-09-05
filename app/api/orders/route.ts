/// <reference types="vite/client" />
import { env } from "cloudflare:workers";
import { OPERATOR_ACTOR, requireOperatorApi } from "../../lib/operator-session";
import { nextOrderNo, orderNumberPrefix } from "../../lib/order-number";

type CustomItemPayload = {
  budgetOption?: string;
  budgetAmount?: number;
  request?: string;
};

type DeliveryMethod = "onsite_sale" | "onsite_reservation" | "delivery";
type WorkStatus = "received" | "confirmed" | "in_progress" | "ready" | "completed" | "cancelled";

type CreateItemPayload = {
  productId?: string;
  unitPrice?: number;
  quantity?: number;
  deliveryMethod?: DeliveryMethod;
  dueAt?: string;
  workStatus?: WorkStatus;
  recipientName?: string | null;
  recipientPhone?: string | null;
  postalCode?: string | null;
  roadAddr?: string | null;
  roadAddrReference?: string | null;
  jibunAddr?: string | null;
  detailAddr?: string | null;
  customizationJson?: string | null;
  note?: string;
};

type CreatePayload = {
  action?: "manual-create";
  idempotencyKey?: string;
  buyerName?: string;
  buyerPhone?: string;
  fulfillmentType?: "onsite" | "pickup" | "shipping";
  paymentMethod?: "card" | "cash" | "bank_transfer" | "later";
  pickupDate?: string;
  pickupTime?: string;
  shipDate?: string;
  recipientName?: string;
  recipientPhone?: string;
  postalCode?: string;
  roadAddr?: string;
  roadAddrReference?: string;
  jibunAddr?: string;
  detailAddr?: string;
  note?: string;
  items?: CreateItemPayload[];
  customItem?: CustomItemPayload | null;
};

type OrderUpdatePayload = {
  id?: string;
  expectedVersion?: number;
  changes?: {
    orderNo?: unknown;
    buyerName?: unknown;
    buyerPhone?: unknown;
    customerNote?: unknown;
  };
};

type ProductRow = {
  id: string;
  name: string;
  price: number;
  daily_limit: number | null;
  active: number;
};

type ReceiptRow = {
  order_no: string;
  delivery_method: DeliveryMethod;
  due_at: string;
};

type WorkItemRow = {
  id: string;
  order_id: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  total_amount: number;
  customer_arrived_at: string | null;
  customer_note: string;
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
};

type EventRow = {
  id: string;
  work_item_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  actor: string;
  created_at: string;
};

type ManualOrderRow = {
  id: string;
  order_no: string;
  version: number;
};

type CurrentOrderRow = {
  id: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  customer_note: string;
  version: number;
};

type PreparedWorkItem = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  deliveryMethod: DeliveryMethod;
  dueAt: string;
  workStatus: WorkStatus;
  recipientName: string | null;
  recipientPhone: string | null;
  postalCode: string | null;
  roadAddr: string | null;
  roadAddrReference: string | null;
  jibunAddr: string | null;
  detailAddr: string | null;
  customizationJson: string | null;
  note: string;
};

type ManualWorkItemInput = Omit<PreparedWorkItem, "id" | "productName" | "lineTotal">;

const runtimeEnv = env as typeof env & { DB: D1Database };
const fulfillmentTypes = new Set(["onsite", "pickup", "shipping"]);
const paymentMethods = new Set(["card", "cash", "bank_transfer"]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const deliveryMethods = new Set<DeliveryMethod>(["onsite_sale", "onsite_reservation", "delivery"]);
const workStatuses = new Set<WorkStatus>(["received", "confirmed", "in_progress", "ready", "completed", "cancelled"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function nullableText(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function nowInSeoul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}+09:00`;
}

function validDueAt(value: string) {
  return isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
}

function buildWorkItem(input: Omit<PreparedWorkItem, "id" | "lineTotal">) {
  if (
    !Number.isInteger(input.unitPrice)
    || input.unitPrice < 0
    || !Number.isInteger(input.quantity)
    || input.quantity < 1
  ) {
    return null;
  }
  const lineTotal = input.unitPrice * input.quantity;
  if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) return null;
  return {
    id: crypto.randomUUID(),
    ...input,
    lineTotal,
  };
}

function workItemStatements(
  workItems: PreparedWorkItem[],
  {
    orderId,
    actor,
    now,
    eventValue,
  }: {
    orderId: string;
    actor: string;
    now: string;
    eventValue: (item: PreparedWorkItem) => Record<string, unknown>;
  },
) {
  return workItems.flatMap((item) => [
    runtimeEnv.DB.prepare(`
      INSERT INTO work_items(
        id,order_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total,
        delivery_method,due_at,work_status,recipient_name,recipient_phone,postal_code,
        road_addr,road_addr_reference,jibun_addr,detail_addr,customization_json,note,
        version,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    `).bind(
      item.id,
      orderId,
      item.productId,
      item.productName,
      item.unitPrice,
      item.quantity,
      item.lineTotal,
      item.deliveryMethod,
      item.dueAt,
      item.workStatus,
      item.recipientName,
      item.recipientPhone,
      item.postalCode,
      item.roadAddr,
      item.roadAddrReference,
      item.jibunAddr,
      item.detailAddr,
      item.customizationJson,
      item.note,
      now,
      now,
    ),
    runtimeEnv.DB.prepare(`
      INSERT INTO work_item_events(
        id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at
      ) VALUES(?,?,?,'work_item_created',NULL,?,?,?)
    `).bind(
      crypto.randomUUID(),
      item.id,
      orderId,
      JSON.stringify(eventValue(item)),
      actor,
      now,
    ),
  ]);
}

async function productsForIds(productIds: string[]) {
  if (!productIds.length) return [] as ProductRow[];
  const result = await runtimeEnv.DB.prepare(`
    SELECT id,name,price,daily_limit,active
    FROM products
    WHERE id IN (${productIds.map(() => "?").join(",")})
  `).bind(...productIds).all<ProductRow>();
  return result.results;
}

async function prepareManualWorkItems(payload: CreatePayload) {
  const payloadItems = payload.items ?? [];
  if (!Array.isArray(payloadItems)) return { error: "새 작업 정보를 확인해주세요." };

  const itemInputs: ManualWorkItemInput[] = [];
  for (const item of payloadItems) {
    if (!isRecord(item)) return { error: "새 작업 정보를 확인해주세요." };
    const productId = clean(item.productId);
    const dueAt = clean(item.dueAt);
    const deliveryMethod = item.deliveryMethod;
    const workStatus = item.workStatus ?? "received";
    const unitPrice = item.unitPrice;
    const quantity = item.quantity;
    const recipientName = nullableText(item.recipientName);
    const recipientPhone = nullableText(item.recipientPhone);
    const postalCode = nullableText(item.postalCode);
    const roadAddr = nullableText(item.roadAddr);
    const roadAddrReference = nullableText(item.roadAddrReference);
    const jibunAddr = nullableText(item.jibunAddr);
    const detailAddr = nullableText(item.detailAddr);
    const customizationJson = nullableText(item.customizationJson);
    const note = item.note === undefined ? "" : textValue(item.note);
    if (
      !productId
      || !validDueAt(dueAt)
      || typeof unitPrice !== "number"
      || !Number.isInteger(unitPrice)
      || typeof quantity !== "number"
      || !Number.isInteger(quantity)
      || typeof deliveryMethod !== "string"
      || !deliveryMethods.has(deliveryMethod as DeliveryMethod)
      || typeof workStatus !== "string"
      || !workStatuses.has(workStatus as WorkStatus)
      || recipientName === undefined
      || recipientPhone === undefined
      || postalCode === undefined
      || roadAddr === undefined
      || roadAddrReference === undefined
      || jibunAddr === undefined
      || detailAddr === undefined
      || customizationJson === undefined
      || note === undefined
    ) {
      return { error: "새 작업 정보를 확인해주세요." };
    }
    itemInputs.push({
      productId,
      unitPrice,
      quantity,
      deliveryMethod: deliveryMethod as DeliveryMethod,
      dueAt,
      workStatus: workStatus as WorkStatus,
      recipientName,
      recipientPhone,
      postalCode,
      roadAddr,
      roadAddrReference,
      jibunAddr,
      detailAddr,
      customizationJson,
      note,
    });
  }

  const productIds = [...new Set(itemInputs.map((item) => item.productId))];
  const products = await productsForIds(productIds);
  if (products.length !== productIds.length) {
    return { error: "상품을 찾을 수 없습니다.", status: 404 };
  }
  const productsById = new Map(products.map((product) => [product.id, product]));
  const workItems: PreparedWorkItem[] = [];
  for (const item of itemInputs) {
    const product = productsById.get(item.productId);
    if (!product) return { error: "상품을 찾을 수 없습니다.", status: 404 };
    const workItem = buildWorkItem({
      ...item,
      productName: product.name,
    });
    if (!workItem) return { error: "상품 금액과 수량을 확인해주세요." };
    workItems.push(workItem);
  }
  return { workItems };
}

function validIsoDate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validPickupTime(value: string) {
  const match = /^(\d{2}):(00|30)$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  return hour >= 8 && hour <= 21 && (hour < 21 || match[2] === "00");
}

function koreanDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${month}월 ${day}일 (${weekdays[date.getUTCDay()]})`;
}

async function createOrderNo() {
  const date = todayInSeoul();
  const prefix = orderNumberPrefix(date);
  const rows = await runtimeEnv.DB.prepare(`
    SELECT order_no
    FROM orders
    WHERE order_no LIKE ?
  `).bind(`${prefix}%`).all<{ order_no: string }>();
  return nextOrderNo(date, rows.results.map((row) => row.order_no));
}

function fulfillmentTypeFor(deliveryMethod: ReceiptRow["delivery_method"]) {
  if (deliveryMethod === "onsite_sale") return "onsite" as const;
  if (deliveryMethod === "onsite_reservation") return "pickup" as const;
  return "shipping" as const;
}

function scheduleLabel(deliveryMethod: ReceiptRow["delivery_method"], dueAt: string) {
  if (deliveryMethod === "onsite_sale") return `현장판매 · ${dueAt.slice(11, 16)}`;
  if (deliveryMethod === "onsite_reservation") {
    return `${koreanDate(dueAt.slice(0, 10))} · ${dueAt.slice(11, 16)}`;
  }
  return `${koreanDate(dueAt.slice(0, 10))} 발송 예정`;
}

function customizationText(value: string | null) {
  return value || null;
}

function workItemRecord(row: WorkItemRow, events: EventRow[]) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNo: row.order_no,
    fulfillmentType: fulfillmentTypeFor(row.delivery_method),
    scheduleLabel: scheduleLabel(row.delivery_method, row.due_at),
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    paymentStatus: row.payment_status,
    paidAmount: row.paid_amount,
    totalAmount: row.total_amount,
    customerArrivedAt: row.customer_arrived_at,
    customerNote: row.customer_note,
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
    customization: customizationText(row.customization_json),
    note: row.note,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: events.map((event) => ({
      id: event.id,
      type: event.event_type,
      fromValue: event.from_value,
      toValue: event.to_value,
      actor: event.actor,
      createdAt: event.created_at,
    })),
  };
}

async function receiptForIdempotency(idempotencyKey: string) {
  const row = await runtimeEnv.DB.prepare(`
    SELECT o.order_no,w.delivery_method,w.due_at
    FROM orders o
    JOIN work_items w ON w.order_id=o.id
    WHERE o.idempotency_key=?
    ORDER BY w.created_at,w.id
    LIMIT 1
  `).bind(idempotencyKey).first<ReceiptRow>();
  if (!row) return null;
  return {
    orderNo: row.order_no,
    fulfillmentType: fulfillmentTypeFor(row.delivery_method),
    scheduleLabel: scheduleLabel(row.delivery_method, row.due_at),
  };
}

async function manualOrderForIdempotency(idempotencyKey: string) {
  return runtimeEnv.DB.prepare(`
    SELECT id,order_no,version
    FROM orders
    WHERE idempotency_key=?
  `).bind(idempotencyKey).first<ManualOrderRow>();
}

async function createManualOrder(payload: CreatePayload) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const idempotencyKey = clean(payload.idempotencyKey);
  if (!idempotencyKey) {
    return Response.json({ error: "중복 방지 키를 확인해주세요." }, { status: 400 });
  }

  const existing = await manualOrderForIdempotency(idempotencyKey);
  if (existing) {
    return Response.json({
      order: { id: existing.id, orderNo: existing.order_no, version: existing.version },
    });
  }

  const preparedItems = await prepareManualWorkItems(payload);
  if ("error" in preparedItems) {
    return Response.json({ error: preparedItems.error }, { status: preparedItems.status ?? 400 });
  }

  const orderId = crypto.randomUUID();
  const orderNo = await createOrderNo();
  const buyerName = clean(payload.buyerName) || "주문자 미입력";
  const buyerPhone = normalizePhone(payload.buyerPhone ?? "");
  const now = new Date().toISOString();
  const totalAmount = preparedItems.workItems.reduce((sum, item) => sum + item.lineTotal, 0);

  try {
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`
        INSERT INTO orders(
          id,order_no,buyer_name,buyer_phone,payment_status,paid_amount,total_amount,
          customer_arrived_at,customer_note,idempotency_key,version,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,NULL,?,?,1,?,?)
      `).bind(
        orderId,
        orderNo,
        buyerName,
        buyerPhone,
        "unpaid",
        0,
        totalAmount,
        "",
        idempotencyKey,
        now,
        now,
      ),
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(
          id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at
        ) VALUES(?,NULL,?,'order_created',NULL,?,?,?)
      `).bind(
        crypto.randomUUID(),
        orderId,
        JSON.stringify({ manual: true, redactedFields: ["buyerName", "buyerPhone"] }),
        OPERATOR_ACTOR,
        now,
      ),
      ...workItemStatements(preparedItems.workItems, {
        orderId,
        actor: OPERATOR_ACTOR,
        now,
        eventValue: (item) => ({
          deliveryMethod: item.deliveryMethod,
          dueAt: item.dueAt,
          workStatus: item.workStatus,
          idempotencyKey,
          manual: true,
        }),
      }),
    ]);
  } catch (error) {
    const concurrent = await manualOrderForIdempotency(idempotencyKey);
    if (concurrent) {
      return Response.json({
        order: { id: concurrent.id, orderNo: concurrent.order_no, version: concurrent.version },
      });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "새 주문을 추가하지 못했습니다." },
      { status: 500 },
    );
  }

  return Response.json({
    order: { id: orderId, orderNo, version: 1 },
  }, { status: 201 });
}

export async function GET(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const params = new URL(request.url).searchParams;
    const date = clean(params.get("date") ?? "");
    const query = clean(params.get("q") ?? "");
    const workItemId = clean(params.get("workItemId") ?? "");
    if (date && !validIsoDate(date)) {
      return Response.json({ error: "조회 날짜 형식을 확인해주세요." }, { status: 400 });
    }

    const predicates = ["1=1"];
    const values: string[] = [];
    if (date) {
      predicates.push("date(w.due_at)=?", "w.work_status!='cancelled'");
      values.push(date);
    }
    if (query) {
      const like = `%${query}%`;
      predicates.push("(o.order_no LIKE ? OR o.buyer_name LIKE ? OR o.buyer_phone LIKE ? OR w.recipient_name LIKE ? OR w.recipient_phone LIKE ?)");
      values.push(like, like, like, like, like);
    }
    if (workItemId) {
      predicates.push("w.id=?");
      values.push(workItemId);
    }
    const result = await runtimeEnv.DB.prepare(`
      SELECT
        w.id,w.order_id,o.order_no,o.buyer_name,o.buyer_phone,o.payment_status,
        o.paid_amount,o.total_amount,o.customer_arrived_at,o.customer_note,
        w.product_id,w.product_name_snapshot,w.unit_price_snapshot,w.quantity,w.line_total,
        w.delivery_method,w.due_at,w.work_status,w.recipient_name,w.recipient_phone,
        w.postal_code,w.road_addr,w.road_addr_reference,w.jibun_addr,w.detail_addr,
        w.customization_json,w.note,w.version,w.created_at,w.updated_at
      FROM work_items w
      JOIN orders o ON o.id=w.order_id
      WHERE ${predicates.join(" AND ")}
      ORDER BY w.due_at,w.created_at,w.id
      LIMIT 500
    `).bind(...values).all<WorkItemRow>();
    const ids = result.results.map((item) => item.id);
    const events = ids.length
      ? await runtimeEnv.DB.prepare(`
        SELECT id,work_item_id,event_type,from_value,to_value,actor,created_at
        FROM work_item_events
        WHERE work_item_id IN (${ids.map(() => "?").join(",")})
        ORDER BY created_at DESC,id DESC
      `).bind(...ids).all<EventRow>()
      : { results: [] as EventRow[] };

    return Response.json(
      {
        orders: result.results.map((item) =>
          workItemRecord(item, events.results.filter((event) => event.work_item_id === item.id))),
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "주문을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let idempotencyKey = "";
  try {
    const payload = await request.json() as CreatePayload;
    if (payload.action === "manual-create") return createManualOrder(payload);
    idempotencyKey = clean(payload.idempotencyKey);
    const fulfillmentType = clean(payload.fulfillmentType);
    const paymentChoice = clean(payload.paymentMethod) || "later";
    const standardItems = (payload.items ?? []).filter(
      (item) => item.productId && Number.isInteger(item.quantity) && (item.quantity ?? 0) > 0,
    );
    const custom = payload.customItem;
    const customAmount = Number(custom?.budgetAmount ?? 0);
    const customValid = Boolean(
      custom
      && clean(custom.budgetOption)
      && Number.isInteger(customAmount)
      && customAmount >= 200_000,
    );
    const buyer = fulfillmentType === "onsite" ? "현장판매 주문" : clean(payload.buyerName);
    const buyerPhone = fulfillmentType === "onsite" ? "" : normalizePhone(payload.buyerPhone ?? "");

    if (
      !idempotencyKey
      || !fulfillmentTypes.has(fulfillmentType)
      || (fulfillmentType !== "onsite" && (!buyer || buyerPhone.length < 10))
      || (!standardItems.length && !customValid)
    ) {
      return Response.json({ error: "주문자와 상품 정보를 확인해주세요." }, { status: 400 });
    }
    if (custom && !customValid) {
      return Response.json({ error: "맞춤주문은 20만원 이상의 예산이 필요합니다." }, { status: 400 });
    }

    let actor = "kiosk";
    if (fulfillmentType === "onsite") {
      if (!paymentMethods.has(paymentChoice)) {
        return Response.json({ error: "현장판매 결제방식을 선택해주세요." }, { status: 400 });
      }
      actor = OPERATOR_ACTOR;
    }

    const existing = await receiptForIdempotency(idempotencyKey);
    if (existing) return Response.json({ order: existing });

    const today = todayInSeoul();
    const scheduleDate = fulfillmentType === "onsite"
      ? today
      : fulfillmentType === "pickup"
        ? clean(payload.pickupDate)
        : clean(payload.shipDate);
    if (fulfillmentType !== "onsite" && (!validIsoDate(scheduleDate) || scheduleDate < today)) {
      return Response.json({ error: "예약 가능한 날짜를 다시 선택해주세요." }, { status: 400 });
    }
    const pickupTime = clean(payload.pickupTime);
    if (fulfillmentType === "pickup" && !validPickupTime(pickupTime)) {
      return Response.json({ error: "방문 시간을 08:00부터 21:00 사이에서 선택해주세요." }, { status: 400 });
    }

    const recipientName = clean(payload.recipientName);
    const recipientPhone = normalizePhone(payload.recipientPhone ?? "");
    const postalCode = (payload.postalCode ?? "").replace(/\D/g, "");
    const roadAddr = clean(payload.roadAddr);
    const detailAddr = clean(payload.detailAddr);
    if (
      fulfillmentType === "shipping"
      && (!recipientName || recipientPhone.length < 10 || postalCode.length !== 5 || roadAddr.length < 5 || !detailAddr)
    ) {
      return Response.json({ error: "받는 분, 우편번호, 배송주소와 상세주소를 확인해주세요." }, { status: 400 });
    }

    const standardProductIds = [...new Set(standardItems.map((item) => item.productId as string))];
    const productIds = customValid ? [...new Set([...standardProductIds, "custom-order"])] : standardProductIds;
    const products = await productsForIds(productIds);
    if (
      products.length !== productIds.length
      || standardProductIds.some((id) => !products.find((product) => product.id === id && product.active))
    ) {
      return Response.json({ error: "현재 주문할 수 없는 상품이 포함되어 있습니다." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const dueAt = fulfillmentType === "onsite"
      ? nowInSeoul()
      : fulfillmentType === "pickup"
        ? `${scheduleDate}T${pickupTime}:00+09:00`
        : `${scheduleDate}T00:00:00+09:00`;
    const deliveryMethod = fulfillmentType === "onsite"
      ? "onsite_sale" as const
      : fulfillmentType === "pickup"
        ? "onsite_reservation" as const
        : "delivery" as const;
    const workStatus = fulfillmentType === "onsite" ? "completed" as const : "received" as const;
    const mergedItems = new Map<string, {
      product: ProductRow;
      quantity: number;
      lineTotal: number;
    }>();
    for (const item of standardItems) {
      const product = products.find((value) => value.id === item.productId)!;
      const key = [product.id, deliveryMethod, dueAt, fulfillmentType === "shipping" ? recipientPhone : ""].join("\u0000");
      const current = mergedItems.get(key);
      const quantity = item.quantity as number;
      if (current) {
        current.quantity += quantity;
        current.lineTotal += product.price * quantity;
      } else {
        mergedItems.set(key, { product, quantity, lineTotal: product.price * quantity });
      }
    }
    const workItems: PreparedWorkItem[] = [];
    for (const item of mergedItems.values()) {
      const workItem = buildWorkItem({
        productId: item.product.id,
        productName: item.product.name,
        unitPrice: item.product.price,
        quantity: item.quantity,
        deliveryMethod,
        dueAt,
        workStatus,
        recipientName: fulfillmentType === "shipping" ? recipientName : null,
        recipientPhone: fulfillmentType === "shipping" ? recipientPhone : null,
        postalCode: fulfillmentType === "shipping" ? postalCode : null,
        roadAddr: fulfillmentType === "shipping" ? roadAddr : null,
        roadAddrReference: fulfillmentType === "shipping" ? clean(payload.roadAddrReference) || null : null,
        jibunAddr: fulfillmentType === "shipping" ? clean(payload.jibunAddr) || null : null,
        detailAddr: fulfillmentType === "shipping" ? detailAddr : null,
        customizationJson: null,
        note: clean(payload.note),
      });
      if (!workItem) return Response.json({ error: "상품 금액과 수량을 확인해주세요." }, { status: 400 });
      workItems.push(workItem);
    }
    if (customValid && custom) {
      const workItem = buildWorkItem({
        productId: "custom-order",
        productName: "맞춤주문",
        unitPrice: customAmount,
        quantity: 1,
        deliveryMethod,
        dueAt,
        workStatus,
        recipientName: fulfillmentType === "shipping" ? recipientName : null,
        recipientPhone: fulfillmentType === "shipping" ? recipientPhone : null,
        postalCode: fulfillmentType === "shipping" ? postalCode : null,
        roadAddr: fulfillmentType === "shipping" ? roadAddr : null,
        roadAddrReference: fulfillmentType === "shipping" ? clean(payload.roadAddrReference) || null : null,
        jibunAddr: fulfillmentType === "shipping" ? clean(payload.jibunAddr) || null : null,
        detailAddr: fulfillmentType === "shipping" ? detailAddr : null,
        customizationJson: clean(custom.request) || null,
        note: clean(payload.note),
      });
      if (!workItem) return Response.json({ error: "상품 금액과 수량을 확인해주세요." }, { status: 400 });
      workItems.push(workItem);
    }

    const reserved = await runtimeEnv.DB.prepare(`
      SELECT product_id, SUM(quantity) AS quantity
      FROM work_items
      WHERE date(due_at) = ?1 AND work_status != 'cancelled'
      GROUP BY product_id
    `).bind(scheduleDate).all<{ product_id: string; quantity: number }>();
    const reservedByProduct = new Map(reserved.results.map((row) => [row.product_id, row.quantity]));
    const requestedByProduct = new Map<string, number>();
    for (const item of workItems) {
      requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
    }
    for (const [productId, quantity] of requestedByProduct) {
      const product = products.find((value) => value.id === productId);
      if (product && product.daily_limit !== null && (reservedByProduct.get(productId) ?? 0) + quantity > product.daily_limit) {
        return Response.json({ error: "선택한 날짜의 한정수량이 마감되었습니다. 수량 또는 날짜를 다시 확인해주세요." }, { status: 409 });
      }
    }

    const orderId = crypto.randomUUID();
    const orderNo = await createOrderNo();
    const totalAmount = workItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const paidAmount = fulfillmentType === "onsite" ? totalAmount : 0;
    const paymentStatus = fulfillmentType === "onsite" ? "paid" : "unpaid";
    const statements: D1PreparedStatement[] = [
      runtimeEnv.DB.prepare(`
        INSERT INTO orders(
          id,order_no,buyer_name,buyer_phone,payment_status,paid_amount,total_amount,
          customer_arrived_at,customer_note,idempotency_key,version,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,NULL,?,?,1,?,?)
      `).bind(
        orderId,
        orderNo,
        buyer,
        buyerPhone,
        paymentStatus,
        paidAmount,
        totalAmount,
        clean(payload.note),
        idempotencyKey,
        now,
        now,
      ),
      ...workItemStatements(workItems, {
        orderId,
        actor,
        now,
        eventValue: (item) => ({
          deliveryMethod: item.deliveryMethod,
          dueAt: item.dueAt,
          workStatus: item.workStatus,
          paymentMethod: fulfillmentType === "onsite" ? paymentChoice : null,
        }),
      }),
    ];
    await runtimeEnv.DB.batch(statements);
    return Response.json({
      order: {
        orderNo,
        fulfillmentType: fulfillmentType as "onsite" | "pickup" | "shipping",
        scheduleLabel: scheduleLabel(deliveryMethod, dueAt),
      },
    }, { status: 201 });
  } catch (error) {
    if (idempotencyKey) {
      const existing = await receiptForIdempotency(idempotencyKey);
      if (existing) return Response.json({ order: existing });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "주문을 접수하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as OrderUpdatePayload;
    const orderId = clean(payload.id);
    const expectedVersion = payload.expectedVersion;
    if (!orderId || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1 || !isRecord(payload.changes)) {
      return Response.json({ error: "수정할 주문과 버전을 확인해주세요." }, { status: 400 });
    }

    const changes = payload.changes;
    const editableFields = ["orderNo", "buyerName", "buyerPhone", "customerNote"];
    if (Object.keys(changes).some((field) => !editableFields.includes(field))) {
      return Response.json({ error: "수정할 수 없는 주문 정보가 포함되어 있습니다." }, { status: 400 });
    }
    const changedFields = editableFields.filter((field) => hasOwn(changes, field));
    if (!changedFields.length) {
      return Response.json({ error: "수정할 주문 정보가 없습니다." }, { status: 400 });
    }

    const orderNoInput = hasOwn(changes, "orderNo") ? textValue(changes.orderNo) : undefined;
    const buyerNameInput = hasOwn(changes, "buyerName") ? textValue(changes.buyerName) : undefined;
    const buyerPhoneInput = hasOwn(changes, "buyerPhone") ? textValue(changes.buyerPhone) : undefined;
    const customerNoteInput = hasOwn(changes, "customerNote") ? textValue(changes.customerNote) : undefined;
    if (
      (hasOwn(changes, "orderNo") && orderNoInput === undefined)
      || (hasOwn(changes, "buyerName") && buyerNameInput === undefined)
      || (hasOwn(changes, "buyerPhone") && buyerPhoneInput === undefined)
      || (hasOwn(changes, "customerNote") && customerNoteInput === undefined)
    ) {
      return Response.json({ error: "주문 정보 형식을 확인해주세요." }, { status: 400 });
    }

    const current = await runtimeEnv.DB.prepare(`
      SELECT id,order_no,buyer_name,buyer_phone,customer_note,version
      FROM orders
      WHERE id=?
    `).bind(orderId).first<CurrentOrderRow>();
    if (!current) return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
    if (current.version !== expectedVersion) {
      return Response.json({
        error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.",
        latestVersion: current.version,
      }, { status: 409 });
    }

    const orderNo = orderNoInput === undefined ? current.order_no : orderNoInput;
    const buyerName = buyerNameInput === undefined ? current.buyer_name : buyerNameInput || "주문자 미입력";
    const buyerPhone = buyerPhoneInput === undefined ? current.buyer_phone : normalizePhone(buyerPhoneInput);
    const customerNote = customerNoteInput === undefined ? current.customer_note : customerNoteInput;
    const now = new Date().toISOString();
    const eventValue = JSON.stringify({ redactedFields: changedFields });
    const results = await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`
        UPDATE orders
        SET order_no=?,buyer_name=?,buyer_phone=?,customer_note=?,version=version+1,updated_at=?
        WHERE id=? AND version=?
      `).bind(orderNo, buyerName, buyerPhone, customerNote, now, current.id, current.version),
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(
          id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at
        )
        SELECT ?,NULL,?,'order_updated',?,?,?,?
        WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)
      `).bind(
        crypto.randomUUID(),
        current.id,
        eventValue,
        eventValue,
        OPERATOR_ACTOR,
        now,
        current.id,
        current.version + 1,
      ),
    ]);
    if (!results[0].meta.changes) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }

    return Response.json({
      order: {
        id: current.id,
        orderNo,
        buyerName,
        buyerPhone,
        customerNote,
        version: current.version + 1,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "주문을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as { id?: string; expectedVersion?: number };
    const orderId = clean(payload.id);
    const expectedVersion = payload.expectedVersion;
    if (!orderId || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
      return Response.json({ error: "삭제할 주문과 버전을 확인해주세요." }, { status: 400 });
    }

    const current = await runtimeEnv.DB.prepare(`
      SELECT id,buyer_name,buyer_phone,customer_note,version
      FROM orders
      WHERE id=?
    `).bind(orderId).first<CurrentOrderRow>();
    if (!current) return Response.json({ error: "삭제할 주문을 찾을 수 없습니다." }, { status: 404 });
    if (current.version !== expectedVersion) {
      return Response.json({
        error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.",
        latestVersion: current.version,
      }, { status: 409 });
    }

    const now = new Date().toISOString();
    const matchesCurrent = "EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)";
    const results = await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`
        UPDATE skin_packs
        SET status='available',assigned_at=NULL,updated_at=?
        WHERE status='assigned'
          AND id IN (
            SELECT package_skin_packs.skin_pack_id
            FROM package_skin_packs
            JOIN packages ON packages.id=package_skin_packs.package_id
            JOIN work_items ON work_items.id=packages.work_item_id
            WHERE work_items.order_id=?
          )
          AND ${matchesCurrent}
      `).bind(now, current.id, current.id, current.version),
      runtimeEnv.DB.prepare(`
        DELETE FROM package_skin_packs
        WHERE package_id IN (
          SELECT packages.id
          FROM packages
          JOIN work_items ON work_items.id=packages.work_item_id
          WHERE work_items.order_id=?
        )
          AND ${matchesCurrent}
      `).bind(current.id, current.id, current.version),
      runtimeEnv.DB.prepare(`
        DELETE FROM packages
        WHERE work_item_id IN (SELECT id FROM work_items WHERE order_id=?)
          AND ${matchesCurrent}
      `).bind(current.id, current.id, current.version),
      runtimeEnv.DB.prepare(`
        DELETE FROM work_item_events
        WHERE order_id=? AND ${matchesCurrent}
      `).bind(current.id, current.id, current.version),
      runtimeEnv.DB.prepare(`
        DELETE FROM work_items
        WHERE order_id=? AND ${matchesCurrent}
      `).bind(current.id, current.id, current.version),
      runtimeEnv.DB.prepare(`
        DELETE FROM orders
        WHERE id=? AND version=?
      `).bind(current.id, current.version),
    ]);
    if (!results[5].meta.changes) {
      return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }

    return Response.json({ deletedId: current.id });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "주문을 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
