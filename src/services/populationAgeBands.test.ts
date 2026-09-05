import { describe, expect, it } from "vitest";
import { createDefaultRaces, HUMAN_RACE_ID } from "../data/races";
import { DEFAULT_POPULATION_AGE_BANDS, getPopulationAgeBands } from "./populationAgeBands";

describe("getPopulationAgeBands", () => {
  const races = createDefaultRaces();

  it("keeps the established labels for mixed and human populations", () => {
    expect(getPopulationAgeBands(races, 2, false)).toEqual(DEFAULT_POPULATION_AGE_BANDS);
    expect(getPopulationAgeBands(races, HUMAN_RACE_ID, true)).toEqual(DEFAULT_POPULATION_AGE_BANDS);
  });

  it("scales mono-racial city bands from the race maturity and lifespan", () => {
    // Elf: maturity 100, lifespan 750. The human 50-year elder threshold maps to 475.
    expect(getPopulationAgeBands(races, 2, true)).toEqual({
      elders: "475+",
      adults: "100-474",
      children: "0-99"
    });
  });

  it("falls back to neutral labels for incomplete race data", () => {
    expect(getPopulationAgeBands([{ i: 3, key: "elf", name: "Custom" }], 3, true)).toEqual(
      DEFAULT_POPULATION_AGE_BANDS
    );
  });
});
