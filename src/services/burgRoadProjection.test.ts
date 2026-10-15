import { describe, expect, it } from "vitest";
import type { Burg, Route } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  type BurgRoadContext,
  captureBurgRoadReadSnapshot,
  collectBurgRoadEntries,
  collectBurgRouteLegs
} from "./burgRoadProjection";

function fixture(): { context: BurgRoadContext; burg: Burg } {
  const burgs = [
    0,
    { i: 1, name: "Origin", x: 0, y: 0, cell: 0, state: 1, population: 2 },
    { i: 2, name: "East", x: 10, y: 0, cell: 2, state: 2, population: 1.5, citadel: 1, walls: 0 },
    { i: 3, name: "North", x: 10, y: -10, cell: 3, state: 1, population: 8 }
  ];
  const pack = {
    burgs,
    cells: {
      burg: [1, 0, 2, 3],
      p: [
        [0, 0],
        [2, 0],
        [10, 0],
        [10, -10]
      ]
    },
    states: [{}, { name: "Home", diplomacy: ["Neutral", "x", "Enemy"] }, { name: "Foreign" }],
    routes: []
  } as unknown as PackedGraph;
  return {
    burg: pack.burgs[1],
    context: { pack, populationRate: 1000, urbanization: 1, metersPerMapUnit: 100, renderPoints: r => r.points }
  };
}
const options = {
  toLocal: (x: number, y: number): [number, number] => [x * 100, -y * 100],
  half: 300,
  cityRadiusMeters: 100
};

describe("read-only CE road projection", () => {
  it("uses the closest burg point instead of an earlier bend in the same cell; preserves both legs", () => {
    const { context, burg } = fixture();
    context.pack.routes = [
      {
        i: 1,
        group: "roads",
        points: [
          [-10, 0, 1],
          [-1, 1, 0],
          [0, 0, 0],
          [10, 0, 2]
        ]
      } as Route
    ];
    const legs = collectBurgRouteLegs(context, burg);
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.leg[0][0] === 0)).toBe(true);
    const entries = collectBurgRoadEntries(context, burg, options);
    expect(entries.find(e => e.nextBurg?.id === 2)?.nextBurg).toMatchObject({
      distanceMeters: 1000,
      population: 1500,
      diplomacyRelation: "Enemy",
      citadel: true,
      walls: false
    });
    expect(entries.find(e => e.nextBurg?.id === 2)?.entryAzimuthDeg).toBe(90);
  });
  it("does not invent a convergence origin when no point is exactly the burg position", () => {
    const { context, burg } = fixture();
    const unresolved: string[] = [];
    context.onUnresolved = (_r, reason) => unresolved.push(reason);
    context.pack.routes = [
      {
        i: 1,
        group: "roads",
        points: [
          [0.1, 0, 0],
          [10, 0, 2]
        ],
        riverRoadConvergence: { originalPoints: [], pointsKey: "", burgIds: [1] }
      } as Route
    ];
    expect(collectBurgRouteLegs(context, burg)).toEqual([]);
    expect(unresolved).toEqual(["rendered_origin_not_found"]);
  });
  it("merges shared approaches while retaining each far-bank branch and destination", () => {
    const { context, burg } = fixture();
    context.pack.routes = [
      {
        i: 1,
        group: "roads",
        points: [
          [0, 0, 0],
          [2, 0, 1],
          [10, 0, 2]
        ],
        traffic: 5
      },
      {
        i: 2,
        group: "roads",
        points: [
          [0, 0, 0],
          [2, 0, 1],
          [10, -10, 3]
        ],
        traffic: 10
      }
    ] as Route[];
    context.facilities = [{ routeIds: [1, 2], near: [200, 0], crossing: { id: 7 } }];
    const before = structuredClone(context.pack);
    const entries = collectBurgRoadEntries(context, burg, options);
    expect(entries).toHaveLength(1);
    expect(entries[0].sharedCrossingId).toBe(7);
    expect(entries[0].sharedBranches?.map(b => b.nextBurg?.id)).toEqual([2, 3]);
    expect(entries[0].sharedRouteIds).toEqual([1, 2]);
    expect(entries[0].path.at(-1)).toEqual([200, 0]);
    expect(entries[0].sharedBranches?.[0].path.at(-1)).toEqual([300, 0]);
    expect(context.pack).toEqual(before);
    expect(captureBurgRoadReadSnapshot(context, burg).facilities).toEqual(context.facilities);
  });
  it("uses registered node endpoints independently of cell visits and stops before a bridge", () => {
    const { context, burg } = fixture();
    context.pack.routes = [
      {
        i: 9,
        group: "roads",
        registeredConnectionId: 70,
        points: [
          [0, 0, 1],
          [2, 0, 1],
          [10, 0, 2]
        ]
      } as Route
    ];
    context.landConnectionGeneration = true;
    context.registeredConnectionAt = () => ({ from: 1, to: 2, crossing: { approachA: [200, 0], approachB: [800, 0] } });
    const legs = collectBurgRouteLegs(context, burg);
    expect(legs).toHaveLength(1);
    expect(legs[0].leg).toHaveLength(2);
    expect(collectBurgRoadEntries(context, burg, options)[0].nextBurg).toBeNull();
    const unresolved: string[] = [];
    context.registeredConnectionAt = () => null;
    context.onUnresolved = (_r, r) => unresolved.push(r);
    expect(collectBurgRouteLegs(context, burg)).toEqual([]);
    expect(unresolved).toEqual(["registered_snapshot_unavailable"]);
  });
  it("keeps sea routes, omits merged routes and suppresses legacy land when registered generation is enabled", () => {
    const { context, burg } = fixture();
    context.landConnectionGeneration = true;
    context.pack.routes = [
      {
        i: 1,
        group: "roads",
        points: [
          [0, 0, 0],
          [10, 0, 2]
        ]
      },
      {
        i: 2,
        group: "searoutes",
        points: [
          [0, 0, 0],
          [10, 0, 2]
        ]
      },
      {
        i: 3,
        group: "searoutes",
        merged: true,
        points: [
          [0, 0, 0],
          [10, 0, 2]
        ]
      }
    ] as Route[];
    expect(collectBurgRouteLegs(context, burg).map(l => l.route.i)).toEqual([2]);
  });
});
