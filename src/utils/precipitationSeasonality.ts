import { getMonthlyMeanTemperaturesC } from "./earthlikeClimate";
import { getDaysInMonth } from "./seasonUtils";
import { getBeltShiftDeg } from "./windClimate";

export const PRECIPITATION_MODEL_VERSION = "seasonal-precipitation-v1";
export type PrecipitationSeasonalitySource = "modeledSeasonality" | "uniformFallback" | "uniformAssumption";
export interface PrecipitationClimateInput {
  latitudeDeg: number;
  axialTiltDeg: number;
  continentality: number;
  landFraction: number;
  moisture: ArrayLike<number>;
  orographic: ArrayLike<number>;
}
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const gaussian = (v: number, center: number, width: number) => {
  const offset = (v - center) / width;
  return Math.exp(-0.5 * offset * offset);
};

/** Initial game coefficients; structural calibration, not a fitted weather forecast. Year-independent daily rates. */
export function getPrecipitationDailyScores(input: PrecipitationClimateInput): Float64Array {
  const temperatures = getMonthlyMeanTemperaturesC({
    annualMeanTemperatureC: 0,
    latitudeDeg: input.latitudeDeg,
    continentality: input.continentality,
    axialTiltDeg: input.axialTiltDeg,
    year: 1
  });
  const amplitude = Math.max(1, ...Array.from(temperatures, Math.abs));
  const terrainMean = Array.from({ length: 12 }, (_, m) => input.orographic[m]).reduce((a, b) => a + b, 0) / 12;
  let start = 0;
  return Float64Array.from({ length: 12 }, (_, m) => {
    const days = getDaysInMonth(1, m + 1);
    const shift = getBeltShiftDeg(start + days / 2, 365, input.landFraction, input.axialTiltDeg);
    start += days;
    const latitude = Math.abs(input.latitudeDeg - shift);
    const warmth = temperatures[m] / amplitude;
    const convection = gaussian(latitude, 0, 8);
    const fronts = gaussian(latitude, 50, 12) * (0.85 - 0.15 * warmth);
    const subsidence = gaussian(latitude, 28, 7);
    const landConvection = input.continentality * Math.max(0, warmth) * (1 - gaussian(latitude, 0, 15));
    return (
      (0.06 + 2.4 * convection + 1.4 * fronts + 0.8 * landConvection) *
      (0.08 + 0.92 * clamp(input.moisture[m])) *
      Math.exp(-2.4 * subsidence) *
      clamp(input.orographic[m] / terrainMean, 0.5, 2)
    );
  });
}

/** Converts daily rates to monthly water equivalent, with one annual confidence and exact mass correction. */
export function distributeSeasonalPrecipitation(
  annualMm: number,
  year: number,
  scores: ArrayLike<number>,
  confidence: number,
  axialTiltDeg: number
): {
  monthly: Float64Array;
  source: PrecipitationSeasonalitySource;
  confidence: number;
  invalidAnnualPrecipitation: boolean;
} {
  const invalidAnnualPrecipitation = !Number.isFinite(annualMm) || annualMm < 0;
  const annual = invalidAnnualPrecipitation ? 0 : annualMm;
  const days = Array.from({ length: 12 }, (_, m) => getDaysInMonth(year, m + 1));
  const yearDays = days.reduce((a, b) => a + b, 0);
  const valid = scores.length === 12 && Array.from(scores).every(v => Number.isFinite(v) && v >= 0);
  const total = valid ? days.reduce((sum, d, m) => sum + d * scores[m], 0) : 0;
  const usable = valid && total > 0 && Number.isFinite(total);
  const q = usable && Number.isFinite(confidence) && !invalidAnnualPrecipitation ? clamp(confidence) : 0;
  const strength =
    q *
    clamp(
      Math.sin((Math.abs(Number.isFinite(axialTiltDeg) ? axialTiltDeg : 0) * Math.PI) / 180) /
        Math.sin((23.5 * Math.PI) / 180)
    );
  const monthly = Float64Array.from(
    days,
    (d, m) => annual * (strength * (usable ? (d * scores[m]) / total : 0) + ((1 - strength) * d) / yearDays)
  );
  const peak = monthly.indexOf(Math.max(...monthly));
  monthly[peak] += annual - monthly.reduce((sum, v) => sum + v, 0);
  return {
    monthly,
    source: q > 0 ? "modeledSeasonality" : "uniformFallback",
    confidence: q,
    invalidAnnualPrecipitation
  };
}

export interface DrySeasonInput {
  year: number;
  annualPrecipitationMm?: number;
  monthlyPrecipitationMm?: ArrayLike<number>;
  precipitationSeasonalitySource?: PrecipitationSeasonalitySource;
  precipitationSeasonalityConfidence?: number;
}
export interface DrySeasonCandidates {
  status: "unknown" | "seasonal" | "none" | "chronicallyDry";
  /** One-based start month and length, cyclic across December. At most two intervals. */
  intervals: { startMonth: number; length: number }[];
}
export function getDrySeasonCandidates(input: DrySeasonInput): DrySeasonCandidates {
  const p = input.monthlyPrecipitationMm;
  const annual = input.annualPrecipitationMm;
  if (
    input.precipitationSeasonalitySource !== "modeledSeasonality" ||
    !(Number.isFinite(input.precipitationSeasonalityConfidence) && input.precipitationSeasonalityConfidence! >= 0.5) ||
    !p ||
    p.length !== 12 ||
    !Array.from(p).every(v => Number.isFinite(v) && v >= 0) ||
    annual === undefined ||
    !Number.isFinite(annual) ||
    annual < 0
  )
    return { status: "unknown", intervals: [] };
  if (Math.abs(Array.from(p).reduce((a, b) => a + b, 0) - annual) > Math.max(1e-8, annual * 1e-12))
    return { status: "unknown", intervals: [] };
  const days = Array.from({ length: 12 }, (_, m) => getDaysInMonth(input.year, m + 1));
  const mean = annual / days.reduce((a, b) => a + b, 0);
  if (days.every((d, m) => (30 * p[m]) / d < 60)) return { status: "chronicallyDry", intervals: [] };
  const dry = days.map((d, m) => (30 * p[m]) / d < 60 && p[m] / d < 0.5 * mean);
  const intervals: DrySeasonCandidates["intervals"] = [];
  for (let m = 0; m < 12; m++) {
    if (!dry[m] || dry[(m + 11) % 12]) continue;
    let length = 1;
    while (length < 12 && dry[(m + length) % 12]) length++;
    if (length >= 2) intervals.push({ startMonth: m + 1, length });
  }
  intervals.sort((a, b) => b.length - a.length || a.startMonth - b.startMonth);
  return { status: intervals.length ? "seasonal" : "none", intervals: intervals.slice(0, 2) };
}
