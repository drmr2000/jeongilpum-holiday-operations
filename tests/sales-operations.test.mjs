import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function order(overrides = {}) {
  return {
    id: "order-1",
    orderNo: "JI-260924-0001",
    buyerName: "테스트 고객",
    buyerPhone: "01012345678",
    status: "confirmed",
    fulfillmentType: "pickup",
    scheduleLabel: "9월 24일 목 10:00",
    fulfillmentId: "fulfillment-1",
    pickupAt: "2026-09-24T10:00:00+09:00",
    shipDate: null,
    recipientName: null,
    recipientPhone: null,
    postalCode: null,
    roadAddress: null,
    roadAddrReference: null,
    jibunAddr: null,
    detailAddress: null,
    customerArrived: false,
    note: "",
    totalAmount: 220000,
    paidAmount: 0,
    balance: 220000,
    paymentStatus: "unpaid",
    creditDueDate: null,
    creditMemo: null,
    customerAccountId: "customer-1",
    customerTotalOrdered: 220000,
    customerNetReceived: 0,
    customerReceivable: 220000,
    customerAdvance: 0,
    customerPaymentStatus: "credit",
    version: 1,
    submittedAt: "2026-09-23T00:00:00.000Z",
    items: [{ id: "item-1", productId: "mi", name: "미", quantity: 1, unitPrice: 220000 }],
    payments: [],
    packageCodes: [],
    packageTotal: 0,
    packageCompleted: 0,
    hasUnacknowledgedChange: false,
    events: [],
    ...overrides,
  };
}

test("sales API keeps cancelled history searchable and exposes work progress, customer ledger, and events", async () => {
  const [api, arrival, sales, statusApi] = await Promise.all([
    read("app/api/orders/route.ts"),
    read("app/api/orders/arrival/route.ts"),
    read("app/components/SalesApp.tsx"),
    read("app/api/orders/status/route.ts"),
  ]);
  assert.match(api, /else if \(q\)[\s\S]*SALES_SEARCH_ORDERS_SQL/);
  assert.match(api, /packageCompleted/);
  assert.match(api, /hasUnacknowledgedChange/);
  assert.match(api, /events: events\.map/);
  assert.match(arrival, /CUSTOMER_ARRIVED/);
  assert.match(arrival, /customer_arrived=0/);
  assert.match(sales, /setInterval\([\s\S]{0,100}2500\)/);
  assert.match(sales, /addEventListener\("focus"/);
  assert.match(sales, /addEventListener\("online"/);
  assert.match(sales, /useCallback\([\s\S]*\}, \[selectedDate\]\)/);
  for (const label of ["시간", "고객", "상품", "수량", "구분", "작업상태", "결제", "고객상태", "변경"]) assert.match(sales, new RegExp(label));
  assert.match(statusApi, /cancellationReason/);
  assert.match(statusApi, /reason,actor_id/);
});
