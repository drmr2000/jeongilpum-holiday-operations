import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy orders remain searchable and appear as unscheduled in date views", async () => {
  const [ordersApi, sales] = await Promise.all([
    read("app/api/orders/route.ts"),
    read("app/components/SalesApp.tsx"),
  ]);

  assert.match(ordersApi, /일정 미지정 · 기존 주문/);
  assert.match(sales, /일정 미지정 주문/);
  assert.match(sales, /기존 주문 원본 날짜는 추정하지 않습니다/);
});
