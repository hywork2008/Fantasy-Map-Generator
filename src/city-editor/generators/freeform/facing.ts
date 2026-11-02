import type { Point } from "../../types/primitives";

/** Compass bearing from `origin` toward `target`. 0 is north, clockwise. */
export function facingToward(origin: Point, target: Point): number {
  const east = target[0] - origin[0];
  const north = target[1] - origin[1];
  if (east * east + north * north < 1e-8) return 0;
  return normalizeDegrees((Math.atan2(east, north) * 180) / Math.PI);
}

/** Cardinal directions within 3°, then an optional equal step such as 15°. */
export function snapFacing(degrees: number, step: number | null): number {
  let value = normalizeDegrees(degrees);
  if (step && step > 0) value = normalizeDegrees(Math.round(value / step) * step);
  for (const cardinal of [0, 90, 180, 270]) {
    const delta = Math.abs(value - cardinal);
    if (Math.min(delta, 360 - delta) <= 3) return cardinal;
  }
  return value;
}

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}
