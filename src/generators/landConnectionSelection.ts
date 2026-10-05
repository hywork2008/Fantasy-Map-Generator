import type { WorldContext } from "../context/worldContext";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import type { ConstrainedLandNetwork } from "./constrainedLandNetwork";
import type { LandConnectionAssessmentSettings } from "./landConnectionAssessment";
import {
  calibrateWorldLandConnectionPair,
  type LandConnectionCalibration,
  validateLandConnectionCalibration
} from "./landConnectionCalibration";
import type { WorldConnectionPair } from "./worldLandConnectionProposals";

export interface NearbyConnectionSettings {
  maxCities: number;
  maxNeighbourChecks: number;
  maxNeighboursPerCity: number;
  maxPairs: number;
  radiusMeters: number;
  firstPairId: number;
}
export type NearbyConnectionResult =
  | {
      status: "selected";
      pairs: readonly WorldConnectionPair[];
      checks: number;
      candidates: number;
      truncated: boolean;
    }
  | { status: "unresolved"; reason: "invalid-input" | "city-budget" | "neighbour-budget"; checks: number };

/** Spatial buckets bound checks independently of the map's total pair count.
 * Keep each city's nearest neighbours, then prioritize by finite importance /
 * distance. ID tie breaks and canonical endpoint order make RNG unnecessary. */
export function selectNearbyWorldConnectionPairs(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  cityIds: readonly number[],
  settings: NearbyConnectionSettings,
  calibration: LandConnectionCalibration,
  assessment: LandConnectionAssessmentSettings
): NearbyConnectionResult {
  let checks = 0;
  const fail = (
    reason: Extract<NearbyConnectionResult, { status: "unresolved" }>["reason"]
  ): NearbyConnectionResult => ({ status: "unresolved", reason, checks });
  try {
    validateLandConnectionCalibration(calibration);
  } catch {
    return fail("invalid-input");
  }
  const scale = mapUnitMeters(world.distanceScale, distanceUnit);
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    ![settings.maxCities, settings.maxNeighbourChecks, settings.maxNeighboursPerCity, settings.maxPairs].every(
      n => Number.isSafeInteger(n) && n > 0
    ) ||
    !Number.isSafeInteger(settings.firstPairId) ||
    settings.firstPairId < 0 ||
    !Number.isSafeInteger(settings.firstPairId + settings.maxPairs) ||
    !Number.isFinite(settings.radiusMeters) ||
    settings.radiusMeters <= 0 ||
    new Set(cityIds).size !== cityIds.length
  )
    return fail("invalid-input");
  if (cityIds.length > settings.maxCities) return fail("city-budget");
  const cities: { id: number; x: number; y: number; bx: number; by: number }[] = [];
  const buckets = new Map<string, typeof cities>();
  for (const id of [...cityIds].sort((a, b) => a - b)) {
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
      return fail("invalid-input");
    const x = city.x * scale,
      y = city.y * scale;
    const bx = Math.floor(x / settings.radiusMeters),
      by = Math.floor(y / settings.radiusMeters);
    if (![x, y].every(Number.isFinite) || ![bx, by].every(Number.isSafeInteger)) return fail("invalid-input");
    const entry = { id, x, y, bx, by },
      key = `${bx}:${by}`;
    cities.push(entry);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  const candidates = new Map<string, { a: number; b: number; distance: number }>();
  for (const city of cities) {
    const nearest: { a: number; b: number; distance: number }[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const neighbour of buckets.get(`${city.bx + dx}:${city.by + dy}`) ?? []) {
          if (neighbour.id === city.id) continue;
          if (++checks > settings.maxNeighbourChecks) return fail("neighbour-budget");
          const distance = Math.hypot(neighbour.x - city.x, neighbour.y - city.y);
          if (distance > settings.radiusMeters) continue;
          nearest.push({ a: Math.min(city.id, neighbour.id), b: Math.max(city.id, neighbour.id), distance });
        }
      }
    nearest.sort((a, b) => a.distance - b.distance || a.a - b.a || a.b - b.b);
    for (const pair of nearest.slice(0, settings.maxNeighboursPerCity)) candidates.set(`${pair.a}:${pair.b}`, pair);
  }
  try {
    const ranked = [...candidates.values()]
      .map(candidate => {
        const pair = calibrateWorldLandConnectionPair(world, 0, candidate.a, candidate.b, calibration, assessment);
        return { pair, priority: pair.weight / Math.max(1, candidate.distance), distance: candidate.distance };
      })
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.distance - b.distance ||
          a.pair.cityAId - b.pair.cityAId ||
          a.pair.cityBId - b.pair.cityBId
      );
    return {
      status: "selected",
      checks,
      candidates: ranked.length,
      truncated: ranked.length > settings.maxPairs,
      pairs: ranked.slice(0, settings.maxPairs).map((entry, i) => ({ ...entry.pair, id: settings.firstPairId + i }))
    };
  } catch {
    return fail("invalid-input");
  }
}

export interface SharedFacilitySelectionSettings {
  maxGroups: number;
  maxPairsPerGroup: number;
  maxFacilitiesPerGroup: number;
  maxChecks: number;
}
export interface SharedFacilityGroup {
  id: number;
  pairIds: readonly number[];
  facilityIds: readonly number[];
  connectionIds: readonly number[];
}
export type SharedFacilitySelectionResult =
  | { status: "selected"; groups: readonly SharedFacilityGroup[]; checks: number; truncated: boolean }
  | { status: "unresolved"; reason: "invalid-input" | "group-budget"; checks: number };

/** Evaluate single shared facilities and whole facility bundles observed on
 * candidate routes. No powerset enumeration. A group cannot borrow a new bridge
 * from another group; explicit baseline connections always remain available. */
export function selectSharedFacilityGroups(
  network: ConstrainedLandNetwork,
  pairs: readonly WorldConnectionPair[],
  baselineConnectionIds: readonly number[],
  routeBundles: readonly { pairId: number; facilityIds: readonly number[] }[],
  settings: SharedFacilitySelectionSettings
): SharedFacilitySelectionResult {
  let checks = 0;
  const fail = (reason: "invalid-input" | "group-budget"): SharedFacilitySelectionResult => ({
    status: "unresolved",
    reason,
    checks
  });
  if (
    ![settings.maxGroups, settings.maxFacilitiesPerGroup, settings.maxChecks].every(
      n => Number.isSafeInteger(n) && n > 0
    ) ||
    !Number.isSafeInteger(settings.maxPairsPerGroup) ||
    settings.maxPairsPerGroup < 2 ||
    new Set(pairs.map(p => p.id)).size !== pairs.length
  )
    return fail("invalid-input");
  const knownConnections = new Set(network.edges.map(edge => edge.id));
  if (
    new Set(baselineConnectionIds).size !== baselineConnectionIds.length ||
    baselineConnectionIds.some(id => !knownConnections.has(id)) ||
    pairs.some(
      pair => !Number.isSafeInteger(pair.id) || pair.id < 0 || !Number.isFinite(pair.weight) || pair.weight <= 0
    )
  )
    return fail("invalid-input");
  let truncated = false;
  const baseline = new Set(baselineConnectionIds);
  const existingFacilities = new Set(
    network.edges.filter(e => baseline.has(e.id)).flatMap(e => (e.crossing ? [e.crossing.facilityId] : []))
  );
  const facilities = new Map<number, Set<number>>();
  const bundles = new Map<string, number[]>();
  const tick = () => ++checks <= settings.maxChecks;
  const remember = (ids: readonly number[]) => {
    const bundle = [...new Set(ids)].filter(id => !existingFacilities.has(id)).sort((a, b) => a - b);
    if (bundle.length > settings.maxFacilitiesPerGroup) truncated = true;
    else if (bundle.length) bundles.set(bundle.join(":"), bundle);
  };
  for (const edge of network.edges) {
    if (!tick()) return fail("group-budget");
    if (!edge.crossing || existingFacilities.has(edge.crossing.facilityId)) continue;
    const id = edge.crossing.facilityId;
    const usage = facilities.get(id) ?? new Set<number>();
    for (const pair of pairs) {
      if (!tick()) return fail("group-budget");
      if (
        (edge.from === pair.cityAId && edge.to === pair.cityBId) ||
        (edge.from === pair.cityBId && edge.to === pair.cityAId)
      )
        usage.add(pair.id);
    }
    facilities.set(id, usage);
    remember([id]);
  }
  for (const route of routeBundles) {
    if (!pairs.some(p => p.id === route.pairId)) return fail("invalid-input");
    for (const id of route.facilityIds) {
      if (!tick()) return fail("group-budget");
      if (existingFacilities.has(id)) continue;
      const usage = facilities.get(id);
      if (!usage) return fail("invalid-input");
      usage.add(route.pairId);
    }
    remember(route.facilityIds);
  }
  const groups: Omit<SharedFacilityGroup, "id">[] = [];
  for (const facilityIds of bundles.values()) {
    const eligible: WorldConnectionPair[] = [];
    for (const pair of pairs) {
      if (!tick()) return fail("group-budget");
      if (facilityIds.every(id => facilities.get(id)?.has(pair.id))) eligible.push(pair);
    }
    if (eligible.length < 2) continue;
    truncated ||= eligible.length > settings.maxPairsPerGroup;
    eligible.sort((a, b) => b.weight - a.weight || a.id - b.id);
    const pairIds = eligible
      .slice(0, settings.maxPairsPerGroup)
      .map(p => p.id)
      .sort((a, b) => a - b);
    const included = new Set(facilityIds),
      connections = new Set(baselineConnectionIds);
    for (const edge of network.edges) {
      if (!tick()) return fail("group-budget");
      if (!edge.crossing || included.has(edge.crossing.facilityId) || existingFacilities.has(edge.crossing.facilityId))
        connections.add(edge.id);
    }
    groups.push({ pairIds, facilityIds, connectionIds: [...connections].sort((a, b) => a - b) });
  }
  const weight = (group: Omit<SharedFacilityGroup, "id">) =>
    group.pairIds.reduce((sum, id) => sum + pairs.find(p => p.id === id)!.weight, 0);
  groups.sort((a, b) => {
    const priority = weight(b) - weight(a) || a.facilityIds.length - b.facilityIds.length;
    if (priority) return priority;
    for (let i = 0; i < a.facilityIds.length; i++)
      if (a.facilityIds[i] !== b.facilityIds[i]) return a.facilityIds[i] - b.facilityIds[i];
    return 0;
  });
  return {
    status: "selected",
    checks,
    truncated: truncated || groups.length > settings.maxGroups,
    groups: groups.slice(0, settings.maxGroups).map((group, id) => ({ ...group, id }))
  };
}
