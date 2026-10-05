import type { WorldContext } from "../context/worldContext";
import { corridorDelta, corridorUnit } from "../services/approachCorridorGeometry";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import type { ApproachCorridorSettings } from "./approachCorridorSearch";
import type { NetworkConnection } from "./constrainedLandNetwork";
import { findLandRouteCorridor, type LandRouteGraphEnvironment } from "./dryLandRouteGraph";
import {
  buildWorldDryLandRouteGraph,
  type WorldDryGuideResult,
  type WorldDryGuideSettings
} from "./worldDryLandRouteGraph";
import type { WorldConnectionPair } from "./worldLandConnectionProposals";

export interface WorldDryConnectionSettings {
  guides: WorldDryGuideSettings;
  corridor: ApproachCorridorSettings;
  firstConnectionId: number;
  maxSearches: number;
}
export type WorldDryConnectionResult =
  | {
      connections: readonly NetworkConnection[];
      guides: Extract<WorldDryGuideResult, { graph: unknown }>;
      searches: number;
      unresolvedPairIds: readonly number[];
    }
  | { reason: string };
/** Derive finite dry walking alternatives between current city positions.
 * Each possible final guide direction is searched; a cheap prefix with a different
 * incoming direction cannot erase a valid approach. Missing finite-guide routes
 * remain unresolved alternatives, never continuous-terrain unreachable claims.
 * Returned corridors do not register/build/render roads or change pack.routes.
 */
export function buildWorldDryLandConnections(
  world: Readonly<WorldContext>,
  unit: string,
  pairs: readonly WorldConnectionPair[],
  settings: WorldDryConnectionSettings,
  environment: LandRouteGraphEnvironment
): WorldDryConnectionResult {
  if (
    !Number.isSafeInteger(settings.firstConnectionId) ||
    settings.firstConnectionId < 0 ||
    !Number.isSafeInteger(settings.maxSearches) ||
    settings.maxSearches < 1 ||
    !Number.isSafeInteger(settings.firstConnectionId + pairs.length) ||
    settings.corridor.roadWidthMeters !== settings.guides.roadWidthMeters ||
    pairs.length > settings.guides.maxSourceNodes ||
    new Set(pairs.map(p => p.id)).size !== pairs.length ||
    pairs.some(
      p =>
        !Number.isSafeInteger(p.id) ||
        p.id < 0 ||
        p.cityAId === p.cityBId ||
        (p.startTangent !== undefined && !corridorUnit(p.startTangent)) ||
        (p.goalTangent !== undefined && !corridorUnit(p.goalTangent))
    )
  )
    return { reason: "invalid-input" };
  const ordered = [...pairs].sort((a, b) => a.id - b.id);
  const scale = mapUnitMeters(world.distanceScale, unit),
    width = world.graphWidth * scale,
    height = world.graphHeight * scale;
  const currentEnvironment = {
    ...environment,
    supportsDryFootprint: (footprint: Parameters<LandRouteGraphEnvironment["supportsDryFootprint"]>[0]) =>
      footprint.every(p => p.every(Number.isFinite) && p[0] >= 0 && p[1] >= 0 && p[0] <= width && p[1] <= height) &&
      environment.supportsDryFootprint(footprint)
  };
  const cityIds = [...new Set(ordered.flatMap(p => [p.cityAId, p.cityBId]))];
  const guides = buildWorldDryLandRouteGraph(world, unit, settings.guides, cityIds, currentEnvironment);
  if (!("graph" in guides)) return guides;
  if (guides.blockedCityIds.length) return { reason: "blocked-city" };
  const byId = new Map(guides.graph.nodes.map(n => [n.id, n]));
  const connections: NetworkConnection[] = [],
    unresolvedPairIds: number[] = [];
  let searches = 0;
  for (let slot = 0; slot < ordered.length; slot++) {
    const pair = ordered[slot],
      startNodeId = guides.cityNodeIds.get(pair.cityAId)!,
      goalNodeId = guides.cityNodeIds.get(pair.cityBId)!;
    const start = byId.get(startNodeId)!,
      goal = byId.get(goalNodeId)!;
    if (start.dryComponentId !== goal.dryComponentId) {
      unresolvedPairIds.push(pair.id);
      continue;
    }
    const tangents = pair.goalTangent
      ? [pair.goalTangent]
      : goal.neighbors
          .map(id => corridorUnit(corridorDelta(goal.point, byId.get(id)!.point)))
          .filter((p): p is NonNullable<typeof p> => !!p);
    const unique = new Map(tangents.map(t => [t.join(","), t]));
    let best: NetworkConnection | undefined;
    for (const goalTangent of unique.values()) {
      if (++searches > settings.maxSearches) return { reason: "dry-search-budget" };
      const input = {
        startNodeId,
        goalNodeId,
        startTangent: pair.startTangent,
        goalTangent,
        settings: settings.corridor,
        ...currentEnvironment
      };
      const result = findLandRouteCorridor(guides.graph, input);
      if (!("corridor" in result)) {
        if (result.reason !== "no-corridor") return { reason: `dry-${result.reason}` };
        continue;
      }
      const candidate: NetworkConnection = {
        id: settings.firstConnectionId + slot,
        from: pair.cityAId,
        to: pair.cityBId,
        bidirectional: true,
        kind: "land",
        land: { corridor: result.corridor, input: { ...input, nodes: guides.graph.nodes } }
      };
      if (
        !best ||
        (best.kind === "land" &&
          (result.corridor.costMeters < best.land.corridor.costMeters ||
            (result.corridor.costMeters === best.land.corridor.costMeters &&
              result.corridor.distanceMeters < best.land.corridor.distanceMeters)))
      )
        best = candidate;
    }
    if (best) connections.push(best);
    else unresolvedPairIds.push(pair.id);
  }
  return { connections, guides, searches, unresolvedPairIds: Object.freeze(unresolvedPairIds) };
}
