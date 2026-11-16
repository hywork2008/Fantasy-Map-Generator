import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { VectorPark } from "../../../types/vector/urban";
import { convexInfillParts } from "../../lotGeometry";
import { LAWN_SETBACK, layoutParkLawn, type ParkClearance } from "../../parkFabric";
import { makeRng } from "../../prng";
import { regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { allVectorWater } from "../geometry/water";
import { vectorTreesGrow } from "./forest";
import { streetBlockOf } from "./wards";

/** An outline edge this close to a wall, river or water takes that clearance as its setback. */
const EDGE_METERS = 12;
/** A park this close to the wall is a fortified esplanade, as a mesh park cell on a wall edge. */
const FORTIFIED_METERS = 15;

const box = (ring: Point[], pad: number) => {
  const xs = ring.map(p => p[0]),
    ys = ring.map(p => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] as const;
};
const near = ([a, b]: [Point, Point], [x0, y0, x1, y1]: readonly number[]) =>
  Math.max(a[0], b[0]) >= x0 && Math.min(a[0], b[0]) <= x1 && Math.max(a[1], b[1]) >= y0 && Math.min(a[1], b[1]) <= y1;
const segments = (line: Point[]) => line.slice(1).map((b, i): [Point, Point] => [line[i], b]);

/**
 * The park wards of the town laid out by the mesh editor's park fabric (P7c, `buildParkLawns` through the cell-free
 * `layoutParkLawn`): each street block whose ward is a park becomes lawns inset from its edges (2.8 m along
 * streets, the wall's and rivers' margins along them, 6 m off water), a walkway, grass tufts and canopies kept
 * 11 m off the wall and off the rivers' margins. A small park along the wall stays a bare esplanade, and a treeless
 * climate plants none.
 * A park block the town had to build on (`vacant` false) stays houses.
 */
export function layoutVectorParks(
  doc: VectorCityDocument,
  districts: readonly { id: string; ward?: string; polygon: VectorPolygon }[],
  vacant: (blockId: string) => boolean = () => true
): VectorPark[] {
  const blocks = new Map<string, VectorPolygon[]>();
  for (const d of districts)
    if (d.ward === "park" && vacant(streetBlockOf(d.id)))
      blocks.set(streetBlockOf(d.id), [...(blocks.get(streetBlockOf(d.id)) ?? []), d.polygon]);
  if (!blocks.size) return [];
  const walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => ({ line: samplePath(p).map(s => s.point), margin: p.width.leftMeters + 2.5 })),
    rivers = Object.values(doc.paths)
      .filter(p => p.role === "river")
      .map(p => ({ line: samplePath(p).map(s => s.point), margin: p.width.leftMeters + 3.2 })),
    water = allVectorWater(doc).map(w => w.outer),
    trees = vectorTreesGrow(doc),
    parks: VectorPark[] = [];
  for (const [id, polygons] of [...blocks].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const outline = regionBoolean(polygons, [], "union").sort((a, b) => b.outer.length - a.outer.length)[0]?.outer;
    if (!outline || outline.length < 3) continue;
    const bounds = box(outline, EDGE_METERS + 11),
      wallSegments = walls.flatMap(w => segments(w.line).filter(s => near(s, bounds))),
      riverSegments = rivers.flatMap(r =>
        segments(r.line)
          .filter(s => near(s, bounds))
          .map(([a, b]) => ({ a, b, clearDist: r.margin }))
      ),
      wet = water.filter(w => {
        const [x0, y0, x1, y1] = box(w, 0);
        return x1 >= bounds[0] && x0 <= bounds[2] && y1 >= bounds[1] && y0 <= bounds[3];
      }),
      shore = wet.flatMap(w => segments([...w, w[0]])),
      distance = (p: Point, list: [Point, Point][]) =>
        list.reduce((n, [a, b]) => Math.min(n, pointSegmentDistance(p, a, b)), Infinity);
    const boundary = outline.map((a, i) => {
      const b = outline[(i + 1) % outline.length],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let setback = LAWN_SETBACK;
      for (const w of walls)
        if (
          distance(
            mid,
            segments(w.line).filter(s => near(s, bounds))
          ) <= EDGE_METERS
        )
          setback = Math.max(setback, w.margin);
      for (const r of riverSegments)
        if (pointSegmentDistance(mid, r.a, r.b) <= EDGE_METERS) setback = Math.max(setback, r.clearDist);
      if (distance(mid, shore) <= EDGE_METERS) setback = Math.max(setback, 6);
      return { a, b, setback };
    });
    const clearance: ParkClearance = {
      segments: wallSegments,
      rivers: [],
      riverSegments,
      water: wet.flatMap(convexInfillParts)
    };
    const lawn = layoutParkLawn(id, outline, boundary, makeRng(`${doc.recipe.seed}:park-lawn:${id}`), clearance, {
      fortified: outline.some(p => distance(p, wallSegments) < FORTIFIED_METERS),
      trees
    });
    if (lawn)
      parks.push({
        id,
        lawns: lawn.lawnPolygons,
        paths: lawn.paths,
        tufts: lawn.grassTufts,
        trees: lawn.trees
      });
  }
  return parks;
}
