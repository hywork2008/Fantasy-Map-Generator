import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import { buildWorldDryLandRouteGraph, type WorldDryGuideSettings } from "./worldDryLandRouteGraph";

const rect = (a: number, b: number, c: number, d: number): RiverPoint[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d]
];
function fixture(single = false, water: RiverPoint[][] = []) {
  const world = {
    graphWidth: 20,
    graphHeight: 10,
    distanceScale: 0.001,
    pack: {
      cells: {
        i: Uint16Array.from(single ? [0] : [0, 1]),
        h: Uint8Array.from(single ? [25] : [25, 25]),
        v: single
          ? [[0, 4, 5, 3]]
          : [
              [0, 1, 2, 3],
              [1, 4, 5, 2]
            ]
      },
      vertices: {
        p: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [20, 0],
          [20, 10]
        ]
      },
      burgs: [{}, { i: 1, x: 2, y: 5, cell: 0 }, { i: 2, x: 18, y: 5, cell: 0 }]
    }
  } as unknown as WorldContext;
  const settings: WorldDryGuideSettings = {
    spacingMeters: 2,
    roadWidthMeters: 1,
    firstNodeId: 100,
    maxCells: 10,
    maxVertices: 100,
    maxSamples: 1000,
    maxSourceNodes: 1000,
    maxSourceEdges: 10000,
    maxNeighbourChecks: 10000
  };
  const environment = {
    water: PhysicalWaterIndex.build(
      water.map((ring, id) => ({ id, rings: [ring] })),
      new PhysicalWaterValidationCache()
    )!,
    supportsDryFootprint: () => true
  };
  const run = () => buildWorldDryLandRouteGraph(world, "km", settings, [1, 2], environment);
  return { world, settings, environment, run };
}
function components(result: ReturnType<typeof buildWorldDryLandRouteGraph>) {
  if (!("graph" in result)) throw Error(result.reason);
  return [1, 2].map(id => result.graph.nodes.find(n => n.id === result.cityNodeIds.get(id))!.dryComponentId);
}
describe("world dry patches and explicit shared-border guides", () => {
  it("joins adjacent land through full-width dry portals and uses physical city positions", () => {
    const f = fixture(),
      result = f.run();
    expect(components(result)[0]).toBe(components(result)[1]);
    if (!("graph" in result)) throw Error();
    expect(result.graph.nodes.some(n => n.portalId !== undefined && n.cellIds.join() === "0,1")).toBe(true);
    expect(result.graph.nodes.find(n => n.id === result.cityNodeIds.get(2))!.cellIds).toEqual([1]);
    expect(result.blockedCityIds).toEqual([]);
  });
  it("keeps two banks in one cell disconnected when the entire river separates them", () => {
    const f = fixture(true, [rect(9.6, 0, 10.4, 10)]);
    f.settings.spacingMeters = 3;
    const result = f.run();
    expect(components(result)[0]).not.toBe(components(result)[1]);
    if (!("graph" in result)) throw Error();
    expect(result.graph.rejectedEdges.some(e => e.reason === "water-intersection")).toBe(true);
  });
  it("does not weld matching coordinates with different topological edge IDs", () => {
    const f = fixture();
    f.world.pack.vertices.p.push([10, 0], [10, 10]);
    f.world.pack.cells.v[1] = [6, 4, 5, 7];
    expect(components(f.run())[0]).not.toBe(components(f.run())[1]);
  });
  it("records flooded cities without certifying them as dry ports", () => {
    const f = fixture(true, [rect(1, 4, 3, 6)]),
      result = f.run();
    if (!("graph" in result)) throw Error(result.reason);
    expect(result.blockedCityIds).toEqual([1]);
    expect(result.cityNodeIds.has(1)).toBe(false);
    expect(result.cityNodeIds.has(2)).toBe(true);
  });
  it("fails without a partial graph on sampling, source, connector and malformed-cell budgets", () => {
    const a = fixture();
    a.settings.maxSamples = 1;
    expect(a.run()).toEqual({ reason: "sample-budget" });
    const b = fixture();
    b.settings.maxSourceNodes = 2;
    expect(b.run()).toEqual({ reason: "graph-budget" });
    const c = fixture();
    c.settings.maxNeighbourChecks = 1;
    expect(c.run()).toEqual({ reason: "neighbour-budget" });
    const d = fixture();
    d.world.pack.cells.v[0][0] = 999;
    expect(d.run()).toEqual({ reason: "invalid-cell" });
  });
  it("is independent of city order and does not mutate world or consume RNG", () => {
    const f = fixture(),
      before = JSON.stringify(f.world);
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("RNG");
    });
    try {
      const a = f.run(),
        b = buildWorldDryLandRouteGraph(f.world, "km", f.settings, [2, 1], f.environment);
      if (!("graph" in a) || !("graph" in b)) throw Error();
      expect(a.graph).toEqual(b.graph);
      expect(a.cityNodeIds).toEqual(b.cityNodeIds);
      expect(JSON.stringify(f.world)).toBe(before);
    } finally {
      random.mockRestore();
    }
  });
});
