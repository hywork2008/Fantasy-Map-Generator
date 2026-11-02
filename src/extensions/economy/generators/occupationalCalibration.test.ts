import { describe, expect, it } from "vitest";
import { CRAFT_KNOWLEDGE_DOMAINS } from "./guildKnowledgeTypes";
import { BASE_HOUSING_RECIPE_BY_CULTURE } from "./housingRecipes";
import {
  expectedDomainWorkerPeople,
  expectedWorkerPeople,
  expectedWorkerPoints,
  getOccupationalRow,
  OCCUPATIONAL_CALIBRATION,
  referenceFixtureDomainPeople,
  referenceFixtureExpectedPeople
} from "./occupationalCalibration";

const fixture = { laborPeople: 9000, port: false, capital: false, hasQuarry: false };

describe("occupationalCalibration", () => {
  it("reads crafts per thousand urban labor-people, not the 9000-person headcount", () => {
    expect(getOccupationalRow("shoemaking").peoplePerThousandUrban.inlandTypicalPerThousand).toBe(15);
    expect(referenceFixtureExpectedPeople("shoemaking")).toBeCloseTo(135, 5);
    expect(
      expectedWorkerPoints({ ...fixture, row: getOccupationalRow("shoemaking"), populationRate: 1000 })
    ).toBeCloseTo(0.135, 6);
  });

  it("sums a domain from its crafts (docs/plan/urban-craft-staffing.md §5.2)", () => {
    expect(referenceFixtureDomainPeople("leather")).toBeCloseTo(43 * 9, 5);
    expect(referenceFixtureDomainPeople("textiles")).toBeCloseTo(40 * 9, 5);
    expect(referenceFixtureDomainPeople("metallurgy")).toBeCloseTo(9.5 * 9, 5);
    expect(referenceFixtureDomainPeople("woodworking")).toBeCloseTo(10 * 9, 5);
  });

  it("doubles ropemaking at ports", () => {
    expect(expectedWorkerPeople({ ...fixture, port: true, row: getOccupationalRow("ropemaking") })).toBeCloseTo(18, 5);
  });

  it("has no press before the age of exploration", () => {
    const row = getOccupationalRow("printing");
    expect(expectedWorkerPeople({ ...fixture, row })).toBe(0);
    expect(expectedWorkerPeople({ ...fixture, row, period: "lateMedieval" })).toBe(0);
    expect(expectedWorkerPeople({ ...fixture, row, period: "ageOfExploration" })).toBeCloseTo(18, 5);
  });

  it("has no instrument makers until the state adopts the technology", () => {
    const row = getOccupationalRow("instrumentMaking");
    expect(expectedWorkerPeople({ ...fixture, row })).toBe(0);
    expect(expectedWorkerPeople({ ...fixture, row, technologyAdopted: () => true })).toBeCloseTo(9, 5);
  });

  it("brews little ale where the market grows grapes", () => {
    const row = getOccupationalRow("brewing");
    expect(expectedWorkerPeople({ ...fixture, row })).toBeCloseTo(108, 5);
    expect(expectedWorkerPeople({ ...fixture, row, wineRegion: true })).toBeCloseTo(18, 5);
  });

  it("scales guild crafts by the world's employed share, not construction or administration", () => {
    expect(expectedDomainWorkerPeople({ ...fixture, domain: "baking", employmentScale: 0.4 / 0.45 })).toBeCloseTo(
      13.8 * 9 * (0.4 / 0.45),
      5
    );
    const admin = getOccupationalRow("administration");
    expect(expectedWorkerPeople({ ...fixture, capital: true, row: admin, employmentScale: 0.5 })).toBeCloseTo(135, 5);
  });

  it("splits construction by housing wood vs stone+brick", () => {
    const generic = BASE_HOUSING_RECIPE_BY_CULTURE.Generic;
    const carpenter = expectedWorkerPeople({
      ...fixture,
      row: getOccupationalRow("constructionCarpenter"),
      housingRecipe: generic
    });
    const mason = expectedWorkerPeople({
      ...fixture,
      row: getOccupationalRow("constructionMason"),
      housingRecipe: generic
    });
    expect(carpenter).toBeCloseTo(89.1, 5);
    expect(mason).toBeCloseTo(108.9, 5);
  });

  it("zeros administration off the capital", () => {
    const row = getOccupationalRow("administration");
    expect(expectedWorkerPeople({ ...fixture, row })).toBe(0);
    expect(expectedWorkerPeople({ ...fixture, capital: true, row })).toBeCloseTo(135, 5);
  });

  it("gives every guild domain at least one craft, and every craft a source", () => {
    const domains = new Set(OCCUPATIONAL_CALIBRATION.map(row => row.guildDomain).filter(Boolean));
    expect([...domains].sort()).toEqual([...CRAFT_KNOWLEDGE_DOMAINS].sort());
    for (const row of OCCUPATIONAL_CALIBRATION) expect(row.sources.length, row.pool).toBeGreaterThan(0);
  });
});
