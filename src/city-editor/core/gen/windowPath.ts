import { MERGE_QUANTUM } from "./edgeGraph";
import type { Point } from "./types";

/** Keep the first boundary contact beside the interior, discarding frame-following tails. */
export function trimWindowTails(points: Point[], half: number): Point[] {
  const onFrame = (p: Point): boolean => Math.max(Math.abs(p[0]), Math.abs(p[1])) >= half - MERGE_QUANTUM;
  const firstInterior = points.findIndex(p => !onFrame(p));
  if (firstInterior < 0) return [];
  let lastInterior = points.length - 1;
  while (onFrame(points[lastInterior])) lastInterior--;
  return points.slice(Math.max(0, firstInterior - 1), Math.min(points.length, lastInterior + 2));
}
