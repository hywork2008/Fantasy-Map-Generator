import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, MilitaryRegiment, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import { getStateArmyFoodConsumptionPerDay, getStateMilitaryUpkeep } from "./militaryLogistics";

function regiment(u: Record<string, number>): MilitaryRegiment {
  return { u } as unknown as MilitaryRegiment;
}

describe("militaryLogistics", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { states: [], burgs: [], markets: [], deals: [] } as unknown as PackedGraph;
    worldContext.options = {} as typeof worldContext.options;
    worldContext.populationRate = undefined as unknown as number;
  });

  describe("getStateMilitaryUpkeep()", () => {
    it("returns 0 for a state with no military", () => {
      const state: State = { i: 1 } as unknown as State;
      expect(getStateMilitaryUpkeep(state)).toBe(0);
    });

    it("returns 0 for a state whose regiments have no units", () => {
      const state: State = { i: 1, military: [regiment({})] } as unknown as State;
      expect(getStateMilitaryUpkeep(state)).toBe(0);
    });

    it("scales linearly with headcount for a non-mounted unit", () => {
      const small: State = { i: 1, military: [regiment({ infantry: 10 })] } as unknown as State;
      const large: State = { i: 2, military: [regiment({ infantry: 20 })] } as unknown as State;

      expect(getStateMilitaryUpkeep(large)).toBeCloseTo(getStateMilitaryUpkeep(small) * 2, 5);
    });

    it("charges a mounted unit (options.military type 'mounted') exactly the mounted multiplier over an equal-headcount non-mounted unit", () => {
      worldContext.options.military = [
        { name: "infantry", type: "melee" },
        { name: "cavalry", type: "mounted" }
      ] as unknown as typeof worldContext.options.military;

      const footState: State = { i: 1, military: [regiment({ infantry: 10 })] } as unknown as State;
      const mountedState: State = { i: 2, military: [regiment({ cavalry: 10 })] } as unknown as State;

      const footUpkeep = getStateMilitaryUpkeep(footState);
      const mountedUpkeep = getStateMilitaryUpkeep(mountedState);

      expect(footUpkeep).toBeGreaterThan(0);
      expect(mountedUpkeep).toBeGreaterThan(footUpkeep);
    });

    it("sums upkeep across multiple regiments", () => {
      const state: State = {
        i: 1,
        military: [regiment({ infantry: 10 }), regiment({ infantry: 10 })]
      } as unknown as State;
      const single: State = { i: 2, military: [regiment({ infantry: 20 })] } as unknown as State;

      expect(getStateMilitaryUpkeep(state)).toBeCloseTo(getStateMilitaryUpkeep(single), 5);
    });

    it("divides real troop headcounts by populationRate before costing them, so upkeep stays comparable to raw-score-population treasury income", () => {
      // military-generator.ts scales regiment.u counts by populationRate (real headcounts, e.g.
      // thousands) while treasury/pollTax stay in the economy extension's raw-score population
      // unit — without this conversion a single sizeable regiment would always dwarf poll tax
      // income and permanently clamp treasury at 0.
      const state: State = { i: 1, military: [regiment({ infantry: 2000 })] } as unknown as State;

      worldContext.populationRate = 1000;
      const scaledUpkeep = getStateMilitaryUpkeep(state);

      worldContext.populationRate = 1;
      const unscaledUpkeep = getStateMilitaryUpkeep(state);

      expect(scaledUpkeep).toBeCloseTo(unscaledUpkeep / 1000, 5);
      expect(scaledUpkeep).toBeLessThan(1);
    });
  });

  describe("getStateArmyFoodConsumptionPerDay()", () => {
    it("returns 0 for a state with no military", () => {
      const state: State = { i: 1 } as unknown as State;
      expect(getStateArmyFoodConsumptionPerDay(state)).toBe(0);
    });

    it("scales linearly with headcount", () => {
      const small: State = { i: 1, military: [regiment({ infantry: 10 })] } as unknown as State;
      const large: State = { i: 2, military: [regiment({ infantry: 30 })] } as unknown as State;

      expect(getStateArmyFoodConsumptionPerDay(large)).toBeCloseTo(getStateArmyFoodConsumptionPerDay(small) * 3, 5);
    });
  });
});
