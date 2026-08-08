import { describe, expect, it } from "vitest";
import { csvDocument } from "./economyCsv";

describe("economyCsv", () => {
  it("escapes commas, quotes, and line breaks without changing numeric columns", () => {
    const csv = csvDocument(["Model", "Tags", "Units"], [["biome(1, 2), elevation()", 'a"b', 12.5]]);

    expect(csv.startsWith("\uFEFFModel,Tags,Units\r\n")).toBe(true);
    expect(csv).toContain('"biome(1, 2), elevation()"');
    expect(csv).toContain('"a""b"');
    expect(csv).toContain(",12.5\r\n");
  });
});
