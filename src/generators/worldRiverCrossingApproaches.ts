import type { WorldContext } from "../context/worldContext";
import { corridorDelta, corridorUnit } from "../services/approachCorridorGeometry";
import type { RiverPoint } from "../services/riverGeometry";
import type { WorldRiverGeometryRegistry, WorldRiverGeometrySettings } from "../services/worldRiverGeometry";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import type { ApproachCorridorSettings } from "./approachCorridorSearch";
import {
  buildLocalApproachGuides,
  type LocalApproachGuideResult,
  type LocalApproachGuideSettings
} from "./localApproachGuides";
import { connectRiverCrossingApproaches, type RiverCrossingApproachResult } from "./riverCrossingApproaches";
import {
  type CrossingCandidateDimensions,
  type ProvisionalRiverCrossing,
  validateProvisionalRiverCrossing
} from "./riverCrossingCandidates";
import type { WorldCrossingCandidateEnvironment } from "./worldRiverCrossingCandidates";

export interface WorldCrossingApproachSettings {
  geometry: WorldRiverGeometrySettings;
  dimensions: CrossingCandidateDimensions;
  guides: LocalApproachGuideSettings;
  corridor: ApproachCorridorSettings;
  maxRivers: number;
}
export type WorldCrossingApproachResult =
  | {
      reason:
        | "invalid-settings"
        | "invalid-city"
        | "unresolved-water"
        | "river-budget"
        | "stale-crossing"
        | "invalid-crossing";
    }
  | { reason: "guide-unresolved"; side: "A" | "B"; build: LocalApproachGuideResult }
  | { result: RiverCrossingApproachResult; builds: readonly [LocalApproachGuideResult, LocalApproachGuideResult] };
/** Read-only city-to-E geometry gate. It uses city coordinates, never a cell's
 * implicit bank connectivity. Caller supplies complete physical lake/sea water
 * and deterministic terrain/capability evaluation for this world snapshot.
 * No adoption, network registration, city relocation or route rendering occurs.
 */
export function connectWorldRiverCrossingApproaches(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  crossing: ProvisionalRiverCrossing,
  cityAId: number,
  cityBId: number,
  settings: WorldCrossingApproachSettings,
  environment: WorldCrossingCandidateEnvironment,
  registry: WorldRiverGeometryRegistry
): WorldCrossingApproachResult {
  const scale = mapUnitMeters(world.distanceScale, distanceUnit);
  const width = world.graphWidth * scale,
    height = world.graphHeight * scale;
  if (
    ![scale, width, height].every(v => Number.isFinite(v) && v > 0) ||
    !Number.isSafeInteger(settings.maxRivers) ||
    settings.maxRivers <= 0 ||
    settings.dimensions.roadWidthMeters !== settings.corridor.roadWidthMeters ||
    settings.guides.terminalLeadMeters < settings.corridor.minimumFinalStraightMeters
  )
    return { reason: "invalid-settings" };
  const starts: RiverPoint[] = [];
  for (const id of [cityAId, cityBId]) {
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
      return { reason: "invalid-city" };
    starts.push([city.x * scale, city.y * scale]);
  }
  const rivers = [...world.pack.rivers].sort((a, b) => a.i - b.i);
  if (rivers.length > settings.maxRivers) return { reason: "river-budget" };
  if (new Set(rivers.map(r => r.i)).size !== rivers.length) return { reason: "unresolved-water" };
  const geometries = rivers.map(r => registry.get(world, r, distanceUnit, settings.geometry));
  if (geometries.some(g => !("geometry" in g))) return { reason: "unresolved-water" };
  const resolved = geometries.filter(g => "geometry" in g);
  const target = resolved.find(g => g.riverId === crossing.riverId);
  if (!target || target.geometryVersion !== crossing.geometryVersion) return { reason: "stale-crossing" };
  const water = registry.getWaterIndex([...resolved.map(g => g.geometry.water), ...environment.nonRiverWater]);
  if (!water) return { reason: "unresolved-water" };
  // Include map boundaries in EVERY final line/arc footprint check, not just samples.
  const supportsDryFootprint = (footprint: readonly RiverPoint[]) =>
    footprint.every(p => p.every(Number.isFinite) && p[0] >= 0 && p[1] >= 0 && p[0] <= width && p[1] <= height) &&
    environment.supportsDryFootprint(crossing.riverId, footprint);
  const endpoints = [crossing.approachA, crossing.approachB],
    decks = [crossing.deckA, crossing.deckB];
  const crossingInput = {
    id: crossing.id,
    geometry: target.geometry,
    arcLengthMeters: crossing.arcLengthMeters,
    dimensions: settings.dimensions,
    otherWater: [],
    waterIndex: water,
    capability: environment.capabilityAt(crossing.riverId, crossing.arcLengthMeters),
    supportsDryFootprint
  };
  if (!validateProvisionalRiverCrossing(crossing, crossingInput)) return { reason: "invalid-crossing" };
  const builds: LocalApproachGuideResult[] = [];
  for (let i = 0; i < 2; i++) {
    const tangent = corridorUnit(corridorDelta(decks[i], endpoints[i]));
    if (!tangent) return { reason: "stale-crossing" };
    const build = buildLocalApproachGuides({
      start: starts[i],
      goal: endpoints[i],
      goalTangent: tangent,
      roadWidthMeters: settings.corridor.roadWidthMeters,
      settings: settings.guides,
      water,
      supportsDryFootprint
    });
    builds.push(build);
    if (!("guides" in build)) return { reason: "guide-unresolved", side: i === 0 ? "A" : "B", build };
  }
  const [a, b] = builds as [
    Extract<LocalApproachGuideResult, { guides: unknown }>,
    Extract<LocalApproachGuideResult, { guides: unknown }>
  ];
  const result = connectRiverCrossingApproaches({
    crossing,
    crossingInput,
    sideA: a.guides,
    sideB: b.guides,
    settings: settings.corridor,
    water
  });
  return { result, builds: [a, b] };
}
