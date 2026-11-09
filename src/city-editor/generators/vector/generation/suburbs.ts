import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { type ApproachBand, type SuburbanLotContext, suburbanLotKept, suburbanProfile } from "../../suburbanLanduse";
import { featureReservations } from "../environmentState";
import { pathIsClosed } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

/** A road ending this close to the wall line ends at its gate. */
const GATE_METERS = 15;

/**
 * The approach land-use bands of a walled meshless town (P7a), by the mesh editor's rules (`suburbanProfile`): one
 * band per approach road beyond the wall, gate end first, profiled by its FMG traffic (trade from rank 0.5, else
 * rural) with the band's glacis clearance and ribbon length. Empty for an open town or one without approaches.
 */
export function vectorApproachBands(doc: VectorCityDocument): { bands: ApproachBand[]; walls: Point[][] } {
  const walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => samplePath(p).map(s => s.point)),
    outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!outer) return { bands: [], walls };
  const ring = samplePath(outer).map(s => s.point),
    wallGap = (q: Point) => nearestOnPolyline(q, [...ring, ring[0]]).dist,
    roads = doc.site?.descriptor?.roads ?? [],
    owned = new Set(doc.urban?.ownedPaths ?? []);
  const bands = Object.values(doc.paths)
    .filter(p => p.role === "road" && !owned.has(p.id))
    .flatMap((p): ApproachBand[] => {
      let line = samplePath(p).map(s => s.point);
      if (!line.some(q => !pointInPolygon(q, ring))) return [];
      // Gate end first: the end inside the wall or nearest its line.
      const score = (q: Point) => (pointInPolygon(q, ring) ? -1 : wallGap(q));
      if (score(line.at(-1)!) < score(line[0])) line = [...line].reverse();
      if (score(line[0]) > GATE_METERS) return [];
      // The band starts at the gate: where the road leaves the wall, to within 2 m.
      line = line
        .slice(1)
        .flatMap((b, i): Point[] => {
          const a = line[i],
            n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          return Array.from(
            { length: n },
            (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
          );
        })
        .concat([line.at(-1)!]);
      const out = line.findIndex(q => !pointInPolygon(q, ring));
      if (out < 0) return [];
      line = line.slice(out);
      if (line.length < 2) return [];
      const i = roads.findIndex((r, k) => p.id === `fmg-road:${r.routeId}:${k}`),
        road = i >= 0 ? roads[i] : undefined,
        use =
          road && (road.traffic != null || road.trafficRank != null)
            ? { traffic: road.traffic ?? 0, trafficRank: road.trafficRank ?? 0, paved: road.group === "roads" }
            : null;
      return [{ groupId: p.id, points: line, ...suburbanProfile(undefined, doc.frame.extentMeters, true, use) }];
    });
  return { bands, walls };
}

/**
 * The lot test for houses beyond the wall (P7a): the mesh editor's roadside ribbon (`suburbanLotKept`) for land
 * outside the curtain, the glacis only for the shanty and for residential outskirts (asked for by `residential`
 * when the town inside the wall and the ribbon cannot house everyone, as the mesh editor opens its residential
 * outskirts as suburbs). Inside the wall, or in an open town, every
 * lot keeps its house. A town of an FMG burg with an urban-morphology profile grows by the mesh editor's other
 * system (`shapeUrbanGrowthFabric`), not ported yet, and keeps every lot too.
 */
export function vectorSuburbanLots(
  doc: VectorCityDocument,
  suburb: (cellId: string) => boolean
): (cellId: string, polygon: Point[], residential: boolean) => boolean {
  if (doc.site?.descriptor?.urbanMorphology) return () => true;
  const { bands, walls } = vectorApproachBands(doc);
  const outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!outer || !bands.length) return () => true;
  const ring = samplePath(outer).map(s => s.point),
    ctx: SuburbanLotContext = {
      bands,
      wallDistance: p => Math.min(...walls.map(w => nearestOnPolyline(p, w).dist)),
      slack: 0
    };
  return (cellId, polygon, residential) =>
    pointInPolygon(polygonCentroid(polygon), ring) ||
    suburbanLotKept(polygon, cellId, residential || suburb(cellId), ctx);
}

/** Half the width of the roadside ribbon land either side of its approach. */
const RIBBON_HALF_METERS = 28;
/** Land beyond the wall already this large holds the ribbon. */
const OUTSKIRTS_MIN_M2 = 6000;

/**
 * Land for the roadside ribbon of a walled town whose site ends at the wall (P7a): a strip along each approach band
 * between its glacis clearance and the end of its ribbon, measured from the gate, as the mesh editor's outskirts
 * cells hold them. A frontier approach keeps none. The strips start beyond the glacis, so they never join the
 * town's land. `faubourgAdded` is true when the shanty just added land of its own.
 */
export function raiseVectorRibbonLand(doc: VectorCityDocument, faubourgAdded: boolean): VectorCityDocument {
  const site = doc.site;
  if (!site || site.descriptor?.urbanMorphology) return doc;
  const outer = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (!outer) return doc;
  const ring = samplePath(outer).map(s => s.point);
  if (
    !faubourgAdded &&
    regionBoolean(site.domain, [{ outer: ring, holes: [] }], "difference").reduce((n, r) => n + regionArea(r), 0) >=
      OUTSKIRTS_MIN_M2
  )
    return doc;
  const half = doc.frame.extentMeters / 2 - 4,
    strips: VectorPolygon[] = [];
  for (const band of vectorApproachBands(doc).bands) {
    if (band.profile === "frontier") continue;
    const gate = band.points[0],
      from = (q: Point) => Math.hypot(q[0] - gate[0], q[1] - gate[1]),
      // Every 5 m along the road, then the stretch the ribbon may hold.
      line = band.points.slice(1).flatMap((b, i): Point[] => {
        const a = band.points[i],
          n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
        return Array.from(
          { length: n + 1 },
          (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
        );
      }),
      run = line.filter(q => from(q) >= band.clearance && from(q) <= band.clearance + band.length);
    if (run.length < 2) continue;
    const a = run[0],
      b = run.at(-1)!,
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 10) continue;
    const n: Point = [(-(b[1] - a[1]) / l) * RIBBON_HALF_METERS, ((b[0] - a[0]) / l) * RIBBON_HALF_METERS];
    strips.push({
      outer: (
        [
          [a[0] + n[0], a[1] + n[1]],
          [b[0] + n[0], b[1] + n[1]],
          [b[0] - n[0], b[1] - n[1]],
          [a[0] - n[0], a[1] - n[1]]
        ] as Point[]
      ).map(([x, y]): Point => [Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, y))]),
      holes: []
    });
  }
  if (!strips.length) return doc;
  const land = regionBoolean(
    regionBoolean(strips, [], "union"),
    [...allVectorWater(doc), ...featureReservations(doc), { outer: ring, holes: [] }, pathSurface(outer)],
    "difference"
  ).filter(r => regionArea(r) > 200);
  if (!land.length) return doc;
  const domain = regionBoolean(site.domain, land, "union");
  return domain.every(p => simpleContour(p.outer, true) && p.holes.every(h => simpleContour(h, true)))
    ? { ...doc, site: { ...site, domain } }
    : doc;
}
