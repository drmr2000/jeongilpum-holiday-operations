import assert from "node:assert/strict";
import test from "node:test";
import { createCsv, escapeCsvCell } from "../app/lib/csv.ts";

test("CSV escapes commas, double quotes, and line breaks for Excel", () => {
  assert.equal(escapeCsvCell("서울, 강남"), '"서울, 강남"');
  assert.equal(escapeCsvCell('그가 "안녕"이라고 말했다'), '"그가 ""안녕""이라고 말했다"');
  assert.equal(escapeCsvCell("첫 줄\n둘째 줄"), '"첫 줄\n둘째 줄"');
  assert.equal(
    createCsv(["이름", "메모"], [["정일품", '서울, "강남"\n둘째 줄']]),
    '\uFEFF이름,메모\r\n정일품,"서울, ""강남""\n둘째 줄"',
  );
});
