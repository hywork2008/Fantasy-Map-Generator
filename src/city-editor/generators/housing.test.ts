import { describe, expect, it } from "vitest";
import { CITY_SIZE_PRESETS } from "./document";
import {
  DWELLING_LOT_M2,
  PLAZA_FOOTPRINT_M,
  plazaFootprintMeters,
  TEMPLE_FOOTPRINT_M,
  templeCellCount,
  templeFootprintMeters
} from "./housing";

describe("temple scale", () => {
  it("keeps village chapels small and gives every basilica its native nave dimensions", () => {
    const micro = templeFootprintMeters(CITY_SIZE_PRESETS.micro.extentMeters);
    const tiny = templeFootprintMeters(CITY_SIZE_PRESETS.tiny.extentMeters);
    const large = templeFootprintMeters(CITY_SIZE_PRESETS.large.extentMeters);
    expect(micro).toEqual(TEMPLE_FOOTPRINT_M.micro);
    expect(tiny).toEqual(TEMPLE_FOOTPRINT_M.tiny);
    expect(micro.length).toBeLessThan(24);
    expect(tiny.length).toBeGreaterThanOrEqual(54);
    expect(tiny.width).toBeGreaterThanOrEqual(28);
    expect(micro.length).toBeGreaterThan(Math.sqrt(DWELLING_LOT_M2));
    expect(tiny.length).toBeGreaterThan(Math.sqrt(DWELLING_LOT_M2) * 2);
    expect(tiny.length * tiny.width).toBeGreaterThan(DWELLING_LOT_M2 * 4);
    expect(large.length).toBeGreaterThan(tiny.length);
    expect(templeFootprintMeters(CITY_SIZE_PRESETS.small.extentMeters).length).toBeGreaterThanOrEqual(tiny.length);
    expect(templeFootprintMeters(CITY_SIZE_PRESETS.medium.extentMeters).length).toBeLessThan(large.length);
  });

  it("reserves more precinct cells on larger maps, but not by population", () => {
    expect(templeCellCount(300, false)).toBe(1);
    expect(templeCellCount(600, false)).toBe(1);
    expect(templeCellCount(1200, false)).toBe(1);
    expect(templeCellCount(2400, false)).toBe(2);
    expect(templeCellCount(4800, false)).toBe(3);
    expect(templeCellCount(600, true)).toBe(2);
    expect(templeCellCount(4800, true)).toBe(3);
  });

  it("steps the market square independently of the basilica's minimum dimensions", () => {
    const micro = plazaFootprintMeters(CITY_SIZE_PRESETS.micro.extentMeters);
    const tiny = plazaFootprintMeters(CITY_SIZE_PRESETS.tiny.extentMeters);
    const large = plazaFootprintMeters(CITY_SIZE_PRESETS.large.extentMeters);
    expect(micro).toBe(PLAZA_FOOTPRINT_M.micro);
    expect(tiny).toBe(PLAZA_FOOTPRINT_M.tiny);
    expect(micro).toBe(tiny / 2);
    expect(micro).toBeGreaterThan(TEMPLE_FOOTPRINT_M.micro.length);
    expect(large).toBeGreaterThan(tiny * 2);
    expect(plazaFootprintMeters(CITY_SIZE_PRESETS.small.extentMeters)).toBeGreaterThan(tiny);
    expect(plazaFootprintMeters(CITY_SIZE_PRESETS.medium.extentMeters)).toBeLessThan(large);
  });
});
