import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { PackedGraph } from "../types/PackedGraph";
import { resolveRiverRouteCrossings } from "./riverRouteCrossings";

beforeEach(() => {
  worldContext.distanceScale = 1;
  worldContext.options.historicalPeriod = "ageOfExploration";
  worldContext.pack = {
    cells: {
      h: [25, 25, 25, 25, 25, 25],
      p: [
        [0, -10],
        [0, -6],
        [0, -2],
        [0, 2],
        [0, 6],
        [0, 10]
      ],
      fl: [200, 200, 200, 200, 200, 200]
    },
    rivers: [
      {
        i: 1,
        cells: [0, 1, 2, 3, 4, 5],
        widthFactor: 0,
        sourceWidth: 1,
        cellHydrology: Object.fromEntries([0, 1, 2, 3, 4, 5].map(c => [c, { waterDepth: 3 }]))
      }
    ],
    routes: [
      {
        i: 0,
        group: "roads",
        cells: [0, 2, 5],
        points: [
          [-10, 0, 0],
          [10, 0, 5]
        ]
      }
    ]
  } as unknown as PackedGraph;
});

describe("final FMG road crossings", () => {
  it("resolves local width and navigation after candidate routes without using mouth width", () => {
    worldContext.pack.rivers[0].width = 7;
    resolveRiverRouteCrossings(worldContext);
    const crossing = worldContext.pack.routes[0].riverCrossings![0];
    expect(crossing).toMatchObject({
      riverId: 1,
      point: [0, 0],
      plan: { kind: "fixedBridge", navigationRequired: true }
    });
    expect(crossing.plan.widthMeters).toBeLessThan(1000);
    worldContext.options.historicalPeriod = "earlyMedieval";
    resolveRiverRouteCrossings(worldContext);
    expect(worldContext.pack.routes[0].riverCrossings![0].plan.kind).toBe("ferry");
  });
  it("is stable on regeneration and does not duplicate an intersection", () => {
    resolveRiverRouteCrossings(worldContext);
    const before = structuredClone(worldContext.pack.routes[0].riverCrossings);
    resolveRiverRouteCrossings(worldContext);
    expect(worldContext.pack.routes[0].riverCrossings).toEqual(before);
    expect(before).toHaveLength(1);
  });
  it("requires a movable span for a tall sea sailing route on the river", () => {
    worldContext.pack.rivers[0].cellHydrology = Object.fromEntries(
      [0, 1, 2, 3, 4, 5].map(c => [c, { waterDepth: 5, waterTemperature: 15, surfaceVelocity: 1 }])
    );
    worldContext.pack.routes.push({
      i: 1,
      group: "searoutes",
      feature: 1,
      points: [
        [0, -10, 0],
        [0, 10, 5]
      ],
      cells: [0, 1, 2, 3, 4, 5]
    });
    resolveRiverRouteCrossings(worldContext);
    expect(worldContext.pack.routes[0].riverCrossings![0].plan.kind).toBe("movableBridge");
  });
});

it("preserves a locked crossing instead of silently upgrading its bridge", () => {
  resolveRiverRouteCrossings(worldContext);
  const route = worldContext.pack.routes[0];
  route.lock = true;
  const before = structuredClone(route.riverCrossings);
  worldContext.options.historicalPeriod = "earlyMedieval";
  resolveRiverRouteCrossings(worldContext);
  expect(route.riverCrossings).toEqual(before);
});
