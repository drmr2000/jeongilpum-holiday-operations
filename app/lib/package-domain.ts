export function packageProductPrefix(productCode: string) {
  const segments = productCode.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return (segments.at(-1) || "PKG").slice(0, 5);
}

export function packageOrderToken(orderNo: string) {
  const match = orderNo.toUpperCase().match(/JI-(\d{6})-([A-Z0-9]+)/);
  if (match) return `${match[1]}-${match[2]}`;
  return orderNo.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-12) || "ORDER";
}

export function buildPackageCode(productCode: string, orderNo: string, orderId: string, sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("패키지 순번은 1 이상이어야 합니다.");
  const orderToken = orderId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-8) || "ORDER";
  return `${packageProductPrefix(productCode)}-${packageOrderToken(orderNo)}-${orderToken}-${String(sequence).padStart(2, "0")}`;
}

export function parseTraceabilityScan(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return { ok: false as const, error: "이력번호를 입력하거나 스캔해주세요." };
  // TODO: 실제 현장 복합 바코드 샘플과 공식 규격을 확인한 뒤 별도 parser를 추가한다.
  if (!/^\d+$/.test(normalized)) return { ok: false as const, error: "복합 바코드 형식은 아직 지원하지 않습니다. 샘플 규격 확인이 필요합니다." };
  if (normalized.length > 64) return { ok: false as const, error: "이력번호가 너무 깁니다." };
  return { ok: true as const, traceabilityNo: normalized, raw: normalized };
}

export function validateTraceabilityLength(value: string, allowedLengths: number[] = []) {
  if (!allowedLengths.length) return { ok: true as const };
  return allowedLengths.includes(value.length)
    ? { ok: true as const }
    : { ok: false as const, error: `허용된 이력번호 자릿수(${allowedLengths.join(", ")})와 일치하지 않습니다.` };
}
