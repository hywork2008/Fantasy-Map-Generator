import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { Routes } from "../generators/routes-generator";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { convergedBurgCrossings, ensureConvergingWorldRiverRoads } from "./convergingWorldRiverRoads";
import { buildPolylineRiverAxis } from "./riverGeometry";
import { resolveRiverRouteCrossings } from "./riverRouteCrossings";
import { SettlementGeometrySession } from "./settlementGeometrySession";

function fixture() {
  const geometry = {
    axis: buildPolylineRiverAxis(7, 3, [
      [0, -100],
      [0, 100]
    ])!,
    water: {
      id: 7,
      rings: [
        [
          [-5, -100],
          [5, -100],
          [5, 100],
          [-5, 100]
        ]
      ] as [number, number][][],
      bankReferences: [
        [
          null,
          { side: "right" as const, arcStart: 0, arcEnd: 200 },
          null,
          { side: "left" as const, arcStart: 200, arcEnd: 0 }
        ]
      ]
    }
  };
  vi.spyOn(SettlementGeometrySession.prototype, "prepare").mockImplementation(() => {});
  vi.spyOn(SettlementGeometrySession.prototype, "rivers").mockReturnValue([7]);
  vi.spyOn(SettlementGeometrySession.prototype, "resolve").mockReturnValue({ geometry, geometryVersion: 3 } as never);
  vi.spyOn(SettlementGeometrySession.prototype, "terrain").mockReturnValue([
    {
      id: 0,
      ring: [
        [-2000, -2000],
        [2000, -2000],
        [2000, 2000],
        [-2000, 2000]
      ]
    }
  ]);
  return {
    distanceScale: 0.001,
    populationRate: 1000,
    urbanization: 1,
    options: { historicalPeriod: "ageOfExploration" },
    pack: {
      vertices: { p: [] },
      cells: {
        p: [
          [-50, 0],
          [50, -30],
          [50, 0],
          [50, 30],
          [0, 0]
        ],
        v: [[0]],
        h: [25, 25, 25, 25, 25],
        fl: [0, 0, 0, 0, 0]
      },
      rivers: [{ i: 7, cells: [4], cellHydrology: { 4: { waterDepth: 3 } } }],
      burgs: [{}, { i: 1, cell: 0, x: -50, y: 0, population: 1 }],
      routes: [-30, 0, 30].map((y, i) => ({
        i,
        group: "roads",
        points: [
          [-50, 0, 0],
          [50, y, i + 1]
        ]
      }))
    }
  } as unknown as WorldContext;
}
afterEach(() => vi.restoreAllMocks());
describe("committed FMG shared bridge geometry", () => {
  it("commits once, exports the same normal section to CE and renders without smoothing or cell snapping", () => {
    const world = fixture();
    const prepared = ensureConvergingWorldRiverRoads(world, "km");
    expect(prepared.facilities).toHaveLength(1);
    expect(prepared.changedRoutes).toEqual([0, 1, 2]);
    const trunk = world.pack.routes[0].points.slice(0, 5).map(p => p.slice(0, 2));
    for (const r of world.pack.routes) {
      expect(r.points.slice(0, 5).map(p => p.slice(0, 2))).toEqual(trunk);
      expect(Routes.getRenderPoints(r, world.pack)).toBe(r.points);
      expect(Routes.getPath(r, world.pack)).not.toContain("C");
    }
    resolveRiverRouteCrossings(world);
    for (const route of world.pack.routes) {
      expect(route.riverCrossings).toHaveLength(1);
      expect(route.riverCrossings![0].plan).toEqual(prepared.facilities[0].crossing.plan);
    }
    const payload = convergedBurgCrossings(world, "km", world.pack.burgs[1])!;
    expect(validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS)).toBe(true);
    expect(payload.crossings).toHaveLength(1);
    expect(payload.crossings[0].deckA).toEqual([57, 0]);
    expect(payload.crossings[0].deckB).toEqual([43, 0]);
    const snapshot = structuredClone(world.pack.routes);
    expect(ensureConvergingWorldRiverRoads(world, "km")).toBe(prepared);
    expect(world.pack.routes).toEqual(snapshot);
    // Revalidate from original paths after a saved map is restored into a new pack.
    const restored = structuredClone(world);
    expect(ensureConvergingWorldRiverRoads(restored, "km").facilities).toHaveLength(1);
    expect(restored.pack.routes).toEqual(snapshot);
  });
  it("does not alter locked roads and restores original cells when bridges become unavailable", () => {
    const world = fixture();
    world.pack.routes[2].lock = true;
    const locked = structuredClone(world.pack.routes[2]);
    const original = structuredClone(world.pack.routes[0].points);
    expect(ensureConvergingWorldRiverRoads(world, "km").facilities).toHaveLength(1);
    expect(world.pack.routes[2]).toEqual(locked);
    world.options.riverBridgeTechnology = { maxSupportedSpanMeters: 0, maxPierDepthMeters: 0 } as never;
    ensureConvergingWorldRiverRoads(world, "km");
    expect(world.pack.routes[0].points).toEqual(original);
    expect(world.pack.routes[0].cells).toEqual([0, 1]);
    expect(world.pack.routes[0].riverRoadConvergence).toBeUndefined();
  });
});
