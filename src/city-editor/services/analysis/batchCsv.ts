/** RFC 4180 quoting, including multiline JSON/name values and Excel's UTF-8 BOM. */
export function writeCsv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${[columns, ...rows.map(row => columns.map(key => row[key]))]
    .map(row => row.map(quote).join(","))
    .join("\r\n")}\r\n`;
}

export function readCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === "," || c === "\n" || c === "\r") {
      record.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        records.push(record);
        record = [];
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting");
      field += c;
    }
  }
  if (quoted) throw new Error("Unterminated CSV field");
  if (field || record.length || closed) {
    record.push(field);
    records.push(record);
  }
  const header = records.shift();
  if (!header?.includes("share_json") || new Set(header).size !== header.length) {
    throw new Error("CSV requires unique column names and a share_json column");
  }
  return records
    .filter(row => row.some(Boolean))
    .map((row, index) => {
      if (row.length !== header.length) throw new Error(`CSV row ${index + 2}: incorrect column count`);
      return Object.fromEntries(header.map((key, i) => [key, row[i]]));
    });
}
