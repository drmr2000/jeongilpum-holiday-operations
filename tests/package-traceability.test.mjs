import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { aggregateProductionNeeds, additionalNeeded, buildSkinPackCode, skinPackLabelsToLongCsv } from "../app/lib/production-domain.ts";
import { buildPackageCode, parseTraceabilityScan, validateTraceabilityLength } from "../app/lib/package-domain.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const splitMigration = (sql) => sql.split(/--> statement-breakpoint\s*/).map((value) => value.trim()).filter(Boolean);
function apply(database, sql) { for (const statement of splitMigration(sql)) database.exec(statement); }
function applyProviderSafe(database, sql) {
  const statements = sql.split(";").map((value) => value.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
  for (const statement of statements) database.exec(statement);
  return statements;
}
async function migratedDatabase(include0005 = true, location = ":memory:") {
  const database = new DatabaseSync(location);
  database.exec("PRAGMA foreign_keys=ON");
  for (const name of ["0000_charming_bishop.sql", "0001_confused_swarm.sql", "0002_deep_giant_girl.sql", "0003_cancel_production_smoke_orders.sql"]) apply(database, await read(`drizzle/${name}`));
  applyProviderSafe(database, await read("drizzle/0004_brown_omega_red.sql"));
  if (include0005) applyProviderSafe(database, await read("drizzle/0005_chunky_sway.sql"));
  return database;
}
function trace(database, number, fields = {}) {
  database.prepare("INSERT INTO traceability_records(traceability_no,last_raw_scan,origin,slaughterhouse,cattle_type,grade,last_used_by,last_used_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(number, number, fields.origin ?? "국내산", fields.slaughterhouse ?? "정일도축장", fields.cattleType ?? "한우", fields.grade ?? "1++", "worker", "2026-08-30T00:00:00Z", "2026-08-30T00:00:00Z", "2026-08-30T00:00:00Z");
}
function batch(database, { id, code, name, target, traceabilityNo, segment = 1, parent = null }) {
  database.prepare("INSERT INTO production_batches(id,production_date,parent_batch_id,segment_no,component_code,cut_name_snapshot,required_quantity,available_quantity_at_start,additional_needed,production_target,produced_quantity,traceability_no,origin,slaughterhouse,cattle_type,grade,storage_method,expiry_text,packaging_material,food_type,status,started_by,started_at,created_at,updated_at) VALUES(?,?,?,?,?,?,20,5,15,?,0,?,'국내산','정일도축장','한우','1++','냉장','제조일 별도','필름','포장육','in_progress','worker','2026-08-30T00:00:00Z','2026-08-30T00:00:00Z','2026-08-30T00:00:00Z')").run(id, "2026-08-30", parent, segment, code, name, target, traceabilityNo);
}
function createPackAtomic(database, { id, batchId, sequence, code, componentCode, name, weight, traceabilityNo, idempotencyKey = `idem-${id}`, createdAt = "2026-08-30T01:00:00Z" }) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const inserted = database.prepare("INSERT INTO skin_packs(id,production_batch_id,batch_sequence,skin_pack_code,component_code,cut_name_snapshot,weight_g,traceability_no,origin,slaughterhouse,cattle_type,grade,manufactured_at,storage_method,expiry_text,packaging_material,food_type,status,idempotency_key,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'available',?,?,?,? FROM production_batches pb WHERE pb.id=? AND pb.status='in_progress' AND pb.produced_quantity=? AND pb.produced_quantity<pb.production_target").run(id, batchId, sequence, code, componentCode, name, weight, traceabilityNo, "국내산", "정일도축장", "한우", "1++", createdAt, "냉장", "제조일 별도", "필름", "포장육", idempotencyKey, "worker", createdAt, createdAt, batchId, sequence - 1);
    const label = { skinPackCode: code, cutName: name, weightG: weight, traceabilityNo, origin: "국내산", slaughterhouse: "정일도축장", grade: "1++", manufacturedAt: createdAt, storageMethod: "냉장", expiryText: "제조일 별도", packagingMaterial: "필름", foodType: "포장육" };
    const labeled = database.prepare("INSERT INTO skin_pack_labels(id,skin_pack_id,version,status,payload_json,created_by,created_at) SELECT ?,?,1,'draft',?,?,? WHERE EXISTS(SELECT 1 FROM skin_packs WHERE id=? AND idempotency_key=?)").run(`label-${id}`, id, JSON.stringify(label), "worker", createdAt, id, idempotencyKey);
    const updated = database.prepare("UPDATE production_batches SET produced_quantity=produced_quantity+1,updated_at=? WHERE id=? AND status='in_progress' AND produced_quantity=? AND produced_quantity<production_target AND EXISTS(SELECT 1 FROM skin_packs WHERE id=? AND idempotency_key=?)").run(createdAt, batchId, sequence - 1, id, idempotencyKey);
    database.exec("COMMIT");
    return { inserted: inserted.changes, labeled: labeled.changes, updated: updated.changes };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}
function insertLegacyOrder(database) {
  const season = database.prepare("SELECT id FROM sales_seasons LIMIT 1").get();
  database.prepare("INSERT INTO orders(id,order_no,season_id,buyer_name_snapshot,buyer_phone_snapshot,order_status,fulfillment_type,schedule_label,customer_note,total_amount,idempotency_key,version,submitted_at,created_at,updated_at) VALUES('legacy-order','JI-260830-9000',?,'보존 고객','01000000000','confirmed','pickup','2026-09-01 10:00 방문','보존 메모',300000,'legacy-idem',2,'2026-08-30','2026-08-30','2026-08-30')").run(season.id);
  database.prepare("INSERT INTO order_items(id,order_id,product_id,product_name_snapshot,list_price_snapshot,sale_unit_price,quantity,line_total,created_at) VALUES('legacy-item','legacy-order','palyeong','팔영세트',300000,300000,1,300000,'2026-08-30')").run();
  database.prepare("INSERT INTO fulfillments(id,order_id,fulfillment_type,pickup_at,status,customer_arrived,note,created_at,updated_at) VALUES('legacy-fulfillment','legacy-order','pickup','2026-09-01T10:00:00+09:00','scheduled',0,'','2026-08-30','2026-08-30')").run();
  database.prepare("INSERT INTO fulfillment_items(id,fulfillment_id,order_item_id,quantity,created_at) VALUES('legacy-fi','legacy-fulfillment','legacy-item',1,'2026-08-30')").run();
  database.prepare("INSERT INTO order_events(id,order_id,event_type,after_data,created_at) VALUES('legacy-event','legacy-order','order_submitted','{}','2026-08-30')").run();
  database.prepare("INSERT INTO packages(id,order_id,package_code,product_id,product_name_snapshot,package_status,created_at,updated_at) VALUES('legacy-package','legacy-order','LEGACY-PACKAGE','palyeong','팔영세트','completed','2026-08-30','2026-08-30')").run();
}
const palyeongBom = [["CM", "치마살"], ["BC", "부채살"], ["UJ", "업진살"], ["GB", "갈비살"], ["JJ", "제비추리"]].map(([componentCode, componentName], index) => ({ productId: "palyeong", componentId: `pc-${index}`, componentCode, componentName, quantityPerProduct: 1 }));

test("0005 is provider-safe under semicolon execution and preserves production-like legacy rows", async () => {
  const database = await migratedDatabase(false); insertLegacyOrder(database);
  const stableTables = ["orders", "order_items", "order_events", "fulfillments", "fulfillment_items", "products", "packages"];
  const before = Object.fromEntries(stableTables.map((table) => [table, database.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count]));
  const original = database.prepare("SELECT order_no,buyer_name_snapshot,total_amount,version FROM orders WHERE id='legacy-order'").get();
  const packageOriginal = database.prepare("SELECT package_code,package_status,product_id FROM packages WHERE id='legacy-package'").get();
  const sql = await read("drizzle/0005_chunky_sway.sql");
  const statements = applyProviderSafe(database, sql);
  assert.ok(statements.length > 20);
  assert.doesNotMatch(sql, /CREATE TRIGGER|\bBEGIN\b[\s\S]*\bEND\b|RAISE\s*\(/);
  assert.deepEqual(Object.fromEntries(stableTables.map((table) => [table, database.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count])), before);
  assert.deepEqual(database.prepare("SELECT order_no,buyer_name_snapshot,total_amount,version FROM orders WHERE id='legacy-order'").get(), original);
  assert.deepEqual(database.prepare("SELECT package_code,package_status,product_id FROM packages WHERE id='legacy-package'").get(), packageOriginal);
  assert.equal(database.prepare("SELECT order_item_id FROM packages WHERE id='legacy-package'").get().order_item_id, null);
  database.close();
});

test("0005 creates only the final model, indexes, constraints, and exact Palyeong BOM", async () => {
  const before = await migratedDatabase(false);
  const existingTriggerCount = before.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE type='trigger'").get().count;
  before.close();
  const database = await migratedDatabase();
  for (const table of ["product_components", "traceability_records", "production_batches", "skin_packs", "skin_pack_labels", "package_skin_packs", "package_labels", "package_assignment_history"]) assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE type='table' AND name=?").get(table).count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE type='table' AND name='package_components'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE type='trigger'").get().count, existingTriggerCount);
  for (const index of ["idx_product_components_code", "idx_production_batches_parent_segment", "skin_packs_idempotency_key_unique", "idx_skin_packs_batch_sequence", "idx_package_skin_packs_skin_pack", "idx_package_skin_packs_component_slot", "idx_packages_assembly_key"]) assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_schema WHERE type='index' AND name=?").get(index).count, 1);
  const definition = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='production_batches'").get().sql;
  assert.match(definition, /production_batches_produced_within_target/);
  assert.deepEqual(database.prepare("SELECT component_name,quantity_per_product FROM product_components WHERE product_id='palyeong' ORDER BY sort_order").all().map((row) => ({ ...row })), palyeongBom.map((item) => ({ component_name: item.componentName, quantity_per_product: 1 })));
  assert.equal(database.prepare("SELECT COUNT(DISTINCT product_id) count FROM product_components").get().count, 1);
  database.close();
});

test("BOM aggregation sums shared cuts, subtracts available inventory, and exposes missing BOM", () => {
  const ten = aggregateProductionNeeds([{ productId: "palyeong", productName: "팔영", quantity: 10 }, { productId: "missing", productName: "미등록", quantity: 2 }], palyeongBom);
  assert.deepEqual(Object.fromEntries(ten.requirements.map((item) => [item.componentCode, item.requiredQuantity])), { BC: 10, GB: 10, JJ: 10, UJ: 10, CM: 10 });
  assert.deepEqual(ten.missingProducts.map((item) => item.productId), ["missing"]);
  const shared = aggregateProductionNeeds([{ productId: "a", productName: "A", quantity: 6 }, { productId: "b", productName: "B", quantity: 7 }], [{ productId: "a", componentId: "a", componentCode: "CM", componentName: "치마살", quantityPerProduct: 1 }, { productId: "b", componentId: "b", componentCode: "CM", componentName: "치마살", quantityPerProduct: 2 }], { CM: 5 });
  assert.equal(shared.requirements[0].requiredQuantity, 20); assert.equal(shared.requirements[0].additionalNeeded, 15); assert.equal(additionalNeeded(20, 5), 15);
});

test("batch target 20 creates three individually labeled packs and preserves trace snapshots across segments", async () => {
  const database = await migratedDatabase(); trace(database, "111111111111"); trace(database, "222222222222", { origin: "호주산", slaughterhouse: "새 도축장", grade: "1+" });
  batch(database, { id: "batch-1", code: "CM", name: "치마살", target: 20, traceabilityNo: "111111111111" });
  [205, 211, 198].forEach((weight, index) => assert.deepEqual(createPackAtomic(database, { id: `sp-${index + 1}`, batchId: "batch-1", sequence: index + 1, code: buildSkinPackCode("CM", "2026-08-30", index + 1), componentCode: "CM", name: "치마살", weight, traceabilityNo: "111111111111" }), { inserted: 1, labeled: 1, updated: 1 }));
  assert.equal(database.prepare("SELECT produced_quantity FROM production_batches WHERE id='batch-1'").get().produced_quantity, 3);
  assert.deepEqual(database.prepare("SELECT weight_g FROM skin_packs WHERE production_batch_id='batch-1' ORDER BY batch_sequence").all().map((row) => row.weight_g), [205, 211, 198]);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM skin_pack_labels").get().count, 3);
  const label = JSON.parse(database.prepare("SELECT payload_json FROM skin_pack_labels WHERE skin_pack_id='sp-1'").get().payload_json);
  for (const field of ["cutName", "weightG", "traceabilityNo", "origin", "slaughterhouse", "grade", "manufacturedAt", "storageMethod", "expiryText", "packagingMaterial", "foodType"]) assert.ok(Object.hasOwn(label, field));
  database.prepare("UPDATE production_batches SET status='completed',completed_at='2026-08-30T02:00:00Z' WHERE id='batch-1'").run();
  batch(database, { id: "batch-2", code: "CM", name: "치마살", target: 1, traceabilityNo: "222222222222", segment: 2, parent: "batch-1" });
  createPackAtomic(database, { id: "sp-4", batchId: "batch-2", sequence: 1, code: "CM-260830-0004", componentCode: "CM", name: "치마살", weight: 207, traceabilityNo: "222222222222" });
  assert.deepEqual({ ...database.prepare("SELECT traceability_no,origin,slaughterhouse,grade FROM skin_packs WHERE id='sp-1'").get() }, { traceability_no: "111111111111", origin: "국내산", slaughterhouse: "정일도축장", grade: "1++" });
  assert.equal(database.prepare("SELECT traceability_no FROM skin_packs WHERE id='sp-4'").get().traceability_no, "222222222222");
  database.close();
});

test("repeated idempotency key creates one skin pack, one label, and increments production once", async () => {
  const database = await migratedDatabase();
  trace(database, "666666666666");
  batch(database, { id: "idempotent-batch", code: "CM", name: "치마살", target: 2, traceabilityNo: "666666666666" });
  createPackAtomic(database, { id: "idempotent-pack-a", batchId: "idempotent-batch", sequence: 1, code: "CM-IDEM-A", componentCode: "CM", name: "치마살", weight: 200, traceabilityNo: "666666666666", idempotencyKey: "shared-idempotency" });
  assert.throws(() => createPackAtomic(database, { id: "idempotent-pack-b", batchId: "idempotent-batch", sequence: 2, code: "CM-IDEM-B", componentCode: "CM", name: "치마살", weight: 201, traceabilityNo: "666666666666", idempotencyKey: "shared-idempotency" }), /UNIQUE/);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM skin_packs WHERE idempotency_key='shared-idempotency'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM skin_pack_labels WHERE skin_pack_id='idempotent-pack-a'").get().count, 1);
  assert.equal(database.prepare("SELECT produced_quantity FROM production_batches WHERE id='idempotent-batch'").get().produced_quantity, 1);
  database.close();
});
test("inventory counts available only, FIFO is deterministic, and assigned packs cannot be reused", async () => {
  const database = await migratedDatabase(); trace(database, "333333333333"); batch(database, { id: "fifo", code: "CM", name: "치마살", target: 3, traceabilityNo: "333333333333" });
  createPackAtomic(database, { id: "sp-old", batchId: "fifo", sequence: 1, code: "CM-OLD", componentCode: "CM", name: "치마살", weight: 200, traceabilityNo: "333333333333", createdAt: "2026-08-30T01:00:00Z" });
  createPackAtomic(database, { id: "sp-b", batchId: "fifo", sequence: 2, code: "CM-B", componentCode: "CM", name: "치마살", weight: 201, traceabilityNo: "333333333333", createdAt: "2026-08-30T02:00:00Z" });
  createPackAtomic(database, { id: "sp-a", batchId: "fifo", sequence: 3, code: "CM-A", componentCode: "CM", name: "치마살", weight: 202, traceabilityNo: "333333333333", createdAt: "2026-08-30T02:00:00Z" });
  assert.deepEqual(database.prepare("SELECT id FROM skin_packs WHERE component_code='CM' AND status='available' ORDER BY created_at,id").all().map((row) => row.id), ["sp-old", "sp-a", "sp-b"]);
  database.prepare("UPDATE skin_packs SET status='assigned' WHERE id='sp-old'").run();
  assert.equal(database.prepare("SELECT COUNT(*) count FROM skin_packs WHERE component_code='CM' AND status='available'").get().count, 2);
  database.close();
});

test("Palyeong assembly is all-or-nothing, consumes five packs, blocks duplicate assignment, and keeps QR PII-free", async () => {
  const database = await migratedDatabase(); insertLegacyOrder(database); trace(database, "444444444444");
  for (const [index, component] of palyeongBom.entries()) { batch(database, { id: `b-${component.componentCode}`, code: component.componentCode, name: component.componentName, target: 1, traceabilityNo: "444444444444" }); if (component.componentCode !== "JJ") createPackAtomic(database, { id: `sp-${component.componentCode}`, batchId: `b-${component.componentCode}`, sequence: 1, code: `${component.componentCode}-1`, componentCode: component.componentCode, name: component.componentName, weight: 200 + index, traceabilityNo: "444444444444" }); }
  const shortage = database.prepare("SELECT pc.component_name,pc.quantity_per_product-(SELECT COUNT(*) FROM skin_packs sp WHERE sp.component_code=pc.component_code AND sp.status='available') missing FROM product_components pc WHERE pc.product_id='palyeong' AND pc.active=1 AND (SELECT COUNT(*) FROM skin_packs sp WHERE sp.component_code=pc.component_code AND sp.status='available')<pc.quantity_per_product").all();
  assert.deepEqual(shortage.map((row) => ({ ...row })), [{ component_name: "제비추리", missing: 1 }]);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM packages WHERE id='new-package'").get().count, 0);
  createPackAtomic(database, { id: "sp-JJ", batchId: "b-JJ", sequence: 1, code: "JJ-1", componentCode: "JJ", name: "제비추리", weight: 205, traceabilityNo: "444444444444" });
  const code = buildPackageCode("VAC-PY", "JI-260830-9000", "legacy-order", 1);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT INTO packages(id,order_id,order_item_id,package_sequence,assembly_key,package_code,product_id,product_name_snapshot,package_status,created_at,updated_at) VALUES('new-package','legacy-order','legacy-item',1,'assembly-1',?,'palyeong','팔영세트','completed','now','now')").run(code);
    for (const [index, component] of database.prepare("SELECT id,component_code FROM product_components WHERE product_id='palyeong' ORDER BY sort_order").all().entries()) { database.prepare("INSERT INTO package_skin_packs(id,package_id,skin_pack_id,product_component_id,quantity_slot,assigned_by,assigned_at) VALUES(?, 'new-package', (SELECT id FROM skin_packs WHERE id=? AND status='available'), ?,1,'worker','now')").run(`map-${index}`, `sp-${component.component_code}`, component.id); database.prepare("UPDATE skin_packs SET status='assigned' WHERE id=? AND status='available'").run(`sp-${component.component_code}`); }
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  assert.equal(database.prepare("SELECT COUNT(*) count FROM package_skin_packs WHERE package_id='new-package'").get().count, 5);
  assert.throws(() => database.prepare("INSERT INTO package_skin_packs(id,package_id,skin_pack_id,product_component_id,quantity_slot,assigned_by,assigned_at) VALUES('duplicate','new-package','sp-CM',?,2,'worker','now')").run(database.prepare("SELECT id FROM product_components WHERE product_id='palyeong' ORDER BY sort_order LIMIT 1").get().id), /UNIQUE/);
  const qr = `/workshop/packages/${encodeURIComponent(code)}`; assert.doesNotMatch(qr, /보존 고객|01000000000/);
  database.close();
});

test("provider-safe statements retain idempotency and assignment atomicity hooks", async () => {
  const [production, assembly] = await Promise.all([read("app/api/workshop/production/route.ts"), read("app/api/workshop/packages/assemble/route.ts")]);
  assert.match(production, /INSERT INTO skin_packs[\s\S]*FROM production_batches pb WHERE/);
  assert.match(production, /UPDATE production_batches SET produced_quantity=produced_quantity\+1/);
  assert.match(production, /idempotency_key=\?/);
  assert.doesNotMatch(production, /CREATE TRIGGER/);
  assert.match(assembly, /\(SELECT id FROM skin_packs WHERE id=\? AND status='available'\)/);
  assert.match(assembly, /DB\.batch\(statements\)/);
});

test("concurrent package assignment permits exactly one consumer for one available skin pack", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeongilpum-skin-pack-"));
  const databasePath = join(directory, "workshop.sqlite");
  try {
    const database = await migratedDatabase(true, databasePath);
    database.exec("PRAGMA journal_mode=WAL");
    insertLegacyOrder(database);
    trace(database, "555555555555");
    batch(database, { id: "concurrent-batch", code: "CM", name: "치마살", target: 1, traceabilityNo: "555555555555" });
    createPackAtomic(database, { id: "concurrent-pack", batchId: "concurrent-batch", sequence: 1, code: "CM-CONCURRENT", componentCode: "CM", name: "치마살", weight: 210, traceabilityNo: "555555555555" });
    database.prepare("INSERT INTO packages(id,order_id,order_item_id,package_sequence,assembly_key,package_code,product_id,product_name_snapshot,package_status,created_at,updated_at) VALUES('concurrent-package','legacy-order','legacy-item',2,'concurrent-assembly','CONCURRENT-PACKAGE','palyeong','팔영세트','completed','now','now')").run();
    const componentId = database.prepare("SELECT id FROM product_components WHERE product_id='palyeong' AND component_code='CM'").get().id;
    database.close();

    const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const workerSource = `
      const { parentPort, workerData } = require("node:worker_threads");
      const { DatabaseSync } = require("node:sqlite");
      const gate = new Int32Array(workerData.gate);
      const database = new DatabaseSync(workerData.databasePath);
      database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
      Atomics.add(gate, 0, 1);
      Atomics.notify(gate, 0);
      Atomics.wait(gate, 1, 0);
      let result;
      try {
        database.exec("BEGIN IMMEDIATE");
        database.prepare("INSERT INTO package_skin_packs(id,package_id,skin_pack_id,product_component_id,quantity_slot,assigned_by,assigned_at) VALUES(?, 'concurrent-package', (SELECT id FROM skin_packs WHERE id='concurrent-pack' AND status='available'), ?, ?, 'worker', 'now')").run(workerData.id, workerData.componentId, workerData.slot);
        database.prepare("UPDATE skin_packs SET status='assigned',assigned_at='now' WHERE id='concurrent-pack' AND status='available'").run();
        database.exec("COMMIT");
        result = { ok: true };
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        result = { ok: false, message: error.message };
      } finally {
        database.close();
        parentPort.postMessage(result);
      }
    `;
    const runWorker = (id, slot) => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { gate, databasePath, componentId, id, slot } });
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    const workers = [runWorker("concurrent-map-a", 1), runWorker("concurrent-map-b", 2)];
    const view = new Int32Array(gate);
    while (Atomics.load(view, 0) < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    Atomics.store(view, 1, 1);
    Atomics.notify(view, 1, 2);
    const results = await Promise.all(workers);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.match(results.find((result) => !result.ok).message, /NOT NULL constraint failed: package_skin_packs.skin_pack_id/);

    const verify = new DatabaseSync(databasePath);
    assert.equal(verify.prepare("SELECT COUNT(*) count FROM package_skin_packs WHERE skin_pack_id='concurrent-pack'").get().count, 1);
    assert.equal(verify.prepare("SELECT status FROM skin_packs WHERE id='concurrent-pack'").get().status, "assigned");
    verify.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("20-pack CSV is UTF-8 BOM-ready, one row per pack, and escapes commas and quotes", async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ skinPackCode: `CM-${index + 1}`, cutName: index === 0 ? '치마살, "특선"' : "치마살", weightG: 200 + index, traceabilityNo: "111", origin: "국내산", slaughterhouse: "A", grade: "1++", manufacturedAt: "2026-08-30", storageMethod: "냉장", expiryText: "설정값", packagingMaterial: "필름", foodType: "포장육" }));
  const csv = skinPackLabelsToLongCsv(rows);
  assert.equal(csv.trim().split(/\r?\n/).length, 21);
  assert.match(csv, /"치마살, ""특선"""/);
  const endpoint = await read("app/api/workshop/production/batches/[batchId]/csv/route.ts");
  assert.match(endpoint, /\\uFEFF/);
});

test("early arrival prioritizes available assembly and all existing operating surfaces regress cleanly", async () => {
  const [reassign, workshop, workshopApi, action, sales, kiosk] = await Promise.all([read("app/api/workshop/packages/reassign/route.ts"), read("app/components/WorkshopApp.tsx"), read("app/api/workshop/orders/route.ts"), read("app/api/workshop/actions/route.ts"), read("app/components/SalesApp.tsx"), read("app/components/KioskApp.tsx")]);
  assert.match(reassign, /assemblyAvailable: true/); assert.match(reassign, /가용 스킨팩으로 즉시 조립/);
  assert.ok(workshop.indexOf("가용 스킨팩으로 1세트 조립") < workshop.indexOf("대체 가능한 완성품"));
  for (const value of ["시간대별 작업 타임라인", "작업 수락", "작업 시작", "상품 준비완료", "고객도착"]) assert.match(workshop, new RegExp(value));
  assert.match(workshopApi, /WORKSHOP_DATE_ORDERS_SQL/); assert.doesNotMatch(action, /INSERT INTO packages/);
  assert.match(sales, /2500/); assert.match(kiosk, /주문 접수/);
});

test("HID/manual scan validation and recent trace cache remain", async () => {
  const [ui, api, data] = await Promise.all([read("app/components/ProductionApp.tsx"), read("app/api/workshop/production/route.ts"), read("app/lib/production-data.ts")]);
  assert.match(ui, /event\.key === "Enter"/); assert.deepEqual(parseTraceabilityScan(" 123456 "), { ok: true, traceabilityNo: "123456", raw: "123456" }); assert.equal(validateTraceabilityLength("123456", []).ok, true);
  assert.match(api, /ON CONFLICT\(traceability_no\) DO UPDATE/); assert.match(data, /last_used_by=\?/); assert.match(data, /LIMIT 5/);
});
