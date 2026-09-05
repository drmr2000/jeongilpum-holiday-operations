export type InputFormat = "number" | "phone";

export function rawInputValue(value: string) {
  return value.replace(/\D/g, "");
}

export function formatNumberInput(value: string) {
  const digits = rawInputValue(value);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatKoreanPhoneInput(value: string) {
  const digits = rawInputValue(value);
  if (!digits) return "";

  const areaLength = digits.startsWith("02") ? 2 : 3;
  const area = digits.slice(0, areaLength);
  const rest = digits.slice(areaLength);
  if (!rest) return area;

  const subscriberLength = digits.length === areaLength + 7 ? 3 : 4;
  if (rest.length <= subscriberLength) return `${area}-${rest}`;

  return `${area}-${rest.slice(0, subscriberLength)}-${rest.slice(subscriberLength)}`;
}

export function formatInputValue(format: InputFormat, value: string) {
  return format === "number" ? formatNumberInput(value) : formatKoreanPhoneInput(value);
}

export function caretPositionForRawLength(formattedValue: string, rawLength: number) {
  if (rawLength <= 0) return 0;

  let digits = 0;
  for (let index = 0; index < formattedValue.length; index += 1) {
    if (/\d/.test(formattedValue[index])) digits += 1;
    if (digits === rawLength) return index + 1;
  }
  return formattedValue.length;
}

export function parseIntegerInput(value: string) {
  const digits = rawInputValue(value);
  if (!digits) return null;

  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
