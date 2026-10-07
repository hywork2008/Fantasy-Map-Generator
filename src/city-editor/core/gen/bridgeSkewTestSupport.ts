/** Shared by the completeCity*.test.ts files. */
import type { CityDocument, Point } from "../types";

/** Degrees by which a bridge arm leans away from a right angle with the river. Null when the channel has no direction. */
export function bridgeSkewDegrees(document: CityDocument, aId: string, midId: string, bId: string): number | null {
  const origin = document.mesh.vertices[midId]?.point;
  const left = document.mesh.vertices[aId]?.point;
  const right = document.mesh.vertices[bId]?.point;
  const river = document.featureGroups.find(group => group.kind === "river" && group.vertices.includes(midId));
  if (!origin || !left || !right || river?.kind !== "river") return null;
  const index = river.vertices.indexOf(midId);
  const prev = index > 0 ? document.mesh.vertices[river.vertices[index - 1]]?.point : null;
  const next = index + 1 < river.vertices.length ? document.mesh.vertices[river.vertices[index + 1]]?.point : null;
  let tx = 0;
  let ty = 0;
  if (prev) {
    const len = Math.hypot(origin[0] - prev[0], origin[1] - prev[1]) || 1;
    tx += (origin[0] - prev[0]) / len;
    ty += (origin[1] - prev[1]) / len;
  }
  if (next) {
    const len = Math.hypot(next[0] - origin[0], next[1] - origin[1]) || 1;
    tx += (next[0] - origin[0]) / len;
    ty += (next[1] - origin[1]) / len;
  }
  const length = Math.hypot(tx, ty);
  if (length < 1e-6) return null;
  tx /= length;
  ty /= length;
  const skew = (point: Point) => {
    const vx = point[0] - origin[0];
    const vy = point[1] - origin[1];
    const span = Math.hypot(vx, vy) || 1;
    return (Math.asin(Math.min(1, Math.abs((vx * tx + vy * ty) / span))) * 180) / Math.PI;
  };
  return Math.max(skew(left), skew(right));
}
