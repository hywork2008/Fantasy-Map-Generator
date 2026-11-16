import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import { bufferPolygon, pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { planGuildFacilities } from "../../guildFacilities";
import { type GuildSpot, type GuildWorksSite, placeGuildWorks } from "../../guildFacilityPlacement";
import { featureReservations } from "../environmentState";
import { pathIsClosed } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { validateVectorGuilds } from "../guild";
import { vectorOccupiedSites } from "../occupancy";

/** Land beside the approach roads beyond the town a yard may take: square pieces this wide, out to this far. */
const OUTSIDE_SPOT_METERS = 44;
const OUTSIDE_REACH_METERS = 170;

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });
const grown = (polygon: Point[], by: number) =>
  by > 0
    ? bufferPolygon(
        polygon,
        polygon.map(() => -by)
      )
    : polygon;

/**
 * The mesh editor's town view for its works (guild yards, inns) on a meshless site (P6d, P6e): the outer wall or the
 * site outline as the town, its land blocks inside, square pieces beside the approach roads beyond it, and the
 * site's water, roads, walls and reserved ground as obstacles. Claimed pieces block the next.
 */
export function vectorWorksSite(doc: VectorCityDocument, blocks: VectorBlock[]) {
  const site = doc.site!;
  const walls = Object.values(doc.paths).filter(p => p.role === "wall"),
    outerWall = walls.find(w => pathIsClosed(w) && !w.id.includes("inner")),
    town = outerWall
      ? samplePath(outerWall).map(s => s.point)
      : site.domain.reduce((a, b) => (regionArea(b) > regionArea(a) ? b : a)).outer,
    insideTown = (p: Point) => pointInPolygon(p, town),
    townDistance = (p: Point) =>
      Math.min(...town.map((a, i) => pointSegmentDistance(p, a, town[(i + 1) % town.length]))),
    roads = Object.values(doc.paths).filter(p => p.role === "road"),
    roadSurfaces = roads.map(pathSurface),
    water = allVectorWater(doc),
    wallBands = walls.flatMap(w => {
      const line = samplePath(w).map(s => s.point),
        width = w.width.leftMeters + w.width.rightMeters;
      return line.slice(1).map((b, i) => {
        const a = line[i],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
          n: Point = [(-(b[1] - a[1]) / l) * (width / 2), ((b[0] - a[0]) / l) * (width / 2)];
        return ring([
          [a[0] + n[0], a[1] + n[1]],
          [b[0] + n[0], b[1] + n[1]],
          [b[0] - n[0], b[1] - n[1]],
          [a[0] - n[0], a[1] - n[1]]
        ]);
      });
    }),
    blocked: VectorPolygon[] = [...featureReservations(doc), ...vectorOccupiedSites(doc, "reserved"), ...wallBands],
    claimed: VectorPolygon[] = [],
    half = doc.frame.extentMeters / 2;
  const hits = (polygon: Point[], regions: VectorPolygon[], clearance = 0) =>
    regionBoolean([ring(grown(polygon, clearance))], regions, "intersection").some(r => regionArea(r) > 1e-3);
  // Inside: the land blocks of the town. Outside: square pieces beside each approach road beyond the town.
  const inner: GuildSpot[] = blocks.flatMap(b => {
    if (Math.abs(polygonArea(b.outer)) < 180) return [];
    const centre = polygonCentroid(b.outer);
    return insideTown(centre)
      ? [
          {
            id: b.id,
            centre,
            polygon: b.outer,
            dist: Math.hypot(centre[0] - site.center[0], centre[1] - site.center[1])
          }
        ]
      : [];
  });
  const outer: GuildSpot[] = [];
  for (const road of roads) {
    const line = samplePath(road).map(s => s.point),
      offset = Math.max(road.width.leftMeters, road.width.rightMeters) + 2 + OUTSIDE_SPOT_METERS / 2;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (span < 1e-6) continue;
      const u: Point = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
      for (let t = 0; t < span; t += OUTSIDE_SPOT_METERS / 2) {
        const p: Point = [a[0] + u[0] * t, a[1] + u[1] * t];
        if (insideTown(p) || townDistance(p) > OUTSIDE_REACH_METERS) continue;
        for (const side of [1, -1]) {
          const v: Point = [-u[1] * side, u[0] * side],
            c: Point = [p[0] + v[0] * offset, p[1] + v[1] * offset],
            h = OUTSIDE_SPOT_METERS / 2,
            corner = (du: number, dv: number): Point => [c[0] + u[0] * du + v[0] * dv, c[1] + u[1] * du + v[1] * dv],
            square = [corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)],
            polygon = polygonArea(square) < 0 ? square.reverse() : square;
          if (insideTown(c) || polygon.some(q => Math.abs(q[0]) > half - 4 || Math.abs(q[1]) > half - 4)) continue;
          outer.push({ id: `outside:${road.id}:${i}:${t}:${side}`, centre: c, polygon, dist: Math.hypot(c[0], c[1]) });
        }
      }
    }
  }
  const view: GuildWorksSite = {
    town,
    spots: outside => (outside ? outer : inner),
    rivers: () =>
      Object.values(doc.paths)
        .filter(p => p.role === "river" && p.id !== "town-moat")
        .map(p => ({
          points: samplePath(p).map(s => s.point),
          widthMeters: p.width.leftMeters + p.width.rightMeters,
          surveyed: false
        })),
    insideTown,
    townDistance,
    inFrame: (polygon, margin = 0) =>
      polygon.every(q => Math.abs(q[0]) <= half - margin && Math.abs(q[1]) <= half - margin),
    hitsWater: (polygon, clearance = 0) => hits(polygon, water, clearance),
    hitsRoutes: (polygon, clearance) => hits(polygon, roadSurfaces, clearance),
    hitsBlocked: polygon => hits(polygon, blocked) || hits(polygon, claimed),
    hitsLanes: () => false,
    buildingsIn: () => [],
    claim: polygon => claimed.push(ring(polygon)),
    // Outside works stand clear of the curtain wall.
    clearsGlacis: (polygon, minClearance = 10) => !hits(polygon, wallBands, minClearance),
    approachClearance: () => 0,
    outworkReach: () => 0
  };
  return { view, town, insideTown, roads };
}

/**
 * The guilds of an FMG town's economy (`planGuildFacilities`) placed by the mesh editor's rules (`placeGuildWorks`,
 * P6d): each chapter's hall in a land block of the town core, the trades with dirty or bulky work toward the edge,
 * and its yards outside the town, a bleaching field upstream on a river bank. The meshless view gives the planner
 * the land blocks inside the town and square pieces beside the approach roads beyond it; the site grows to take
 * the yards placed there.
 */
export function raiseVectorGuilds(
  doc: VectorCityDocument,
  blocks: VectorBlock[]
): { document: VectorCityDocument; wanted: number; placed: number } {
  const site = doc.site!,
    economy = site.descriptor?.economy,
    plan = planGuildFacilities(economy, doc.context.historicalPeriod ?? "ageOfExploration"),
    wanted = plan.reduce((n, f) => n + (f.hall ? 1 : 0) + f.ancillary.filter(k => k !== "tannery").length, 0);
  if (!wanted) return { document: doc, wanted: 0, placed: 0 };
  const { view } = vectorWorksSite(doc, blocks);
  const works = placeGuildWorks(view, plan, economy?.year ?? 0);
  const placed = works.halls.length + works.yards.length;
  if (!placed) return { document: doc, wanted, placed };
  // The site takes in the yards placed beyond it.
  const outside = works.yards
    .map(y => ring(y.polygon))
    .filter(y => regionBoolean([y], site.domain, "difference").some(r => regionArea(r) > 1e-3));
  const next: VectorCityDocument = {
    ...doc,
    site: outside.length ? { ...site, domain: regionBoolean(site.domain, outside, "union") } : site,
    environment: { features: {}, hidden: [], ...doc.environment, guilds: works }
  };
  return validateVectorGuilds(next).length ? { document: doc, wanted, placed: 0 } : { document: next, wanted, placed };
}
