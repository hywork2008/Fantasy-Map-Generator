import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import { MONASTERY_NAMES, monasteryCountFor, monasteryKindsFor } from "../../aerialLandmarks";
import { bufferPolygon, convexHull, pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { fitMonastery, type Monastery } from "../../monasteryLayout";
import { makeRng } from "../../prng";
import { featureReservations } from "../environmentState";
import { pathIsClosed } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { validateVectorMonasteries } from "../monastery";
import { vectorOccupiedSites } from "../occupancy";

/** The mesh editor's precinct rules (`aerialLandmarks.ts`): a block pulled back from its streets and big enough. */
const STREET_VERGE = 1.8;
const MIN_BLOCK_AREA = 3600;

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });
const hits = (polygon: Point[], regions: VectorPolygon[], grow = 0) =>
  regionBoolean(
    [
      ring(
        grow
          ? bufferPolygon(
              polygon,
              polygon.map(() => -grow)
            )
          : polygon
      )
    ],
    regions,
    "intersection"
  ).some(r => regionArea(r) > 1e-3);

/**
 * Religious houses by the mesh editor's rules (P6c): the faith and period found abbeys, friaries or Orthodox
 * monasteries, as many as the town's size calls for; each takes the best land block for `fitMonastery`'s precinct
 * (church on the nearest street, cloister or courtyard behind it). A friary stands inside the walls some 150 m from a
 * gate, a walled town's abbey outside them; precincts stay 140 m apart.
 */
export function raiseVectorMonasteries(
  doc: VectorCityDocument,
  blocks: VectorBlock[]
): { document: VectorCityDocument; wanted: number } {
  const site = doc.site!,
    period = doc.context.historicalPeriod,
    walls = Object.values(doc.paths).filter(p => p.role === "wall"),
    outerWall = walls.find(w => pathIsClosed(w) && !w.id.includes("inner")),
    walled = !!outerWall,
    kinds = monasteryKindsFor(site.descriptor?.civilization?.faith, period, walled).slice(
      0,
      monasteryCountFor(getUrbanDwellings(doc.context.targetPopulation ?? 0), period)
    );
  if (!kinds.length) return { document: doc, wanted: 0 };
  const town = outerWall
      ? samplePath(outerWall).map(s => s.point)
      : site.domain.reduce((a, b) => (regionArea(b) > regionArea(a) ? b : a)).outer,
    townDistance = (p: Point) =>
      Math.min(...town.map((a, i) => pointSegmentDistance(p, a, town[(i + 1) % town.length]))),
    gates = Object.values(doc.connections.gates)
      .map(g => doc.connections.nodes[g.nodeId]?.position)
      .filter(Boolean),
    roads = Object.values(doc.paths).filter(p => p.role === "road"),
    roadLines = roads.map(r => ({
      line: samplePath(r).map(s => s.point),
      half: Math.max(r.width.leftMeters, r.width.rightMeters)
    })),
    nearestRoad = (p: Point) =>
      Math.min(
        ...roadLines.flatMap(({ line, half }) =>
          line.slice(1).map((b, i) => pointSegmentDistance(p, line[i], b) - half)
        )
      ),
    water = allVectorWater(doc),
    blocked: VectorPolygon[] = [
      ...featureReservations(doc),
      ...vectorOccupiedSites(doc, "reserved"),
      ...walls.map(pathSurface)
    ],
    roadSurfaces = roads.map(pathSurface),
    rng = makeRng(`${doc.recipe.seed}:monastery`);
  // Land blocks a precinct can fill, pulled back from their streets.
  const candidates = blocks.flatMap(b => {
    if (b.holes.length || Math.abs(polygonArea(b.outer)) < MIN_BLOCK_AREA * 1.2) return [];
    if (Math.abs(polygonArea(b.outer)) < 0.82 * Math.abs(polygonArea(convexHull(b.outer)))) return [];
    const pulled = bufferPolygon(
      b.outer,
      b.outer.map(() => STREET_VERGE)
    );
    if (pulled.length < 3 || Math.abs(polygonArea(pulled)) < MIN_BLOCK_AREA) return [];
    return [{ id: b.id, ring: pulled, centre: polygonCentroid(pulled) }];
  });
  const houses: Record<string, Monastery> = {};
  kinds.forEach((kind, index) => {
    const outside = kind === "abbey" && walled;
    let best: { score: number; monastery: Monastery } | undefined;
    for (const block of candidates) {
      const inside = !outerWall || pointInPolygon(block.centre, town),
        edge = townDistance(block.centre);
      if (outside ? inside || edge < 40 || edge > 280 : !inside || edge < 25) continue;
      if (Object.values(houses).some(m => Math.hypot(m.gate[0] - block.centre[0], m.gate[1] - block.centre[1]) < 140))
        continue;
      const nearGate = gates.length
        ? Math.min(...gates.map(g => Math.hypot(g![0] - block.centre[0], g![1] - block.centre[1])))
        : 0;
      if (kind === "friary" && gates.length && (nearGate < 50 || nearGate > 340)) continue;
      const distances = block.ring.map((a, i) => {
          const b = block.ring[(i + 1) % block.ring.length];
          return nearestRoad([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        }),
        nearest = Math.min(...distances),
        frontEdges = distances.flatMap((d, i) => (d <= nearest + 8 ? [i] : []));
      const fit = fitMonastery({
        kind,
        id: `monastery:${index}`,
        faceId: block.id,
        ring: block.ring,
        rng: makeRng(`${block.id}:${kind}:${index}`),
        frontEdges,
        margin: outside ? 22 : 8
      });
      if (!fit) continue;
      const precinct = fit.monastery.precinct;
      if (
        hits(precinct, water, 3) ||
        hits(precinct, roadSurfaces) ||
        hits(precinct, blocked) ||
        Object.values(houses).some(m => hits(precinct, [ring(m.precinct)])) ||
        regionBoolean([ring(precinct)], site.domain, "difference").some(r => regionArea(r) > 1)
      )
        continue;
      const score =
        fit.scale * 8 -
        Math.abs(fit.looseness - 1.9) * 0.7 -
        Math.min(nearest, 60) * 0.03 -
        (kind === "friary" && gates.length ? Math.abs(nearGate - 150) * 0.008 : 0) -
        (outside ? Math.abs(edge - 110) * 0.01 : 0) +
        rng() * 0.4;
      if (!best || score > best.score) best = { score, monastery: fit.monastery };
    }
    if (!best) return;
    best.monastery.name = `${MONASTERY_NAMES[kind]} #${index + 1}`;
    houses[best.monastery.id] = best.monastery;
  });
  if (!Object.keys(houses).length) return { document: doc, wanted: kinds.length };
  const next = { ...doc, environment: { features: {}, hidden: [], ...doc.environment, monasteries: houses } };
  return validateVectorMonasteries(next).length
    ? { document: doc, wanted: kinds.length }
    : { document: next, wanted: kinds.length };
}
