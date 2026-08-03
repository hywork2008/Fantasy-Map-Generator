import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import {
  applyDebtDefaultConsequences,
  DEBT_COUP_DISCONTENT_THRESHOLD,
  DEBT_DEFAULT_POOL_FLIGHT_RATE
} from "./debtDefaultConsequences";
import type { Market } from "./marketTypes";

function makeMerchant(id: number, wealth: number): Character {
  return {
    i: id,
    name: `M${id}`,
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {
      boldness: 50,
      compassion: 50,
      confidence: 50,
      energy: 50,
      greed: 60,
      guile: 50,
      honor: 50,
      piety: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 50,
      zeal: 50
    } as Character["personality"],
    family: {} as Character["family"],
    appearance: 0,
    prestige: 0,
    wealth,
    pastTitles: [],
    dead: false
  } as Character;
}

describe("debtDefaultConsequences (PR-12)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    worldContext.pack = { characters: [], states: [], burgs: [] } as unknown as PackedGraph;
    setMarkets([]);
  });

  it("is a no-op when not in default", () => {
    const state = { i: 1, creditPoolBalance: 100, militaryDiscontent: 10 } as unknown as State;
    const result = applyDebtDefaultConsequences(state, { inDefault: false, enteredDefault: false });
    expect(result.poolFlight).toBe(0);
    expect(state.creditPoolBalance).toBe(100);
  });

  it("flees credit pool while in default", () => {
    const state = {
      i: 1,
      creditPoolBalance: 100,
      militaryDiscontent: 10,
      debtInDefault: true
    } as unknown as State;
    const result = applyDebtDefaultConsequences(state, { inDefault: true, enteredDefault: false });
    expect(result.poolFlight).toBeCloseTo(100 * DEBT_DEFAULT_POOL_FLIGHT_RATE, 5);
    expect(state.creditPoolBalance).toBeCloseTo(100 * (1 - DEBT_DEFAULT_POOL_FLIGHT_RATE), 5);
    expect(state.militaryDiscontent).toBeGreaterThan(10);
  });

  it("haircuts syndicate merchant wealth", () => {
    const merchant = makeMerchant(9, 40);
    const state = {
      i: 1,
      capital: 1,
      creditPoolBalance: 50,
      militaryDiscontent: 5,
      debtInDefault: true
    } as unknown as State;
    worldContext.pack = {
      characters: [merchant],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        managerCharacterId: 9
      } as Market
    ]);

    const result = applyDebtDefaultConsequences(state, { inDefault: true, enteredDefault: true });
    expect(result.merchantHaircutTotal).toBeGreaterThan(0);
    expect(merchant.wealth).toBeLessThan(40);
  });

  it("fires coup-risk event when discontent is high", () => {
    const handler = vi.fn();
    document.addEventListener("fmg:debt-coup-risk", handler);
    const state = {
      i: 3,
      creditPoolBalance: 10,
      militaryDiscontent: DEBT_COUP_DISCONTENT_THRESHOLD,
      debtInDefault: true
    } as unknown as State;
    const result = applyDebtDefaultConsequences(state, { inDefault: true, enteredDefault: false });
    expect(result.coupRisk).toBe(true);
    expect(state.debtCoupRisk).toBe(true);
    expect(state.debtCoupSupportPenalty).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("fmg:debt-coup-risk", handler);
  });
});
