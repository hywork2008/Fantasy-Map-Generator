import type { Point } from "../../city-editor/types/primitives";

/**
 * CE plan point in the city view.
 * SVG draws `(x, -y)`, so three.js Z is `-planY`.
 * With the camera on +Z, plan +x stays to the right and plan +y stays up.
 */
export function planVertex(point: Point, y: number): [number, number, number] {
  return [point[0], y, -point[1]];
}
