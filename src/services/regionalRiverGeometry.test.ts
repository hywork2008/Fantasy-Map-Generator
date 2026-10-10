import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import * as riverShape from "../utils/riverShape";
import { indexedPhysicalWater } from "./indexedPhysicalWater";
import { RegionalRiverGeometry, regionalRiverGeometry } from "./regionalRiverGeometry";
import { evaluateRiverAxis } from "./riverAxisSampling";
import { SETTLEMENT_RIVER_SETTINGS } from "./settlementRiverSite";
import { buildWorldRiverGeometry } from "./worldRiverGeometry";

function fixture(count = 40) {
  const p = Array.from({ length: count }, (_, i) => [20, 20 + i * 4]);
  return {
    distanceScale: 1,
    graphWidth: 200,
    graphHeight: 200,
    pack: {
      cells: { p, h: p.map(() => 25), fl: p.map(() => 20) },
      rivers: [{ i: 7, cells: p.map((_, i) => i), widthFactor: 0, sourceWidth: 0.4 }]
    }
  } as unknown as WorldContext;
}
function prepared(world: WorldContext) {
  const source = regionalRiverGeometry(world, world.pack.rivers[0], "km", SETTLEMENT_RIVER_SETTINGS);
  if (!(source instanceof RegionalRiverGeometry)) throw new Error(source.reason);
  return source;
}
describe("regional physical rivers", () => {
  it("samples only local source sections, reuses them, and excludes distant added sections", () => {
    for (const count of [40, 400]) {
      const source = prepared(fixture(count));
      const bounds = { minX: 19000, maxX: 21000, minY: 77000, maxY: 79000 };
      const result = source.query(bounds)!;
      expect(result).toHaveProperty("geometry");
      expect(source.sectionBuilds).toBeLessThan(10);
      const builds = source.sectionBuilds;
      expect(source.query({ ...bounds, minY: 77100 })).toHaveProperty("geometry");
      expect(source.sectionBuilds).toBe(builds);
      if (!("geometry" in result)) throw new Error(result.reason);
      for (const cap of result.artificialCaps) expect(result.geometry.water.bankReferences![cap[0]][cap[1]]).toBeNull();
    }
  });
  it("agrees with full-axis water and retains analytical axis evidence inside coverage", () => {
    const world = fixture(10),
      source = prepared(world);
    const bounds = { minX: 19000, maxX: 21000, minY: 33000, maxY: 37000 };
    const regional = source.query(bounds)!;
    const full = buildWorldRiverGeometry(world, world.pack.rivers[0], "km", 1, SETTLEMENT_RIVER_SETTINGS);
    if (!("geometry" in regional) || !("geometry" in full)) throw new Error("fixture failed");
    const a = indexedPhysicalWater(regional.geometry.water),
      b = indexedPhysicalWater(full.geometry.water);
    for (let x = 19940; x <= 20060; x += 5)
      for (let y = 33100; y <= 36900; y += 100) expect(a.contains([x, y])).toBe(b.contains([x, y]));
    for (const segment of regional.geometry.axis.segments) {
      const value = evaluateRiverAxis(regional.geometry.axis, segment.arcStart + segment.length / 2)!;
      expect(value.tangent[0]).toBeCloseTo(0, 8);
      expect(value.tangent[1]).toBeCloseTo(1, 8);
    }
  });
  it("reports oversized coverage as a budget failure without sampling distant sections", () => {
    const source = prepared(fixture(400));
    expect(source.query({ minX: -1e9, maxX: 1e9, minY: -1e9, maxY: 1e9 })).toMatchObject({ reason: "region-budget" });
    expect(source.sectionBuilds).toBe(0);
    expect(source.query({ minX: 19000, maxX: 21000, minY: 77000, maxY: 79000 })).toHaveProperty("geometry");
  });

  it("invalidates source edits and units but retains an unchanged source", () => {
    const world = fixture();
    const a = prepared(world);
    expect(prepared(world)).toBe(a);
    world.pack.rivers[0].sourceWidth = 0.8;
    expect(prepared(world)).not.toBe(a);
    const b = prepared(world);
    expect(regionalRiverGeometry(world, world.pack.rivers[0], "mi", SETTLEMENT_RIVER_SETTINGS)).not.toBe(b);
  });
  it("checks physical inputs before meandering and preserves geometry across metadata edits", () => {
    const world = fixture();
    const spy = vi.spyOn(riverShape, "meanderRiverPoints");
    try {
      const source = prepared(world);
      const count = spy.mock.calls.length;
      Object.assign(world.pack.rivers[0], { name: "Renamed", parent: 12, basin: 12 });
      expect(prepared(world)).toBe(source);
      expect(spy).toHaveBeenCalledTimes(count);
      world.pack.cells.fl[1] += 20;
      expect(prepared(world)).not.toBe(source);
      expect(spy).toHaveBeenCalledTimes(count + 1);
    } finally {
      spy.mockRestore();
    }
  });
  it("does not silently certify failed or incomplete local geometry", () => {
    const world = fixture();
    const source = prepared(world);
    const result = source.query({ minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 });
    expect(result).toHaveProperty("geometry"); // complete source has only true end caps
    world.pack.rivers[0].widthFactor = -1;
    expect(regionalRiverGeometry(world, world.pack.rivers[0], "km", SETTLEMENT_RIVER_SETTINGS)).toHaveProperty(
      "reason"
    );
  });
});
