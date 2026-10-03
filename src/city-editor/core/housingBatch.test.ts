import { describe, expect, it } from "vitest";
import { compareHousingInputs, readCsv, writeCsv } from "./housingBatch";

describe("housing batch CSV", () => {
  it("round trips Japanese, quotes, commas, newlines and complete JSON", () => {
    const rows = [{ name: '都市, "湾"\n町', share_json: JSON.stringify({ roads: [1, 2] }), schema_version: "1" }];
    expect(readCsv(writeCsv(rows))).toEqual(rows);
  });
  it("rejects incomplete and malformed CSV", () => {
    expect(() => readCsv('share_json,name\n"unfinished')).toThrow("Unterminated");
    expect(() => readCsv("share_json,name\nx")).toThrow("column count");
    expect(() => readCsv("share_json,share_json\na,b")).toThrow("unique");
  });
  it("retains failed rows and clears stale results on rerun", () => {
    const result = compareHousingInputs([
      { schema_version: "1", share_json: "{}", houses: "999", absolute_gap: "500" }
    ]);
    expect(result[0]).toMatchObject({ generated: false, houses: "", absolute_gap: null });
    expect(result[0].error).toBeTruthy();
  });
});
