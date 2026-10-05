import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { updateBurgWaterAccess } from "./burgWaterAccess";

function fixture() {
  const burg: Burg = { i: 1, cell: 0, x: 0, y: 0, port: 1 };
  const pack = {
    cells: { c: [[1, 2, 3]], h: [30, 10, 10, 30], f: [3, 1, 2, 1], r: [7], fl: [200] },
    features: [null, { type: "ocean" }, { type: "lake" }, { type: "island" }]
  } as unknown as PackedGraph;
  return { burg, pack };
}

describe("burg water access", () => {
  it("preserves simultaneous river, sea and lake access independently of haven", () => {
    const { burg, pack } = fixture();
    expect(updateBurgWaterAccess(burg, pack)).toEqual({
      river: true,
      sea: true,
      lake: true,
      riverId: 7,
      seaFeatureIds: [1],
      lakeFeatureIds: [2],
      port: { river: true, sea: true, lake: true }
    });
  });
  it("does not classify an inland river port as sea access from its drain feature", () => {
    const { burg, pack } = fixture();
    pack.cells.c[0] = [3];
    expect(updateBurgWaterAccess(burg, pack).port).toEqual({ river: true, sea: false, lake: false });
  });
  it("retains measured river access outside the administrative river cell", () => {
    const { burg, pack } = fixture();
    pack.cells.r[0] = 0;
    burg.riverPlacement = { riverId: 7, bank: "left", widthMeters: 40, physicalCellId: 0, bankDistanceMeters: 10 };
    expect(updateBurgWaterAccess(burg, pack).riverId).toBe(7);
    expect(burg.riverPlacement).toBeDefined();
    expect(burg.cell).toBe(0);
  });
  it("distinguishes contact from a navigable river port and clears stale flags", () => {
    const { burg, pack } = fixture();
    pack.cells.fl[0] = 99;
    expect(updateBurgWaterAccess(burg, pack).port.river).toBe(false);
    expect(burg.waterAccess?.river).toBe(true);
    burg.port = 0;
    expect(updateBurgWaterAccess(burg, pack).port).toEqual({ river: false, sea: false, lake: false });
    pack.cells.c[0] = [];
    pack.cells.r[0] = 0;
    expect(updateBurgWaterAccess(burg, pack)).toMatchObject({ river: false, sea: false, lake: false, riverId: null });
  });
});
