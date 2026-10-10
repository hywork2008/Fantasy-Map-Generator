import type { WorldContext } from "../context/worldContext";
import type { PhysicalWaterIndex } from "../services/physicalWaterIndex";
import { evaluateRiverAxis, sampleRiverAxis } from "../services/riverAxisSampling";
import type { RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
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
  /** Optional bounded subdivision near measured narrow spans and city corridors. */
  refinement?: { maxCenters: number; levels: number; maxProjectionChecks: number };
}
export interface WorldCrossingCandidateEnvironment {
  /** Caller must supply physical lake/sea obstacles; registered rivers are added here. */
  nonRiverWater: readonly PhysicalWaterPolygon[];
  supportsDryFootprint: (riverId: number, footprint: readonly RiverPoint[]) => boolean;
  /** Collect vessel/technology requirements BEFORE candidate selection. */
  capabilityAt: (riverId: number, arcLengthMeters: number) => CrossingCandidateInput["capability"];
  corridors?: readonly { start: RiverPoint; end: RiverPoint }[];
  /** Bridge skew allowance at a river point (bridgeSkewPolicy.ts). When given, each
   * corridor's nearest coarse sample also gets one bridge turned toward the corridor,
   * within the allowance. Omitted: square crossings only. */
  skewLimitAt?: (point: RiverPoint) => number;
}
export interface WorldCrossingCandidateReport {
  status:
    | "complete"
    | "attempt-budget"
    | "river-budget"
    | "unresolved-water"
    | "invalid-settings"
    | "refinement-budget";
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
  waterSearch: { queries: number; visitedNodes: number; polygonTests: number; boundsTests: number };
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
  let waterIndex: PhysicalWaterIndex | null = null;
  let initialWaterStats = { queries: 0, visitedNodes: 0, polygonTests: 0, boundsTests: 0 };
  const waterSearch = () => {
    const stats = waterIndex?.stats ?? initialWaterStats;
    return {
      queries: stats.queries - initialWaterStats.queries,
      visitedNodes: stats.visitedNodes - initialWaterStats.visitedNodes,
      polygonTests: stats.polygonTests - initialWaterStats.polygonTests,
      boundsTests: stats.boundsTests - initialWaterStats.boundsTests
    };
  };
  const report = (status: WorldCrossingCandidateReport["status"]): WorldCrossingCandidateReport => ({
    status,
    geometries,
    candidates,
    rejected,
    attempts,
    nextCandidateId: settings.firstCandidateId + attempts,
    waterSearch: waterSearch()
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
  const refinement = settings.refinement;
  if (
    refinement &&
    (![refinement.maxCenters, refinement.levels, refinement.maxProjectionChecks].every(
      v => Number.isSafeInteger(v) && v > 0
    ) ||
      refinement.levels > 20 ||
      refinement.maxCenters > settings.maxAttempts ||
      environment.corridors?.some(c => [c.start, c.end].some(p => p.length !== 2 || !p.every(Number.isFinite))))
  )
    return report("invalid-settings");
  const rivers = [...world.pack.rivers].sort((a, b) => a.i - b.i);
  if (rivers.length > settings.maxRivers) return report("river-budget");
  if (new Set(rivers.map(r => r.i)).size !== rivers.length) return report("unresolved-water");
  for (const river of rivers) geometries.push(registry.get(world, river, distanceUnit, settings.geometry));
  if (geometries.some(g => !("geometry" in g))) return report("unresolved-water");
  const resolved = geometries.filter(
    (g): g is Extract<WorldRiverGeometryResult, { geometry: unknown }> => "geometry" in g
  );
  waterIndex = registry.getWaterIndex([...resolved.map(g => g.geometry.water), ...environment.nonRiverWater]);
  if (!waterIndex) return report("unresolved-water");
  initialWaterStats = waterIndex.stats;
  const samples: { geometry: (typeof resolved)[number]; arc: number; point: RiverPoint; width?: number }[] = [];
  const seen = new Set<string>();
  const attempt = (g: (typeof resolved)[number], arcLengthMeters: number) => {
    const candidateId = settings.firstCandidateId + attempts++;
    const result = createProvisionalRiverCrossing({
      id: candidateId,
      geometry: g.geometry,
      arcLengthMeters,
      dimensions: settings.dimensions,
      otherWater: [],
      waterIndex: waterIndex!,
      capability: environment.capabilityAt(g.riverId, arcLengthMeters),
      supportsDryFootprint: footprint => environment.supportsDryFootprint(g.riverId, footprint)
    });
    if ("candidate" in result) candidates.push(result.candidate);
    else rejected.push({ candidateId, riverId: g.riverId, arcLengthMeters, reason: result.reason });
    const position = evaluateRiverAxis(g.geometry.axis, arcLengthMeters);
    if (position)
      samples.push({
        geometry: g,
        arc: arcLengthMeters,
        point: position.point,
        ...("candidate" in result ? { width: result.candidate.deckLengthMeters } : {})
      });
    seen.add(`${g.riverId}:${arcLengthMeters}`);
  };
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
      attempt(g, arcLengthMeters);
    }
  }
  if (environment.skewLimitAt && environment.corridors?.length) {
    const coarse = samples.slice();
    const tried = new Set<string>();
    for (const corridor of environment.corridors) {
      const dx = corridor.end[0] - corridor.start[0],
        dy = corridor.end[1] - corridor.start[1];
      const length = Math.hypot(dx, dy);
      if (!(length > 0)) continue;
      let closest: (typeof samples)[number] | undefined,
        best = Infinity;
      for (const sample of coarse) {
        const t = Math.max(
          0,
          Math.min(
            length,
            ((sample.point[0] - corridor.start[0]) * dx + (sample.point[1] - corridor.start[1]) * dy) / length
          )
        );
        const d = Math.hypot(
          sample.point[0] - corridor.start[0] - (dx / length) * t,
          sample.point[1] - corridor.start[1] - (dy / length) * t
        );
        if (d < best) {
          best = d;
          closest = sample;
        }
      }
      if (!closest) continue;
      const frame = sampleRiverAxis(closest.geometry.geometry.axis, closest.arc, settings.dimensions.localWindowMeters);
      if (!frame) continue;
      // Signed turn from the river normal to the corridor (either direction along it).
      const along = frame.normal[0] * dx + frame.normal[1] * dy >= 0 ? 1 : -1;
      const desired =
        (Math.atan2(
          frame.normal[0] * dy * along - frame.normal[1] * dx * along,
          frame.normal[0] * dx * along + frame.normal[1] * dy * along
        ) *
          180) /
        Math.PI;
      const limit = Math.max(0, environment.skewLimitAt(closest.point));
      const skewDegrees = Math.round(Math.max(-limit, Math.min(limit, desired)));
      const key = `${closest.geometry.riverId}:${closest.arc}:${skewDegrees}`;
      if (Math.abs(skewDegrees) < 1 || tried.has(key)) continue;
      tried.add(key);
      if (attempts === settings.maxAttempts) return report("attempt-budget");
      const candidateId = settings.firstCandidateId + attempts++;
      const result = createProvisionalRiverCrossing({
        id: candidateId,
        geometry: closest.geometry.geometry,
        arcLengthMeters: closest.arc,
        skewDegrees,
        dimensions: settings.dimensions,
        otherWater: [],
        waterIndex: waterIndex!,
        capability: environment.capabilityAt(closest.geometry.riverId, closest.arc),
        supportsDryFootprint: footprint => environment.supportsDryFootprint(closest.geometry.riverId, footprint)
      });
      if ("candidate" in result) candidates.push(result.candidate);
      else
        rejected.push({
          candidateId,
          riverId: closest.geometry.riverId,
          arcLengthMeters: closest.arc,
          reason: result.reason
        });
    }
  }
  if (refinement) {
    const coarse = samples.slice();
    let checks = 0;
    const corridorCenters: (typeof samples)[number][] = [];
    for (const corridor of environment.corridors ?? []) {
      let closest: (typeof samples)[number] | undefined,
        distance = Infinity;
      for (const sample of coarse) {
        if (++checks > refinement.maxProjectionChecks) return report("refinement-budget");
        const dx = corridor.end[0] - corridor.start[0],
          dy = corridor.end[1] - corridor.start[1];
        const length = Math.hypot(dx, dy);
        const t = length
          ? Math.max(
              0,
              Math.min(
                length,
                (sample.point[0] - corridor.start[0]) * (dx / length) +
                  (sample.point[1] - corridor.start[1]) * (dy / length)
              )
            )
          : 0;
        const d = Math.hypot(
          sample.point[0] - corridor.start[0] - (length ? (dx / length) * t : 0),
          sample.point[1] - corridor.start[1] - (length ? (dy / length) * t : 0)
        );
        if (!Number.isFinite(d)) return report("invalid-settings");
        if (d < distance) {
          distance = d;
          closest = sample;
        }
      }
      if (closest && !corridorCenters.includes(closest)) corridorCenters.push(closest);
    }
    const byRiver = new Map<number, typeof samples>();
    for (const sample of coarse) {
      const group = byRiver.get(sample.geometry.riverId) ?? [];
      group.push(sample);
      byRiver.set(sample.geometry.riverId, group);
    }
    const narrow: typeof samples = [];
    for (const group of byRiver.values())
      for (let i = 0; i < group.length; i++) {
        if (++checks > refinement.maxProjectionChecks) return report("refinement-budget");
        const s = group[i];
        if (
          s.width !== undefined &&
          [group[i - 1], group[i + 1]].every(other => !other || other.width === undefined || other.width >= s.width!)
        )
          narrow.push(s);
      }
    narrow.sort((a, b) => a.width! - b.width! || a.geometry.riverId - b.geometry.riverId || a.arc - b.arc);
    const centers = [...new Set([...corridorCenters.slice(0, Math.ceil(refinement.maxCenters / 2)), ...narrow])].slice(
      0,
      refinement.maxCenters
    );
    for (let level = 1; level <= refinement.levels; level++)
      for (const center of centers)
        for (const sign of [-1, 1]) {
          const arc = center.arc + (sign * settings.spacingMeters) / 2 ** level;
          if (
            arc <= settings.dimensions.localWindowMeters ||
            arc >= center.geometry.geometry.axis.length - settings.dimensions.localWindowMeters ||
            seen.has(`${center.geometry.riverId}:${arc}`)
          )
            continue;
          if (attempts === settings.maxAttempts) return report("attempt-budget");
          attempt(center.geometry, arc);
        }
  }
  return report("complete");
}
