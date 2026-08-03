import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, Province, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  drawHouseholdPurseToPersonal,
  getFiscalAuthorityView,
  getFormFiscalPolicy,
  remitDomainToStateTreasury,
  seizePublicTreasuryToPersonal,
  spendDomainTreasury,
  toggleWarFootingForRuler
} from "./fiscalAuthority";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
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

describe("fiscalAuthority", () => {
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

  describe("getFormFiscalPolicy()", () => {
    it("blocks free household/public draws in Republic", () => {
      const policy = getFormFiscalPolicy("Republic");
      expect(policy.canDrawHouseholdToPersonal).toBe(false);
      expect(policy.canSpendPublicDirectly).toBe(false);
    });

    it("allows household draw in Monarchy and public seize in Anarchy", () => {
      expect(getFormFiscalPolicy("Monarchy").canDrawHouseholdToPersonal).toBe(true);
      expect(getFormFiscalPolicy("Monarchy").canSpendPublicDirectly).toBe(false);
      expect(getFormFiscalPolicy("Anarchy").canSpendPublicDirectly).toBe(true);
    });
  });

  describe("getFiscalAuthorityView()", () => {
    it("sums allowed ledgers into spendableAsRuler", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        treasury: 100,
        householdPurse: 40
      } as unknown as State;
      const ruler = makeCharacter({
        i: 1,
        wealth: 3,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      });
      worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;

      const view = getFiscalAuthorityView(state, ruler);
      expect(view.spendableBreakdown.personal).toBe(3);
      expect(view.spendableBreakdown.household).toBe(40);
      expect(view.spendableBreakdown.public).toBe(0); // monarchy cannot seize public
      expect(view.spendableAsRuler).toBe(43);
      expect(view.canDrawHouseholdToPersonal).toBe(true);
    });
  });

  describe("drawHouseholdPurseToPersonal()", () => {
    it("moves L1 cash to the living ruler's personal wealth", () => {
      const state = { i: 1, form: "Monarchy", householdPurse: 20 } as unknown as State;
      const ruler = makeCharacter({ i: 1, wealth: 1 });
      setRulerId(state, 1);
      worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;

      const result = drawHouseholdPurseToPersonal(state, 1, 100);
      expect(result.ok).toBe(true);
      expect(result.paid).toBe(5); // action cap
      expect(state.householdPurse).toBe(15);
      expect(ruler.wealth).toBe(6);
    });

    it("rejects Republic free draws", () => {
      const state = { i: 1, form: "Republic", householdPurse: 20 } as unknown as State;
      const ruler = makeCharacter({ i: 1, wealth: 0 });
      setRulerId(state, 1);
      worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;

      const result = drawHouseholdPurseToPersonal(state, 1, 5);
      expect(result.ok).toBe(false);
      expect(result.paid).toBe(0);
      expect(state.householdPurse).toBe(20);
    });
  });

  describe("seizePublicTreasuryToPersonal()", () => {
    it("allows Anarchy rulers to take public cash", () => {
      const state = { i: 1, form: "Anarchy", treasury: 12 } as unknown as State;
      const ruler = makeCharacter({ i: 1, wealth: 0 });
      setRulerId(state, 1);
      worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;

      const result = seizePublicTreasuryToPersonal(state, 1, 5);
      expect(result).toEqual({ ok: true, paid: 5 });
      expect(state.treasury).toBe(7);
      expect(ruler.wealth).toBe(5);
    });
  });

  describe("spendDomainTreasury()", () => {
    it("consumes seated burg treasury for a province lord", () => {
      const lord = makeCharacter({
        i: 2,
        titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }]
      });
      const burg = { i: 5, treasury: 9, removed: false } as unknown as Burg;
      worldContext.pack = {
        characters: [lord],
        provinces: [undefined, { i: 1, burg: 5, state: 1 } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg]
      } as unknown as PackedGraph;

      const result = spendDomainTreasury(2, 3);
      expect(result).toEqual({ ok: true, paid: 3 });
      expect(burg.treasury).toBe(6);
      expect(lord.wealth).toBe(0); // spent, not pocketed
    });
  });

  describe("remitDomainToStateTreasury() (PR-6)", () => {
    it("moves domain cash into the owning state's public L2", () => {
      const lord = makeCharacter({
        i: 2,
        titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }]
      });
      const state = { i: 1, form: "Monarchy", treasury: 10 } as unknown as State;
      const burg = { i: 5, treasury: 9, state: 1, removed: false } as unknown as Burg;
      worldContext.pack = {
        characters: [lord],
        states: [undefined, state],
        provinces: [undefined, { i: 1, burg: 5, state: 1 } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg]
      } as unknown as PackedGraph;

      const result = remitDomainToStateTreasury(2, 4);
      expect(result).toEqual({ ok: true, paid: 4 });
      expect(burg.treasury).toBe(5);
      expect(state.treasury).toBe(14);
      expect(lord.wealth).toBe(0);
    });
  });

  describe("toggleWarFootingForRuler() (PR-6)", () => {
    it("lets the living ruler enable and disable war footing", () => {
      const state = { i: 1, form: "Monarchy", warFooting: false } as unknown as State;
      const ruler = makeCharacter({ i: 1 });
      setRulerId(state, 1);
      worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;

      const on = toggleWarFootingForRuler(state, 1);
      expect(on).toEqual({ ok: true, paid: 0, warFooting: true });
      expect(state.warFooting).toBe(true);

      const off = toggleWarFootingForRuler(state, 1);
      expect(off.warFooting).toBe(false);
      expect(state.warFooting).toBe(false);
    });

    it("rejects non-rulers", () => {
      const state = { i: 1, form: "Monarchy" } as unknown as State;
      const ruler = makeCharacter({ i: 1 });
      const other = makeCharacter({ i: 2 });
      setRulerId(state, 1);
      worldContext.pack = { characters: [ruler, other], states: [undefined, state] } as unknown as PackedGraph;

      const result = toggleWarFootingForRuler(state, 2);
      expect(result.ok).toBe(false);
      expect(state.warFooting).toBeFalsy();
    });
  });
});
