import * as THREE from "three";
import { pointInPolygon } from "../../city-editor/generators/geom";
import type { Point } from "../../city-editor/types/primitives";

/** Fit the entire BV envelope, including roofs and steps, without stretching its proportions. */
export function fitBvBuilding(
  bounds: THREE.Box3,
  footprint: Point[],
  angle: number,
  elevation: number,
  minimumScale = 0.5
) {
  if (footprint.length < 3 || !Number.isFinite(angle) || !Number.isFinite(elevation)) return;
  const ring = footprint.slice();
  if (ring.length > 3 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
  if (ring.some(p => !p.every(Number.isFinite))) return;
  const turns = ring
    .map((p, i) => {
      const q = ring[(i + 1) % ring.length],
        r = ring[(i + 2) % ring.length];
      return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    })
    .filter(t => Math.abs(t) > 1e-7);
  // Concave reservations keep their existing conforming massing.
  if (!turns.length || turns.some(t => Math.sign(t) !== Math.sign(turns[0]))) return;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const xs = ring.map(([x, y]) => x * c + y * s),
    ys = ring.map(([x, y]) => -x * s + y * c);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) return;
  const scale = Math.min(1.5, 0.94 * Math.min((maxX - minX) / size.x, (maxY - minY) / size.z));
  if (scale < minimumScale) return;
  const x = (minX + maxX) / 2,
    y = (minY + maxY) / 2;
  const point: Point = [x * c - y * s, x * s + y * c];
  const envelope: Point[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([a, b]) => {
    const u = (a * size.x * scale) / 2,
      v = (b * size.z * scale) / 2;
    return [point[0] + u * c - v * s, point[1] + u * s + v * c];
  });
  if (envelope.some(p => !pointInPolygon(p, ring))) return;
  const matrix = new THREE.Matrix4()
    .compose(
      new THREE.Vector3(point[0], elevation, -point[1]),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
      new THREE.Vector3(scale, scale, scale)
    )
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  return { matrix, footprint: envelope, scale };
}
