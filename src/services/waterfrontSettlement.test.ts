import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { settledRiverSite, WATERFRONT_BANK_GAP_METERS, waterfrontIssues } from "./waterfrontSettlement";

/** A reservation found by findRiverSettlementSite: bank along y = 0, town north of it. */
function placedBurg(r: number): Burg {
  const gap = WATERFRONT_BANK_GAP_METERS;
  const point: [number, number] = [0, r + gap];
  return {
    i: 1,
    cell: 0,
    x: point[0],
    y: point[1],
    port: 1,
    riverSiteStatus: { riverId: 3, status: "placed" },
    riverPlacement: {
      riverId: 3,
      bank: "left",
      widthMeters: 30,
      physicalCellId: 0,
      bankDistanceMeters: r + gap,
      footprintMeters: [
        [-r, gap],
        [r, gap],
        [r, gap + 2 * r],
        [-r, gap + 2 * r]
      ],
      accessMeters: [point, [0, 2]],
      accessWidthMeters: 2,
      accessFootprintMeters: [
        [1, r + gap + 1],
        [-1, r + gap + 1],
        [-1, 1],
        [1, 1]
      ]
    },
    waterAccess: {
      river: true,
      sea: false,
      lake: false,
      riverId: 3,
      seaFeatureIds: [],
      lakeFeatureIds: [],
      port: { river: true, sea: false, lake: false }
    }
  } as unknown as Burg;
}

const pack = {
  cells: {
    v: [[0, 1, 2, 3]],
    c: [[]]
  },
  vertices: {
    p: [
      [-1000, -1000],
      [1000, -1000],
      [1000, 1000],
      [-1000, 1000]
    ]
  }
} as unknown as PackedGraph;

const inside = (p: number[], square: number[][]) => {
  const xs = square.map(q => q[0]),
    ys = square.map(q => q[1]);
  return (
    p[0] >= Math.min(...xs) - 1e-9 &&
    p[0] <= Math.max(...xs) + 1e-9 &&
    p[1] >= Math.min(...ys) - 1e-9 &&
    p[1] <= Math.max(...ys) + 1e-9
  );
};

describe("waterfront settlement", () => {
  it("shrinks a river reservation toward its bank, inside the surveyed square", () => {
    const burg = placedBurg(200);
    const settled = settledRiverSite(pack, burg, 120, 1)!;
    expect(settled.y).toBeCloseTo(120 + WATERFRONT_BANK_GAP_METERS);
    expect(settled.riverPlacement!.bankDistanceMeters).toBeCloseTo(120 + WATERFRONT_BANK_GAP_METERS);
    for (const p of settled.riverPlacement!.footprintMeters!)
      expect(inside(p, burg.riverPlacement!.footprintMeters!)).toBe(true);
    for (const p of settled.riverPlacement!.accessFootprintMeters!)
      expect(inside(p, burg.riverPlacement!.accessFootprintMeters!)).toBe(true);
    // The landing on the bank is unchanged.
    expect(settled.riverPlacement!.accessMeters![1]).toEqual([0, 2]);
  });

  it("slides along the bank toward a preferred point, within one radius of the tested access", () => {
    const burg = placedBurg(200);
    const settled = settledRiverSite(pack, burg, 120, 1, x => Math.abs(x - 500))!;
    expect(settled.x).toBeCloseTo(80); // min(shift 80, radius 120)
    for (const p of settled.riverPlacement!.footprintMeters!)
      expect(inside(p, burg.riverPlacement!.footprintMeters!)).toBe(true);
    // The access path stays on the original (u = 0) line.
    expect(settled.riverPlacement!.accessMeters![0][0]).toBeCloseTo(0);
  });

  it("does not grow a reservation", () => {
    expect(settledRiverSite(pack, placedBurg(100), 140, 1)).toBeNull();
  });

  it("fails a river port whose bank lies beyond the dry gap, and an unresolved one", () => {
    const world = { pack } as never;
    const burg = placedBurg(200);
    expect(waterfrontIssues(world, burg, 200, 1, new Map())).toEqual([]);
    expect(waterfrontIssues(world, burg, 120, 1, new Map())).toEqual([{ kind: "bank-distance", excessMeters: 80 }]);
    const unresolved = { ...burg, riverSiteStatus: { riverId: 3, status: "unresolved", reason: "folded-banks" } };
    expect(waterfrontIssues(world, unresolved as Burg, 200, 1, new Map())).toEqual([
      { kind: "river-unresolved", reason: "folded-banks" }
    ]);
    expect(waterfrontIssues(world, { ...burg, port: 0 }, 120, 1, new Map())).toEqual([]);
  });
});
