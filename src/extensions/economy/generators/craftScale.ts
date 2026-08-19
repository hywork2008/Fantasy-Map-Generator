/**
 * Display-people / labor-people / population-point conversion for craft calibration
 * (docs/plan/craft-demand-calibration.md §1). Pure — no economyContext.
 */

export const DEFAULT_PEOPLE_PER_POPULATION_POINT = 1000;

/** Reference burg used by occupational and demand tables (not a typical-burg guarantee). */
export const REFERENCE_FIXTURE_LABOR_PEOPLE = 9000;

/** Census shown in UI. Not the occupational labor base. */
export function displayPeople(populationPoints: number, populationRate: number, urbanization: number): number {
  return Math.max(0, populationPoints) * Math.max(1, populationRate) * Math.max(0, urbanization);
}

/** Occupational / housing-aligned urban people (K18 — no urbanization). */
export function laborPeople(populationPoints: number, populationRate: number): number {
  return Math.max(0, populationPoints) * Math.max(1, populationRate);
}

export function peopleToPoints(people: number, populationRate: number): number {
  return Math.max(0, people) / Math.max(1, populationRate);
}

export function pointsToPeople(points: number, populationRate: number): number {
  return Math.max(0, points) * Math.max(1, populationRate);
}

/** Authored saturation in people. Applied to guild coverage only after PR 3 closed inventory. */
export const GUILD_SATURATION_PEOPLE = 12;

export function guildSaturationPoints(populationRate: number): number {
  return Math.max(peopleToPoints(GUILD_SATURATION_PEOPLE, populationRate), 1e-9);
}
