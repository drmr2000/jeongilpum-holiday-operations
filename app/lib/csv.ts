export type CsvCellValue = string | number | Date | null | undefined;

function csvText(value: CsvCellValue) {
  if (value === null || value === undefined) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

export function escapeCsvCell(value: CsvCellValue) {
  const text = csvText(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCsv(headers: CsvCellValue[], rows: CsvCellValue[][]) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

export function datedCsvFilename(name: string, date = new Date()) {
  const dateText = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const safeName = name.replace(/[\\/:*?"<>|]/g, "_").trim() || "table";
  return `${safeName}-${dateText}.csv`;
}
