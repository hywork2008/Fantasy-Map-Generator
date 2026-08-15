/**
 * Births for one demography step. Logistic growth still applies below carrying
 * capacity, but at or near K the old `female * rate * room` term goes to ~0
 * after aging deaths, so the population bled out every year. Replacement
 * fertility floors births at this step's natural deaths whenever the cell or
 * burg is not already over capacity.
 */
export function replacementAwareBirths(input: {
  femaleAdults: number;
  baseGrowthRate: number;
  deltaYears: number;
  roomForGrowth: number;
  naturalDeaths: number;
  extraFloor?: number;
}): number {
  if (input.roomForGrowth < 0 || input.femaleAdults <= 0 || input.deltaYears <= 0) return 0;
  const growthBirths = input.femaleAdults * input.baseGrowthRate * input.deltaYears * Math.max(0, input.roomForGrowth);
  const replacementBirths = Math.max(0, input.naturalDeaths);
  const extraFloor = Math.max(0, input.extraFloor ?? 0);
  return Math.max(growthBirths, replacementBirths, extraFloor);
}
