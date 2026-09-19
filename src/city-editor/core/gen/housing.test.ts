import { describe, expect, it } from "vitest";
import { CITY_SIZE_PRESETS } from "../document";
import { DWELLING_LOT_M2, TEMPLE_FOOTPRINT_M, templeCellCount, templeFootprintMeters } from "./housing";

describe("temple scale", () => {
  it("steps footprint with map size and stays well above a dwelling plot", () => {
    const tiny = templeFootprintMeters(CITY_SIZE_PRESETS.tiny.extentMeters);
    const large = templeFootprintMeters(CITY_SIZE_PRESETS.large.extentMeters);
    expect(tiny).toEqual(TEMPLE_FOOTPRINT_M.tiny);
    expect(tiny.length).toBeGreaterThan(Math.sqrt(DWELLING_LOT_M2) * 2);
    expect(tiny.length * tiny.width).toBeGreaterThan(DWELLING_LOT_M2 * 4);
    expect(large.length).toBeGreaterThan(tiny.length * 2);
    expect(large.length).toBeLessThan(tiny.length * 3);
    expect(templeFootprintMeters(CITY_SIZE_PRESETS.small.extentMeters).length).toBeGreaterThan(tiny.length);
    expect(templeFootprintMeters(CITY_SIZE_PRESETS.medium.extentMeters).length).toBeLessThan(large.length);
  });

  it("reserves more precinct cells on larger maps, but not by population", () => {
    expect(templeCellCount(600, false)).toBe(1);
    expect(templeCellCount(1200, false)).toBe(1);
    expect(templeCellCount(2400, false)).toBe(2);
    expect(templeCellCount(4800, false)).toBe(3);
    expect(templeCellCount(600, true)).toBe(2);
    expect(templeCellCount(4800, true)).toBe(3);
  });
});
