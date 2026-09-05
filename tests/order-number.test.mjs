import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { nextOrderNo } from "../app/lib/order-number.ts";

test("nextOrderNo increments within a Seoul calendar date and resets on the next date", () => {
  assert.equal(nextOrderNo("2026-09-05", []), "260905-001");
  assert.equal(nextOrderNo("2026-09-05", ["260905-001", "260905-009", "260904-999"]), "260905-010");
  assert.equal(nextOrderNo("2026-09-06", ["260905-009"]), "260906-001");
});

test("0009 removes the order number unique index", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE orders (id TEXT PRIMARY KEY NOT NULL, order_no TEXT NOT NULL)");
  database.exec("CREATE UNIQUE INDEX orders_order_no_unique ON orders (order_no)");
  database.exec(await readFile(new URL("../drizzle/0009_damp_scorpion.sql", import.meta.url), "utf8"));
  database.prepare("INSERT INTO orders(id,order_no) VALUES(?,?)").run("first", "260905-001");
  database.prepare("INSERT INTO orders(id,order_no) VALUES(?,?)").run("second", "260905-001");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM orders WHERE order_no=?").get("260905-001").count, 2);
  database.close();
});
