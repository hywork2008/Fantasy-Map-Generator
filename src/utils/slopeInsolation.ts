/**
 * Slope/aspect insolation and its near-surface air-temperature effect
 * (docs/plan/wind-aspect-climate-variability.md §3).
 *
 * Clear-sky daily-mean shortwave on an inclined plane vs. the horizontal, integrated over the
 * hour angle. Hemisphere handling is implicit: a pole-facing slope behaves like a flat surface
 * at a more poleward latitude, so north faces cool in the north and south faces in the south,
 * and the tropics' seasonal sun-side switch falls out of the same geometry.
 *
 * The temperature offset is linear in the absorbed-radiation difference (W/m²), with the same
 * coefficient for sun-facing and shaded slopes: both effects are physical, and their asymmetry
 * comes from the geometry (shade dominates in winter, sun-side gains are small in summer).
 *
 * Leaf module: no imports from context/, generators/ or extensions/.
 */

import { EARTH_AXIAL_TILT_DEG } from "../data/earthConfig";
import { getDaysInMonth } from "./seasonUtils";

const SOLAR_CONSTANT_WM2 = 1361;
/** Clear-sky direct-beam and isotropic-diffuse transmittances. Uncalibrated starting values. */
const BEAM_TRANSMITTANCE = 0.6;
const DIFFUSE_TRANSMITTANCE = 0.15;
/** Hour-angle integration steps per day. */
const STEPS = 48;
/**
 * °C of 2 m air-temperature change per W/m² of daily-mean shortwave difference. 0.02 gives
 * roughly −1.6 °C on a 25° north face and +2 °C on a south face at 46°N in January, inside the
 * 1–3 °C north/south contrasts reported for Alpine slopes. Uncalibrated.
 */
export const SLOPE_TEMPERATURE_PER_WM2 = 0.02;
export const MAX_SLOPE_TEMPERATURE_OFFSET_C = 4;

const RAD = Math.PI / 180;

/** Daily-mean clear-sky shortwave (W/m²) on a plane of `slopeDeg` facing `aspectDeg` (0 = north, clockwise). */
export function getDailyClearSkyInsolationWm2(
  latitudeDeg: number,
  slopeDeg: number,
  aspectDeg: number,
  declinationDeg: number
): number {
  const phi = latitudeDeg * RAD;
  const delta = declinationDeg * RAD;
  const beta = slopeDeg * RAD;
  const aspect = aspectDeg * RAD;
  // Slope normal in local east/north/up.
  const nE = Math.sin(beta) * Math.sin(aspect);
  const nN = Math.sin(beta) * Math.cos(aspect);
  const nU = Math.cos(beta);
  const skyView = (1 + Math.cos(beta)) / 2;
  let sum = 0;
  for (let step = 0; step < STEPS; step++) {
    const omega = ((step + 0.5) / STEPS) * 2 * Math.PI - Math.PI;
    const sE = -Math.cos(delta) * Math.sin(omega);
    const sN = Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(omega);
    const sU = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(omega);
    if (sU <= 0) continue;
    const incidence = sE * nE + sN * nN + sU * nU;
    sum += BEAM_TRANSMITTANCE * Math.max(0, incidence) + DIFFUSE_TRANSMITTANCE * sU * skyView;
  }
  return (SOLAR_CONSTANT_WM2 * sum) / STEPS;
}

/** Approximate solar declination at a mid-month day (non-leap calendar). */
function getMidMonthDeclinationDeg(month: number, axialTiltDeg: number): number {
  let dayOfYear = 0;
  for (let m = 1; m < month; m++) dayOfYear += getDaysInMonth(2001, m);
  dayOfYear += getDaysInMonth(2001, month) / 2;
  return -axialTiltDeg * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
}

/**
 * Monthly (index 0 = January) air-temperature offsets in °C for a slope relative to flat ground
 * at the same latitude and elevation. Zero for flat ground and in polar-night months.
 */
export function getMonthlySlopeTemperatureOffsetsC(
  latitudeDeg: number,
  slopeDeg: number,
  aspectDeg: number,
  axialTiltDeg: number = EARTH_AXIAL_TILT_DEG
): Float64Array {
  const offsets = new Float64Array(12);
  if (!(slopeDeg > 0) || !Number.isFinite(latitudeDeg) || !Number.isFinite(aspectDeg)) return offsets;
  const tilt = Number.isFinite(axialTiltDeg) ? axialTiltDeg : EARTH_AXIAL_TILT_DEG;
  for (let month = 1; month <= 12; month++) {
    const declination = getMidMonthDeclinationDeg(month, tilt);
    const flat = getDailyClearSkyInsolationWm2(latitudeDeg, 0, 0, declination);
    if (flat <= 0) continue;
    const slope = getDailyClearSkyInsolationWm2(latitudeDeg, slopeDeg, aspectDeg, declination);
    const offset = (slope - flat) * SLOPE_TEMPERATURE_PER_WM2;
    offsets[month - 1] = Math.max(-MAX_SLOPE_TEMPERATURE_OFFSET_C, Math.min(MAX_SLOPE_TEMPERATURE_OFFSET_C, offset));
  }
  return offsets;
}

/** Day-weighted annual mean of monthly offsets (non-leap calendar). */
export function getAnnualMeanOfMonthlyC(monthly: ArrayLike<number>): number {
  let sum = 0;
  for (let m = 0; m < 12; m++) sum += monthly[m] * getDaysInMonth(2001, m + 1);
  return sum / 365;
}
