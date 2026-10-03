import type { WorldContext } from "../context/worldContext";
import type { RiverPoint } from "../services/riverGeometry";
import { type PhysicalWaterPolygon, validWaterPolygon } from "../services/riverPhysicalGeometry";
import type {
  WorldRiverGeometryRegistry,
  WorldRiverGeometryResult,
  WorldRiverGeometrySettings
} from "../services/worldRiverGeometry";
import {
  type CrossingCandidateDimensions,
  type CrossingCandidateInput,
  type CrossingCandidateResult,
  createProvisionalRiverCrossing,
  type ProvisionalRiverCrossing
} from "./riverCrossingCandidates";

export interface WorldCrossingCandidateSettings {
  geometry: WorldRiverGeometrySettings;
  dimensions: CrossingCandidateDimensions;
  spacingMeters: number;
  maxRivers: number;
  maxAttempts: number;
  /** Explicit allocation range; rejected attempts also consume a slot. */
  firstCandidateId: number;
}
export interface WorldCrossingCandidateEnvironment {
  /** Caller must supply physical lake/sea obstacles; registered rivers are added here. */
  nonRiverWater: readonly PhysicalWaterPolygon[];
  supportsDryFootprint: (riverId: number, footprint: readonly RiverPoint[]) => boolean;
  /** Collect vessel/technology requirements BEFORE candidate selection. */
  capabilityAt: (riverId: number, arcLengthMeters: number) => CrossingCandidateInput["capability"];
}
export interface WorldCrossingCandidateReport {
  status: "complete" | "attempt-budget" | "river-budget" | "unresolved-water" | "invalid-settings";
  geometries: readonly WorldRiverGeometryResult[];
  candidates: readonly ProvisionalRiverCrossing[];
  rejected: readonly {
    candidateId: number;
    riverId: number;
    arcLengthMeters: number;
    reason: Extract<CrossingCandidateResult, { reason: string }>["reason"];
  }[];
  attempts: number;
  nextCandidateId: number;
}
/** Read-only coarse enumeration, in stable river order with a round-robin budget.
 * This does not register bridges/routes or assert reachability. Corridor refinement
 * and directional approach search are later stages. Unknown registered water blocks
 * the whole enumeration rather than allowing a partial obstacle set to certify it.
 */
export function generateWorldRiverCrossingCandidates(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  settings: WorldCrossingCandidateSettings,
  environment: WorldCrossingCandidateEnvironment,
  registry: WorldRiverGeometryRegistry
): WorldCrossingCandidateReport {
  const geometries: WorldRiverGeometryResult[] = [],
    candidates: ProvisionalRiverCrossing[] = [];
  const rejected: WorldCrossingCandidateReport["rejected"][number][] = [];
  let attempts = 0;
  const report = (status: WorldCrossingCandidateReport["status"]): WorldCrossingCandidateReport => ({
    status,
    geometries,
    candidates,
    rejected,
    attempts,
    nextCandidateId: settings.firstCandidateId + attempts
  });
  if (
    !Number.isFinite(settings.spacingMeters) ||
    settings.spacingMeters <= 0 ||
    !Number.isSafeInteger(settings.maxAttempts) ||
    settings.maxAttempts < 1 ||
    !Number.isSafeInteger(settings.maxRivers) ||
    settings.maxRivers < 1 ||
    !Number.isSafeInteger(settings.firstCandidateId) ||
    settings.firstCandidateId < 0 ||
    !Number.isSafeInteger(settings.firstCandidateId + settings.maxAttempts) ||
    !Object.values(settings.dimensions).every(v => Number.isFinite(v) && v > 0)
  )
    return report("invalid-settings");
  if (!environment.nonRiverWater.every(validWaterPolygon)) return report("unresolved-water");
  const rivers = [...world.pack.rivers].sort((a, b) => a.i - b.i);
  if (rivers.length > settings.maxRivers) return report("river-budget");
  if (new Set(rivers.map(r => r.i)).size !== rivers.length) return report("unresolved-water");
  for (const river of rivers) geometries.push(registry.get(world, river, distanceUnit, settings.geometry));
  if (geometries.some(g => !("geometry" in g))) return report("unresolved-water");
  const resolved = geometries.filter(
    (g): g is Extract<WorldRiverGeometryResult, { geometry: unknown }> => "geometry" in g
  );
  const first = settings.dimensions.localWindowMeters + settings.spacingMeters / 2;
  const counts = resolved.map(g =>
    Math.max(
      0,
      Math.ceil((g.geometry.axis.length - settings.dimensions.localWindowMeters - first) / settings.spacingMeters)
    )
  );
  for (let sampleIndex = 0; counts.some(c => c > sampleIndex); sampleIndex++) {
    for (let i = 0; i < resolved.length; i++) {
      if (sampleIndex >= counts[i]) continue;
      if (attempts === settings.maxAttempts) return report("attempt-budget");
      const g = resolved[i],
        arcLengthMeters = first + sampleIndex * settings.spacingMeters;
      const candidateId = settings.firstCandidateId + attempts++;
      const result = createProvisionalRiverCrossing({
        id: candidateId,
        geometry: g.geometry,
        arcLengthMeters,
        dimensions: settings.dimensions,
        otherWater: [
          ...resolved.filter(other => other !== g).map(other => other.geometry.water),
          ...environment.nonRiverWater
        ],
        capability: environment.capabilityAt(g.riverId, arcLengthMeters),
        supportsDryFootprint: footprint => environment.supportsDryFootprint(g.riverId, footprint)
      });
      if ("candidate" in result) candidates.push(result.candidate);
      else rejected.push({ candidateId, riverId: g.riverId, arcLengthMeters, reason: result.reason });
    }
  }
  return report("complete");
}
