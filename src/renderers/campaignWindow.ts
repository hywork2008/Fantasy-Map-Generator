import { mapUnitMeters } from "../utils/mapUnitMeters";

/**
 * Flat-ground foot pace. Must stay equal to `FOOT_SPEED_KM_PER_DAY` in
 * `src/generators/regimentMovement.ts`. The campaign view sizes itself from this
 * pace so a week of marching stays inside the window on every map scale.
 */
export const CAMPAIGN_FOOT_KM_PER_DAY = 28;

/** Days of foot march from the window centre to its edge. */
export const CAMPAIGN_FOOT_DAYS = 7;

export interface CampaignWindowInput {
  centerX: number;
  centerY: number;
  graphWidth: number;
  graphHeight: number;
  /** Kilometres per map pixel. Use `kmPerMapPixel(distanceScale, distanceUnit)`. */
  kmPerPx: number;
  /** Pack/grid point spacing in map pixels. Typical neighbour distance. */
  spacingPx: number;
  footDays?: number;
  footKmPerDay?: number;
}

/** Map-pixel rectangle covering one week of foot march around a battle. */
export interface CampaignWindowBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Nominal side in kilometres, before the rectangle is clipped to the graph. */
  sideKm: number;
  /** Nominal side divided by point spacing. Does not shrink when the rectangle is clipped. */
  cellsAlongSide: number;
}

/** Kilometres per map pixel for the active distance unit. */
export function kmPerMapPixel(distanceScale: number, distanceUnit = "km"): number {
  return mapUnitMeters(distanceScale, distanceUnit) / 1000;
}

/** Map pixels across one campaign window. Two forces this far apart both fit when the camera sits on their midpoint. */
export function campaignSidePx(
  kmPerPx: number,
  footDays = CAMPAIGN_FOOT_DAYS,
  footKmPerDay = CAMPAIGN_FOOT_KM_PER_DAY
): number {
  const kmPerPxSafe = Number.isFinite(kmPerPx) ? kmPerPx : 0;
  if (kmPerPxSafe <= 0) return 0;
  const days = Number.isFinite(footDays) ? Math.max(0, footDays) : CAMPAIGN_FOOT_DAYS;
  const pace = Number.isFinite(footKmPerDay) ? Math.max(0, footKmPerDay) : CAMPAIGN_FOOT_KM_PER_DAY;
  return (days * pace * 2) / kmPerPxSafe;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Square around `center` whose edge is `footDays` of flat foot march away.
 * The rectangle is clipped to the graph. Cell count follows kilometres, so a
 * fine Earth template and a large fantasy world share one physical window.
 */
export function campaignWindow(input: CampaignWindowInput): CampaignWindowBox {
  const footDays = Math.max(0, finite(input.footDays ?? CAMPAIGN_FOOT_DAYS));
  const footKmPerDay = Math.max(0, finite(input.footKmPerDay ?? CAMPAIGN_FOOT_KM_PER_DAY));
  const halfKm = footDays * footKmPerDay;
  const sideKm = halfKm * 2;
  const kmPerPx = finite(input.kmPerPx);
  const halfPx = kmPerPx > 0 ? halfKm / kmPerPx : 0;
  const graphWidth = Math.max(0, finite(input.graphWidth));
  const graphHeight = Math.max(0, finite(input.graphHeight));
  const centerX = Math.min(graphWidth, Math.max(0, finite(input.centerX)));
  const centerY = Math.min(graphHeight, Math.max(0, finite(input.centerY)));
  const spacingPx = finite(input.spacingPx);

  return {
    minX: Math.max(0, centerX - halfPx),
    minY: Math.max(0, centerY - halfPx),
    maxX: Math.min(graphWidth, centerX + halfPx),
    maxY: Math.min(graphHeight, centerY + halfPx),
    sideKm,
    cellsAlongSide: spacingPx > 0 && kmPerPx > 0 ? sideKm / kmPerPx / spacingPx : 0
  };
}
