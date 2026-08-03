import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  ANARCHY_PLUNDER_SHARE,
  applyFormRevenueMix,
  getWartimeIncomeMultiplier,
  MONARCHY_WARTIME_INCOME_MULTIPLIER,
  THEOCRACY_TITHE_SHARE
} from "./revenueMix";

function makeRuler(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Ruler",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
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

describe("revenueMix (PR-6)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
    clearNobilityContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    initNobilityContext(api);
  });

  describe("getWartimeIncomeMultiplier()", () => {
    it("boosts Monarchy only when diplomacy has Enemy", () => {
      expect(getWartimeIncomeMultiplier({ form: "Monarchy", diplomacy: ["Enemy"] })).toBe(
        MONARCHY_WARTIME_INCOME_MULTIPLIER
      );
      expect(getWartimeIncomeMultiplier({ form: "Monarchy", diplomacy: ["Ally"] })).toBe(1);
      expect(getWartimeIncomeMultiplier({ form: "Republic", diplomacy: ["Enemy"] })).toBe(1);
    });
  });

  describe("applyFormRevenueMix()", () => {
    it("credits wartime Monarchy subsidy onto L2 and raises adjusted income", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        diplomacy: ["Enemy"],
        treasury: 100
      } as unknown as State;

      const result = applyFormRevenueMix(state, 100);

      expect(result.wartimeSubsidy).toBe(15);
      expect(result.adjustedDomesticIncome).toBe(115);
      expect(state.treasury).toBe(115);
      expect(result.titheToEcclesiastica).toBe(0);
      expect(result.plunderToRuler).toBe(0);
    });

    it("moves Theocracy tithe from L2 into L3a.ecclesiastica", () => {
      const state = {
        i: 1,
        form: "Theocracy",
        diplomacy: [],
        treasury: 100
      } as unknown as State;

      const result = applyFormRevenueMix(state, 100);

      expect(result.titheToEcclesiastica).toBe(THEOCRACY_TITHE_SHARE * 100);
      expect(state.treasury).toBe(80);
      expect(state.departmentBalances?.ecclesiastica).toBe(20);
      expect(result.adjustedDomesticIncome).toBe(100);
    });

    it("skims Anarchy plunder share to the living ruler", () => {
      const ruler = makeRuler();
      const state = {
        i: 1,
        form: "Anarchy",
        diplomacy: [],
        treasury: 100
      } as unknown as State;
      worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;
      setRulerId(state, 1);

      const result = applyFormRevenueMix(state, 100);

      expect(result.plunderToRuler).toBe(ANARCHY_PLUNDER_SHARE * 100);
      expect(state.treasury).toBe(65);
      expect(ruler.wealth).toBe(35);
    });

    it("is a no-op for Republic peacetime (no routing off the top)", () => {
      const state = {
        i: 1,
        form: "Republic",
        diplomacy: [],
        treasury: 100
      } as unknown as State;

      const result = applyFormRevenueMix(state, 100);

      expect(result).toEqual({
        adjustedDomesticIncome: 100,
        titheToEcclesiastica: 0,
        plunderToRuler: 0,
        wartimeSubsidy: 0
      });
      expect(state.treasury).toBe(100);
    });
  });
});
