import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function applyBreakpointMigration(database, path) {
  const sql = await read(path);
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

async function applyProviderSafeMigration(database, path) {
  const sql = await read(path);
  const statements = sql
    .split(";")
    .map((statement) => statement.replaceAll("--> statement-breakpoint", "").trim())
    .filter(Boolean);
  for (const statement of statements) database.exec(statement);
  return statements;
}

async function baseDatabase(location = ":memory:") {
  const database = new DatabaseSync(location);
  database.exec("PRAGMA foreign_keys=ON");
  for (const migration of [
    "drizzle/0000_charming_bishop.sql",
    "drizzle/0001_confused_swarm.sql",
    "drizzle/0002_deep_giant_girl.sql",
    "drizzle/0003_cancel_production_smoke_orders.sql",
  ]) {
    await applyBreakpointMigration(database, migration);
  }
  return database;
}

async function preLedgerDatabase(location = ":memory:") {
  const database = await baseDatabase(location);
  await applyProviderSafeMigration(database, "drizzle/0004_brown_omega_red.sql");
  await applyBreakpointMigration(database, "drizzle/0005_chunky_sway.sql");
  return database;
}

async function migratedDatabase(location = ":memory:") {
  const database = await preLedgerDatabase(location);
  await applyBreakpointMigration(database, "drizzle/0006_hot_hercules.sql");
  return database;
}

function insertOrder(database, id, totalAmount = 220_000) {
  const now = "2026-09-01T00:00:00.000Z";
  database.prepare(`
    INSERT INTO orders(
      id,order_no,season_id,buyer_name_snapshot,buyer_phone_snapshot,
      order_status,fulfillment_type,schedule_label,customer_note,total_amount,
      idempotency_key,version,submitted_at,created_at,updated_at
    ) VALUES(?,?,?,'테스트 고객','01012345678','submitted','pickup','9월 10일 · 10:00','',?,?,1,?,?,?)
  `).run(id, `TEST-${id}`, "season-2026-chuseok", totalAmount, `idem-${id}`, now, now, now);
}

function insertItem(database, orderId, itemId, quantity = 1, productId = "mi") {
  database.prepare(`
    INSERT INTO order_items(
      id,order_id,product_id,product_name_snapshot,list_price_snapshot,
      sale_unit_price,quantity,line_total,created_at
    ) VALUES(?,?,?,'미',220000,220000,?,?,?)
  `).run(itemId, orderId, productId, quantity, 220_000 * quantity, "2026-09-01T00:00:00.000Z");
}

const reservationSql = `
  INSERT INTO product_daily_reservations(
    id,order_id,order_item_id,product_id,reserve_date,quantity,status,created_at
  )
  SELECT ?,?,?,?,?,CASE
    WHEN (
      COALESCE((
        SELECT SUM(quantity)
        FROM product_daily_reservations
        WHERE product_id=? AND reserve_date=? AND status='active'
      ),0) + ?
    ) <= (
      SELECT daily_limit
      FROM product_daily_limits
      WHERE product_id=? AND active=1
    )
    THEN ?
    ELSE 0
  END,'active',?
`;

function reserveLimited(database, id, orderId, itemId, quantity = 1) {
  database.prepare(reservationSql).run(
    id,
    orderId,
    itemId,
    "mi",
    "2026-09-10",
    "mi",
    "2026-09-10",
    quantity,
    "mi",
    quantity,
    "2026-09-01T00:00:00.000Z",
  );
}

function recordPayment(database, {
  id,
  orderId,
  method,
  amount,
  idempotencyKey,
  paidAt,
}) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const order = database.prepare("SELECT total_amount FROM orders WHERE id=?").get(orderId);
    const previous = database.prepare("SELECT COALESCE(SUM(CASE WHEN type='payment' THEN amount WHEN type='refund' THEN -amount ELSE amount END),0) AS paid FROM payments WHERE order_id=?").get(orderId);
    database.prepare("INSERT INTO payments(id,order_id,type,method,amount,paid_at,recorded_by,memo,idempotency_key,created_at) VALUES(?,?,'payment',?,?,?,?,?,?,?)")
      .run(id, orderId, method, amount, paidAt, "operator", "", idempotencyKey, paidAt);
    database.prepare("UPDATE order_credit_terms SET status='settled',settled_at=? WHERE order_id=? AND status='open' AND ?>=?")
      .run(paidAt, orderId, previous.paid + amount, order.total_amount);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

test("the former trigger is reproducibly truncated by semicolon splitting", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE product_daily_reservations(quantity INTEGER,status TEXT)");
  const formerLines92To114 = `
    CREATE TRIGGER trg_daily_reservations_validate_insert
    BEFORE INSERT ON product_daily_reservations
    WHEN NEW.status = 'active'
    BEGIN
      SELECT CASE
        WHEN NEW.quantity <= 0 THEN RAISE(ABORT, 'reservation quantity must be positive')
      END;
    END;
  `;
  const providerFirstFragment = formerLines92To114.split(";")[0];
  assert.throws(() => database.exec(providerFirstFragment), /incomplete input/);
  database.close();
});

test("0004 is provider-safe when every semicolon-delimited unit is executed independently", async () => {
  const database = await baseDatabase();
  const statements = await applyProviderSafeMigration(database, "drizzle/0004_brown_omega_red.sql");
  assert.equal(statements.length, 15);
  const migration = await read("drizzle/0004_brown_omega_red.sql");
  assert.doesNotMatch(migration, /CREATE TRIGGER|BEGIN\s+[\s\S]*END;/);
  database.close();
});

test("corrected 0004 upgrades a production-like database without changing existing rows", async () => {
  const database = await baseDatabase();
  insertOrder(database, "legacy-row");
  insertItem(database, "legacy-row", "legacy-item");
  database.prepare("INSERT INTO fulfillments(id,order_id,fulfillment_type,pickup_at,status,customer_arrived,note,created_at,updated_at) VALUES('legacy-fulfillment','legacy-row','pickup','2026-09-10T10:00:00+09:00','scheduled',0,'','2026-09-01','2026-09-01')").run();
  database.prepare("INSERT INTO fulfillment_items(id,fulfillment_id,order_item_id,quantity,created_at) VALUES('legacy-fi','legacy-fulfillment','legacy-item',1,'2026-09-01')").run();
  database.prepare("INSERT INTO order_events(id,order_id,event_type,created_at) VALUES('legacy-event','legacy-row','order_submitted','2026-09-01')").run();
  const before = Object.fromEntries(["orders", "order_items", "order_events", "fulfillments", "fulfillment_items", "products"].map((table) => [table, database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  await applyProviderSafeMigration(database, "drizzle/0004_brown_omega_red.sql");
  const after = Object.fromEntries(Object.keys(before).map((table) => [table, database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  assert.deepEqual(after, { ...before, products: before.products + 1 });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM products WHERE id='custom-order' AND active=0").get().count, 1);
  database.close();
});

test("schema contains every required table, index, and provider-safe constraint", async () => {
  const database = await migratedDatabase();
  for (const table of [
    "payments",
    "order_credit_terms",
    "product_daily_limits",
    "product_daily_reservations",
    "order_item_customizations",
    "customer_accounts",
    "order_customer_accounts",
    "customer_ledger_transactions",
    "customer_ledger_consultations",
    "customer_ledger_consultation_orders",
    "customer_ledger_events",
  ]) {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name=?").get(table).count, 1);
  }
  for (const index of [
    "idx_payments_idempotency",
    "idx_payments_order_paid_at",
    "idx_order_credit_terms_order_status",
    "idx_daily_reservations_item",
    "idx_daily_reservations_product_date",
    "idx_daily_reservations_order",
    "idx_order_item_customizations_item",
    "idx_customer_accounts_identity_sequence",
    "idx_customer_ledger_transactions_idempotency",
    "idx_customer_ledger_transactions_customer_time",
    "idx_customer_ledger_transactions_reversal_once",
    "idx_order_customer_accounts_customer",
  ]) {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='index' AND name=?").get(index).count, 1);
  }
  const reservationDefinition = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='product_daily_reservations'").get().sql;
  assert.match(reservationDefinition, /product_daily_reservations_quantity_positive/);
  assert.match(reservationDefinition, /product_daily_reservations_status_valid/);
  const migrationTriggerCount = database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='trigger' AND name LIKE 'trg_%'").get().count;
  assert.equal(migrationTriggerCount, 0);
  database.close();
});

test("custom order integrates into the main order draft and persists custom fields", async () => {
  const [custom, kiosk, api] = await Promise.all([
    read("app/components/CustomOrderApp.tsx"),
    read("app/components/KioskApp.tsx"),
    read("app/api/orders/route.ts"),
  ]);
  for (const category of ["진공세트", "프리미엄", "O'meat", "LA갈비", "뼈세트"]) {
    assert.match(custom, new RegExp(category.replace("'", "\\'")));
  }
  assert.match(custom, /맞춤주문은 20만원부터 가능합니다/);
  assert.match(kiosk, /custom-review-item/);
  assert.match(api, /customAmount >= 200_000/);

  const database = await migratedDatabase();
  insertOrder(database, "custom-persist", 200_000);
  insertItem(database, "custom-persist", "custom-item", 1, "custom-order");
  database.prepare("INSERT INTO order_item_customizations(id,order_item_id,category,budget_option,desired_composition,preferred_cut,fat_preference,packaging_request,other_request,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("customization", "custom-item", "프리미엄", "20만원대", "구성", "등심", "적게", "선물포장", "테스트", "2026-09-01");
  const row = database.prepare("SELECT * FROM order_item_customizations WHERE order_item_id='custom-item'").get();
  assert.equal(row.category, "프리미엄");
  assert.equal(row.budget_option, "20만원대");
  database.close();
});

test("pickup and shipping calendars expose today, selected, and closed labels together", async () => {
  const [kiosk, css] = await Promise.all([
    read("app/components/KioskApp.tsx"),
    read("app/kiosk-flow.css"),
  ]);
  assert.match(kiosk, /date===today&&<small>오늘<\/small>/);
  assert.match(kiosk, /value===date&&<small>✓ 선택<\/small>/);
  assert.match(kiosk, /<small>예약마감<\/small>/);
  assert.match(css, /button\.today/);
  assert.match(kiosk, /type="pickup"/);
  assert.match(kiosk, /type="shipping"/);
});

test("conditional reservation plus CHECK allows only one concurrent order at 29 of 30", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeongilpum-limit-"));
  const databasePath = join(directory, "commerce.sqlite");
  const database = await migratedDatabase(databasePath);
  database.exec("PRAGMA journal_mode=WAL");
  insertOrder(database, "limit-base", 6_380_000);
  insertItem(database, "limit-base", "item-base", 29);
  database.prepare("INSERT INTO product_daily_reservations(id,order_id,order_item_id,product_id,reserve_date,quantity,status,created_at) VALUES(?,?,?,?,?,29,'active',?)")
    .run("reservation-base", "limit-base", "item-base", "mi", "2026-09-10", "2026-09-01T00:00:00.000Z");
  for (const suffix of ["a", "b"]) {
    insertOrder(database, `limit-${suffix}`);
    insertItem(database, `limit-${suffix}`, `item-${suffix}`);
  }
  database.close();

  const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const workerSource = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { DatabaseSync } = require("node:sqlite");
    const gate = new Int32Array(workerData.gate);
    const database = new DatabaseSync(workerData.databasePath);
    database.exec("PRAGMA busy_timeout=5000");
    Atomics.add(gate, 0, 1);
    Atomics.notify(gate, 0);
    Atomics.wait(gate, 1, 0);
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare(workerData.sql).run(...workerData.params);
      database.exec("COMMIT");
      database.close();
      parentPort.postMessage({ ok: true });
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      database.close();
      parentPort.postMessage({ ok: false, message: error.message });
    }
  `;
  const runWorker = (suffix) => new Promise((resolve, reject) => {
    const params = [
      `reservation-${suffix}`,
      `limit-${suffix}`,
      `item-${suffix}`,
      "mi",
      "2026-09-10",
      "mi",
      "2026-09-10",
      1,
      "mi",
      1,
      "2026-09-01T00:00:00.000Z",
    ];
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { gate, databasePath, sql: reservationSql, params },
    });
    worker.once("message", resolve);
    worker.once("error", reject);
  });
  const workers = [runWorker("a"), runWorker("b")];
  const view = new Int32Array(gate);
  while (Atomics.load(view, 0) < 2) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  Atomics.store(view, 1, 1);
  Atomics.notify(view, 1, 2);
  const results = await Promise.all(workers);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.match(results.find((result) => !result.ok).message, /product_daily_reservations_quantity_positive|CHECK constraint failed/);

  const verify = new DatabaseSync(databasePath);
  assert.equal(verify.prepare("SELECT SUM(quantity) AS reserved FROM product_daily_reservations WHERE product_id='mi' AND reserve_date='2026-09-10' AND status='active'").get().reserved, 30);
  verify.close();
  await rm(directory, { recursive: true, force: true });
});

test("0006 groups the same name and phone into one unallocated customer ledger", async () => {
  const database = await preLedgerDatabase();
  insertOrder(database, "customer-order-1", 300_000);
  insertOrder(database, "customer-order-2", 200_000);
  recordPayment(database, { id: "pay-1", orderId: "customer-order-1", method: "card", amount: 100_000, idempotencyKey: "pay-idem-1", paidAt: "2026-09-01T10:00:00.000Z" });
  recordPayment(database, { id: "pay-2", orderId: "customer-order-1", method: "bank_transfer", amount: 150_000, idempotencyKey: "pay-idem-2", paidAt: "2026-09-01T11:00:00.000Z" });

  await applyBreakpointMigration(database, "drizzle/0006_hot_hercules.sql");

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM customer_accounts").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM order_customer_accounts").get().count, 2);
  const account = database.prepare("SELECT id FROM customer_accounts").get();
  const totals = database.prepare(`
    SELECT
      (SELECT SUM(o.total_amount) FROM orders o JOIN order_customer_accounts oca ON oca.order_id=o.id WHERE oca.customer_account_id=? AND o.order_status!='cancelled') AS ordered,
      (SELECT SUM(CASE WHEN type IN ('reversal','transfer_out') THEN -amount ELSE amount END) FROM customer_ledger_transactions WHERE customer_account_id=?) AS received
  `).get(account.id, account.id);
  assert.equal(totals.ordered, 500_000);
  assert.equal(totals.received, 250_000);
  assert.equal(totals.ordered - totals.received, 250_000);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('customer_ledger_transactions') WHERE name='order_id'").get().count, 0);
  database.close();
});

test("payment correction preserves the original and uses reversal plus optional replacement", async () => {
  const database = await migratedDatabase();
  const now = "2026-09-01T10:00:00.000Z";
  database.prepare("INSERT INTO customer_accounts(id,normalized_name,normalized_phone,display_name,display_phone,created_at,updated_at) VALUES('customer','테스트 고객','01012345678','테스트 고객','01012345678',?,?)").run(now, now);
  database.prepare("INSERT INTO customer_ledger_transactions(id,customer_account_id,type,method,amount,transacted_at,memo,idempotency_key,recorded_by,created_at) VALUES('original','customer','payment','cash',100000,?,'','original-key','operator',?)").run(now, now);
  database.prepare("INSERT INTO customer_ledger_transactions(id,customer_account_id,type,amount,transacted_at,memo,related_transaction_id,idempotency_key,recorded_by,created_at) VALUES('reversal','customer','reversal',100000,?,'금액 정정','original','reversal-key','operator',?)").run(now, now);
  database.prepare("INSERT INTO customer_ledger_transactions(id,customer_account_id,type,method,amount,transacted_at,memo,related_transaction_id,idempotency_key,recorded_by,created_at) VALUES('replacement','customer','payment','card',70000,?,'정정 결제','original','replacement-key','operator',?)").run(now, now);
  const net = database.prepare("SELECT SUM(CASE WHEN type IN ('reversal','transfer_out') THEN -amount ELSE amount END) AS amount FROM customer_ledger_transactions WHERE customer_account_id='customer'").get().amount;
  assert.equal(net, 70_000);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM customer_ledger_transactions WHERE id='original'").get().count, 1);
  assert.throws(
    () => database.prepare("INSERT INTO customer_ledger_transactions(id,customer_account_id,type,amount,transacted_at,memo,related_transaction_id,idempotency_key,recorded_by,created_at) VALUES('duplicate-reversal','customer','reversal',100000,?,'중복','original','duplicate-reversal-key','operator',?)").run(now, now),
    /idx_customer_ledger_transactions_reversal_once|UNIQUE constraint failed/,
  );
  database.close();
});

test("customer ledger uses the shared operator session and stays out of workshop", async () => {
  const [sales, session, workshop] = await Promise.all([
    read("app/components/SalesApp.tsx"),
    read("app/lib/operator-session.ts"),
    read("app/components/WorkshopApp.tsx"),
  ]);
  assert.match(session, /OPERATOR_PASSCODE/);
  assert.doesNotMatch(workshop, /고객 결제·미수|결제누계|결제수단|외상 처리/);
});
