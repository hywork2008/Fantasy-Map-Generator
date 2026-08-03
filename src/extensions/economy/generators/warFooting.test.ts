import { describe, expect, it } from "vitest";
import type { State } from "../../hostTypes";
import { BASELINE_ALLOCATION_BY_FORM } from "./treasuryAllocation";
import {
  applyWarFootingToBaseline,
  MOBILIZATION_BOOST_CAP,
  setWarFooting,
  updateMilitaryMobilizationBoost,
  WAR_FOOTING_MARSHALCY_FLOOR
} from "./warFooting";

describe("warFooting (PR-6)", () => {
  describe("applyWarFootingToBaseline()", () => {
    it("leaves peacetime shares unchanged when warFooting is off", () => {
      const baseline = BASELINE_ALLOCATION_BY_FORM.Monarchy;
      const next = applyWarFootingToBaseline(baseline, { form: "Monarchy", warFooting: false });
      expect(next).toEqual(baseline);
    });

    it("raises marshalcy to at least the war footing floor for Monarchy", () => {
      const baseline = BASELINE_ALLOCATION_BY_FORM.Monarchy;
      const next = applyWarFootingToBaseline(baseline, { form: "Monarchy", warFooting: true });

      expect(next.marshalcy).toBeGreaterThanOrEqual(WAR_FOOTING_MARSHALCY_FLOOR - 0.001);
      expect(next.household).toBeLessThan(baseline.household);
      const sum =
        next.marshalcy + next.household + next.chancery + next.stewardship + next.spymastery + next.ecclesiastica;
      expect(sum).toBeCloseTo(1, 3);
    });

    it("protects Theocracy ecclesiastica floor under war footing", () => {
      const baseline = BASELINE_ALLOCATION_BY_FORM.Theocracy;
      const next = applyWarFootingToBaseline(baseline, { form: "Theocracy", warFooting: true });

      expect(next.marshalcy).toBeGreaterThanOrEqual(WAR_FOOTING_MARSHALCY_FLOOR - 0.05);
      expect(next.ecclesiastica).toBeGreaterThanOrEqual(0.2 - 0.001);
    });
  });

  describe("updateMilitaryMobilizationBoost()", () => {
    it("writes 0 when war footing is off even if overfunded", () => {
      const state = { i: 1, warFooting: false } as unknown as State;
      expect(updateMilitaryMobilizationBoost(state, 2)).toBe(0);
      expect(state.militaryMobilizationBoost).toBe(0);
    });

    it("writes a capped boost when war footing is on and ratio > 1", () => {
      const state = { i: 1, warFooting: true } as unknown as State;
      const boost = updateMilitaryMobilizationBoost(state, 2);
      expect(boost).toBe(MOBILIZATION_BOOST_CAP);
      expect(state.militaryMobilizationBoost).toBe(MOBILIZATION_BOOST_CAP);
    });

    it("clears boost when ratio is not overfunded", () => {
      const state = { i: 1, warFooting: true, militaryMobilizationBoost: 0.1 } as unknown as State;
      expect(updateMilitaryMobilizationBoost(state, 0.9)).toBe(0);
      expect(state.militaryMobilizationBoost).toBe(0);
    });
  });

  describe("setWarFooting()", () => {
    it("toggles the flag and clears boost on disable", () => {
      const state = {
        i: 1,
        warFooting: true,
        militaryMobilizationBoost: 0.1
      } as unknown as State;
      expect(setWarFooting(state, false)).toBe(false);
      expect(state.warFooting).toBe(false);
      expect(state.militaryMobilizationBoost).toBe(0);
    });
  });
});
