import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  allocateTreasury,
  CENTRAL_OFFICE_STIPEND_CAP,
  CENTRAL_OFFICE_STIPEND_FLOOR,
  clearTreasuryAllocationSnapshots,
  FIELD_COMMANDER_STIPEND_CAP,
  FIELD_COMMANDER_STIPEND_FLOOR,
  getCentralOfficePersonalStipend,
  getFieldCommanderStipend,
  getHouseholdStipendRate,
  getMilitaryFundingCeiling,
  getMilitaryStructuralMultiplier,
  getRulerHouseholdStipend,
  getTreasuryAllocationSnapshots,
  HOUSEHOLD_STIPEND_CAP,
  payRulerHouseholdStipend
} from "./treasuryAllocation";

function makeRuler(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Ruler",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: {} as Character["family"],
    appearance: 0,
    prestige: 0,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

describe("treasuryAllocation", () => {
  describe("getHouseholdStipendRate()", () => {
    it("returns the form-specific rate", () => {
      expect(getHouseholdStipendRate({ form: "Monarchy" })).toBe(0.25);
      expect(getHouseholdStipendRate({ form: "Republic" })).toBe(0.05);
      expect(getHouseholdStipendRate({ form: "Theocracy" })).toBe(0.08);
      expect(getHouseholdStipendRate({ form: "Union" })).toBe(0.08);
      expect(getHouseholdStipendRate({ form: "Anarchy" })).toBe(0.15);
    });

    it("falls back to the Monarchy rate for an unknown/missing form", () => {
      expect(getHouseholdStipendRate({ form: undefined })).toBe(0.25);
      expect(getHouseholdStipendRate({ form: "Something Else" })).toBe(0.25);
    });
  });

  describe("payRulerHouseholdStipend()", () => {
    it("skips (returns 0) when Characters context is not initialized", () => {
      const state = { i: 1, form: "Monarchy" } as unknown as State;
      expect(payRulerHouseholdStipend(state, 1000)).toBe(0);
    });

    describe("with Characters/Nobility context initialized", () => {
      afterEach(() => {
        clearNobilityContext();
        clearCharactersContext();
      });

      beforeEach(() => {
        const api = { worldContext } as unknown as ExtensionAPI;
        initNobilityContext(api);
        initCharactersContext(api);
        worldContext.pack = { characters: [] } as unknown as PackedGraph;
      });

      it("skips when domestic income is zero or negative", () => {
        const state = { i: 1, form: "Monarchy" } as unknown as State;
        expect(payRulerHouseholdStipend(state, 0)).toBe(0);
        expect(payRulerHouseholdStipend(state, -5)).toBe(0);
      });

      it("skips when the state has no ruler on file", () => {
        const state = { i: 1, form: "Monarchy" } as unknown as State;
        expect(payRulerHouseholdStipend(state, 1000)).toBe(0);
      });

      it("skips when the ruler id points at a dead or missing character", () => {
        const state = { i: 1, form: "Monarchy" } as unknown as State;
        setRulerId(state, 1);
        worldContext.pack.characters = [makeRuler({ dead: true })];

        expect(payRulerHouseholdStipend(state, 1000)).toBe(0);
      });

      it("pays the Monarchy household share capped at HOUSEHOLD_STIPEND_CAP from the household purse", () => {
        const state = { i: 1, form: "Monarchy", householdPurse: 100 } as unknown as State;
        setRulerId(state, 1);
        const ruler = makeRuler();
        worldContext.pack.characters = [ruler];

        // Raw 25% of 1000 = 250 → personal cap 5, drawn from L1
        const paid = payRulerHouseholdStipend(state, 1000);

        expect(paid).toBe(HOUSEHOLD_STIPEND_CAP);
        expect(ruler.wealth).toBe(HOUSEHOLD_STIPEND_CAP);
        expect(state.householdPurse).toBe(100 - HOUSEHOLD_STIPEND_CAP);
        expect(getRulerHouseholdStipend(state, 1000)).toBe(HOUSEHOLD_STIPEND_CAP);
      });

      it("accumulates wealth across multiple cycles instead of overwriting it", () => {
        const state = { i: 1, form: "Republic", householdPurse: 100 } as unknown as State;
        setRulerId(state, 1);
        const ruler = makeRuler({ wealth: 10 });
        worldContext.pack.characters = [ruler];

        // Republic 5% of 1000 = 50 → still capped at 5, from L1
        payRulerHouseholdStipend(state, 1000);
        payRulerHouseholdStipend(state, 1000);

        expect(ruler.wealth).toBe(10 + HOUSEHOLD_STIPEND_CAP * 2);
        expect(state.householdPurse).toBe(100 - HOUSEHOLD_STIPEND_CAP * 2);
      });

      it("pays nothing when the household purse is empty even if income is large", () => {
        const state = { i: 1, form: "Monarchy", householdPurse: 0, treasury: 0 } as unknown as State;
        setRulerId(state, 1);
        const ruler = makeRuler();
        worldContext.pack.characters = [ruler];

        expect(payRulerHouseholdStipend(state, 1000)).toBe(0);
        expect(ruler.wealth).toBe(0);
      });
    });
  });

  describe("creditHouseholdPurse() + allocateTreasury multi-ledger", () => {
    afterEach(() => {
      clearEconomyContext();
      clearNobilityContext();
      clearCharactersContext();
      clearTreasuryAllocationSnapshots();
    });

    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      initNobilityContext({ worldContext } as unknown as ExtensionAPI);
      initCharactersContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.pack = { states: [], characters: [] } as unknown as PackedGraph;
    });

    it("moves the nominal household share L2→L1 then pays the capped personal stipend L1→L0", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        treasury: 1000,
        householdPurse: 0
      } as unknown as State;
      setRulerId(state, 1);
      const ruler = makeRuler({ i: 1 });
      worldContext.pack.characters = [ruler];
      worldContext.pack.states = [undefined, state] as unknown as State[];

      const allocation = allocateTreasury(state, 1000);

      // Nominal HH 25% = 250 → L1; depts 750 → L3a; personal cap 5 → L0 from L1
      expect(allocation.householdNominal).toBe(250);
      expect(allocation.householdPurseCredit).toBe(250);
      expect(allocation.household).toBe(HOUSEHOLD_STIPEND_CAP);
      expect(allocation.departmentBalancesCredit).toBe(750);
      expect(state.householdPurse).toBe(250 - HOUSEHOLD_STIPEND_CAP);
      expect(state.treasury).toBe(0);
      expect(state.departmentBalances?.marshalcy).toBe(350);
      expect(state.departmentBalances?.chancery).toBe(150);
      expect(ruler.wealth).toBe(HOUSEHOLD_STIPEND_CAP);
    });

    it("parks department cash in L3a when the office is vacant (no personal pay)", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        treasury: 1000,
        householdPurse: 0
      } as unknown as State;
      worldContext.pack.characters = [];
      worldContext.pack.states = [undefined, state] as unknown as State[];

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.officeStipendsPaid).toBe(0);
      expect(allocation.departmentBalancesCredit).toBe(750);
      expect(state.departmentBalances?.marshalcy).toBe(350);
      expect(state.departmentBalances?.ecclesiastica).toBe(80);
      expect(state.treasury).toBe(0);
    });
  });

  describe("getMilitaryStructuralMultiplier()", () => {
    it("is 1 for a sovereign Monarchy with no vassal diplomacy", () => {
      const state = { form: "Monarchy", diplomacy: ["Ally", "Enemy"] } as unknown as State;
      expect(getMilitaryStructuralMultiplier(state)).toBe(1);
    });

    it("applies the vassal multiplier when diplomacy includes Vassal", () => {
      const state = { form: "Monarchy", diplomacy: ["Vassal"] } as unknown as State;
      expect(getMilitaryStructuralMultiplier(state)).toBe(0.55);
    });

    it("applies the Union multiplier for Union-form states", () => {
      const state = { form: "Union", diplomacy: [] } as unknown as State;
      expect(getMilitaryStructuralMultiplier(state)).toBe(0.75);
    });

    it("stacks vassal and Union multipliers", () => {
      const state = { form: "Union", diplomacy: ["Vassal"] } as unknown as State;
      expect(getMilitaryStructuralMultiplier(state)).toBeCloseTo(0.55 * 0.75, 10);
    });
  });

  describe("getMilitaryFundingCeiling()", () => {
    it("uses the peacetime tolerance floor when the state has no Enemy diplomacy", () => {
      const state = { form: "Monarchy", diplomacy: [] } as unknown as State;
      expect(getMilitaryFundingCeiling(state)).toBe(0.6);
    });

    it("uses the tighter wartime tolerance floor when the state has an Enemy", () => {
      const state = { form: "Monarchy", diplomacy: ["Enemy"] } as unknown as State;
      expect(getMilitaryFundingCeiling(state)).toBe(0.9);
    });

    it("combines the vassal structural multiplier with the peacetime floor (§4.3 worked example)", () => {
      const state = { form: "Union", diplomacy: ["Vassal"] } as unknown as State;
      // baseline(Union Marshalcy 20%) × structural(0.55×0.75) × peacetime(0.6) ≈ 6.6% per the design doc.
      expect(getMilitaryFundingCeiling(state)).toBeCloseTo(0.55 * 0.75 * 0.6, 2);
    });
  });

  describe("allocateTreasury()", () => {
    afterEach(() => {
      clearEconomyContext();
    });

    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.pack = { states: [] } as unknown as PackedGraph;
    });

    it("splits domestic income across all 6 departments per the form's baseline table", () => {
      const state = { i: 1, form: "Theocracy", diplomacy: [] } as unknown as State;

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.marshalcy).toBe(150); // 15%, no vassal/Union structural adjustment
      expect(allocation.household).toBe(0); // no Characters/Nobility context in this describe block
      expect(allocation.chancery).toBe(120);
      expect(allocation.stewardship).toBe(120);
      expect(allocation.spymastery).toBe(50);
      expect(allocation.ecclesiastica).toBe(480);
    });

    it("scales the Marshalcy Budget down by the structural multiplier for a vassal", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: ["Vassal"] } as unknown as State;

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.marshalcy).toBe(rn(1000 * 0.35 * 0.55, 2));
    });

    it("reports militaryFundingRatio 1 (no discontent risk) when the state has no troops to pay for", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], military: [] } as unknown as State;

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.militaryFundingRatio).toBe(1);
      expect(state.militaryFundingRatio).toBe(1);
      expect(state.militaryDiscontent ?? 0).toBe(0);
    });

    it("accumulates militaryDiscontent while the funding ratio stays underfunded, and decays once well-funded", () => {
      // Marshalcy Budget = 1000 × 0.35 = 350; Need is forced far above that so the ratio lands under 0.5.
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        military: [{ u: { Infantry: 100000 } }]
      } as unknown as State;

      allocateTreasury(state, 1000);
      expect(state.militaryFundingRatio).toBeLessThan(0.5);
      expect(state.militaryDiscontent).toBe(10); // strong gain, first cycle

      allocateTreasury(state, 1000);
      expect(state.militaryDiscontent).toBe(20); // strong gain again

      // Remove the troops so Need drops to 0 and the ratio becomes fully funded again.
      state.military = [];
      allocateTreasury(state, 1000);
      expect(state.militaryFundingRatio).toBe(1);
      expect(state.militaryDiscontent).toBe(15); // decays by 5
    });

    it("dispatches fmg:military-discontent-threshold exactly once when discontent crosses 100", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        military: [{ u: { Infantry: 100000 } }]
      } as unknown as State;
      const handler = vi.fn();
      document.addEventListener("fmg:military-discontent-threshold", handler);

      try {
        // Strong gain is 10/cycle; 11 cycles crosses the 100 threshold exactly once.
        for (let i = 0; i < 11; i++) allocateTreasury(state, 1000);
        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ stateId: 1, discontent: 100 });

        allocateTreasury(state, 1000); // stays above threshold — must not re-fire
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener("fmg:military-discontent-threshold", handler);
      }
    });
  });

  describe("allocateTreasury() central office stipends (payCentralOfficeStipends)", () => {
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
      clearTreasuryAllocationSnapshots();
    });

    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      initCharactersContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.pack = { states: [], characters: [] } as unknown as PackedGraph;
    });

    it("pays each living central office holder from L3a department balances (not 100% of Budget)", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], treasury: 1000 } as unknown as State;
      const chancellor = makeRuler({
        i: 10,
        titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }]
      });
      const marshal = makeRuler({
        i: 11,
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      });
      worldContext.pack.characters = [chancellor, marshal];

      const allocation = allocateTreasury(state, 1000);

      // Nominal budgets still full for funding-ratio / overview; personal pay is share+cap from L3a.
      expect(allocation.chancery).toBe(150);
      expect(allocation.marshalcy).toBe(350);
      expect(chancellor.wealth).toBe(getCentralOfficePersonalStipend(150));
      expect(marshal.wealth).toBe(getCentralOfficePersonalStipend(350));
      expect(chancellor.wealth).toBeLessThanOrEqual(CENTRAL_OFFICE_STIPEND_CAP);
      expect(marshal.wealth).toBeLessThanOrEqual(CENTRAL_OFFICE_STIPEND_CAP);
      expect(marshal.wealth).toBeGreaterThanOrEqual(CENTRAL_OFFICE_STIPEND_FLOOR);
      expect(allocation.officeStipendsPaid).toBe(chancellor.wealth + marshal.wealth);
      // Institutional remainder stays in L3a
      expect(state.departmentBalances?.chancery).toBe(rn(150 - chancellor.wealth, 2));
      expect(state.departmentBalances?.marshalcy).toBe(rn(350 - marshal.wealth, 2));
    });

    it("leaves a vacant office's share in L3a instead of paying anyone", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], treasury: 1000 } as unknown as State;
      worldContext.pack.characters = [];

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.officeStipendsPaid).toBe(0);
      expect(allocation.chancery).toBe(150); // nominal Budget unaffected by vacancy
      expect(state.departmentBalances?.chancery).toBe(150);
      expect(state.departmentBalances?.marshalcy).toBe(350);
    });

    it("does not pay a dead office holder", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], treasury: 1000 } as unknown as State;
      const deadChancellor = makeRuler({
        i: 10,
        dead: true,
        titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }]
      });
      worldContext.pack.characters = [deadChancellor];

      allocateTreasury(state, 1000);

      expect(deadChancellor.wealth).toBe(0);
      expect(state.departmentBalances?.chancery).toBe(150);
    });

    it("does not pay a same-title office holder of a different state", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], treasury: 1000 } as unknown as State;
      const otherStateChancellor = makeRuler({
        i: 10,
        titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 2 }]
      });
      worldContext.pack.characters = [otherStateChancellor];

      allocateTreasury(state, 1000);

      expect(otherStateChancellor.wealth).toBe(0);
    });

    it("keeps the nominal Marshalcy Budget (and militaryFundingRatio) unaffected by Marshal vacancy", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], military: [], treasury: 1000 } as unknown as State;
      worldContext.pack.characters = [];

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.militaryFundingRatio).toBe(1); // no troops => Need 0 => ratio 1, unaffected by vacancy
      expect(allocation.marshalcy).toBe(350);
      expect(state.departmentBalances?.marshalcy).toBe(350);
    });
  });

  describe("allocateTreasury() field commander stipends (payFieldCommanderStipends)", () => {
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
      clearTreasuryAllocationSnapshots();
    });

    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      initCharactersContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.pack = { states: [], characters: [] } as unknown as PackedGraph;
    });

    it("pays a regiment's living commander a share of that regiment's own upkeep", () => {
      const commander = makeRuler({
        i: 20,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      });
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        military: [{ state: 1, commanderId: 20, u: { Infantry: 100 } }]
      } as unknown as State;
      worldContext.pack.characters = [commander];

      const allocation = allocateTreasury(state, 1000);

      // regiment upkeep = 100 heads × 0.12/head = 12; stipend = clamp(12 × 0.15, 0.5, 1.5) = 1.5 (cap)
      expect(allocation.fieldCommanderStipendsPaid).toBe(FIELD_COMMANDER_STIPEND_CAP);
      expect(commander.wealth).toBe(FIELD_COMMANDER_STIPEND_CAP);
      expect(getFieldCommanderStipend({ u: { Infantry: 100 } })).toBe(FIELD_COMMANDER_STIPEND_CAP);
    });

    it("applies the personal-pay floor when regiment upkeep would yield copper scraps", () => {
      const commander = makeRuler({
        i: 22,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      });
      // 1 head → upkeep 0.12 → proportional 0.018, floor lifts to 0.5
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        military: [{ state: 1, commanderId: 22, u: { Infantry: 1 } }]
      } as unknown as State;
      worldContext.pack.characters = [commander];

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.fieldCommanderStipendsPaid).toBe(FIELD_COMMANDER_STIPEND_FLOOR);
      expect(commander.wealth).toBe(FIELD_COMMANDER_STIPEND_FLOOR);
    });

    it("never pays the capital guard's commander (already paid as Marshal via officeStipendsPaid)", () => {
      const marshal = makeRuler({
        i: 21,
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      });
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        treasury: 1000,
        military: [{ state: 1, commanderId: 21, isCapitalGuard: true, u: { Infantry: 100 } }]
      } as unknown as State;
      worldContext.pack.characters = [marshal];

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.fieldCommanderStipendsPaid).toBe(0);
      expect(marshal.wealth).toBe(getCentralOfficePersonalStipend(350));
    });

    it("skips a regiment with no living dedicated officer", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: [],
        military: [{ state: 1, u: { Infantry: 100 } }]
      } as unknown as State;
      worldContext.pack.characters = [];

      const allocation = allocateTreasury(state, 1000);

      expect(allocation.fieldCommanderStipendsPaid).toBe(0);
    });
  });

  describe("getTreasuryAllocationSnapshots() / clearTreasuryAllocationSnapshots()", () => {
    afterEach(() => {
      clearEconomyContext();
      clearTreasuryAllocationSnapshots();
    });

    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.pack = { states: [] } as unknown as PackedGraph;
      clearTreasuryAllocationSnapshots();
    });

    it("is empty before any allocateTreasury() call", () => {
      expect(getTreasuryAllocationSnapshots()).toEqual([]);
    });

    it("records the latest breakdown per state, keyed by stateId", () => {
      const state = { i: 7, form: "Monarchy", diplomacy: [] } as unknown as State;

      allocateTreasury(state, 1000);
      const [snapshot] = getTreasuryAllocationSnapshots();

      expect(snapshot).toMatchObject({ stateId: 7, domesticIncome: 1000, marshalcy: 350, ecclesiastica: 80 });
    });

    it("overwrites rather than accumulates on repeated calls for the same state", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [] } as unknown as State;

      allocateTreasury(state, 1000);
      allocateTreasury(state, 2000);

      const snapshots = getTreasuryAllocationSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].domesticIncome).toBe(2000);
    });

    it("clears all recorded snapshots", () => {
      allocateTreasury({ i: 1, form: "Monarchy", diplomacy: [] } as unknown as State, 1000);
      clearTreasuryAllocationSnapshots();

      expect(getTreasuryAllocationSnapshots()).toEqual([]);
    });
  });
});
