import { describe, expect, it } from "vitest";
import {
  auditNutrition,
  CHEESE_KG_PER_UNIT,
  CHEESE_RECIPE_MILK_UNITS,
  DAILY_CALORIC_NEED_KCAL,
  DAILY_PROTEIN_NEED_G,
  getAnnualNutritionNeed,
  getCheeseNutrition,
  getDairyNutritionPotential,
  getStapleCoverage,
  MILK_LITERS_PER_CHEESE_KG,
  MILK_LITERS_PER_UNIT
} from "./nutritionAudit";

describe("nutritionAudit (2026-08-07, docs/plan/food-nutrition-audit.md)", () => {
  describe("getAnnualNutritionNeed", () => {
    it("is zero for zero population", () => {
      expect(getAnnualNutritionNeed(0)).toEqual({ kcal: 0, proteinKg: 0 });
    });

    it("scales linearly with population", () => {
      const one = getAnnualNutritionNeed(1);
      const thousand = getAnnualNutritionNeed(1000);
      expect(thousand.kcal).toBeCloseTo(one.kcal * 1000, 5);
      expect(thousand.proteinKg).toBeCloseTo(one.proteinKg * 1000, 5);
    });

    it("matches DAILY_CALORIC_NEED_KCAL / DAILY_PROTEIN_NEED_G times days per year, for one person", () => {
      const one = getAnnualNutritionNeed(1);
      expect(one.kcal).toBeCloseTo(DAILY_CALORIC_NEED_KCAL * 365.2425, 2);
      expect(one.proteinKg).toBeCloseTo((DAILY_PROTEIN_NEED_G * 365.2425) / 1000, 5);
    });

    it("clamps negative population to zero", () => {
      expect(getAnnualNutritionNeed(-5)).toEqual({ kcal: 0, proteinKg: 0 });
    });
  });

  describe("getStapleCoverage (Tier 1 — Grain's real-world nutrition vs. real need)", () => {
    it("covers most, but not all, of one person's annual caloric need from the 200kg/year staple baseline alone", () => {
      const staple = getStapleCoverage();
      // 200kg * 3400 kcal/kg = 680,000 kcal/year vs. 2100 kcal/day * 365.2425 = ~767,009 kcal/year.
      expect(staple.kcalCoverageRatio).toBeGreaterThan(0.8);
      expect(staple.kcalCoverageRatio).toBeLessThan(1); // grain alone falls short — the realistic gap Tier 2 exists to fill
      expect(staple.kcalCoverageRatio).toBeCloseTo(0.8865, 3);
    });

    it("covers protein mass generously (the staple baseline exceeds the raw protein-gram target)", () => {
      const staple = getStapleCoverage();
      // 200kg * 120g/kg = 24kg/year vs. 50g/day * 365.2425 = ~18.26kg/year.
      expect(staple.proteinCoverageRatio).toBeGreaterThan(1);
      expect(staple.proteinCoverageRatio).toBeCloseTo(1.3142, 3);
    });
  });

  describe("getDairyNutritionPotential (Tier 2 — Milk's cheese-making potential)", () => {
    it("is zero for zero Milk", () => {
      const potential = getDairyNutritionPotential(0);
      expect(potential.milkLiters).toBe(0);
      expect(potential.cheeseEquivalentKg).toBe(0);
      expect(potential.kcal).toBe(0);
      expect(potential.proteinKg).toBe(0);
    });

    it("converts Milk units to liters, then to cheese-equivalent mass at the real dairying ratio", () => {
      const milkUnits = 100;
      const potential = getDairyNutritionPotential(milkUnits);
      expect(potential.milkLiters).toBeCloseTo(milkUnits * MILK_LITERS_PER_UNIT, 5);
      expect(potential.cheeseEquivalentKg).toBeCloseTo(
        (milkUnits * MILK_LITERS_PER_UNIT) / MILK_LITERS_PER_CHEESE_KG,
        5
      );
      expect(potential.kcal).toBeGreaterThan(0);
      expect(potential.proteinKg).toBeGreaterThan(0);
    });
  });

  describe("getCheeseNutrition", () => {
    it("is zero for zero Cheese", () => {
      expect(getCheeseNutrition(0)).toEqual({ kcal: 0, proteinKg: 0 });
    });

    it("scales with Cheese units via CHEESE_KG_PER_UNIT", () => {
      const a = getCheeseNutrition(1);
      const b = getCheeseNutrition(10);
      expect(b.kcal).toBeCloseTo(a.kcal * 10, 5);
      expect(b.proteinKg).toBeCloseTo(a.proteinKg * 10, 5);
      expect(a.kcal).toBeGreaterThan(0);
    });

    it("is consistent with CHEESE_KG_PER_UNIT's real-world kg conversion", () => {
      const { kcal } = getCheeseNutrition(1);
      expect(kcal).toBeCloseTo(CHEESE_KG_PER_UNIT * 4000, 5);
    });

    it(
      "mass-balances against Cheese's own recipe (found 2026-08-07, user caught it by hand): the real " +
        "milk that goes into one Cheese unit's worth of the recipe must reduce to the same real kg that " +
        "unit is defined to represent — not an independently-picked, inconsistent number",
      () => {
        const milkInputLiters = CHEESE_RECIPE_MILK_UNITS * MILK_LITERS_PER_UNIT; // 3 * 4 = 12 L
        const cheeseOutputKg = milkInputLiters / MILK_LITERS_PER_CHEESE_KG; // 12 / 10 = 1.2 kg
        expect(CHEESE_KG_PER_UNIT).toBeCloseTo(cheeseOutputKg, 10);
        // The old, inconsistent hardcoded value (40kg) must not silently come back.
        expect(CHEESE_KG_PER_UNIT).toBeLessThan(2);
      }
    );
  });

  describe("auditNutrition (combined report)", () => {
    it("computes a positive remaining-after-grain gap for a population with no dairy yet", () => {
      const report = auditNutrition(10000, 0, 0);
      expect(report.realPopulation).toBe(10000);
      expect(report.remainingAfterGrain.kcal).toBeGreaterThan(0);
      expect(report.remainingAfterGrain.proteinKg).toBe(0); // protein already over-covered by grain alone, clamped to 0
      expect(report.dairyPotential.kcal).toBe(0);
      expect(report.cheeseAlreadyMade.kcal).toBe(0);
    });

    it("remainingAfterGrain never goes negative even if grain coverage would exceed total need", () => {
      // A tiny population where grain's fixed per-person surplus can't go negative regardless.
      const report = auditNutrition(1, 0, 0);
      expect(report.remainingAfterGrain.kcal).toBeGreaterThanOrEqual(0);
      expect(report.remainingAfterGrain.proteinKg).toBeGreaterThanOrEqual(0);
    });

    it("scales grain coverage linearly with population", () => {
      const small = auditNutrition(100, 0, 0);
      const large = auditNutrition(1000, 0, 0);
      const smallGrainKcal = small.need.kcal - small.remainingAfterGrain.kcal;
      const largeGrainKcal = large.need.kcal - large.remainingAfterGrain.kcal;
      expect(largeGrainKcal).toBeCloseTo(smallGrainKcal * 10, 2);
    });
  });
});
