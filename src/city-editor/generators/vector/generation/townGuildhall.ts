import type { EnclosedGuildRole } from "../../../../buildings/medieval/enclosedGuildTrades";
import { MARKET_GUILD_HALL } from "../../../../buildings/medieval/marketGuildHall";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { bvFacilityAsset } from "../../bvFacilityAsset";
import { polygonCentroid, segmentSegmentHit } from "../../geom";
import { buildPopulationFacilityRequests } from "../../populationFacilityRequests";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { vectorTownCulture, vectorTownProfile } from "./housingCulture";
import { CIVIC_PLAZA_ID } from "./market";

/** The hall's back stands this far inside the market place's edge. */
const EDGE_METERS = 0.5;
/** Room left at either end of the edge the hall stands along, and kept clear either side of a street's mouth. */
const END_METERS = 1;
const MOUTH_METERS = 3;

const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The town guildhall's placement: laid with the civic centre, before the market's stalls. */
export const TOWN_GUILDHALL_ID = "civic:plaza-guildhall";

/**
 * An English-style town's guildhall in its market place (docs/plan/bv-workhome-facade-variation.md §5.6, §6.1 W5c):
 * the market-side hall of task 49, its open ground storey the market's covered floor, as at Thaxted. Laid with the
 * civic centre, before the stalls, so they set out round it: against an edge of the civic plaza, the head of the
 * market (farthest from where the market's street comes in) first, its front to the square, clear of the streets
 * entering the square. `role` is the guild whose emblem it shows. False where it finds no room; the town's
 * guildhall request then keeps its enclosed hall and is placed as any other facility.
 */
export function raiseTownGuildhall(doc: VectorCityDocument, role: EnclosedGuildRole): boolean {
  const plaza = doc.environment?.features[CIVIC_PLAZA_ID];
  if (plaza?.kind !== "market") return false;
  const asset = bvFacilityAsset(`trade-hall.guild-market-arcade.${role}`, [{ id: "main", ...MARKET_GUILD_HALL.main }]),
    entrance = asset.entrances[0],
    ring = plaza.boundary.outer,
    centre = polygonCentroid(ring);
  const solids: VectorPolygon[] = Object.values(doc.placements).map(p => p.site);
  // Where the streets come into the square, and the middle of each side the market's cross aisles start from
  // (`layoutMarketStalls`): the hall leaves them open.
  const closed = [...ring, ring[0]],
    mouths: Point[] = [plaza.entrance, ...ring.map((a, i) => midpoint(a, ring[(i + 1) % ring.length]))];
  for (const road of Object.values(doc.paths).filter(p => p.role === "road")) {
    const line = samplePath(road).map(q => q.point);
    for (let i = 1; i < line.length; i++)
      for (let j = 1; j < closed.length; j++) {
        const hit = segmentSegmentHit(line[i - 1], line[i], closed[j - 1], closed[j]);
        if (hit)
          mouths.push([
            line[i - 1][0] + (line[i][0] - line[i - 1][0]) * hit.t,
            line[i - 1][1] + (line[i][1] - line[i - 1][1]) * hit.t
          ]);
      }
  }
  const edges = ring
    .map((a, i) => [a, ring[(i + 1) % ring.length]] as const)
    .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1)
    .map(([a, b]) => ({ a, b, mid: midpoint(a, b) }))
    .sort(
      (p, q) =>
        Math.hypot(q.mid[0] - plaza.entrance[0], q.mid[1] - plaza.entrance[1]) -
        Math.hypot(p.mid[0] - plaza.entrance[0], p.mid[1] - plaza.entrance[1])
    );
  for (const { a, b } of edges) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let v: Point = [-u[1], u[0]];
    if ((centre[0] - a[0]) * v[0] + (centre[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]];
    // The front (the entrance's outward side) faces into the square.
    const angle = Math.atan2(v[1], v[0]) - Math.atan2(entrance.outward[1], entrance.outward[0]),
      c = Math.cos(angle),
      s = Math.sin(angle),
      rotate = (p: Point): Point => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    const local = asset.footprint.flatMap(p => p.outer).map(rotate),
      along = local.map(p => p[0] * u[0] + p[1] * u[1]),
      across = local.map(p => p[0] * v[0] + p[1] * v[1]),
      lo = Math.min(...along),
      hi = Math.max(...along),
      back = Math.min(...across);
    const room = length - 2 * END_METERS - (hi - lo);
    if (room < 0) continue;
    for (const share of [0.5, 0.25, 0.75, 0, 1]) {
      const at = END_METERS + room * share - lo,
        from = at + lo - MOUTH_METERS,
        to = at + hi + MOUTH_METERS;
      if (
        mouths.some(m => {
          const x = (m[0] - a[0]) * u[0] + (m[1] - a[1]) * u[1],
            y = (m[0] - a[0]) * v[0] + (m[1] - a[1]) * v[1];
          return Math.abs(y) < MOUTH_METERS && x > from && x < to;
        })
      )
        continue;
      const translation: Point = [
          a[0] + u[0] * at + v[0] * (EDGE_METERS - back),
          a[1] + u[1] * at + v[1] * (EDGE_METERS - back)
        ],
        place = (p: Point): Point => {
          const q = rotate(p);
          return [q[0] + translation[0], q[1] + translation[1]];
        };
      const footprint = asset.footprint.map(p => ({
        outer: p.outer.map(place),
        holes: p.holes.map(h => h.map(place))
      }));
      if (regionBoolean(footprint, [plaza.boundary], "difference").some(r => regionArea(r) > 1e-5)) continue;
      if (regionBoolean(footprint, solids, "intersection").some(r => regionArea(r) > 1e-5)) continue;
      doc.placements[TOWN_GUILDHALL_ID] = {
        id: TOWN_GUILDHALL_ID,
        modelId: asset.bvModel!.id,
        position: translation,
        facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
        origin: "automatic",
        editPolicy: "editable",
        site: footprint[0],
        accesses: [plaza.access],
        appearance: { quality: "high" },
        display: {
          kind: "object",
          heightMeters: asset.bvModel!.heightMeters,
          footprint,
          provenance: "copied",
          note: "The town's guildhall in its market place, laid with the civic centre; excluded from residential capacity.",
          dwellings: 0
        }
      };
      plaza.placementIds.push(TOWN_GUILDHALL_ID);
      return true;
    }
  }
  return false;
}

/**
 * The guild whose emblem the town's guildhall shows, where the town's facilities include one (an English-style
 * town in facility mode, plan §6.1); undefined otherwise.
 */
export function townGuildhallRole(doc: VectorCityDocument): EnclosedGuildRole | undefined {
  const population = doc.context.targetPopulation ?? 0;
  if (doc.context.requestedSettings?.facilityLayout !== "population" || population < 1) return;
  const town = buildPopulationFacilityRequests(population, {
    period: doc.context.historicalPeriod,
    port: !!doc.site?.descriptor?.burg.port,
    culture: vectorTownCulture(vectorTownProfile(doc))
  }).requests.find(r => r.id.endsWith(":guild:town"));
  return /^trade-hall\.guild-enclosed\.([a-z-]+)$/.exec(town?.asset.bvModel?.id ?? "")?.[1] as
    | EnclosedGuildRole
    | undefined;
}
