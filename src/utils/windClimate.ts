import { pow } from "../simulation/deterministicMath";
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

// ---------------------------------------------------------------------------------------------
// W2: monsoon (§5.3), diurnal cycle (§5.5) and daily aggregates.
// ---------------------------------------------------------------------------------------------

/** §5.3: smoothing radius of the seasonal land–sea temperature contrast. */
export const MONSOON_BLUR_RADIUS_KM = 800;
/**
 * §5.3 k_mon: m/s of monsoon wind per °C/km of smoothed seasonal-temperature gradient.
 * Set from measurement, not estimate: on a 3000 km subtropical continent (28°N, 40 km cells) the
 * smoothed gradient at the east coast is ~0.001 °C/km, and 6000 turns that into ~6 m/s, the
 * East-Asian monsoon order of magnitude. Still to be compared with ERA5 (§7).
 */
export const MONSOON_COEFFICIENT = 6000;
export const MONSOON_MAX_SPEED = 9;

/** §5.3 w_sub(φ): strongest over ~10–35° latitude, fading to 0 at the equator and by ~55°. */
export function getMonsoonLatitudeWeight(latitudeDeg: number): number {
  const lat = Math.abs(latitudeDeg);
  return smoothstep((lat - 2) / 8) * (1 - smoothstep((lat - 35) / 20));
}

/** §5.3 α(φ): Coriolis turning, 0 at the equator and ~30° by mid-latitudes. */
export function getCoriolisTurnDeg(latitudeDeg: number): number {
  return 30 * Math.min(1, Math.abs(latitudeDeg) / 30);
}

/**
 * Turns the down-gradient flow: clockwise (to the right) in the northern hemisphere,
 * counter-clockwise in the southern one.
 */
export function rotateForCoriolis(u: number, v: number, latitudeDeg: number): WindVector {
  const angle = ((getCoriolisTurnDeg(latitudeDeg) * Math.PI) / 180) * (latitudeDeg >= 0 ? 1 : -1);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Clockwise rotation of a (east, north) vector by `angle`.
  return { u: u * c + v * s, v: -u * s + v * c };
}

/**
 * Monsoon vector from the gradient (°C/km, east / north) of the smoothed seasonal temperature
 * anomaly. Air flows toward warm (low-pressure) ground, then turns with Coriolis.
 * `confidence` (0–1) is reduced near regional-map edges where unseen land/sea is unknown.
 */
export function getMonsoonVector(
  gradientEast: number,
  gradientNorth: number,
  latitudeDeg: number,
  confidence = 1
): WindVector {
  const weight = MONSOON_COEFFICIENT * getMonsoonLatitudeWeight(latitudeDeg) * Math.min(1, Math.max(0, confidence));
  let u = gradientEast * weight;
  let v = gradientNorth * weight;
  const speed = Math.hypot(u, v);
  if (speed > MONSOON_MAX_SPEED) {
    u *= MONSOON_MAX_SPEED / speed;
    v *= MONSOON_MAX_SPEED / speed;
  }
  return rotateForCoriolis(u, v, latitudeDeg);
}

/** §5.5 per-cell, per-month diurnal parameters. Directions are bearings (0 = north, clockwise). */
export interface DiurnalWindParameters {
  /** Fractional daytime mixing boost of the mean wind (peak ~14:00). */
  readonly mixAmp: number;
  /** Afternoon sea-breeze speed (m/s); the night land breeze is 0.4 of it, reversed. */
  readonly breezeAmp: number;
  /** Bearing from sea toward land (where the sea breeze blows to). */
  readonly breezeDirDeg: number;
  /** Daytime upslope speed (m/s); the night downslope wind uses `slopeNightFactor`. */
  readonly slopeAmp: number;
  /** Bearing pointing uphill. */
  readonly upslopeDirDeg: number;
  /** Night drainage wind relative to the day upslope (≥1 in winter on high ground). */
  readonly slopeNightFactor: number;
}

export const SEA_BREEZE_PEAK_SPEED = 3.5;
export const SEA_BREEZE_DECAY_KM = 20;
export const SEA_BREEZE_REACH_KM = 40;
export const LAND_BREEZE_RATIO = 0.4;
export const MIX_AMP_OCEAN = 0.05;
export const SLOPE_WIND_MIN_RELIEF_M = 500;
export const SLOPE_WIND_PEAK_SPEED = 2.5;

/**
 * Land mixing amplitude, 0.2–0.5: larger in summer, in dry climates and at low latitude (§5.5).
 * `summer` and `dryness` are 0–1.
 */
export function getMixingAmplitude(isLand: boolean, summer: number, dryness: number, latitudeDeg: number): number {
  if (!isLand) return MIX_AMP_OCEAN;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const lowLatitude = 1 - Math.min(1, Math.abs(latitudeDeg) / 70);
  return 0.2 + 0.3 * (0.4 * clamp01(summer) + 0.3 * clamp01(dryness) + 0.3 * lowLatitude);
}

/**
 * Sea-breeze amplitude at `coastDistanceKm` inland: e^(−d/20 km) within ~40 km, stronger in
 * summer (0.6–1.4), and suppressed by a strong synoptic wind (×max(0, 1 − V̄/8)).
 */
export function getSeaBreezeAmplitude(coastDistanceKm: number, summer: number, meanSpeed: number): number {
  if (!(coastDistanceKm >= 0) || coastDistanceKm > SEA_BREEZE_REACH_KM * 1.5) return 0;
  const season = 0.6 + 0.8 * Math.min(1, Math.max(0, summer));
  return (
    SEA_BREEZE_PEAK_SPEED * Math.exp(-coastDistanceKm / SEA_BREEZE_DECAY_KM) * season * Math.max(0, 1 - meanSpeed / 8)
  );
}

/** Valley/mountain wind amplitude from local relief (m) and how one-sided the slope is (0–1). */
export function getSlopeWindAmplitude(reliefM: number, dominance: number): number {
  if (!(reliefM >= SLOPE_WIND_MIN_RELIEF_M)) return 0;
  return (
    SLOPE_WIND_PEAK_SPEED *
    Math.min(1, (reliefM - SLOPE_WIND_MIN_RELIEF_M) / 1500) *
    Math.min(1, Math.max(0, dominance))
  );
}

function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** Half-sine bump on [start, end) (hours, may wrap past midnight) peaking at `peak`. */
function bump(hour: number, start: number, peak: number, end: number): number {
  const span = (a: number, b: number) => wrapHour(b - a);
  const t = span(start, hour);
  const total = span(start, end);
  if (t >= total) return 0;
  const rise = span(start, peak);
  return rise > 0 && t <= rise
    ? Math.sin((Math.PI / 2) * (t / rise))
    : Math.cos((Math.PI / 2) * ((t - rise) / (total - rise)));
}

/** Signed sea-breeze factor: +1 at the ~14:30 sea-breeze peak, −0.4 at the ~05:00 land-breeze peak. */
export function getSeaBreezeShape(hour: number): number {
  const h = wrapHour(hour);
  return bump(h, 9, 14.5, 20) - LAND_BREEZE_RATIO * bump(h, 20, 5, 9);
}

/** Signed slope-wind factor: +1 upslope at ~13:00, −nightFactor downslope at ~04:00. */
export function getSlopeWindShape(hour: number, nightFactor = 1): number {
  const h = wrapHour(hour);
  return bump(h, 8, 13, 18.5) - nightFactor * bump(h, 18.5, 4, 8);
}

/** Mixing shape: zero daily mean, peak at 14:00, minimum before dawn (§5.5; test 14). */
export function getMixingShape(hour: number): number {
  return Math.cos((2 * Math.PI * (hour - 14)) / 24);
}

/** wind(cell, m, h) of §5.5 from the monthly mean vector and that month's diurnal parameters. */
export function getHourlyWindVector(mean: WindVector, p: DiurnalWindParameters, hour: number): WindVector {
  const mix = 1 + p.mixAmp * getMixingShape(hour);
  const breeze = windTowardToVector(p.breezeDirDeg, p.breezeAmp * getSeaBreezeShape(hour));
  const slope = windTowardToVector(p.upslopeDirDeg, p.slopeAmp * getSlopeWindShape(hour, p.slopeNightFactor));
  return { u: mean.u * mix + breeze.u + slope.u, v: mean.v * mix + breeze.v + slope.v };
}

/** Weibull shape for the within-hour speed distribution (§5.1: fixed at 2 in v1). */
export const WIND_WEIBULL_K = 2;
const GAMMA_1_PLUS_HALF = 0.886226925452758; // Γ(1 + 1/2)
export const WIND_CALM_SPEED = 0.5;
/** Typical post-medieval windmill working range (m/s). */
export const WINDMILL_MIN_SPEED = 4;
export const WINDMILL_MAX_SPEED = 12;

/** P(speed < x) for a Weibull(k = 2) with the given mean speed. */
export function getWeibullCdf(x: number, meanSpeed: number): number {
  if (!(meanSpeed > 0)) return 1;
  const scale = meanSpeed / GAMMA_1_PLUS_HALF;
  return 1 - Math.exp(-pow(Math.max(0, x) / scale, WIND_WEIBULL_K));
}

export interface DailyWindStats {
  /** Mean of the 24 hourly mean speeds (m/s). */
  readonly meanSpeed: number;
  /** Highest hourly mean speed (m/s) and its hour. */
  readonly maxSpeed: number;
  readonly maxHour: number;
  /** Expected share of the day below WIND_CALM_SPEED, Weibull-distributed around each hourly mean. */
  readonly calmFraction: number;
  /** Expected share of the day inside the windmill working range. */
  readonly windmillFraction: number;
}

export function getDailyWindStatsFromParameters(mean: WindVector, p: DiurnalWindParameters): DailyWindStats {
  let sum = 0;
  let maxSpeed = -1;
  let maxHour = 0;
  let calm = 0;
  let mill = 0;
  for (let hour = 0; hour < 24; hour++) {
    const w = getHourlyWindVector(mean, p, hour + 0.5);
    const speed = Math.hypot(w.u, w.v);
    sum += speed;
    if (speed > maxSpeed) {
      maxSpeed = speed;
      maxHour = hour;
    }
    calm += getWeibullCdf(WIND_CALM_SPEED, speed);
    mill += getWeibullCdf(WINDMILL_MAX_SPEED, speed) - getWeibullCdf(WINDMILL_MIN_SPEED, speed);
  }
  return { meanSpeed: sum / 24, maxSpeed, maxHour, calmFraction: calm / 24, windmillFraction: mill / 24 };
}
