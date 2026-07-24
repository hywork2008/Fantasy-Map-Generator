import { describe, expect, it } from "vitest";
import { createInitialPopulationCohorts } from "./initialPopulationCohorts";

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
