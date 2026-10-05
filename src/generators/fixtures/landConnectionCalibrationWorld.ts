import type { WorldContext } from "../../context/worldContext";
import { WorldRiverGeometryRegistry } from "../../services/worldRiverGeometry";
import type { NetworkConnection } from "../constrainedLandNetwork";
import {
  evaluateWorldLandConnectionProposals,
  type WorldConnectionPair,
  type WorldProposalEnvironment,
  type WorldProposalSettings
} from "../worldLandConnectionProposals";

/** Fixed physical crossing fixture shared by tests and the calibration runner. */
export function createLandCalibrationWorldFixture() {
  const world = {
    mapId: 5,
    seed: "land-calibration",
    grid: { cells: { temp: [12], prec: [45] } },
    distanceScale: 0.001,
    graphWidth: 100,
    graphHeight: 100,
    pack: {
      cells: {
        capacity: [100],
        subsistenceCapacity: [100],
        s: [100],
        g: [0],
        p: [
          [50, 40],
          [50, 44],
          [50, 48],
          [50, 52],
          [50, 56],
          [50, 60]
        ],
        h: [25, 25, 25, 25, 25, 25],
        fl: [20, 20, 20, 20, 20, 20]
      },
      rivers: [{ i: 7, cells: [0, 1, 2, 3, 4, 5], widthFactor: 0, sourceWidth: 2 }],
      burgs: [{}, { i: 1, x: 85, y: 50, cell: 0 }, { i: 2, x: 15, y: 50, cell: 0 }, { i: 3, x: 80, y: 50, cell: 0 }],
      routes: []
    }
  } as unknown as WorldContext;
  const settings: WorldProposalSettings = {
    crossings: {
      geometry: {
        curveAlpha: 0.1,
        precision: { arcToleranceMeters: 1e-5, maxIntegrationDepth: 24, maxEvaluations: 100000 },
        banks: { maxStepMeters: 5, maxChordErrorMeters: 0.01, maxSamples: 2000 },
        maxSourcePoints: 100
      },
      dimensions: { bankSeatMeters: 2, straightApproachMeters: 5, roadWidthMeters: 2, localWindowMeters: 4 },
      spacingMeters: 12,
      maxRivers: 10,
      maxAttempts: 10,
      firstCandidateId: 100
    },
    approaches: {
      guides: {
        spacingMeters: 5,
        paddingMeters: 5,
        terminalLeadMeters: 5,
        connectorRadiusMeters: 8,
        maxSamples: 1000,
        maxNodes: 1000,
        maxEdges: 10000,
        maxEdgeChecks: 10000
      },
      corridor: {
        roadWidthMeters: 2,
        minimumTurnRadiusMeters: 2,
        minimumStraightMeters: 0,
        minimumFinalStraightMeters: 2,
        turnPenaltyMetersPerRadian: 0,
        maxEnvelopeErrorMeters: 0.05,
        maxArcSections: 100,
        maxNodes: 1000,
        maxEdges: 10000,
        maxLabels: 10000,
        maxExpansions: 10000
      }
    },
    network: { maxNodes: 100, maxEdges: 100, maxCorridorPieces: 1000, maxGuideNodes: 10000, maxGuideEdges: 100000 },
    maxPairs: 5,
    maxApproachAttempts: 20,
    maxAssessmentSearches: 30,
    firstConnectionId: 1000,
    search: { maxLabels: 10000, maxExpansions: 10000, historyCountCap: 2, repeatCrossingCostMeters: 10 },
    individual: {
      minimumImprovementMeters: 1,
      nearEqualCostMeters: 1,
      maxConstructionCostMeters: 100,
      maxRouteCostMeters: 500,
      maxSearches: 4,
      maxReturnComparisons: 1
    },
    shared: {
      maxPairs: 5,
      maxSearches: 20,
      maxReturnComparisons: 1,
      nearEqualCostMeters: 1,
      maxConstructionCostMeters: 100,
      maxPairCostMeters: 500,
      maxTotalCostMeters: 1000,
      minimumNetBenefitMeters: 1
    }
  };
  const environment: WorldProposalEnvironment = {
    nonRiverWater: [],
    supportsDryFootprint: () => true,
    allowsPassageFootprint: () => true,
    capabilityAt: () => ({ depthMeters: 3 }),
    facilityCostsAt: () => ({ constructionCostMeters: 10, useCostMeters: 3 }),
    approachConstructionCostAt: () => 2
  };
  const pairs: WorldConnectionPair[] = [
    { id: 1, cityAId: 1, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 },
    { id: 2, cityAId: 3, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 }
  ];
  const registry = new WorldRiverGeometryRegistry();
  const input = { pairs, baselineConnections: [] as NetworkConnection[], settings, environment, registry };
  const run = () => evaluateWorldLandConnectionProposals(world, "km", input);
  return { world, input, run };
}
