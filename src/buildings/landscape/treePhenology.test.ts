import { describe, expect, it } from "vitest";
import { resolveTreeAppearance, resolveTreeAppearanceYear, TREE_PHENOLOGY } from "./treePhenology";
import { TREE_SPECIES } from "./trees";

const TEMPERATE = [0.9, 2.0, 5.6, 9.6, 14.0, 17.2, 19.3, 18.8, 14.8, 10.0, 5.4, 2.1];
const MEDITERRANEAN = [10.2, 10.6, 12.6, 16.1, 21.0, 25.7, 28.4, 28.1, 24.0, 19.5, 15.2, 11.8];
const TROPICAL = [27.0, 27.5, 27.2, 27.0, 26.6, 25.6, 24.3, 24.3, 25.0, 25.6, 26.3, 26.8];
const weightsIn = (...months: number[]) => Array.from({ length: 12 }, (_, m) => (months.includes(m + 1) ? 1 : 0));
const looks = (states: { appearance: string }[]) => states.map(state => state.appearance).join(" ");

describe("tree phenology", () => {
  it("registers the 91 appearances of the design and resolves only supported ones", () => {
    // 81 of the 32 landscape species (§4) and 10 of the four grove forms (§18).
    expect(TREE_SPECIES.reduce((sum, species) => sum + TREE_PHENOLOGY[species].appearances.length, 0)).toBe(91);
    for (const species of TREE_SPECIES) {
      const profile = TREE_PHENOLOGY[species];
      expect(profile.appearances).toContain(profile.defaultAppearance);
      for (const climate of [TEMPERATE, MEDITERRANEAN, TROPICAL])
        for (const state of resolveTreeAppearanceYear(species, { monthlyMeanTemperatureC: climate }))
          expect(profile.appearances).toContain(state.appearance);
      expect(resolveTreeAppearance(species, 7).appearance).toBe(profile.defaultAppearance);
    }
  });

  it("drops leaves in temperate and Mediterranean winters but not in the tropics", () => {
    const climate = (monthlyMeanTemperatureC: number[]) => ({ monthlyMeanTemperatureC });
    expect(looks(resolveTreeAppearanceYear("european_beech", climate(TEMPERATE)))).toBe(
      "bare bare bare leaf leaf leaf leaf leaf leaf autumn bare bare"
    );
    expect(looks(resolveTreeAppearanceYear("european_beech", climate(MEDITERRANEAN)))).toBe(
      "bare bare bare leaf leaf leaf leaf leaf leaf autumn autumn bare"
    );
    expect(resolveTreeAppearanceYear("european_beech", climate(TROPICAL)).every(s => s.appearance === "leaf")).toBe(
      true
    );
    // Alder leaves fall green.
    expect(looks(resolveTreeAppearanceYear("black_alder", climate(TEMPERATE)))).not.toContain("autumn");
  });

  it("mirrors the year in the southern hemisphere through temperatures alone", () => {
    const southern = TEMPERATE.map((_, m) => TEMPERATE[(m + 6) % 12]);
    const north = resolveTreeAppearanceYear("domestic_apple", { monthlyMeanTemperatureC: TEMPERATE });
    const south = resolveTreeAppearanceYear("domestic_apple", { monthlyMeanTemperatureC: southern });
    expect(south.map((_, m) => south[(m + 6) % 12])).toEqual(north);
  });

  it("anchors fruit timing to seasonal temperatures and follows the crop calendar where there is no season", () => {
    // The economy calendar picks May–June here; only its two-month length is used.
    const olive = resolveTreeAppearanceYear("olive", {
      monthlyMeanTemperatureC: MEDITERRANEAN,
      harvestWeights: weightsIn(5, 6)
    });
    expect(looks(olive)).toBe("leaf leaf leaf leaf leaf leaf leaf unripe unripe unripe fruit fruit");
    const apple = resolveTreeAppearanceYear("domestic_apple", { monthlyMeanTemperatureC: TEMPERATE });
    expect(apple[3].appearance).toBe("bloom");
    expect(apple[9]).toEqual({ appearance: "fruit", autumnPalette: true });
    // The male palm flowers with the date crop it pollinates and is otherwise in leaf.
    const male = resolveTreeAppearanceYear("date_palm_orchard_male", { monthlyMeanTemperatureC: MEDITERRANEAN });
    const female = resolveTreeAppearanceYear("date_palm_orchard", { monthlyMeanTemperatureC: MEDITERRANEAN });
    expect(male.map(state => (state.appearance === "bloom" ? "bloom" : "leaf"))).toEqual(
      female.map(state => (state.appearance === "bloom" ? "bloom" : "leaf"))
    );
    expect(looks(male)).toContain("bloom");
    const cacao = resolveTreeAppearanceYear("cacao", {
      monthlyMeanTemperatureC: TROPICAL,
      harvestWeights: weightsIn(4, 5, 6)
    });
    expect(looks(cacao)).toBe(
      "harvested harvested harvested fruit fruit fruit harvested harvested harvested harvested harvested harvested"
    );
  });
});
