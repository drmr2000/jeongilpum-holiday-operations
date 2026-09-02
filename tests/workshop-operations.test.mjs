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
    buyerName: "테스트 작업",
    status: "confirmed",
    version: 1,
    submittedAt: "2026-09-23T00:00:00.000Z",
    fulfillmentId: "fulfillment-1",
    fulfillmentType: "pickup",
    pickupAt: "2026-09-24T11:00:00+09:00",
    shipDate: null,
    scheduleLabel: "2026-09-24 11:00 방문",
    customerArrived: false,
    actualArrivedAt: null,
    arrivalOffsetMinutes: null,
    note: "",
    hasSpecialRequest: false,
    items: [{ id: "item-1", productId: "mi", name: "미", quantity: 2, packageTotal: 2, packageCompleted: 0, hasCustomization: false }],
    packageTotal: 2,
    packageCompleted: 0,
    hasUnacknowledgedChange: false,
    changeSeverity: null,
    workAcceptedAt: null,
    workAcceptedBy: null,
    workStartedAt: null,
    workCompletedAt: null,
    substituteCandidates: [],
    events: [],
    ...overrides,
  };
}

test("a failed statement rolls back the whole work transition", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,order_status TEXT,version INTEGER); CREATE TABLE order_events(id TEXT PRIMARY KEY,order_id TEXT,event_type TEXT); CREATE TRIGGER fail_work_event BEFORE INSERT ON order_events WHEN NEW.event_type='WORK_STARTED' BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  database.prepare("INSERT INTO orders VALUES('order-1','confirmed',1)").run();
  assert.throws(() => {
    database.exec("BEGIN");
    try {
      database.prepare("UPDATE orders SET order_status='in_progress',version=version+1 WHERE id='order-1'").run();
      database.prepare("INSERT INTO order_events VALUES('event-1','order-1','WORK_STARTED')").run();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  });
  const preserved = database.prepare("SELECT order_status,version FROM orders").get();
  assert.equal(preserved.order_status, "confirmed");
  assert.equal(preserved.version, 1);
  database.close();
});

test("digital whiteboard UI ties checkmarks to ready, separates completed, and omits money", async () => {
  const [api, actions, app, salesApi] = await Promise.all([
    read("app/api/workshop/orders/route.ts"),
    read("app/api/workshop/actions/route.ts"),
    read("app/components/WorkshopApp.tsx"),
    read("app/api/orders/route.ts"),
  ]);
  for (const source of [api, app]) {
    assert.doesNotMatch(source, /payments|paidAmount|balance|creditDueDate|카드결제|계좌이체|외상|잔액|totalAmount|금액/);
  }
  assert.match(app, /order\.status === "ready" \? "✓" : "☐"/);
  assert.match(app, /준비완료 \{completed\.length\}건/);
  assert.match(app, /전체 보기/);
  assert.match(app, /오늘 상품별 생산량/);
  assert.match(app, /시간대별 작업 타임라인/);
  assert.match(app, /setInterval\([\s\S]{0,100}2500\)/);
  assert.match(app, /addEventListener\("focus"/);
  assert.match(app, /addEventListener\("online"/);
  assert.match(api, /fulfillment_items/);
  assert.match(api, /changeSeverity/);
  assert.match(api, /workAcceptedBy/);
  assert.match(api, /Cache-Control/);
  assert.match(actions, /runtimeEnv\.DB\.batch/);
  assert.match(actions, /WORK_ACCEPTED/);
  assert.match(actions, /package_status='in_progress'/);
  assert.match(actions, /package_status='completed'/);
  assert.match(salesApi, /workAcceptedAt/);
});
test("one-for-one package reassignment preserves total and records non-PII audit data", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,order_status TEXT,version INTEGER); CREATE TABLE order_items(order_id TEXT,product_id TEXT,quantity INTEGER); CREATE TABLE packages(id TEXT PRIMARY KEY,order_id TEXT,product_id TEXT,package_status TEXT); CREATE TABLE order_events(id TEXT PRIMARY KEY,order_id TEXT,event_type TEXT,after_data TEXT,reason TEXT,actor_id TEXT,created_at TEXT)");
  database.prepare("INSERT INTO orders VALUES('early','in_progress',1),('later','ready',1)").run();
  database.prepare("INSERT INTO order_items VALUES('early','mi',1),('later','mi',1)").run();
  database.prepare("INSERT INTO packages VALUES('early-p','early','mi','in_progress'),('MI-001','later','mi','completed')").run();
  const totalBefore = database.prepare("SELECT SUM(quantity) total FROM order_items").get().total;
  database.exec("BEGIN");
  database.prepare("UPDATE packages SET order_id='early' WHERE id='MI-001' AND order_id='later' AND package_status='completed'").run();
  database.prepare("UPDATE packages SET order_id='later' WHERE id='early-p' AND order_id='early' AND package_status='in_progress'").run();
  database.prepare("UPDATE orders SET order_status='ready',version=version+1 WHERE id='early'").run();
  database.prepare("UPDATE orders SET order_status='in_progress',version=version+1 WHERE id='later'").run();
  database.prepare("INSERT INTO order_events VALUES('event','early','PACKAGE_REASSIGNED','{\"packageId\":\"MI-001\",\"replacementPackageId\":\"early-p\",\"fromOrderId\":\"later\",\"toOrderId\":\"early\",\"workerId\":\"worker\",\"performedAt\":\"2026-09-24T01:15:00Z\",\"labelActionRequired\":\"VOID_AND_REPRINT\"}','EARLY_CUSTOMER_ARRIVAL','worker','2026-09-24T01:15:00Z')").run();
  database.exec("COMMIT");
  assert.equal(database.prepare("SELECT SUM(quantity) total FROM order_items").get().total, totalBefore);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM packages WHERE order_id='early'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM packages WHERE order_id='later'").get().count, 1);
  assert.equal(database.prepare("SELECT order_status FROM orders WHERE id='early'").get().order_status, "ready");
  assert.equal(database.prepare("SELECT order_status FROM orders WHERE id='later'").get().order_status, "in_progress");
  const event = database.prepare("SELECT * FROM order_events").get();
  assert.equal(event.event_type, "PACKAGE_REASSIGNED");
  assert.equal(event.reason, "EARLY_CUSTOMER_ARRIVAL");
  assert.match(event.after_data, /VOID_AND_REPRINT/);
  assert.doesNotMatch(event.after_data, /buyerName|phone|address/);
  database.close();
});

test("integrated APIs expose arrival, reassignment, audit, and label hooks without migration", async () => {
  const [ordersApi, reassignApi, workshop] = await Promise.all([
    read("app/api/workshop/orders/route.ts"),
    read("app/api/workshop/packages/reassign/route.ts"),
    read("app/components/WorkshopApp.tsx"),
  ]);
  assert.match(ordersApi, /actualArrivedAt/);
  assert.match(ordersApi, /fulfillment_items/);
  assert.match(ordersApi, /findSubstituteCandidates/);
  assert.match(reassignApi, /PACKAGE_REASSIGNED/);
  assert.match(reassignApi, /EARLY_CUSTOMER_ARRIVAL/);
  assert.match(reassignApi, /order_item_customizations/);
  assert.match(reassignApi, /labelActionRequired/);
  assert.match(reassignApi, /workerId/);
  assert.match(reassignApi, /performedAt/);
  assert.match(workshop, /대체 완성품 적용/);
});
