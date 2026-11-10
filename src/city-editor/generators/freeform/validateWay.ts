import {
  type BridgeStructure,
  bridgeSkewDegrees,
  resolveBridgeSkewLimit,
  withinBridgeSkewLimit
} from "../../../utils/bridgeSkewPolicy";
import type { CityDocument, Point } from "../../types/document";
import type { FreeformWay, TerrainRiverCorridor } from "../../types/terrain";
import { pointInPolygon, segmentSegmentHit } from "../geom";
import { cityTerrain } from "../terrainElevation";
import { terrainFieldForDocument } from "../terrainField/build";
import { gradeLimitOf, planSlopeWay } from "./slopeWay";
import { planSteppedWay, type SteppedProfile } from "./steppedWay";
import { distanceToSegment, polylineLength, wayCoversRing } from "./wayGeometry";

export type WayReject = "short" | "skew" | "bend" | "overlap" | "grade" | "field";

export interface WayDraft {
  id: string;
  centerline: Point[];
  widthMeters: number;
  profile: FreeformWay["profile"];
  surface: FreeformWay["surface"];
  grade?: FreeformWay["grade"];
}

export interface WayPreview {
  ok: boolean;
  reason?: WayReject;
  /** Worst crossing, when the way meets a river. */
  skewDegrees?: number;
  limitDegrees?: number;
  stepped?: SteppedProfile;
  /** Absolute graded heights at the drafted vertices of a slope way. */
  elevations?: number[];
  gradeLimit: number;
}

const WATER_INSET_METERS = 0.2;

/** Documents are replaced on commit, so a height sample stays valid for one document object. */
const absoluteHeight = new WeakMap<CityDocument, (point: Point) => number>();

function heightAt(document: CityDocument): (point: Point) => number {
  const cached = absoluteHeight.get(document);
  if (cached) return cached;
  const terrain = cityTerrain(document);
  const sample = (point: Point) => terrain.heightAt(point) + terrain.datumMeters;
  absoluteHeight.set(document, sample);
  return sample;
}

export function previewWay(document: CityDocument, draft: WayDraft): WayPreview {
  const gradeLimit = gradeLimitOf(draft.grade);
  const fail = (reason: WayReject, extra: Partial<WayPreview> = {}): WayPreview => ({
    ok: false,
    reason,
    gradeLimit,
    ...extra
  });
  if (!document.terrain?.field || !terrainFieldForDocument(document)) return fail("field");
  if (draft.centerline.length < 2 || !(draft.widthMeters > 0)) return fail("short");
  const length = polylineLength(draft.centerline);
  if (length < 1) return fail("short");
  if (draft.profile === "stepped" && length < 3 - 1e-6) return fail("short");

  const crossing = riverCrossing(document, draft);
  if (crossing.reason) return fail(crossing.reason, crossing);

  if (overlapsPlot(document, draft)) return fail("overlap", crossing);

  const sample = heightAt(document);
  if (draft.profile === "slope") {
    const elevations = planSlopeWay(draft.centerline, draft.widthMeters, gradeLimit, sample);
    return { ok: true, ...crossing, elevations, gradeLimit };
  }
  const stepped = planSteppedWay({
    centerline: draft.centerline,
    heightAt: sample,
    pinStart: padLevelAt(document, draft.centerline[0]),
    pinEnd: padLevelAt(document, draft.centerline[draft.centerline.length - 1])
  });
  if (!stepped) return fail("grade", crossing);
  return { ok: true, ...crossing, stepped, gradeLimit };
}

export function wayCoversPolygon(document: CityDocument, polygon: readonly Point[]): boolean {
  return (document.terrain?.ways ?? []).some(way => wayCoversRing(way.centerline, way.widthMeters, polygon));
}

function overlapsPlot(document: CityDocument, draft: WayDraft): boolean {
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "platform" || feature.role !== "pad" || feature.summit.kind !== "polygon") continue;
    if (wayCoversRing(draft.centerline, draft.widthMeters, feature.summit.points)) return true;
  }
  return false;
}

function padLevelAt(document: CityDocument, point: Point): number | undefined {
  for (let i = (document.terrain?.features.length ?? 0) - 1; i >= 0; i--) {
    const feature = document.terrain?.features[i];
    if (!feature) continue;
    if (feature.kind !== "platform" || feature.role !== "pad" || feature.summit.kind !== "polygon") continue;
    if (pointInPolygon(point, feature.summit.points)) return feature.levelMeters;
  }
  return undefined;
}

export function riverCrossing(
  document: CityDocument,
  draft: WayDraft
): { reason?: "skew" | "bend"; skewDegrees?: number; limitDegrees?: number } {
  const corridors = (document.terrain?.features ?? []).filter(
    (feature): feature is TerrainRiverCorridor => feature.kind === "riverCorridor"
  );
  if (!corridors.length) return {};
  const structure: BridgeStructure = draft.surface === "dirt" ? "timber" : "stone";
  const limit = resolveBridgeSkewLimit(
    document.historicalPeriod,
    { maxBridgeSkewDegrees: document.maxBridgeSkewDegrees },
    structure
  );
  let worst = 0;
  let crossed = false;
  for (const corridor of corridors) {
    for (const point of draft.centerline)
      if (insideChannel(point, corridor))
        return { reason: "bend", limitDegrees: limit, skewDegrees: worst || undefined };
    for (let i = 1; i < draft.centerline.length; i++) {
      const a = draft.centerline[i - 1];
      const b = draft.centerline[i];
      for (let k = 1; k < corridor.centerline.length; k++) {
        const c = corridor.centerline[k - 1];
        const d = corridor.centerline[k];
        const hit = segmentSegmentHit(a, b, c, d);
        if (!hit || hit.t <= 1e-4 || hit.t >= 1 - 1e-4) continue;
        const skew = bridgeSkewDegrees([b[0] - a[0], b[1] - a[1]], [d[0] - c[0], d[1] - c[1]]);
        worst = Math.max(worst, skew);
        crossed = true;
        if (!withinBridgeSkewLimit(skew, limit)) return { reason: "skew", skewDegrees: skew, limitDegrees: limit };
      }
    }
  }
  return crossed ? { skewDegrees: worst, limitDegrees: limit } : {};
}

function insideChannel(point: Point, corridor: TerrainRiverCorridor): boolean {
  for (let i = 1; i < corridor.centerline.length; i++) {
    const half = Math.max(corridor.widthsMeters[i - 1] ?? 0, corridor.widthsMeters[i] ?? 0) / 2;
    const { distance, t } = distanceToSegment(point, corridor.centerline[i - 1], corridor.centerline[i]);
    if (t > 0 && t < 1 && distance < half - WATER_INSET_METERS) return true;
    if ((t === 0 || t === 1) && distance < half - WATER_INSET_METERS) return true;
  }
  return false;
}
