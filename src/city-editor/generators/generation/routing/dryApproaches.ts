import type { CityDocument, Point } from "../../../types/document";
import type { CityProgram } from "../../../types/geometry";
import { pointInPolygon } from "../../geom";
import { defaultRoadWidthMeters, townExtentMeters } from "../../settlementExtent";
import { lineHitsDocumentWater } from "../../waterGeometry";
import type { Plan } from "../contracts";

/** Town-side remainder of an approach whose line enters surveyed water. The outer goal is polyline[0]. */
export function dryTownApproachLine(polyline: Point[], wet: (a: Point, b: Point) => boolean): Point[] | null {
  if (polyline.length < 2) return null;
  let cut = 0;
  while (cut < polyline.length - 1 && wet(polyline[cut], polyline[cut + 1])) cut += 1;
  if (cut === 0) {
    let index = polyline.length - 1;
    while (index > 0 && !wet(polyline[index - 1], polyline[index])) index -= 1;
    if (index <= 0) return null;
    const suffix = polyline.slice(index);
    if (suffix.length < 2) return null;
    if (Math.hypot(suffix[0][0] - polyline[0][0], suffix[0][1] - polyline[0][1]) < 1) return null;
    return suffix;
  }
  const rest = polyline.slice(cut);
  if (rest.length >= 2) {
    if (Math.hypot(rest[0][0] - polyline[0][0], rest[0][1] - polyline[0][1]) < 1) return null;
    return rest;
  }
  const inner = polyline[cut];
  const landed = drySideOfWetSegment(polyline[cut - 1], inner, wet);
  if (!landed) return null;
  if (Math.hypot(landed[0] - polyline[0][0], landed[1] - polyline[0][1]) < 1) return null;
  const step = townwardStep(inner, landed);
  if (Math.hypot(step[0] - landed[0], step[1] - landed[1]) < 1 || wet(landed, step)) return null;
  return [landed, step];
}

/** Outermost point on the town side of a wet segment, where the stroke still stays dry. */
export function drySideOfWetSegment(outer: Point, inner: Point, wet: (a: Point, b: Point) => boolean): Point | null {
  if (!wet(outer, inner)) return inner;
  let lo = 0;
  let hi = 1;
  let best: Point | null = null;
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2;
    const mid: Point = [inner[0] + (outer[0] - inner[0]) * t, inner[1] + (outer[1] - inner[1]) * t];
    if (wet(inner, mid)) hi = t;
    else {
      best = mid;
      lo = t;
    }
  }
  return best;
}

export function townwardStep(inner: Point, landed: Point): Point {
  if (Math.hypot(inner[0] - landed[0], inner[1] - landed[1]) >= 1) return inner;
  const length = Math.hypot(inner[0], inner[1]);
  if (length >= 8) return [inner[0] - (inner[0] / length) * 8, inner[1] - (inner[1] / length) * 8];
  return [inner[0] * 0.5, inner[1] * 0.5];
}

export function dryTownApproach(document: CityDocument, polyline: Point[]): Point[] | null {
  if (!document.importedFixedCrossings) return null;
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  return dryTownApproachLine(polyline, (a, b) => lineHitsDocumentWater(document, [a, b], width, false));
}

export function isInteriorRiverLanding(
  plan: Pick<Plan, "importedRoads">,
  program: Pick<CityProgram, "walls">,
  urbanRegions: Point[][],
  roadIndex: number | undefined
): boolean {
  const road = roadIndex === undefined ? undefined : plan.importedRoads?.[roadIndex];
  if (!road?.riverLanding) return false;
  const tip = road.path.at(-1)!;
  return !program.walls || urbanRegions.some(region => pointInPolygon(tip, region));
}
