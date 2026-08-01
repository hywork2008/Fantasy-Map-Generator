import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { getHouseholdStipendRate, payRulerHouseholdStipend } from "./treasuryAllocation";

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

      it("pays the Monarchy rate (25%) to the ruler and returns the deducted amount", () => {
        const state = { i: 1, form: "Monarchy" } as unknown as State;
        setRulerId(state, 1);
        const ruler = makeRuler();
        worldContext.pack.characters = [ruler];

        const paid = payRulerHouseholdStipend(state, 1000);

        expect(paid).toBe(250);
        expect(ruler.wealth).toBe(250);
      });

      it("accumulates wealth across multiple cycles instead of overwriting it", () => {
        const state = { i: 1, form: "Republic" } as unknown as State;
        setRulerId(state, 1);
        const ruler = makeRuler({ wealth: 10 });
        worldContext.pack.characters = [ruler];

        payRulerHouseholdStipend(state, 1000); // +50 (5% of 1000)
        payRulerHouseholdStipend(state, 1000); // +50 again

        expect(ruler.wealth).toBe(110);
      });
    });
  });
});
