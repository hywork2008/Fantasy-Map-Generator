import type { CityDocument } from "../types";
import type { BurgSiteRoadEntry } from "./site/burgSiteDescriptor";

/** Upper half of land routes that carry traffic: a trade ribbon instead of fields. */
export const TRADE_RANK = 0.5;
/** Upper third: the extramural stretch of a `roads` group is widened and drawn as cobbles. */
export const COBBLE_RANK = 0.66;
export const COBBLE_WIDTH_SCALE = 1.6;
/** Public-works paving threshold. A road with this many departures keeps today's 200 m ribbon. */
export const TRADE_REFERENCE_TRAFFIC = 24;
export const TRADE_RIBBON_AT_REFERENCE_METERS = 200;

export interface RoadUse {
  traffic: number;
  trafficRank: number;
  /** FMG group `roads`. Trails stay earth even when they are busy. */
  paved: boolean;
}

export function descriptorRoads(document: CityDocument): BurgSiteRoadEntry[] {
  return document.fabric?.generation?.settings.descriptor?.roads ?? [];
}

/** Absent when this leg has no recorded departures. Index and route must both match. */
export function roadUse(document: CityDocument, sourceIndex: number | undefined, routeId?: number): RoadUse | null {
  if (sourceIndex == null) return null;
  const road = descriptorRoads(document)[sourceIndex];
  if (!road || (routeId != null && road.routeId !== routeId)) return null;
  if (road.traffic == null && road.trafficRank == null) return null;
  return {
    traffic: road.traffic ?? 0,
    trafficRank: road.trafficRank ?? 0,
    paved: road.group === "roads"
  };
}

export function roadTrafficKey(document: CityDocument): string {
  return descriptorRoads(document)
    .map(road => `${road.routeId}:${road.group}:${road.traffic ?? "-"}:${road.trafficRank ?? "-"}`)
    .join(",");
}

/** Ribbon length grows with departures. Quiet roads stay at 60 m; none run past 480 m. */
export function tradeRibbonMeters(traffic: number): number {
  const scaled = (TRADE_RIBBON_AT_REFERENCE_METERS * Math.max(0, traffic)) / TRADE_REFERENCE_TRAFFIC;
  return Math.round(Math.min(480, Math.max(60, scaled)));
}

export function cobbledApproach(use: RoadUse | null): boolean {
  return !!use && use.paved && use.trafficRank >= COBBLE_RANK;
}

export function cobbledWidthMeters(baseMeters: number): number {
  return baseMeters * COBBLE_WIDTH_SCALE;
}
