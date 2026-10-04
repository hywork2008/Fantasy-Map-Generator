import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { buildWorldNonRiverWater, WorldNonRiverWaterRegistry } from "./worldNonRiverWater";

const square = (x: number, y: number, w: number, h: number) =>
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ] as [number, number][];
function fixture() {
  // Sea surrounds a dry island; an inland lake occupies a fifth, separate cell.
  const rings = [
    square(-1, -1, 4, 12),
    square(3, -1, 4, 4),
    square(3, 7, 4, 4),
    square(7, -1, 4, 12),
    square(3, 3, 4, 4)
  ];
  const world = {
    distanceScale: 0.001,
    graphWidth: 10,
    graphHeight: 10,
    pack: {
      cells: {
        i: Uint16Array.from([0, 1, 2, 3, 4]),
        h: Uint8Array.from([10, 10, 10, 10, 25]),
        v: rings.map((_, i) => [4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3]),
        state: new Uint16Array(5)
      },
      vertices: { p: rings.flat() }
    }
  } as unknown as WorldContext;
  const budgets = { maxCells: 10, maxVertices: 100 };
  return { world, budgets, build: () => buildWorldNonRiverWater(world, "km", budgets) };
}
describe("world physical lake/sea cell union", () => {
  it("retains islands, containment, internal water seams and the map border", () => {
    const f = fixture(),
      result = f.build();
    if (!("water" in result)) throw Error(result.reason);
    expect(result.cellIds).toEqual([0, 1, 2, 3]);
    expect(result.index.touchesWater(square(4, 4, 2, 2))).toBe(false);
    expect(result.index.touchesWater(square(0.2, 1, 1, 1))).toBe(true);
    expect(result.index.touchesWater(square(2.9, 1, 0.2, 1))).toBe(true);
    expect(result.index.touchesWater(square(0, 0, 10, 10))).toBe(true);
    expect(result.water.every(w => w.rings.flat().every(p => p.every(v => v >= 0 && v <= 10)))).toBe(true);
    f.world.pack.cells.h[4] = 10;
    const lake = f.build();
    if (!("water" in lake)) throw Error(lake.reason);
    expect(lake.index.touchesWater(square(4, 4, 2, 2))).toBe(true);
    // A previously obtained snapshot is independent of current mutable heights.
    expect(result.index.touchesWater(square(4, 4, 2, 2))).toBe(false);
  });
  it("fails closed for missing water geometry and budgets without partial results", () => {
    const f = fixture();
    f.budgets.maxCells = 1;
    expect(f.build()).toEqual({ reason: "cell-budget" });
    f.budgets.maxCells = 10;
    f.budgets.maxVertices = 1;
    expect(f.build()).toEqual({ reason: "vertex-budget" });
    f.budgets.maxVertices = 100;
    f.world.pack.cells.v[0][0] = 999;
    expect(f.build()).toEqual({ reason: "invalid-cell" });
    const g = fixture();
    g.world.pack.cells.i[1] = 0;
    expect(g.build()).toEqual({ reason: "invalid-cell" });
    const h = fixture();
    h.world.pack.cells.h = new Uint8Array([10]);
    expect(h.build()).toEqual({ reason: "invalid-cell" });
  });
  it("reuses political changes and invalidates height, mesh, unit, budgets and pack identity", () => {
    const f = fixture(),
      registry = new WorldNonRiverWaterRegistry();
    const first = registry.get(f.world, "km", f.budgets);
    f.world.pack.cells.state[0] = 2;
    expect(registry.get(f.world, "km", f.budgets)).toBe(first);
    f.world.pack.cells.h[4] = 10;
    const lake = registry.get(f.world, "km", f.budgets);
    expect(lake).not.toBe(first);
    f.world.pack.vertices.p[0][0] = -2;
    const mesh = registry.get(f.world, "km", f.budgets);
    expect(mesh).not.toBe(lake);
    expect(registry.get(f.world, "mi", f.budgets)).not.toBe(mesh);
    f.budgets.maxVertices = 1;
    expect(registry.get(f.world, "km", f.budgets)).toEqual({ reason: "vertex-budget" });
    f.budgets.maxVertices = 100;
    const repaired = registry.get(f.world, "km", f.budgets);
    expect(repaired).toHaveProperty("water");
    f.world.pack = structuredClone(f.world.pack);
    expect(registry.get(f.world, "km", f.budgets)).not.toBe(repaired);
  });
  it("is deterministic, does not mutate world/RNG, and preserves metre geometry across units", () => {
    const f = fixture(),
      before = JSON.stringify(f.world);
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("RNG");
    });
    try {
      const first = f.build();
      expect(JSON.stringify(f.world)).toBe(before);
      f.world.distanceScale /= 1.609344;
      const second = buildWorldNonRiverWater(f.world, "mi", f.budgets);
      if (!("water" in first) || !("water" in second)) throw Error("water failed");
      expect(second.water).toEqual(first.water);
    } finally {
      random.mockRestore();
    }
  });
});
