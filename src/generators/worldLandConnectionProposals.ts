import type { WorldContext } from "../context/worldContext";
import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
import type { RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import type { WorldRiverGeometryRegistry } from "../services/worldRiverGeometry";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import {
  buildConstrainedLandNetwork,
  type ConstrainedLandNetwork,
  type NetworkConnection,
  type NetworkEnvironment,
  type NetworkNode,
  type NetworkSearchSettings
} from "./constrainedLandNetwork";
import {
  assessLandConnection,
  type LandConnectionAssessment,
  type LandConnectionAssessmentSettings
} from "./landConnectionAssessment";
import type { CrossingCandidateInput, ProvisionalRiverCrossing } from "./riverCrossingCandidates";
import {
  assessSharedLandConnections,
  type SharedConnectionAssessment,
  type SharedConnectionSettings
} from "./sharedLandConnectionAssessment";
import {
  connectWorldRiverCrossingApproaches,
  type WorldCrossingApproachSettings
} from "./worldRiverCrossingApproaches";
import {
  generateWorldRiverCrossingCandidates,
  type WorldCrossingCandidateReport,
  type WorldCrossingCandidateSettings
} from "./worldRiverCrossingCandidates";

export interface WorldConnectionPair {
  id: number;
  cityAId: number;
  cityBId: number;
  weight: number;
  unconnectedAllowanceMeters: number;
  startTangent?: RiverPoint;
  goalTangent?: RiverPoint;
}
export interface WorldProposalEnvironment {
  nonRiverWater: readonly PhysicalWaterPolygon[];
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
  /** Whole occupied regions in metres, including bridge water: politics/diplomacy/allowed regions. */
  allowsPassageFootprint: (footprint: readonly RiverPoint[]) => boolean;
  capabilityAt: (riverId: number, arcLengthMeters: number) => CrossingCandidateInput["capability"];
  facilityCostsAt: (crossing: ProvisionalRiverCrossing) => { constructionCostMeters: number; useCostMeters: number };
  approachConstructionCostAt: (crossing: ProvisionalRiverCrossing, cityAId: number, cityBId: number) => number;
}
export interface WorldProposalSettings {
  crossings: WorldCrossingCandidateSettings;
  approaches: Pick<WorldCrossingApproachSettings, "guides" | "corridor">;
  network: Pick<
    Parameters<typeof buildConstrainedLandNetwork>[0],
    "maxNodes" | "maxEdges" | "maxCorridorPieces" | "maxGuideNodes" | "maxGuideEdges"
  >;
  maxPairs: number;
  maxApproachAttempts: number;
  maxAssessmentSearches: number;
  firstConnectionId: number;
  search: NetworkSearchSettings;
  individual: LandConnectionAssessmentSettings;
  shared: SharedConnectionSettings;
}
export interface WorldProposalDiagnostics {
  enumeration: WorldCrossingCandidateReport | null;
  approachAttempts: number;
  assessmentSearches: number;
  rejected: readonly {
    facilityId: number;
    connectionId?: number;
    cityAId?: number;
    cityBId?: number;
    reason: string;
  }[];
  individuals: readonly { pairId: number; assessment: LandConnectionAssessment }[];
  shared?: SharedConnectionAssessment;
}
export type WorldLandProposalResult = (
  | { status: "evaluated"; network: ConstrainedLandNetwork }
  | {
      status: "unresolved";
      reason:
        | "invalid-input"
        | "pair-budget"
        | "candidate-enumeration"
        | "approach-budget"
        | "assessment-budget"
        | "unresolved-water"
        | "invalid-cost"
        | "invalid-network"
        | "assessment-unresolved";
    }
) & { diagnostics: WorldProposalDiagnostics };
/** Read-only world→coarse candidates→city approaches→candidate network→proposal
 * adapter. Baseline connections are explicit validated CURRENT city-to-city
 * corridors, not inferred from pack.cells.routes. Pair selection/importance and
 * full physical lake/sea/terrain/passage data remain required caller contracts.
 * Every successful result is an evaluation, not an adoption/rendering permit.
 */
export function evaluateWorldLandConnectionProposals(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: {
    pairs: readonly WorldConnectionPair[];
    baselineConnections: readonly NetworkConnection[];
    settings: WorldProposalSettings;
    environment: WorldProposalEnvironment;
    registry: WorldRiverGeometryRegistry;
  }
): WorldLandProposalResult {
  const s = input.settings,
    e = input.environment,
    diagnostics: WorldProposalDiagnostics = {
      enumeration: null,
      approachAttempts: 0,
      assessmentSearches: 0,
      rejected: [],
      individuals: []
    };
  const unresolved = (
    reason: Extract<WorldLandProposalResult, { status: "unresolved" }>["reason"]
  ): WorldLandProposalResult => ({ status: "unresolved", reason, diagnostics });
  if (
    ![
      e.supportsDryFootprint,
      e.allowsPassageFootprint,
      e.capabilityAt,
      e.facilityCostsAt,
      e.approachConstructionCostAt
    ].every(callback => typeof callback === "function") ||
    ![s.maxPairs, s.maxApproachAttempts, s.maxAssessmentSearches].every(v => Number.isSafeInteger(v) && v > 0) ||
    !Number.isSafeInteger(s.firstConnectionId) ||
    s.firstConnectionId < 0 ||
    !Number.isSafeInteger(s.firstConnectionId + s.maxApproachAttempts) ||
    s.approaches.corridor.roadWidthMeters !== s.crossings.dimensions.roadWidthMeters
  )
    return unresolved("invalid-input");
  if (input.pairs.length > s.maxPairs) return unresolved("pair-budget");
  if (!input.pairs.length || input.baselineConnections.length > s.network.maxEdges) return unresolved("invalid-input");
  const pairs = [...input.pairs].sort((a, b) => a.id - b.id),
    seen = new Set<string>();
  if (new Set(pairs.map(p => p.id)).size !== pairs.length) return unresolved("invalid-input");
  for (const p of pairs) {
    const k = [p.cityAId, p.cityBId].sort((a, b) => a - b).join(":");
    if (
      !Number.isSafeInteger(p.id) ||
      p.id < 0 ||
      p.cityAId === p.cityBId ||
      seen.has(k) ||
      !Number.isFinite(p.weight) ||
      p.weight <= 0 ||
      !Number.isFinite(p.unconnectedAllowanceMeters) ||
      p.unconnectedAllowanceMeters < 0
    )
      return unresolved("invalid-input");
    seen.add(k);
  }
  const scale = mapUnitMeters(world.distanceScale, distanceUnit),
    width = world.graphWidth * scale,
    height = world.graphHeight * scale;
  if (![scale, width, height].every(v => Number.isFinite(v) && v > 0)) return unresolved("invalid-input");
  const cityIds = [...new Set(pairs.flatMap(p => [p.cityAId, p.cityBId]))].sort((a, b) => a - b),
    nodes: NetworkNode[] = [];
  if (cityIds.length > s.network.maxNodes) return unresolved("pair-budget");
  for (const id of cityIds) {
    const city = world.pack.burgs[id];
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !city ||
      city.i !== id ||
      city.removed ||
      ![city.x, city.y].every(Number.isFinite) ||
      city.x < 0 ||
      city.y < 0 ||
      city.x > world.graphWidth ||
      city.y > world.graphHeight
    )
      return unresolved("invalid-input");
    nodes.push({ id, point: [city.x * scale, city.y * scale] });
  }
  const baselineIds = new Set(input.baselineConnections.map(c => c.id));
  if (
    baselineIds.size !== input.baselineConnections.length ||
    input.baselineConnections.some(
      c =>
        !cityIds.includes(c.from) ||
        !cityIds.includes(c.to) ||
        (c.id >= s.firstConnectionId && c.id < s.firstConnectionId + s.maxApproachAttempts) ||
        (c.kind === "bridge" &&
          c.crossing.id >= s.crossings.firstCandidateId &&
          c.crossing.id < s.crossings.firstCandidateId + s.crossings.maxAttempts)
    )
  )
    return unresolved("invalid-input");
  const inBounds = (p: readonly RiverPoint[]) =>
    p.every(q => q.every(Number.isFinite) && q[0] >= 0 && q[1] >= 0 && q[0] <= width && q[1] <= height);
  const supportsDryFootprint = (p: readonly RiverPoint[]) =>
    inBounds(p) && e.supportsDryFootprint(p) && e.allowsPassageFootprint(p);
  const environment = {
    nonRiverWater: e.nonRiverWater,
    supportsDryFootprint: (_riverId: number, p: readonly RiverPoint[]) => supportsDryFootprint(p),
    capabilityAt: e.capabilityAt
  };
  const enumeration = generateWorldRiverCrossingCandidates(
    world,
    distanceUnit,
    s.crossings,
    environment,
    input.registry
  );
  diagnostics.enumeration = enumeration;
  if (enumeration.status !== "complete") return unresolved("candidate-enumeration");
  const geometries = enumeration.geometries.filter(g => "geometry" in g),
    water = input.registry.getWaterIndex([...geometries.map(g => g.geometry.water), ...e.nonRiverWater]);
  if (!water) return unresolved("unresolved-water");
  if (enumeration.attempts * pairs.length * 2 > s.maxApproachAttempts) return unresolved("approach-budget");
  const currentSources = new Map<number, CrossingCandidateInput>();
  for (const c of input.baselineConnections)
    if (c.kind === "bridge") {
      const g = geometries.find(g => g.riverId === c.crossing.riverId);
      if (!g) return unresolved("unresolved-water");
      currentSources.set(c.crossing.id, {
        ...c.crossingInput,
        geometry: g.geometry,
        otherWater: [],
        waterIndex: water,
        capability: e.capabilityAt(c.crossing.riverId, c.crossing.arcLengthMeters),
        supportsDryFootprint
      });
    }
  const networkEnvironment: NetworkEnvironment = {
    water,
    supportsDryFootprint,
    allowsBridgeFootprint: p => inBounds(p) && e.allowsPassageFootprint(p),
    crossingInputAt: id => currentSources.get(id) ?? null
  };
  const connections: NetworkConnection[] = input.baselineConnections.map(c =>
    c.kind === "bridge" ? { ...c, crossingInput: currentSources.get(c.crossing.id)! } : c
  );
  const baseline = buildConstrainedLandNetwork({
    nodes,
    connections,
    roadWidthMeters: s.crossings.dimensions.roadWidthMeters,
    ...s.network,
    environment: networkEnvironment
  });
  if (!("network" in baseline)) return unresolved("invalid-network");
  const rejected: WorldProposalDiagnostics["rejected"][number][] = [],
    individuals: WorldProposalDiagnostics["individuals"][number][] = [];
  diagnostics.rejected = rejected;
  diagnostics.individuals = individuals;
  const approachSettings: WorldCrossingApproachSettings = {
    ...s.approaches,
    geometry: s.crossings.geometry,
    dimensions: s.crossings.dimensions,
    maxRivers: s.crossings.maxRivers
  };
  const sharedFacilities = new Set<number>();
  for (let ci = 0; ci < enumeration.candidates.length; ci++) {
    const crossing = enumeration.candidates[ci],
      passage = bridgePassageFootprint(crossing.approachA, crossing.approachB, s.crossings.dimensions.roadWidthMeters);
    if (!passage || !networkEnvironment.allowsBridgeFootprint!(passage, crossing.id)) {
      rejected.push({ facilityId: crossing.id, reason: "passage-blocked" });
      continue;
    }
    const costs = e.facilityCostsAt(crossing);
    if (
      !Number.isFinite(costs.constructionCostMeters) ||
      costs.constructionCostMeters < 0 ||
      !Number.isFinite(costs.useCostMeters) ||
      costs.useCostMeters <= 0
    )
      return unresolved("invalid-cost");
    for (let pi = 0; pi < pairs.length; pi++)
      for (let direction = 0; direction < 2; direction++) {
        const p = pairs[pi],
          cityAId = direction === 0 ? p.cityAId : p.cityBId,
          cityBId = direction === 0 ? p.cityBId : p.cityAId;
        const id =
          s.firstConnectionId + ((crossing.id - s.crossings.firstCandidateId) * pairs.length + pi) * 2 + direction;
        diagnostics.approachAttempts++;
        const approach = connectWorldRiverCrossingApproaches(
          world,
          distanceUnit,
          crossing,
          cityAId,
          cityBId,
          approachSettings,
          environment,
          input.registry
        );
        if ("reason" in approach) {
          if (approach.reason === "guide-unresolved" && "reason" in approach.build) {
            if (approach.build.reason.endsWith("-budget")) return unresolved("approach-budget");
            if (approach.build.reason === "invalid-input") return unresolved("invalid-input");
          } else if (approach.reason !== "invalid-crossing") {
            return unresolved(approach.reason === "river-budget" ? "approach-budget" : "invalid-network");
          }
          rejected.push({ facilityId: crossing.id, connectionId: id, cityAId, cityBId, reason: approach.reason });
          continue;
        }
        if (!("status" in approach.result)) {
          if (approach.result.reason === "approach-unresolved" && "reason" in approach.result.search) {
            if (approach.result.search.reason.endsWith("-budget")) return unresolved("approach-budget");
            if (approach.result.search.reason !== "no-corridor") return unresolved("invalid-network");
          }
          rejected.push({
            facilityId: crossing.id,
            connectionId: id,
            cityAId,
            cityBId,
            reason: approach.result.reason
          });
          continue;
        }
        const approachConstructionCostMeters = e.approachConstructionCostAt(crossing, cityAId, cityBId);
        if (!Number.isFinite(approachConstructionCostMeters) || approachConstructionCostMeters < 0)
          return unresolved("invalid-cost");
        const c: NetworkConnection = {
          id,
          kind: "bridge",
          from: cityAId,
          to: cityBId,
          bidirectional: true,
          crossing,
          crossingInput: approach.contracts.crossingInput,
          approachA: { corridor: approach.result.approachA, input: approach.contracts.approachA },
          approachB: { corridor: approach.result.approachB, input: approach.contracts.approachB },
          ...costs,
          approachConstructionCostMeters
        };
        const validated = buildConstrainedLandNetwork({
          nodes,
          connections: [c],
          roadWidthMeters: s.crossings.dimensions.roadWidthMeters,
          ...s.network,
          environment: networkEnvironment
        });
        if (!("network" in validated)) {
          if (validated.reason.endsWith("-budget")) return unresolved("invalid-network");
          rejected.push({ facilityId: crossing.id, connectionId: id, cityAId, cityBId, reason: validated.reason });
          continue;
        }
        currentSources.set(crossing.id, c.crossingInput);
        connections.push(c);
        sharedFacilities.add(crossing.id);
      }
  }
  const built = buildConstrainedLandNetwork({
    nodes,
    connections,
    roadWidthMeters: s.crossings.dimensions.roadWidthMeters,
    ...s.network,
    environment: networkEnvironment
  });
  if (!("network" in built)) return unresolved("invalid-network");
  const available = [...baselineIds],
    candidates = connections.map(c => c.id);
  for (const p of pairs) {
    const remaining = s.maxAssessmentSearches - diagnostics.assessmentSearches;
    if (remaining < 1) return unresolved("assessment-budget");
    const assessment = assessLandConnection(built.network, {
      startNodeId: p.cityAId,
      goalNodeId: p.cityBId,
      startTangent: p.startTangent,
      goalTangent: p.goalTangent,
      baselineConnectionIds: available,
      candidateConnectionIds: candidates,
      searchSettings: s.search,
      settings: { ...s.individual, maxSearches: Math.min(s.individual.maxSearches, remaining) },
      environment: networkEnvironment
    });
    diagnostics.assessmentSearches += assessment.comparison.searches;
    individuals.push({ pairId: p.id, assessment });
    if (assessment.status === "unresolved")
      return unresolved(assessment.reason === "comparison-budget" ? "assessment-budget" : "assessment-unresolved");
  }
  if (pairs.length >= 2 && sharedFacilities.size) {
    const remaining = s.maxAssessmentSearches - diagnostics.assessmentSearches;
    if (remaining < 1) return unresolved("assessment-budget");
    const shared = assessSharedLandConnections(built.network, {
      pairs: pairs.map(p => ({ ...p, startNodeId: p.cityAId, goalNodeId: p.cityBId })),
      baselineConnectionIds: available,
      candidateConnectionIds: candidates,
      sharedFacilityIds: [...sharedFacilities],
      settings: { ...s.shared, maxSearches: Math.min(s.shared.maxSearches, remaining) },
      searchSettings: s.search,
      environment: networkEnvironment
    });
    diagnostics.shared = shared;
    diagnostics.assessmentSearches += shared.searches;
    if (shared.status === "unresolved")
      return unresolved(shared.reason === "comparison-budget" ? "assessment-budget" : "assessment-unresolved");
  }
  return { status: "evaluated", network: built.network, diagnostics };
}
