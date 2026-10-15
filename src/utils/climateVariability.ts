/**
 * Long-period climate variability: Little-Ice-Age-like cold episodes and volcanic cold summers
 * (docs/plan/wind-aspect-climate-variability.md §4).
 *
 * Everything is a pure function of (options, map seed, year). No RNG state is stored, so
 * stepping day by day, fast-forwarding, history mode, reloading or asking about negative years
 * all agree on the same anomaly for the same year.
 *
 * Leaf module: no imports from context/, generators/ or extensions/.
 */

import { getDaysInMonth } from "./seasonUtils";

export type ClimateVariabilityStart = "off" | "fromStart" | "later";
export type ClimateVariabilityMode = "periodic" | "irregular";

export interface ClimateVariabilityOptions {
  /** Generation option: off, a cold episode already under way at the start year, or one arriving later. */
  readonly start: ClimateVariabilityStart;
  readonly mode: ClimateVariabilityMode;
  /** Mean spacing of cold episodes in years. */
  readonly periodYears: number;
  /**
   * Global-mean cooling at the depth of an episode, °C (positive number). The default 0.5 is
   * close to reconstructions of the Little Ice Age; large values (10–25) give a frozen world.
   */
  readonly depthC: number;
  /** Expected large volcanic cold summers per century outside episodes (doubled inside). */
  readonly volcanicPerCentury: number;
  /** Year the map started; `fromStart`/`later` are aligned to it. */
  readonly anchorYear: number;
}

export const DEFAULT_CLIMATE_VARIABILITY: ClimateVariabilityOptions = {
  start: "off",
  mode: "irregular",
  periodYears: 450,
  depthC: 0.5,
  volcanicPerCentury: 0.8,
  anchorYear: 0
};

export const MIN_PERIOD_YEARS = 100;
export const MAX_PERIOD_YEARS = 2000;
export const MAX_DEPTH_C = 30;

/** Fraction of the period spent in a cold episode (periodic mode). */
const COLD_FRACTION = 0.3;
/** Probability that an irregular slot holds an episode. */
const SLOT_OCCUPANCY = 0.7;
const VOLCANIC_DECAY_YEARS = 1;
const VOLCANIC_REACH_YEARS = 3;

/** Clamps saved/edited options into a usable range; missing options mean "off". */
export function normalizeClimateVariability(value: unknown): ClimateVariabilityOptions {
  const v = (value && typeof value === "object" ? value : {}) as Partial<ClimateVariabilityOptions>;
  const finite = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
  return {
    start: v.start === "fromStart" || v.start === "later" ? v.start : "off",
    mode: v.mode === "periodic" ? "periodic" : "irregular",
    periodYears: Math.min(
      MAX_PERIOD_YEARS,
      Math.max(MIN_PERIOD_YEARS, finite(v.periodYears, DEFAULT_CLIMATE_VARIABILITY.periodYears))
    ),
    depthC: Math.min(MAX_DEPTH_C, Math.max(0, finite(v.depthC, DEFAULT_CLIMATE_VARIABILITY.depthC))),
    volcanicPerCentury: Math.min(
      20,
      Math.max(0, finite(v.volcanicPerCentury, DEFAULT_CLIMATE_VARIABILITY.volcanicPerCentury))
    ),
    anchorYear: Math.round(finite(v.anchorYear, 0))
  };
}

/** Deterministic uniform [0,1) from a seed string and integers. */
export function hashUnit(seed: string, a: number, b = 0): number {
  let h = 2166136261 ^ b;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (a | 0), 2246822519);
  h = Math.imul(h ^ Math.floor(a / 4294967296), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 668265263);
  h ^= h >>> 13;
  h = Math.imul(h, 374761393);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

interface Episode {
  start: number;
  duration: number;
  /** 0..1 share of depthC. */
  strength: number;
}

/** Trapezoid with smooth ramps: onset ~25% of the duration, recovery ~30%. */
function episodeShape(year: number, e: Episode): number {
  const t = year - e.start;
  if (t <= 0 || t >= e.duration) return 0;
  const onset = e.duration * 0.25;
  const recovery = e.duration * 0.3;
  return e.strength * Math.min(smoothstep(t / onset), smoothstep((e.duration - t) / recovery));
}

function periodicCold(o: ClimateVariabilityOptions, seed: string, year: number): number {
  const P = o.periodYears;
  const duration = P * COLD_FRACTION;
  // Episode k starts at origin + k*P.
  let origin: number;
  if (o.start === "fromStart")
    origin = o.anchorYear - duration * 0.4; // anchor sits on the plateau
  else origin = o.anchorYear + Math.max(30, P * (0.1 + 0.4 * hashUnit(seed, 1, 7))); // arrives later
  const k = Math.floor((year - origin) / P);
  let value = 0;
  for (const j of [k - 1, k])
    value = Math.max(value, episodeShape(year, { start: origin + j * P, duration, strength: 1 }));
  return value;
}

function irregularEpisode(o: ClimateVariabilityOptions, seed: string, slot: number, origin: number): Episode | null {
  const P = o.periodYears;
  const scale = P / 450;
  const forced = slot === 0;
  if (!forced && hashUnit(seed, slot, 11) >= SLOT_OCCUPANCY) return null;
  const duration = (60 + 140 * hashUnit(seed, slot, 13)) * scale;
  const strength = 0.5 + 0.5 * hashUnit(seed, slot, 17);
  const latest = Math.max(0, P - duration);
  let start = origin + slot * P + latest * hashUnit(seed, slot, 19);
  if (forced) {
    if (o.start === "fromStart") start = o.anchorYear - duration * 0.4;
    else start = o.anchorYear + Math.max(30, latest * (0.15 + 0.6 * hashUnit(seed, slot, 23)));
  }
  return { start, duration, strength: forced ? Math.max(strength, 0.8) : strength };
}

function irregularCold(o: ClimateVariabilityOptions, seed: string, year: number): number {
  const P = o.periodYears;
  // Slot 0 begins at the anchor so the generation option controls the first episode.
  const origin = o.anchorYear;
  const k = Math.floor((year - origin) / P);
  let value = 0;
  for (const slot of [k - 1, k, k + 1]) {
    const e = irregularEpisode(o, seed, slot, origin);
    if (e) value = Math.max(value, episodeShape(year, e));
  }
  return value;
}

/** 0..1 depth of the long-period cold episode in `year` (share of depthC). */
export function getColdEpisodeDepth(o: ClimateVariabilityOptions, seed: string, year: number): number {
  if (o.start === "off" || !(o.depthC > 0)) return 0;
  return o.mode === "periodic" ? periodicCold(o, seed, year) : irregularCold(o, seed, year);
}

/** Global-mean volcanic cooling in `year`, °C (≤ 0). Independent of depthC: real eruptions don't scale with it. */
export function getVolcanicAnomalyC(o: ClimateVariabilityOptions, seed: string, year: number): number {
  if (o.start === "off" || !(o.volcanicPerCentury > 0)) return 0;
  let total = 0;
  for (let eruption = Math.floor(year) - VOLCANIC_REACH_YEARS + 1; eruption <= Math.floor(year); eruption++) {
    const boost = getColdEpisodeDepth(o, seed, eruption) > 0.3 ? 2 : 1;
    if (hashUnit(seed, eruption, 31) >= (o.volcanicPerCentury / 100) * boost) continue;
    const magnitude = 0.5 + 0.7 * hashUnit(seed, eruption, 37);
    total -= magnitude * Math.exp(-(year - eruption) / VOLCANIC_DECAY_YEARS);
  }
  return total;
}

export interface GlobalClimateAnomaly {
  /** Long-period component, °C (≤ 0). */
  readonly episodeC: number;
  /** Volcanic component, °C (≤ 0). */
  readonly volcanicC: number;
}

export function getGlobalClimateAnomaly(
  o: ClimateVariabilityOptions,
  seed: string,
  year: number
): GlobalClimateAnomaly {
  return {
    episodeC: -o.depthC * getColdEpisodeDepth(o, seed, year) + 0, // + 0 turns -0 into 0
    volcanicC: getVolcanicAnomalyC(o, seed, year)
  };
}

function rawAmplification(latitudeDeg: number): number {
  return 0.5 + 1.5 * (Math.min(90, Math.abs(latitudeDeg)) / 90) ** 1.5;
}

/** Area-weighted (cos latitude) global mean of the raw shape, so depthC stays a global mean. */
const AMPLIFICATION_GLOBAL_MEAN = (() => {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < 900; i++) {
    const lat = (i + 0.5) / 10;
    const w = Math.cos((lat * Math.PI) / 180);
    sum += rawAmplification(lat) * w;
    weight += w;
  }
  return sum / weight;
})();

/** Polar amplification, ~4× stronger at the poles than at the equator; area-weighted global mean 1. */
export function getLatitudeAmplification(latitudeDeg: number): number {
  return rawAmplification(latitudeDeg) / AMPLIFICATION_GLOBAL_MEAN;
}

/**
 * Monthly cell anomaly in °C (index 0 = January). `warmth[m]` is cos of the month's distance
 * from the local temperature peak (1 = warmest month, -1 = coldest), from the same curve the
 * seasonal model uses, so hemispheres and seasonal lag line up.
 * Episodes bite hardest in continental winters; volcanic cooling in summer. Both seasonal
 * weightings are normalised to a day-weighted annual mean of 1.
 */
export function getMonthlyCellAnomalyC(
  anomaly: GlobalClimateAnomaly,
  latitudeDeg: number,
  continentality: number,
  warmth: ArrayLike<number>,
  year = 2001
): Float64Array {
  const out = new Float64Array(12);
  if (!anomaly.episodeC && !anomaly.volcanicC) return out;
  const c = Math.min(1, Math.max(0, Number.isFinite(continentality) ? continentality : 0.5));
  const winterWeight = 1 + 0.5 * c;
  const summerWeight = 0.8;
  const episode = new Float64Array(12);
  const volcanic = new Float64Array(12);
  let episodeMean = 0;
  let volcanicMean = 0;
  let days = 0;
  for (let m = 0; m < 12; m++) {
    const w = warmth[m];
    const d = getDaysInMonth(year, m + 1);
    episode[m] = (winterWeight + summerWeight) / 2 - ((winterWeight - summerWeight) / 2) * w;
    volcanic[m] = 1 + 0.3 * w;
    episodeMean += episode[m] * d;
    volcanicMean += volcanic[m] * d;
    days += d;
  }
  episodeMean /= days;
  volcanicMean /= days;
  const amplification = getLatitudeAmplification(latitudeDeg);
  for (let m = 0; m < 12; m++)
    out[m] =
      amplification *
      (anomaly.episodeC * (episode[m] / episodeMean) + anomaly.volcanicC * (volcanic[m] / volcanicMean));
  return out;
}

export interface ColdExposure {
  /** Mean growing-season (months ≥ 5 °C) cooling from the anomaly, °C, ≥ 0. */
  readonly cooling: number;
  /** 0..1 share of a cool growing season: 1 when the warmest month is ≤ 12 °C, 0 at ≥ 22 °C. */
  readonly marginality: number;
}

/** Shared by the cold-harvest disaster and Fast-Forward population so both read the same signal. */
export function getColdExposure(monthlyMeanC: ArrayLike<number>, monthlyAnomalyC: ArrayLike<number>): ColdExposure {
  let cooling = 0;
  let months = 0;
  let warmest = -Infinity;
  for (let m = 0; m < 12; m++) {
    const t = monthlyMeanC[m];
    if (t > warmest) warmest = t;
    if (t < 5) continue;
    cooling += Math.max(0, -monthlyAnomalyC[m]);
    months++;
  }
  return {
    cooling: months ? cooling / months : 0,
    marginality: Math.min(1, Math.max(0, (22 - warmest) / 10))
  };
}

/**
 * Fast-Forward population growth penalty, percentage points per year (≥ 0), standing in for the
 * famine deaths the skipped economy would have produced. 1.5 pp/yr per °C on fully marginal land.
 */
export const COLD_POPULATION_PENALTY_PCT_PER_C = 1.5;
export function getColdPopulationPenaltyPct(exposure: ColdExposure): number {
  return COLD_POPULATION_PENALTY_PCT_PER_C * exposure.cooling * (0.3 + 0.7 * exposure.marginality);
}
