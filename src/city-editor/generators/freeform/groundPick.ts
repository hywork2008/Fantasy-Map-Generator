import type { Point } from "../../types/primitives";
import type { PlanRay } from "./heightFieldDda";

/**
 * First place a downward-looking ray meets `heightAt`, including pads.
 * The last step is split so the plan point sits on the crossing.
 */
export function terrainRayPoint(heightAt: (point: Point) => number, ray: PlanRay, maxDistance: number): Point | null {
  const length = Math.hypot(ray.direction[0], ray.direction[1], ray.direction[2]);
  if (!(length > 0) || !(maxDistance > 0)) return null;
  const dx = ray.direction[0] / length;
  const dy = ray.direction[1] / length;
  const dz = ray.direction[2] / length;
  const step = 2;
  let previousT = 0;
  let previousAbove = ray.origin[2] >= heightAt([ray.origin[0], ray.origin[1]]);
  if (!previousAbove) return null;
  for (let t = step; t <= maxDistance; t += step) {
    const point: Point = [ray.origin[0] + dx * t, ray.origin[1] + dy * t];
    const above = ray.origin[2] + dz * t >= heightAt(point);
    if (previousAbove && !above) {
      let near = previousT;
      let far = t;
      for (let i = 0; i < 8; i++) {
        const mid = (near + far) / 2;
        const sample: Point = [ray.origin[0] + dx * mid, ray.origin[1] + dy * mid];
        if (ray.origin[2] + dz * mid >= heightAt(sample)) near = mid;
        else far = mid;
      }
      return [ray.origin[0] + dx * far, ray.origin[1] + dy * far];
    }
    previousT = t;
    previousAbove = above;
  }
  return null;
}
