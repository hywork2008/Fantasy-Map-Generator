import { describe, expect, it } from "vitest";
import {
  createInitialPopulationCohorts,
  INITIAL_POPULATION_FRACTION_OF_K,
  startingPopulationScaleOfK
} from "./initialPopulationCohorts";

describe("createInitialPopulationCohorts", () => {
  it("characterizes the current standard 60% saturation and demographic split", () => {
    const cohorts = createInitialPopulationCohorts(250, 0.6);

    expect(cohorts.population).toBe(150);
    expect(cohorts.children).toBe(60);
    expect(cohorts.maleAdults).toBeCloseTo(33.075, 10);
    expect(cohorts.femaleAdults).toBeCloseTo(34.425, 10);
    expect(cohorts.elders).toBe(22.5);
    expect(cohorts.children + cohorts.maleAdults + cohorts.femaleAdults + cohorts.elders).toBeCloseTo(
      cohorts.population,
      10
    );
  });
});

describe("startingPopulationScaleOfK", () => {
  it("caps frontier-style full-fill (saturation ≈ footprint) at 60% of K", () => {
    expect(startingPopulationScaleOfK(30, 100, 0.3)).toBe(INITIAL_POPULATION_FRACTION_OF_K);
    expect(startingPopulationScaleOfK(45, 100, 0.45)).toBe(INITIAL_POPULATION_FRACTION_OF_K);
  });

  it("still honors a thinner requested saturation", () => {
    expect(startingPopulationScaleOfK(50, 100, 0.2)).toBeCloseTo(0.4);
  });

  it("leaves the standard all-land 60% path unchanged", () => {
    expect(startingPopulationScaleOfK(100, 100, 0.6)).toBeCloseTo(0.6);
  });

  it("returns 0 when nothing is settled", () => {
    expect(startingPopulationScaleOfK(0, 100, 0.3)).toBe(0);
  });
});
