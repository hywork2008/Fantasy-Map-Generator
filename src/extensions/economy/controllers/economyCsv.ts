/** RFC 4180-compatible CSV helpers shared by Economy downloads. */

export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvDocument(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[]
): string {
  const lines = [headers, ...rows].map(row => row.map(csvCell).join(","));
  // BOM lets Excel identify UTF-8 map and Good names correctly without locale-specific import steps.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
