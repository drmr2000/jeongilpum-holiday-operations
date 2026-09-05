import assert from "node:assert/strict";
import test from "node:test";
import {
  caretPositionForRawLength,
  formatInputValue,
  formatKoreanPhoneInput,
  formatNumberInput,
  parseIntegerInput,
  rawInputValue,
} from "../app/lib/input-format.ts";

test("number input formats digits without changing the raw value", () => {
  assert.equal(rawInputValue("12,345원"), "12345");
  assert.equal(formatNumberInput("1234567"), "1,234,567");
  assert.equal(formatInputValue("number", "001234"), "001,234");
  assert.equal(parseIntegerInput("1,234,567"), 1234567);
});

test("Korean phone input formats mobile and landline numbers", () => {
  assert.equal(formatKoreanPhoneInput("01012345678"), "010-1234-5678");
  assert.equal(formatKoreanPhoneInput("0212345678"), "02-1234-5678");
  assert.equal(formatKoreanPhoneInput("0311234567"), "031-123-4567");
  assert.equal(formatKoreanPhoneInput("02123"), "02-123");
});

test("caret position follows the same digit after inserted separators", () => {
  assert.equal(caretPositionForRawLength("1,234", 1), 1);
  assert.equal(caretPositionForRawLength("1,234", 2), 3);
  assert.equal(caretPositionForRawLength("010-1234-5678", 7), 8);
});
