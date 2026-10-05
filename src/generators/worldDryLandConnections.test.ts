import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import { buildConstrainedLandNetwork, findConstrainedLandRoute } from "./constrainedLandNetwork";
import { buildWorldDryLandConnections } from "./worldDryLandConnections";

function fixture(waters: RiverPoint[][] = []) {
  const world = {
    graphWidth: 20,
    graphHeight: 10,
    distanceScale: 0.001,
    pack: {
      cells: { i: new Uint16Array([0]), h: new Uint8Array([25]), v: [[0, 1, 2, 3]] },
      vertices: {
        p: [
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10]
        ]
      },
      burgs: [{}, { i: 1, x: 2, y: 5 }, { i: 2, x: 18, y: 5 }]
    }
  } as unknown as WorldContext;
  const pairs = [{ id: 1, cityAId: 1, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 100 }];
  const settings = {
    firstConnectionId: 10,
    maxSearches: 100,
    guides: {
      spacingMeters: 2,
      roadWidthMeters: 1,
      firstNodeId: 100,
      maxCells: 10,
      maxVertices: 100,
      maxSamples: 1000,
      maxSourceNodes: 1000,
      maxSourceEdges: 10000,
      maxNeighbourChecks: 10000
    },
    corridor: {
      roadWidthMeters: 1,
      minimumTurnRadiusMeters: 1,
      minimumStraightMeters: 0,
      minimumFinalStraightMeters: 0,
      turnPenaltyMetersPerRadian: 0,
      maxEnvelopeErrorMeters: 0.01,
      maxArcSections: 100,
      maxNodes: 1000,
      maxEdges: 10000,
      maxLabels: 100000,
      maxExpansions: 100000
    }
  };
  const environment = {
    water: PhysicalWaterIndex.build(
      waters.map((ring, id) => ({ id, rings: [ring] })),
      new PhysicalWaterValidationCache()
    )!,
    supportsDryFootprint: () => true
  };
  const run = () => buildWorldDryLandConnections(world, "km", pairs, settings, environment);
  return { world, pairs, settings, environment, run };
}
describe("automatic world dry walking alternatives", () => {
  it("exports current width/turn-validated city corridors usable by the existing network", () => {
    const f = fixture(),
      result = f.run();
    if (!("connections" in result)) throw Error(result.reason);
    expect(result.unresolvedPairIds).toEqual([]);
    expect(result.connections).toHaveLength(1);
    const environment = { ...f.environment, crossingInputAt: () => null };
    const network = buildConstrainedLandNetwork({
      nodes: [
        { id: 1, point: [2, 5] },
        { id: 2, point: [18, 5] }
      ],
      connections: result.connections,
      roadWidthMeters: 1,
      maxNodes: 10,
      maxEdges: 10,
      maxCorridorPieces: 100,
      maxGuideNodes: 1000,
      maxGuideEdges: 10000,
      environment
    });
    if (!("network" in network)) throw Error(network.reason);
    expect(
      findConstrainedLandRoute(network.network, {
        startNodeId: 1,
        goalNodeId: 2,
        environment,
        settings: { maxLabels: 1000, maxExpansions: 1000, historyCountCap: 2, repeatCrossingCostMeters: 1 }
      })
    ).toHaveProperty("route");
  });
  it("does not turn an unconfirmed finite-guide alternative into continuous unreachability", () => {
    const f = fixture([
        [
          [9, 0],
          [11, 0],
          [11, 10],
          [9, 10]
        ]
      ]),
      result = f.run();
    if (!("connections" in result)) throw Error(result.reason);
    expect(result.connections).toEqual([]);
    expect(result.unresolvedPairIds).toEqual([1]);
  });
  it("discards the entire result if terminal-direction or search work exceeds budgets", () => {
    const f = fixture();
    f.settings.maxSearches = 1;
    expect(f.run()).toEqual({ reason: "dry-search-budget" });
    const g = fixture();
    g.settings.corridor.maxLabels = 1;
    expect(g.run()).toEqual({ reason: "dry-search-budget" });
  });
});
