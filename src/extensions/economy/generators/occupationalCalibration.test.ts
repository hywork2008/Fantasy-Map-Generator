import { describe, expect, it } from "vitest";
import { BASE_HOUSING_RECIPE_BY_CULTURE } from "./housingRecipes";
import {
  expectedWorkerPeople,
  expectedWorkerPoints,
  getOccupationalRow,
  OCCUPATIONAL_CALIBRATION,
  referenceFixtureExpectedPeople
} from "./occupationalCalibration";

describe("occupationalCalibration", () => {
  it("uses inlandTypicalPerThousand 2.2 for woodworking, not the 9000-person headcount", () => {
    expect(getOccupationalRow("woodworking").peoplePerThousandUrban.inlandTypicalPerThousand).toBe(2.2);
    const people = referenceFixtureExpectedPeople("woodworking");
    expect(people).toBeCloseTo(19.8, 5);
    expect(people).toBeGreaterThanOrEqual(10);
    expect(people).toBeLessThanOrEqual(40);
    expect(
      expectedWorkerPoints({
        row: getOccupationalRow("woodworking"),
        laborPeople: 9000,
        populationRate: 1000,
        port: false,
        capital: false,
        hasQuarry: false
      })
    ).toBeCloseTo(0.0198, 6);
  });

  it("does not 10× woodworking if someone confuses typical people with per-thousand", () => {
    expect(referenceFixtureExpectedPeople("woodworking")).toBeLessThan(40);
    expect(referenceFixtureExpectedPeople("leather")).toBeCloseTo(270, 5);
  });

  it("doubles woodworking at ports", () => {
    const people = expectedWorkerPeople({
      row: getOccupationalRow("woodworking"),
      laborPeople: 9000,
      port: true,
      capital: false,
      hasQuarry: false
    });
    expect(people).toBeCloseTo(39.6, 5);
  });

  it("splits construction by housing wood vs stone+brick", () => {
    const generic = BASE_HOUSING_RECIPE_BY_CULTURE.Generic;
    const carpenter = expectedWorkerPeople({
      row: getOccupationalRow("constructionCarpenter"),
      laborPeople: 9000,
      port: false,
      capital: false,
      hasQuarry: false,
      housingRecipe: generic
    });
    const mason = expectedWorkerPeople({
      row: getOccupationalRow("constructionMason"),
      laborPeople: 9000,
      port: false,
      capital: false,
      hasQuarry: false,
      housingRecipe: generic
    });
    expect(carpenter).toBeCloseTo(89.1, 5);
    expect(mason).toBeCloseTo(108.9, 5);
  });

  it("zeros administration off the capital", () => {
    expect(
      expectedWorkerPeople({
        row: getOccupationalRow("administration"),
        laborPeople: 9000,
        port: false,
        capital: false,
        hasQuarry: false
      })
    ).toBe(0);
    expect(
      expectedWorkerPeople({
        row: getOccupationalRow("administration"),
        laborPeople: 9000,
        port: false,
        capital: true,
        hasQuarry: false
      })
    ).toBeCloseTo(135, 5);
  });

  it("covers every guild domain exactly once", () => {
    const guildRows = OCCUPATIONAL_CALIBRATION.filter(row => row.guildDomain);
    expect(guildRows.map(row => row.guildDomain).sort()).toEqual([
      "glassware",
      "instruments",
      "leather",
      "masonry",
      "metallurgy",
      "printing",
      "textiles",
      "woodworking"
    ]);
  });
});
