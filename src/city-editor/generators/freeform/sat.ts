import type { Point } from "../../types/primitives";

/** Touching edges do not count. A shared boundary can hold two plots. */
const TOUCH_EPSILON = 1e-4;

function separated(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return maxA <= minB + TOUCH_EPSILON || maxB <= minA + TOUCH_EPSILON;
}

function project(corners: readonly Point[], axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const point of corners) {
    const dot = point[0] * axis[0] + point[1] * axis[1];
    if (dot < min) min = dot;
    if (dot > max) max = dot;
  }
  return [min, max];
}

/** Convex quadrilaterals. Two edge normals from each box are enough when both are rectangles. */
export function orientedBoxesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (let box = 0; box < 2; box++) {
    const corners = box === 0 ? a : b;
    for (let edge = 0; edge < 2; edge++) {
      const from = corners[edge];
      const to = corners[edge + 1];
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy) || 1;
      const axis: Point = [-dy / length, dx / length];
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (separated(minA, maxA, minB, maxB)) return false;
    }
  }
  return true;
}
