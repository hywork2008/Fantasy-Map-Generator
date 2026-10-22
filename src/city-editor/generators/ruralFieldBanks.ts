import type { CityDocument, Point } from "../types/document";
import { riverRibbons } from "./bridgeDeck";
import { nearestOnPolyline } from "./geom";

/** Bank identity follows the nearest local river tangent, including bends.
 * Extending the end tangents keeps a short river's two banks independent even
 * when the surrounding dry land remains connected around its endpoints. */
export function ruralBankKey(point: Point, dividers: readonly Point[][] = []): string {
  return dividers
    .map(line => {
      const hit = nearestOnPolyline(point, line),
        a = line[hit.segIndex],
        b = line[hit.segIndex + 1];
      return (b[0] - a[0]) * (point[1] - hit.point[1]) - (b[1] - a[1]) * (point[0] - hit.point[0]) < 0 ? "0" : "1";
    })
    .join("");
}

/** Surveyed rivers have banks but no centreline. Use their longitudinal axis
 * to separate bank identities; the actual water footprint still cuts access. */
function surveyAxis(rings: readonly (readonly (readonly [number, number])[])[]): Point[] | undefined {
  const points = rings.flat();
  if (points.length < 3) return;
  const center = points.reduce<Point>(
    (sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length],
    [0, 0]
  );
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of points) {
    const x = p[0] - center[0],
      y = p[1] - center[1];
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2,
    axis: Point = [Math.cos(angle), Math.sin(angle)];
  const values = points.map(p => (p[0] - center[0]) * axis[0] + (p[1] - center[1]) * axis[1]);
  const lo = Math.min(...values),
    hi = Math.max(...values);
  if (hi - lo < 1e-6) return;
  return [lo, hi].map(t => [center[0] + t * axis[0], center[1] + t * axis[1]]);
}

export function ruralRiverDividers(document: CityDocument): Point[][] {
  return [
    ...riverRibbons(document).map(river => river.points),
    ...(document.waterAreas ?? []).flatMap(area => {
      const axis = surveyAxis([area.polygon]);
      return axis ? [axis] : [];
    }),
    ...(document.importedFixedCrossings?.rivers ?? []).flatMap(river => {
      const axis = surveyAxis(river.rings);
      return axis ? [axis] : [];
    })
  ].filter(line => line.length >= 2 && line.some(p => Math.hypot(p[0] - line[0][0], p[1] - line[0][1]) > 1e-6));
}

/** Connected dry cells of one bank are a local parcel-planning domain. */
export function ruralAccessRegions(
  nodes: Map<string, { x: number; y: number; point: Point }>,
  dividers: readonly Point[][] = []
): Map<string, string> {
  const banks = new Map([...nodes].map(([id, node]) => [id, ruralBankKey(node.point, dividers)]));
  const regions = new Map<string, string>();
  for (const [start, bank] of banks) {
    if (regions.has(start)) continue;
    const queue = [start];
    regions.set(start, start);
    for (let i = 0; i < queue.length; i++) {
      const node = nodes.get(queue[i])!;
      for (const [x, y] of [
        [node.x - 1, node.y],
        [node.x + 1, node.y],
        [node.x, node.y - 1],
        [node.x, node.y + 1]
      ]) {
        const id = `${x}:${y}`;
        if (regions.has(id) || banks.get(id) !== bank) continue;
        regions.set(id, start);
        queue.push(id);
      }
    }
  }
  return regions;
}
