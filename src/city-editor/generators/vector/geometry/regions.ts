import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import { pointInPolygon, polygonArea } from "../../geom";
import type { PathSurface } from "./surfaces";

export type VectorPolygon = PathSurface;
export const regionArea = (p: VectorPolygon) =>
  Math.abs(polygonArea(p.outer)) - p.holes.reduce((n, h) => n + Math.abs(polygonArea(h)), 0);
export function containsRegion(polygons: VectorPolygon[], p: Point): boolean {
  return polygons.some(r => pointInPolygon(p, r.outer) && !r.holes.some(h => pointInPolygon(p, h)));
}
export function indexedContains(polygons: VectorPolygon[]) {
  const trees = polygons.map(p =>
    [p.outer, ...p.holes].map(r => {
      const tree = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; a: Point; b: Point }>();
      tree.load(
        r.map((a, i) => {
          const b = r[(i + 1) % r.length];
          return {
            a,
            b,
            minX: Math.min(a[0], b[0]),
            maxX: Math.max(a[0], b[0]),
            minY: Math.min(a[1], b[1]),
            maxY: Math.max(a[1], b[1])
          };
        })
      );
      return tree;
    })
  );
  return (p: Point) =>
    trees.some(rings => {
      const inside = (tree: (typeof rings)[number]) => {
        let yes = false;
        for (const { a, b } of tree.search({ minX: p[0], maxX: Infinity, minY: p[1], maxY: p[1] }))
          if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
        return yes;
      };
      return inside(rings[0]) && !rings.slice(1).some(inside);
    });
}
/** Only derived boundaries enter the clipping kernel; source paths and surveyed rings remain untouched. */
export function regionBoolean(
  a: VectorPolygon[],
  b: VectorPolygon[],
  operation: "union" | "difference" | "intersection"
): VectorPolygon[] {
  const toClip = (polygons: VectorPolygon[]): MultiPolygon => polygons.map(p => [p.outer, ...p.holes]);
  const count = [...a, ...b].reduce((n, p) => n + p.outer.length + p.holes.reduce((n, h) => n + h.length, 0), 0);
  if (count > 30000) throw new Error("region-budget");
  if ((operation !== "union" && !a.length) || (operation === "intersection" && !b.length)) return [];
  if (operation === "union" && !a.length && !b.length) return [];
  const result =
    operation === "union"
      ? polygonClipping.union(toClip([...a, ...b]))
      : operation === "difference"
        ? polygonClipping.difference(toClip(a), toClip(b))
        : polygonClipping.intersection(toClip(a), toClip(b));
  let points = 0;
  const polygons = result
    .map(rings => {
      const converted = rings.map(r => {
        const points = r.slice(0, -1).map(p => [p[0], p[1]] as Point);
        if (points.length > 16000) throw new Error("region-budget");
        return points;
      });
      points += converted.reduce((n, r) => n + r.length, 0);
      return { outer: converted[0], holes: converted.slice(1) };
    })
    .filter(p => regionArea(p) > 1e-8);
  if (points > 50000) throw new Error("region-budget");
  return polygons.sort(
    (a, b) => regionArea(b) - regionArea(a) || JSON.stringify(a.outer).localeCompare(JSON.stringify(b.outer))
  );
}
