export function orderNumberPrefix(date: string) {
  return `${date.replaceAll("-", "").slice(2)}-`;
}

export function nextOrderNo(date: string, orderNos: Iterable<string>) {
  const prefix = orderNumberPrefix(date);
  let sequence = 0;
  for (const orderNo of orderNos) {
    const value = orderNo.slice(prefix.length);
    if (!orderNo.startsWith(prefix) || !/^\d+$/.test(value)) continue;
    sequence = Math.max(sequence, Number(value));
  }
  return `${prefix}${String(sequence + 1).padStart(3, "0")}`;
}
