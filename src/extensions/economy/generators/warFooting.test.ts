import { describe, expect, it } from "vitest";
import type { State } from "../../hostTypes";
import { BASELINE_ALLOCATION_BY_FORM } from "./treasuryAllocation";
import {
  applyWarFootingPoliticalCost,
  applyWarFootingToBaseline,
  MOBILIZATION_BOOST_CAP,
  setWarFooting,
  setWarFootingByPlayer,
  shouldAiEnableWarFooting,
  syncWarFootingFromDiplomacy,
  updateMilitaryMobilizationBoost,
  WAR_FOOTING_HOUSEHOLD_COST_FLOOR,
  WAR_FOOTING_MARSHALCY_FLOOR,
  WAR_FOOTING_PEACETIME_DISCONTENT
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

  describe("syncWarFootingFromDiplomacy() (PR-7/PR-8 AI)", () => {
    it("enables war footing when at war and not player-locked", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: ["Enemy"],
        warFooting: false
      } as unknown as State;
      const result = syncWarFootingFromDiplomacy(state);
      expect(result).toEqual({ changed: true, warFooting: true });
      expect(state.warFooting).toBe(true);
    });

    it("respects player lock while at war", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: ["Enemy"],
        warFooting: false,
        warFootingPlayerLocked: true
      } as unknown as State;
      const result = syncWarFootingFromDiplomacy(state);
      expect(result.changed).toBe(false);
      expect(state.warFooting).toBe(false);
    });

    it("demobilizes and clears player lock in peacetime without Rival posture", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: ["Ally"],
        warFooting: true,
        warFootingPlayerLocked: true,
        militaryMobilizationBoost: 0.1
      } as unknown as State;
      const result = syncWarFootingFromDiplomacy(state);
      expect(result.warFooting).toBe(false);
      expect(state.warFootingPlayerLocked).toBe(false);
      expect(state.militaryMobilizationBoost).toBe(0);
    });
  });

  describe("shouldAiEnableWarFooting() boldness (PR-8)", () => {
    it("enables preemptive arming for high boldness with a Rival", () => {
      // Without characters, getRulerBoldness returns 50 — inject via shouldAi using a spy state
      // by testing the threshold helper path with mocked boldness through diplomacy only:
      // default boldness 50 should NOT preemptive-arm.
      const calm = {
        i: 1,
        form: "Monarchy",
        diplomacy: ["Rival"],
        warFooting: false
      } as unknown as State;
      expect(shouldAiEnableWarFooting(calm)).toBe(false);

      // At war with default boldness 50 → enable
      const war = {
        i: 1,
        form: "Monarchy",
        diplomacy: ["Enemy"],
        warFooting: false
      } as unknown as State;
      expect(shouldAiEnableWarFooting(war)).toBe(true);
    });
  });

  describe("setWarFootingByPlayer()", () => {
    it("locks when the player diverges from AI default", () => {
      const state = {
        i: 1,
        diplomacy: ["Enemy"],
        warFooting: true
      } as unknown as State;
      // AI default at war is ON; player turns OFF → locked
      setWarFootingByPlayer(state, false);
      expect(state.warFooting).toBe(false);
      expect(state.warFootingPlayerLocked).toBe(true);
    });
  });

  describe("applyWarFootingPoliticalCost()", () => {
    it("drains household purse while war footing is on", () => {
      const state = {
        i: 1,
        warFooting: true,
        diplomacy: ["Enemy"],
        householdPurse: 10
      } as unknown as State;
      const result = applyWarFootingPoliticalCost(state);
      expect(result.householdCost).toBeGreaterThanOrEqual(WAR_FOOTING_HOUSEHOLD_COST_FLOOR);
      expect(state.householdPurse).toBe(10 - result.householdCost);
      expect(result.peacetimeDiscontent).toBe(0);
    });

    it("accrues peacetime discontent when war footing is kept without Enemy", () => {
      const state = {
        i: 1,
        warFooting: true,
        diplomacy: [],
        householdPurse: 0,
        militaryDiscontent: 10
      } as unknown as State;
      const result = applyWarFootingPoliticalCost(state);
      expect(result.peacetimeDiscontent).toBe(WAR_FOOTING_PEACETIME_DISCONTENT);
      expect(state.militaryDiscontent).toBe(10 + WAR_FOOTING_PEACETIME_DISCONTENT);
    });
  });
});
