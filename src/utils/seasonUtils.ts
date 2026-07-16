/**
 * Pure, dependency-free seasonal calendar math. Every consumer (economy, road/sea route
 * graphs, calendar UI) computes its own season from its own latitude at its own point of
 * consumption — there is no single global "current season," since a map can span both
 * hemispheres and they experience opposite seasons at the same calendar month. The only
 * exception is getCurrentDirection(), which models a single global seasonal current
 * reversal per docs/simulation/seasons.md, not a per-latitude effect.
 *
 * This module must stay a leaf: no imports from context/, generators/, or extensions/, so
 * it can be safely imported from any layer (Generator, Renderer, extension sub-modules)
 * without pulling in unrelated module graphs or risking circular dependencies.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";

/** Earth-like axial tilt in degrees, driving the solar-declination seasonal swing. */
const AXIAL_TILT_DEG = 23.5;

/** Fraction of the map's configured equator-to-pole temperature gradient realized as a seasonal swing. */
const SEASONAL_AMPLITUDE_FACTOR = 0.5;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** 1-based day-of-year (Jan 1 = 1), Gregorian, leap-year aware. */
export function getDayOfYear(year: number, month: number, day: number): number {
  let days = day;
  for (let m = 1; m < month; m++) days += getDaysInMonth(year, m);
  return days;
}

/**
 * Solar declination in degrees for the given day-of-year, using the standard approximation
 * `-tilt * cos(360/365 * (dayOfYear + 10))`. Positive values mean the sun is over the
 * northern hemisphere (northern summer / southern winter); peaks near day 172 (~June 21).
 */
export function getSolarDeclinationDeg(dayOfYear: number): number {
  const angleDeg = (360 / 365) * (dayOfYear + 10);
  return -AXIAL_TILT_DEG * Math.cos(angleDeg * (Math.PI / 180));
}

/** The subset of WorldOptions this module needs, kept narrow to avoid importing context types. */
export interface SeasonalClimateOptions {
  temperatureEquator: number;
  temperatureNorthPole: number;
  temperatureSouthPole: number;
}

/**
 * Magnitude (in °C) of the seasonal temperature swing at the given latitude: zero at the
 * equator, scaling up toward the poles (sin(|latitude|) shape), sized off the map's own
 * configured equator/pole temperature spread so it stays consistent with whatever climate
 * the user set in WorldConfiguratorDialog rather than an unrelated hardcoded constant.
 */
export function getSeasonalAmplitude(latitudeDeg: number, climate: SeasonalClimateOptions): number {
  const northSpread = Math.abs(climate.temperatureNorthPole - climate.temperatureEquator);
  const southSpread = Math.abs(climate.temperatureSouthPole - climate.temperatureEquator);
  const gradient = (northSpread + southSpread) / 2;
  return gradient * SEASONAL_AMPLITUDE_FACTOR * Math.sin(Math.abs(latitudeDeg) * (Math.PI / 180));
}

/**
 * Normalized [0,1] strength of latitudinal seasonality: 0 at the equator (no seasonal swing,
 * year-round growing conditions), 1 at the poles (full swing). Unlike getSeasonalAmplitude(),
 * this is independent of the map's configured climate spread — it is the bare sin(|latitude|)
 * shape used to blend season-dependent gameplay effects (e.g. food production) between a flat
 * baseline near the equator and their full defined swing at high latitudes.
 */
export function getSeasonalityStrength(latitudeDeg: number): number {
  return Math.sin(Math.abs(latitudeDeg) * (Math.PI / 180));
}

/**
 * Signed °C offset to layer on top of (never mutate) the static annual-average
 * grid.cells.temp value for a cell at the given latitude and calendar date.
 */
export function getSeasonalTemperatureOffset(
  latitudeDeg: number,
  year: number,
  month: number,
  day: number,
  climate: SeasonalClimateOptions
): number {
  const declination = getSolarDeclinationDeg(getDayOfYear(year, month, day));
  const amplitude = getSeasonalAmplitude(latitudeDeg, climate);
  const hemisphereSign = latitudeDeg >= 0 ? 1 : -1;
  return amplitude * hemisphereSign * (declination / AXIAL_TILT_DEG);
}

/** Northern-hemisphere meteorological season per calendar month (index 0 = January). */
const NORTHERN_SEASON_BY_MONTH: readonly Season[] = [
  "winter",
  "winter",
  "spring",
  "spring",
  "spring",
  "summer",
  "summer",
  "summer",
  "autumn",
  "autumn",
  "autumn",
  "winter"
];

const OPPOSITE_SEASON: Record<Season, Season> = {
  winter: "summer",
  summer: "winter",
  spring: "autumn",
  autumn: "spring"
};

/**
 * Hemisphere-aware meteorological season for a given latitude and calendar month.
 * Southern-hemisphere latitudes get the opposite season of the same month in the north.
 */
export function getSeason(latitudeDeg: number, month: number): Season {
  const northern = NORTHERN_SEASON_BY_MONTH[(((Math.trunc(month) - 1) % 12) + 12) % 12];
  return latitudeDeg >= 0 ? northern : OPPOSITE_SEASON[northern];
}

/**
 * Single global seasonal ocean-current bias: +1 favors eastward sailing (spring/summer,
 * northern-hemisphere reference), -1 favors westward sailing (autumn/winter). Deliberately
 * not latitude-banded — this models the simple whole-map seasonal reversal described in
 * docs/simulation/seasons.md, not real-world latitude-banded trade winds/currents.
 */
export function getCurrentDirection(month: number): 1 | -1 {
  const season = NORTHERN_SEASON_BY_MONTH[(((Math.trunc(month) - 1) % 12) + 12) % 12];
  return season === "spring" || season === "summer" ? 1 : -1;
}
