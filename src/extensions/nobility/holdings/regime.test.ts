import { describe, expect, it } from "vitest";
import { regimeFor } from "./regime";

const medieval = ["earlyMedieval", "highMedieval", "lateMedieval"] as const;

describe("regimeFor", () => {
  it("classifies a Celtic monarchy as gaelicProvincial in every medieval period", () => {
    for (const period of medieval) {
      expect(regimeFor({ cultureBase: 22, form: "Monarchy", formName: "Kingdom", period })).toBe("gaelicProvincial");
    }
  });

  it("keeps a Celtic union on the same provincial procedure", () => {
    expect(regimeFor({ cultureBase: 22, form: "Union", formName: "Confederation", period: "highMedieval" })).toBe(
      "gaelicProvincial"
    );
  });

  it("sends a Celtic republic or free city to the urban procedure and a theocracy to the episcopal one", () => {
    expect(regimeFor({ cultureBase: 22, form: "Republic", formName: "Republic", period: "highMedieval" })).toBe(
      "urbanCommunal"
    );
    expect(regimeFor({ cultureBase: 22, form: "Monarchy", formName: "Free City", period: "highMedieval" })).toBe(
      "urbanCommunal"
    );
    expect(regimeFor({ cultureBase: 22, form: "Theocracy", formName: "Theocracy", period: "earlyMedieval" })).toBe(
      "episcopal"
    );
  });

  it("returns null for anarchy, an excluded form name, a later period, or a missing period", () => {
    expect(regimeFor({ cultureBase: 22, form: "Anarchy", formName: "Warlord", period: "earlyMedieval" })).toBeNull();
    expect(regimeFor({ cultureBase: 22, form: "Monarchy", formName: "Khanate", period: "highMedieval" })).toBeNull();
    expect(
      regimeFor({ cultureBase: 22, form: "Monarchy", formName: "Kingdom", period: "ageOfExploration" })
    ).toBeNull();
    expect(regimeFor({ cultureBase: 22, form: "Monarchy", formName: "Kingdom" })).toBeNull();
  });

  it.each([
    [0, "Monarchy", "Kingdom", "germanImmediate"],
    [1, "Monarchy", "Kingdom", "englishHonour"],
    [2, "Monarchy", "Kingdom", "frenchTerritorial"],
    [8, "Monarchy", "Kingdom", "frenchTerritorial"],
    [3, "Monarchy", "Kingdom", "italianFeudal"],
    [3, "Republic", "Republic", "italianCommunal"],
    [3, "Theocracy", "Theocracy", "episcopal"],
    [8, "Theocracy", "Papacy", "episcopal"],
    [4, "Monarchy", "Kingdom", "iberianConcejo"],
    [13, "Monarchy", "Kingdom", "iberianConcejo"],
    [20, "Monarchy", "Kingdom", "iberianConcejo"],
    [6, "Monarchy", "Kingdom", "nordicOfficer"],
    [9, "Monarchy", "Kingdom", "nordicOfficer"],
    [15, "Monarchy", "Kingdom", "hungarianCounty"],
    [1, "Republic", "City-state", "urbanCommunal"]
  ] as const)("maps base %s %s/%s to %s", (cultureBase, form, formName, regime) => {
    expect(regimeFor({ cultureBase, form, formName, period: "lateMedieval" })).toBe(regime);
  });

  it("leaves Ruthenian and Greek bases on the frontier-lord path", () => {
    expect(regimeFor({ cultureBase: 5, form: "Monarchy", formName: "Kingdom", period: "highMedieval" })).toBeNull();
    expect(regimeFor({ cultureBase: 7, form: "Monarchy", formName: "Kingdom", period: "highMedieval" })).toBeNull();
  });
});
