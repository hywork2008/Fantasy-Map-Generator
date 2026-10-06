/** Crop-independent v1 climate math. Coefficients are game approximations, not calibrated observations. */
import { EARTH_AXIAL_TILT_DEG } from "../data/earthConfig";
import { getDayOfYear, getDaysInMonth, isLeapYear } from "./seasonUtils";

export const CLIMATE_MODEL_VERSION = "earthlike-seasonal-v1";
const SEA_AMPLITUDES = [0, 2, 4, 7, 10, 12, 14];
const LAND_AMPLITUDES = [0, 3, 8, 14, 20, 24, 26];

export interface TemperatureCurve {
  readonly annualMeanTemperatureC: number;
  readonly latitudeDeg: number;
  readonly continentality: number;
  readonly axialTiltDeg: number;
  readonly year: number;
}

export function getEarthlikeAmplitude(
  latitudeDeg: number,
  continentality = 0.5,
  axialTiltDeg = EARTH_AXIAL_TILT_DEG
): number {
  const latitude = Math.min(90, Math.abs(Number.isFinite(latitudeDeg) ? latitudeDeg : 0));
  const position = latitude / 15;
  const index = Math.min(5, Math.floor(position));
  const fraction = position - index;
  const sea = SEA_AMPLITUDES[index] + fraction * (SEA_AMPLITUDES[index + 1] - SEA_AMPLITUDES[index]);
  const land = LAND_AMPLITUDES[index] + fraction * (LAND_AMPLITUDES[index + 1] - LAND_AMPLITUDES[index]);
  const c = Math.min(1, Math.max(0, Number.isFinite(continentality) ? continentality : 0.5));
  const tilt = Number.isFinite(axialTiltDeg) ? axialTiltDeg : EARTH_AXIAL_TILT_DEG;
  return (
    ((sea * (1 - c) + land * c) * Math.sin((tilt * Math.PI) / 180)) / Math.sin((EARTH_AXIAL_TILT_DEG * Math.PI) / 180)
  );
}

export function getTemperatureCurveParameters(curve: TemperatureCurve): {
  amplitude: number;
  peakDay: number;
  daysInYear: number;
} {
  const c = Math.min(1, Math.max(0, Number.isFinite(curve.continentality) ? curve.continentality : 0.5));
  return {
    amplitude: getEarthlikeAmplitude(curve.latitudeDeg, c, curve.axialTiltDeg),
    peakDay: getDayOfYear(curve.year, curve.latitudeDeg >= 0 ? 6 : 12, 21) - 1 + c * 20 + (1 - c) * 45,
    daysInYear: isLeapYear(curve.year) ? 366 : 365
  };
}

/** day=0 is January 1 at midnight; accepts days beyond the year for cyclic crop windows. */
export function getDailyMeanTemperatureC(curve: TemperatureCurve, day: number): number {
  const { amplitude, peakDay, daysInYear } = getTemperatureCurveParameters(curve);
  return curve.annualMeanTemperatureC + amplitude * Math.cos((2 * Math.PI * (day - peakDay)) / daysInYear);
}

export function getMonthlyMeanTemperaturesC(curve: TemperatureCurve): Float64Array {
  const { amplitude, peakDay, daysInYear } = getTemperatureCurveParameters(curve);
  const omega = (2 * Math.PI) / daysInYear;
  const offsets = new Float64Array(12);
  let start = 0;
  let weighted = 0;
  for (let month = 0; month < 12; month++) {
    const days = getDaysInMonth(curve.year, month + 1);
    offsets[month] =
      (amplitude * (Math.sin(omega * (start + days - peakDay)) - Math.sin(omega * (start - peakDay)))) / (omega * days);
    weighted += offsets[month] * days;
    start += days;
  }
  const mean = weighted / daysInYear;
  return offsets.map(offset => curve.annualMeanTemperatureC + offset - mean);
}

export function distributeAnnualPrecipitationMm(annualMm: number, year: number): Float64Array {
  const total = Math.max(0, Number.isFinite(annualMm) ? annualMm : 0);
  const days = isLeapYear(year) ? 366 : 365;
  return Float64Array.from({ length: 12 }, (_, month) => (total * getDaysInMonth(year, month + 1)) / days);
}
