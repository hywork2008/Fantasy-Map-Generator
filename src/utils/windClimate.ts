/**
 * Climatological zonal wind (docs/plan/wind-aspect-climate-variability.md §5.1–5.2, stage W1).
 *
 * Pure functions only: no context, generator or extension imports (same rule as seasonUtils.ts).
 *
 * Direction conventions — keep every conversion in this file:
 * - `options.winds[tier]` is the bearing the wind blows TOWARD (0 = north, clockwise), as the
 *   precipitation model and ocean currents read it.
 * - Vectors (u, v) are m/s with east and north positive.
 * - UI text uses the meteorological convention: the bearing the wind blows FROM.
 *
 * All coefficients are uncalibrated initial candidates (§7: compare against ERA5 zonal means).
 */

/** Band boundaries matching precipitationModel's `floor(|lat - 89| / 30)` tiers. */
export const WIND_BAND_BOUNDARIES_DEG = [60, 30, 0, -30, -60] as const;
/** Half-width of the vector blend around each boundary (§5.2). */
export const WIND_BOUNDARY_BLEND_DEG = 6;
/** Calm-belt speed (doldrums / horse latitudes) reached at the boundary centre (§5.2: 2–3 m/s). */
export const WIND_CALM_BELT_SPEED = 2.5;
/** Seasonal belt migration: open ocean vs a fully continental neighbourhood (§5.2). */
export const WIND_BELT_SHIFT_OCEAN_DEG = 5;
export const WIND_BELT_SHIFT_LAND_DEG = 12;
/** Mid/high-latitude winter strengthening amplitude (§5.2: ±25%). */
export const WIND_SEASONAL_STRENGTH_AMPLITUDE = 0.25;
const EARTH_TILT_DEG = 23.5;
/** Day of year (0-based) when the belts reach their northernmost position: solstice + ~1 month lag. */
const BELT_PEAK_DAY = 171 + 30;

export interface WindVector {
  readonly u: number;
  readonly v: number;
}

/** `towardDeg` follows options.winds: the bearing the air moves to. */
export function windTowardToVector(towardDeg: number, speed: number): WindVector {
  const rad = (towardDeg * Math.PI) / 180;
  return { u: speed * Math.sin(rad), v: speed * Math.cos(rad) };
}

export function windSpeed(u: number, v: number): number {
  return Math.hypot(u, v);
}

/** Bearing the wind blows TOWARD, [0, 360). */
export function windVectorToTowardDeg(u: number, v: number): number {
  return ((((Math.atan2(u, v) * 180) / Math.PI) % 360) + 360) % 360;
}

/** Meteorological direction: the bearing the wind blows FROM, [0, 360). */
export function windVectorToFromDeg(u: number, v: number): number {
  return (windVectorToTowardDeg(u, v) + 180) % 360;
}

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass8 = (typeof COMPASS_8)[number];
export function bearingToCompass8(bearingDeg: number): Compass8 {
  return COMPASS_8[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];
}

/** Beaufort force from 10 m wind speed in m/s (WMO lower bounds). */
const BEAUFORT_LIMITS = [0.5, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
export function getBeaufortForce(speed: number): number {
  let force = 0;
  while (force < BEAUFORT_LIMITS.length && speed >= BEAUFORT_LIMITS[force]) force++;
  return force;
}

/** Tier index exactly as precipitationModel computes it. */
export function getWindTier(latitudeDeg: number): number {
  return Math.min(5, Math.max(0, Math.floor(Math.abs(latitudeDeg - 89) / 30)));
}

/** Open-ocean reference speed of a tier at a latitude (§5.2). */
export function getBandBaseSpeed(tier: number, latitudeDeg: number): number {
  switch (tier) {
    case 0:
    case 5:
      return 5; // polar easterlies
    case 1:
      return 8; // northern westerlies
    case 2:
    case 3:
      return 6.5; // trades
    default: {
      // Southern westerlies: 8 m/s near 30°S rising to 10 m/s over 40–60°S (roaring forties).
      const t = Math.min(1, Math.max(0, (-latitudeDeg - 30) / 10));
      return 8 + 2 * t;
    }
  }
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function bandVector(winds: ArrayLike<number>, tier: number, latitudeDeg: number): WindVector {
  return windTowardToVector(winds[tier] ?? 0, getBandBaseSpeed(tier, latitudeDeg));
}

/**
 * Band wind at an (already season-shifted) latitude: the tier's configured direction, blended
 * linearly with the neighbouring tier within ±WIND_BOUNDARY_BLEND_DEG, and slowed toward the calm
 * belt at the boundary centre. Opposed bands cancel naturally in the blend.
 */
export function getBandWindVector(winds: ArrayLike<number>, latitudeDeg: number): WindVector {
  const lat = Math.min(90, Math.max(-90, latitudeDeg));
  let nearest: number = WIND_BAND_BOUNDARIES_DEG[0];
  for (const boundary of WIND_BAND_BOUNDARIES_DEG)
    if (Math.abs(lat - boundary) < Math.abs(lat - nearest)) nearest = boundary;
  const offset = lat - nearest;
  const tier = getWindTier(lat);
  if (Math.abs(offset) >= WIND_BOUNDARY_BLEND_DEG) return bandVector(winds, tier, lat);
  const northTier = getWindTier(nearest + 1);
  const southTier = getWindTier(nearest - 1);
  const north = bandVector(winds, northTier, lat);
  const south = bandVector(winds, southTier, lat);
  // weight of the northern band: 0.5 at the boundary, 1 at +blend
  const w = 0.5 + offset / (2 * WIND_BOUNDARY_BLEND_DEG);
  const u = north.u * w + south.u * (1 - w);
  const v = north.v * w + south.v * (1 - w);
  const speed = windSpeed(u, v);
  const centre = 1 - smoothstep(Math.abs(offset) / WIND_BOUNDARY_BLEND_DEG);
  const target = speed * (1 - centre) + Math.min(speed, WIND_CALM_BELT_SPEED) * centre;
  if (speed <= 1e-9) return { u: 0, v: 0 };
  return { u: (u * target) / speed, v: (v * target) / speed };
}

/**
 * Northward belt displacement (degrees) for a day of year. The whole system follows the sun, so
 * it is the same sign in both hemispheres — which is opposite seasonal phase in local terms.
 * `landFraction` (0–1) is the share of land around the cell (§5.2: ~1500 km box).
 */
export function getBeltShiftDeg(dayOfYear: number, daysInYear: number, landFraction: number, axialTiltDeg: number) {
  const tiltRatio = Math.sin((Math.abs(axialTiltDeg) * Math.PI) / 180) / Math.sin((EARTH_TILT_DEG * Math.PI) / 180);
  const land = Math.min(1, Math.max(0, landFraction));
  const amplitude = WIND_BELT_SHIFT_OCEAN_DEG + (WIND_BELT_SHIFT_LAND_DEG - WIND_BELT_SHIFT_OCEAN_DEG) * land;
  return amplitude * tiltRatio * Math.cos((2 * Math.PI * (dayOfYear - BELT_PEAK_DAY)) / daysInYear);
}

/**
 * Mid/high-latitude winter strengthening factor (1 ± 25%), faded in over 25–40° latitude.
 * Winter is when the local hemisphere's belts are farthest equatorward.
 */
export function getSeasonalStrengthFactor(dayOfYear: number, daysInYear: number, latitudeDeg: number): number {
  const weight = smoothstep((Math.abs(latitudeDeg) - 25) / 15);
  const summer = Math.cos((2 * Math.PI * (dayOfYear - BELT_PEAK_DAY)) / daysInYear) * (latitudeDeg >= 0 ? 1 : -1);
  return 1 - WIND_SEASONAL_STRENGTH_AMPLITUDE * weight * summer;
}

/** Open-ocean band wind for a cell on a given day: seasonal shift, blend and strength (§5.2). */
export function getZonalWindVector(
  winds: ArrayLike<number>,
  latitudeDeg: number,
  dayOfYear: number,
  daysInYear: number,
  landFraction: number,
  axialTiltDeg: number
): WindVector {
  const shift = getBeltShiftDeg(dayOfYear, daysInYear, landFraction, axialTiltDeg);
  const base = getBandWindVector(winds, latitudeDeg - shift);
  const factor = getSeasonalStrengthFactor(dayOfYear, daysInYear, latitudeDeg);
  return { u: base.u * factor, v: base.v * factor };
}

/** §5.4 surface roughness multipliers. */
export const WIND_ROUGHNESS_LAND = 0.65;
export const WIND_ROUGHNESS_COAST = 0.85;
/** §5.4 exposure: ×(1 + e·clamp(Δh/1000 m, 0, 2)). */
export const WIND_EXPOSURE_COEFFICIENT = 0.25;
export function getExposureFactor(heightAboveSurroundingsM: number): number {
  return 1 + WIND_EXPOSURE_COEFFICIENT * Math.min(2, Math.max(0, heightAboveSurroundingsM / 1000));
}
/** §5.4 lee shelter. */
export const WIND_LEE_SEARCH_KM = 150;
export const WIND_LEE_OBSTACLE_M = 500;
export const WIND_FOEHN_OBSTACLE_M = 1500;
export const WIND_LEE_FACTOR = 0.6;
