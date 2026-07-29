import { describe, expect, it } from "vitest";
import { prepareNewerLegacyMapForLoad } from "./newerLegacyMapCompatibility";

describe("prepareNewerLegacyMapForLoad", () => {
  it("keeps the shared slots and discards newer upstream fields", () => {
    const mapData = Array.from({ length: 49 }, (_, index) => `field-${index}`);
    mapData[47] = "";

    const result = prepareNewerLegacyMapForLoad(mapData);

    expect(result.mapData).toHaveLength(45);
    expect(result.mapData[44]).toBe("field-44");
    expect(result.skippedItems).toEqual([
      "custom good icons",
      "map measurers",
      "additional newer-format data (field 48)"
    ]);
  });

  it("does not report empty trailing fields as skipped content", () => {
    const result = prepareNewerLegacyMapForLoad([...Array(47).fill("")]);

    expect(result.mapData).toHaveLength(45);
    expect(result.skippedItems).toEqual([]);
  });
});
