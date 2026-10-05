import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import type { RiverPoint } from "./riverGeometry";
import { buildWorldLandFootprintPolicy } from "./worldLandFootprintPolicy";

const rect = (x: number, y: number, w: number, h: number): RiverPoint[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
function fixture(polygons = [rect(0, 0, 4, 10), rect(4, 0, 2, 10), rect(6, 0, 4, 10)]) {
  const world = {
    distanceScale: 0.001,
    graphWidth: 10,
    graphHeight: 10,
    pack: {
      cells: {
        i: Uint16Array.from(polygons.map((_, i) => i)),
        v: polygons.map((_, i) => [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3]),
        h: Uint8Array.from(polygons.map(() => 25)),
        state: Uint16Array.from(polygons.map((_, i) => i))
      },
      vertices: { p: polygons.flat() }
    }
  } as unknown as WorldContext;
  const settings = { maxCells: 20, maxVertices: 100, maxClipOperations: 1000, maxRemainingPieces: 100 };
  const rules = { allowsCell: (_: { cellId: number }) => true, supportsCell: (_: { cellId: number }) => true };
  const build = (unit = "km") => buildWorldLandFootprintPolicy(world, unit, settings, rules);
  const assess = (p: RiverPoint[], purpose: "passage" | "dry-support" = "passage") => {
    const b = build();
    if (!("policy" in b)) throw Error(b.reason);
    return b.policy.assess(p, purpose);
  };
  return { world, settings, rules, build, assess };
}
describe("world cell full-footprint policy", () => {
  it("covers a long stroke across fractional shared borders without manufacturing ULP gaps", () => {
    const f = fixture(Array.from({ length: 6 }, (_, i) => rect((i * 100) / 6, 0, 100 / 6, 100)));
    // Use the same stored border coordinates on both cells, as a shared mesh does.
    f.world.pack.vertices.p = Array.from({ length: 6 }, (_, i) => [
      [(i * 100) / 6, 0],
      [((i + 1) * 100) / 6, 0],
      [((i + 1) * 100) / 6, 100],
      [(i * 100) / 6, 100]
    ]).flat();
    f.world.graphWidth = f.world.graphHeight = 100;
    expect(
      f.assess(
        [
          [66.72991677469778, 29],
          [66.72991677469778, 31],
          [17.506932429798717, 31],
          [17.506932429798717, 29]
        ],
        "dry-support"
      ).status
    ).toBe("allowed");
  });
  it("preserves concave rounded-cell recesses instead of filling a convex hull", () => {
    const f = fixture([
      [
        [0, 0],
        [10, 0],
        [10, 3],
        [3, 3],
        [3, 10],
        [0, 10]
      ]
    ]);
    f.world.pack.cells.v[0] = [0, 1, 2, 3, 4, 5];
    expect(f.assess(rect(1, 1, 1, 1), "dry-support")).toEqual({ status: "allowed" });
    expect(f.assess(rect(5, 5, 1, 1), "dry-support")).toEqual({ status: "blocked", reason: "uncovered-region" });
    f.settings.maxClipOperations = 1;
    expect(f.build()).toEqual({ reason: "triangulation-budget" });
  });
  it("accepts exact adjacent/closing duplicate coordinates without modifying source vertex IDs", () => {
    const f = fixture([
      [
        [0, 0],
        [10, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ]
    ]);
    f.world.pack.cells.v[0] = [0, 1, 2, 3, 4, 5];
    const before = JSON.stringify(f.world);
    expect(f.assess(rect(1, 1, 8, 8), "dry-support")).toEqual({ status: "allowed" });
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("does not spend the local clipping budget on distant cells", () => {
    const f = fixture([...Array.from({ length: 12 }, () => rect(0, 0, 2, 2)), rect(0, 0, 10, 10)]);
    f.settings.maxClipOperations = 4;
    expect(f.assess(rect(7, 7, 1, 1), "dry-support")).toEqual({ status: "allowed" });
  });
  it("covers the union across shared borders in both winding directions", () => {
    const f = fixture();
    f.world.pack.vertices.p.splice(4, 4, ...rect(4, 0, 2, 10).reverse());
    expect(f.assess(rect(1, 1, 8, 8))).toEqual({ status: "allowed" });
  });
  it("detects forbidden cells in the interior even when every corner is permitted", () => {
    const f = fixture();
    f.rules.allowsCell = c => c.cellId !== 1;
    expect(f.assess(rect(1, 1, 8, 8))).toEqual({ status: "blocked", reason: "forbidden-cell" });
    expect(f.assess(rect(1, 1, 3, 2))).toMatchObject({ reason: "forbidden-cell" });
  });
  it("applies political permission on water while separating dry support", () => {
    const f = fixture();
    f.world.pack.cells.h[1] = 10;
    expect(f.assess(rect(1, 1, 8, 8))).toEqual({ status: "allowed" });
    expect(f.assess(rect(1, 1, 8, 8), "dry-support")).toMatchObject({ reason: "unsupported-cell" });
    f.rules.allowsCell = c => c.cellId !== 1;
    expect(f.assess(rect(1, 1, 8, 8))).toMatchObject({ reason: "forbidden-cell" });
  });
  it("rejects unsupported land, uncovered holes and outside-world width", () => {
    const f = fixture();
    f.rules.supportsCell = c => c.cellId !== 1;
    expect(f.assess(rect(1, 1, 8, 8), "dry-support")).toMatchObject({ reason: "unsupported-cell" });
    const g = fixture([rect(0, 0, 4, 10), rect(6, 0, 4, 10)]);
    expect(g.assess(rect(1, 1, 8, 8))).toMatchObject({ reason: "uncovered-region" });
    expect(f.assess(rect(-0.1, 1, 2, 2))).toMatchObject({ reason: "outside-world" });
  });
  it("does not let overlapping permitted cells hide a forbidden interior", () => {
    const f = fixture([rect(0, 0, 10, 10), rect(4, 4, 2, 2)]);
    f.rules.allowsCell = c => c.cellId === 0;
    expect(f.assess(rect(1, 1, 8, 8))).toMatchObject({ reason: "forbidden-cell" });
  });
  it("freezes geometry, permissions and budgets until explicit rebuild", () => {
    const f = fixture(),
      b = f.build();
    if (!("policy" in b)) throw Error();
    f.world.pack.cells.state[1] = 10;
    f.rules.allowsCell = c => c.cellId !== 1;
    f.world.pack.vertices.p[0][0] = NaN;
    f.settings.maxClipOperations = 1;
    expect(b.policy.assess(rect(1, 1, 8, 8), "passage")).toEqual({ status: "allowed" });
    expect(f.build()).toMatchObject({ reason: "invalid-cell" });
  });
  it("bounds cells, vertices, clipping and remaining pieces", () => {
    const f = fixture();
    f.settings.maxCells = 1;
    expect(f.build()).toMatchObject({ reason: "cell-budget" });
    f.settings.maxCells = 20;
    f.settings.maxVertices = 1;
    expect(f.build()).toMatchObject({ reason: "vertex-budget" });
    f.settings.maxVertices = 100;
    f.settings.maxClipOperations = 1;
    expect(f.assess(rect(1, 1, 8, 8))).toMatchObject({ status: "unresolved", reason: "clip-budget" });
    const g = fixture([rect(4, 4, 2, 2)]);
    g.settings.maxRemainingPieces = 1;
    expect(g.assess(rect(1, 1, 8, 8))).toMatchObject({ status: "unresolved", reason: "piece-budget" });
  });
  it("rejects malformed cells and nonconvex or degenerate footprints", () => {
    const f = fixture();
    expect(
      f.assess([
        [1, 1],
        [9, 1],
        [5, 5],
        [9, 9],
        [1, 9]
      ])
    ).toMatchObject({ reason: "invalid-footprint" });
    expect(
      f.assess([
        [1, 1],
        [2, 2],
        [3, 3]
      ])
    ).toMatchObject({ reason: "invalid-footprint" });
    f.world.pack.cells.v[0][0] = 999;
    expect(f.build()).toMatchObject({ reason: "invalid-cell" });
    const g = fixture();
    g.world.pack.vertices = undefined as unknown as WorldContext["pack"]["vertices"];
    expect(g.build()).toMatchObject({ reason: "invalid-cell" });
    const h = fixture();
    h.settings.maxClipOperations = undefined as unknown as number;
    expect(h.build()).toMatchObject({ reason: "invalid-input" });
  });
  it("keeps metre geometry equivalent across units without consuming RNG or mutating input", () => {
    const f = fixture(),
      before = JSON.stringify(f.world),
      random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw Error("RNG");
      });
    try {
      expect(f.assess(rect(1, 1, 8, 8))).toEqual({ status: "allowed" });
      expect(JSON.stringify(f.world)).toBe(before);
      f.world.distanceScale = 0.001 / 1.609344;
      const b = f.build("mi");
      if (!("policy" in b)) throw Error();
      expect(b.policy.assess(rect(1, 1, 8, 8), "passage")).toEqual({ status: "allowed" });
    } finally {
      random.mockRestore();
    }
  });
});
