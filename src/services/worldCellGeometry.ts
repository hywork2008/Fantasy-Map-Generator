import type { WorldContext } from "../context/worldContext";
import { validWaterPolygon } from "./riverPhysicalGeometry";

/** FMG saves round Voronoi coordinates: different adjacent vertex IDs can
 * coincide exactly. Remove only zero-length edges and the repeated closing
 * coordinate. This preserves the polygon's point set/area; it does not snap,
 * smooth, merge nearby points, or repair a self-intersection. Topological vertex
 * IDs remain untouched for callers that extract shared-boundary portals.
 */
export function worldCellRing(world: Readonly<WorldContext>, cellId: number, scale: number): [number, number][] | null {
  const refs = world.pack?.cells?.v?.[cellId],
    positions = world.pack?.vertices?.p;
  if (!refs || refs.length < 3 || !positions || !Number.isFinite(scale) || scale <= 0) return null;
  const ring: [number, number][] = [];
  for (const ref of refs) {
    const p = positions[ref];
    if (!Number.isSafeInteger(ref) || ref < 0 || !p || p.length !== 2 || !p.every(Number.isFinite)) return null;
    const point: [number, number] = [p[0] * scale, p[1] * scale];
    if (!point.every(Number.isFinite)) return null;
    const previous = ring.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) ring.push(point);
  }
  if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
  return ring.length >= 3 ? ring : null;
}

const side = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** Decompose a simple rounded Voronoi ring without taking its convex hull.
 * Roundoff can make a valid saved cell slightly concave. Source-coordinate ears
 * preserve those recesses; the footprint policy subtracts the union of pieces.
 * A finite work budget is mandatory and failure returns no partial coverage.
 */
export function worldCellConvexPieces(
  world: Readonly<WorldContext>,
  cellId: number,
  scale: number,
  maxOperations: number
): { pieces: [number, number][][] } | { reason: "invalid-cell" | "triangulation-budget" } {
  const source = worldCellRing(world, cellId, 1);
  if (!source || !Number.isSafeInteger(maxOperations) || maxOperations < 1) return { reason: "invalid-cell" };
  const polygon = source.map(p => [p[0] * scale, p[1] * scale] as [number, number]);
  if (!validWaterPolygon({ id: cellId, rings: [polygon] })) return { reason: "invalid-cell" };
  const initialArea = source.reduce((area, p, i) => area + side(source[0], p, source[(i + 1) % source.length]), 0);
  if (!Number.isFinite(initialArea) || initialArea === 0) return { reason: "invalid-cell" };
  if (
    source.every(
      (p, i) => side(p, source[(i + 1) % source.length], source[(i + 2) % source.length]) * Math.sign(initialArea) > 0
    )
  )
    return { pieces: [polygon] };
  let operations = 0;
  const vertices = source.map((_, i) => i);
  for (let i = 0; i < vertices.length && vertices.length > 3; ) {
    if (++operations > maxOperations) return { reason: "triangulation-budget" };
    const a = source[vertices[(i + vertices.length - 1) % vertices.length]],
      b = source[vertices[i]],
      c = source[vertices[(i + 1) % vertices.length]];
    if (side(a, b, c) === 0 && (b[0] - a[0]) * (b[0] - c[0]) + (b[1] - a[1]) * (b[1] - c[1]) <= 0) {
      vertices.splice(i, 1);
      i = Math.max(0, i - 1);
    } else i++;
  }
  const origin = source[vertices[0]];
  const signedArea = vertices.reduce(
    (area, index, i) => area + side(origin, source[index], source[vertices[(i + 1) % vertices.length]]),
    0
  );
  if (!Number.isFinite(signedArea) || signedArea === 0) return { reason: "invalid-cell" };
  const orientation = Math.sign(signedArea);
  if (
    vertices.every(
      (index, i) =>
        side(source[index], source[vertices[(i + 1) % vertices.length]], source[vertices[(i + 2) % vertices.length]]) *
          orientation >
        0
    )
  )
    return { pieces: [vertices.map(i => polygon[i])] };
  const pieces: [number, number][][] = [];
  while (vertices.length > 3) {
    let found = false;
    for (let i = 0; i < vertices.length; i++) {
      if (++operations > maxOperations) return { reason: "triangulation-budget" };
      const ia = vertices[(i + vertices.length - 1) % vertices.length],
        ib = vertices[i],
        ic = vertices[(i + 1) % vertices.length];
      const a = source[ia],
        b = source[ib],
        c = source[ic];
      if (side(a, b, c) * orientation <= 0) continue;
      let occupied = false;
      for (const index of vertices) {
        if (index === ia || index === ib || index === ic) continue;
        if (++operations > maxOperations) return { reason: "triangulation-budget" };
        const p = source[index];
        if (side(a, b, p) * orientation >= 0 && side(b, c, p) * orientation >= 0 && side(c, a, p) * orientation >= 0) {
          occupied = true;
          break;
        }
      }
      if (occupied) continue;
      pieces.push([polygon[ia], polygon[ib], polygon[ic]]);
      vertices.splice(i, 1);
      found = true;
      break;
    }
    if (!found) return { reason: "invalid-cell" };
  }
  pieces.push(vertices.map(i => polygon[i]));
  return pieces.every(piece => validWaterPolygon({ id: cellId, rings: [piece] }))
    ? { pieces }
    : { reason: "invalid-cell" };
}
