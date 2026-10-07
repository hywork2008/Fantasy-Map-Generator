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
  it("commits a single crossing without removing routes, destinations or same-bank roads", () => {
    const world = fixture();
    world.pack.routes = [
      world.pack.routes[0],
      {
        i: 9,
        group: "roads",
        points: [
          [-50, 0, 0],
          [-60, 50, 2]
        ]
      } as never
    ];
    const before = structuredClone(world.pack.routes);
    const prepared = ensureConvergingWorldRiverRoads(world, "km");
    expect(prepared.facilities).toHaveLength(1);
    expect(prepared.changedRoutes).toEqual([0]);
    expect(world.pack.routes.map(r => r.i)).toEqual(before.map(r => r.i));
    expect(world.pack.routes[0].points[0]).toEqual(before[0].points[0]);
    expect(world.pack.routes[0].points.at(-1)).toEqual(before[0].points.at(-1));
    expect(world.pack.routes[1]).toEqual(before[1]);
    expect(convergedBurgCrossings(world, "km", world.pack.burgs[1])?.crossings).toHaveLength(1);
  });
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
  it("follows an oblique road with a skewed bridge only within the period's allowance", () => {
    const skewOf = (period: string) => {
      vi.restoreAllMocks();
      const world = fixture();
      world.options.historicalPeriod = period as never;
      // A single road meeting the river 20° off square.
      world.pack.routes = [
        {
          i: 0,
          group: "roads",
          points: [
            [-50, 0, 0],
            [50, Math.tan((20 * Math.PI) / 180) * 100, 1]
          ]
        } as never
      ];
      const prepared = ensureConvergingWorldRiverRoads(world, "km");
      expect(prepared.facilities).toHaveLength(1);
      const payload = convergedBurgCrossings(world, "km", world.pack.burgs[1])!;
      expect(validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS)).toBe(true);
      return prepared.facilities[0].crossing.skewDegrees;
    };
    const exploration = skewOf("ageOfExploration");
    expect(Math.abs(exploration)).toBeGreaterThan(0);
    expect(Math.abs(exploration)).toBeLessThanOrEqual(25);
    expect(Math.abs(skewOf("earlyMedieval"))).toBeLessThanOrEqual(15);
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
  it("keeps separate necessary crossings when a lake prevents sharing the far-bank arms", () => {
    const world = fixture();
    world.pack.routes = [-80, 80].map((y, i) => ({
      i,
      group: "roads",
      points: [
        [-50, 0, 0],
        [50, y, i + 1]
      ]
    })) as never;
    world.pack.cells.h[1] = 10;
    vi.mocked(SettlementGeometrySession.prototype.terrain).mockReturnValue([
      {
        id: 0,
        ring: [
          [-2000, -2000],
          [2000, -2000],
          [2000, 2000],
          [-2000, 2000]
        ]
      },
      {
        id: 1,
        // Close to the far bank: no dry gap for a shared far arm, even behind a skewed bridge.
        ring: [
          [12, -20],
          [35, -20],
          [35, 20],
          [12, 20]
        ]
      }
    ]);
    const endpoints = world.pack.routes.map(r => r.points.at(-1));
    const prepared = ensureConvergingWorldRiverRoads(world, "km");
    expect(prepared.facilities).toHaveLength(2);
    expect(new Set(prepared.facilities.map(f => f.crossing.id)).size).toBe(2);
    expect(world.pack.routes.map(r => r.points.at(-1))).toEqual(endpoints);
    const exported = convergedBurgCrossings(world, "km", world.pack.burgs[1])!;
    expect(exported.crossings).toHaveLength(2);
    expect(exported.rivers).toHaveLength(1);
    expect(exported.obstacles).toHaveLength(1);
    expect(validFixedBurgCrossings(exported, FIXED_SITE_CROSSING_BUDGETS)).toBe(true);
  });
});
