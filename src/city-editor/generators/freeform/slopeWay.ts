import type { RoadRibbon } from "../../../utils/roadSurface";
import type { Point } from "../../types/primitives";
import type { FreeformWay } from "../../types/terrain";
import { gradeRoads } from "../roadGrading";

/** Loaded carts. A castle approach is gentler. */
export const CART_GRADE = 0.1;
export const APPROACH_GRADE = 0.08;

export function gradeLimitOf(grade: FreeformWay["grade"]): number {
  return grade === "approach" ? APPROACH_GRADE : CART_GRADE;
}

export function waySurface(surface: FreeformWay["surface"]): RoadRibbon["surface"] {
  if (surface === "paved") return "flags";
  if (surface === "cobble") return "setts";
  return "earth";
}

/** Longitudinal profile from the existing road grader, clamped to the grade limit. */
export function planSlopeWay(
  centerline: readonly Point[],
  widthMeters: number,
  limit: number,
  heightAt: (point: Point) => number
): number[] {
  const grading = gradeRoads(
    [{ centerline, widthMeters, surface: "earth", gradeClass: "cart", maxGrade: limit }],
    heightAt,
    () => null
  );
  return centerline.map(point => grading.apply(point, heightAt(point)));
}

/** Steepest rise/run along a graded centre line. */
export function maxGrade(centerline: readonly Point[], elevations: readonly number[]): number {
  let grade = 0;
  for (let i = 1; i < centerline.length && i < elevations.length; i++) {
    const run = Math.hypot(centerline[i][0] - centerline[i - 1][0], centerline[i][1] - centerline[i - 1][1]);
    if (run < 1e-6) continue;
    grade = Math.max(grade, Math.abs(elevations[i] - elevations[i - 1]) / run);
  }
  return grade;
}
