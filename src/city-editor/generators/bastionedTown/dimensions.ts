// Artillery-sized works. These are generation calibration values, not universal historical standards.
import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import type { HistoricalPeriod, Point } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { distanceToPolyline } from "../generation/skeleton/vector";
import { nearestOnPolyline, segmentSegmentHit } from "../geom";

export interface ArtilleryDimensions {
  profile: "renaissance" | "mature" | "rifled-era";
  bastionDepth: number;
  depthToWidthRatio: number;
  curtainLength: number;
  rampartWidth: number;
  ditchWidth: number;
  ravelinDepth: number;
  glacisWidth: number;
  urbanSetback: number;
  flankingRange: number;
}

export function artilleryDimensions(period: HistoricalPeriod | undefined): ArtilleryDimensions {
  const at = historicalPeriodIndex(period ?? "ageOfExploration");
  const mature = at >= historicalPeriodIndex("maritimeEra");
  const rifled = at >= historicalPeriodIndex("steamEra");
  return {
    profile: rifled ? "rifled-era" : mature ? "mature" : "renaissance",
    bastionDepth: mature ? 90 : 70,
    depthToWidthRatio: mature ? 1.125 : 1,
    curtainLength: mature ? 120 : 90,
    rampartWidth: mature ? 20 : 16,
    ditchWidth: mature ? 24 : 18,
    ravelinDepth: mature ? 65 : 50,
    glacisWidth: mature ? 120 : 80,
    urbanSetback: mature ? 60 : 40,
    // Palmanova's 350 m design reference concerns mutual support, not bombardment immunity.
    flankingRange: 350
  };
}

export function resolveArtilleryDimensions(settings: GenerationSettings): ArtilleryDimensions | null {
  return settings.townFortification?.dimensionPolicy === "artillery-v1"
    ? artilleryDimensions(settings.historicalPeriod ?? settings.descriptor?.historicalPeriod)
    : null;
}

export function ringGap(a: Point[], b: Point[]): number {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (segmentSegmentHit(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0;
  const ac = [...a, a[0]],
    bc = [...b, b[0]];
  return Math.min(...a.map(p => distanceToPolyline(p, bc)), ...b.map(p => distanceToPolyline(p, ac)));
}

/** Every curtain station must be within close supporting range of a neighbouring flank. */
export function flankingDistance(
  outer: Point[],
  sides: number,
  omitted = new Set<number>(),
  missingBastions = new Set<number>()
): number {
  let maximum = 0;
  for (let i = 0; i < sides; i++) {
    if (omitted.has(i)) continue;
    const next = (i + 1) % sides;
    const a = outer[i * 5 + 4],
      b = outer[next * 5];
    const left = outer[i * 5 + 3],
      right = outer[next * 5 + 1];
    const batteries: Point[] = [];
    if (!missingBastions.has(i)) batteries.push([(a[0] + left[0]) / 2, (a[1] + left[1]) / 2]);
    if (!missingBastions.has(next)) batteries.push([(b[0] + right[0]) / 2, (b[1] + right[1]) / 2]);
    if (!batteries.length) return Infinity;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      maximum = Math.max(maximum, ...batteries.map(q => Math.hypot(p[0] - q[0], p[1] - q[1])));
    }
  }
  return maximum;
}

export function bastionDepth(outer: Point[], i: number): number {
  return nearestOnPolyline(outer[i * 5 + 2], [outer[i * 5], outer[i * 5 + 4]]).dist;
}
