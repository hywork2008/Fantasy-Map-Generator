import type { Point } from "../../../city-editor/types/document";

/** World X/Z coordinates shared by chapel shells and the fitted ambulatory's exclusions. */
export function notreDameChapelPlan() {
  return Array.from({ length: 7 }, (_, i) => {
    const angle = ((i + 0.5) * Math.PI) / 7,
      dx = Math.sin(angle),
      dz = Math.cos(angle);
    const points: Point[] = [
      [42 + dx * 15 - dz * 3.2, dz * 15 + dx * 3.2],
      [42 + dx * 19.7 - dz * 3, dz * 19.7 + dx * 3],
      [42 + dx * 21.5, dz * 21.5],
      [42 + dx * 19.7 + dz * 3, dz * 19.7 - dx * 3],
      [42 + dx * 15 + dz * 3.2, dz * 15 - dx * 3.2]
    ];
    return { points, center: [42 + dx * 17.9, dz * 17.9] as Point };
  });
}
