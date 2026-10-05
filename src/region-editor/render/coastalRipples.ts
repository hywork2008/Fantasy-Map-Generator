import { normal, normalize, pointAdd, pointScale, pointSub } from "../core/geometry";
import type { Point } from "../core/types";

/**
 * 海岸線に沿った多重同心波線（Coastal Ripples / Hachures）を生成する
 * D&D Sword Coast や Watabou Perilous Shores の特徴的な海岸表現
 */
export function generateCoastalRipples(coastlines: Point[][], count = 3, spacingUnits = 4): Point[][] {
  const ripples: Point[][] = [];

  for (const coast of coastlines) {
    if (coast.length < 2) continue;

    for (let level = 1; level <= count; level++) {
      const offsetDist = level * spacingUnits;
      const ripplePoints: Point[] = [];

      for (let i = 0; i < coast.length; i++) {
        const pt = coast[i];
        let tangent: Point;

        if (i === 0) {
          tangent = normalize(pointSub(coast[1], coast[0]));
        } else if (i === coast.length - 1) {
          tangent = normalize(pointSub(coast[i], coast[i - 1]));
        } else {
          const t1 = normalize(pointSub(pt, coast[i - 1]));
          const t2 = normalize(pointSub(coast[i + 1], pt));
          tangent = normalize(pointAdd(t1, t2));
        }

        // 外側（海側）への法線（時計回り）
        const norm = normal(tangent);
        ripplePoints.push(pointAdd(pt, pointScale(norm, -offsetDist)));
      }

      ripples.push(ripplePoints);
    }
  }

  return ripples;
}
