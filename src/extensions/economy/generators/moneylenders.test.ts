import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import type { Market } from "./marketTypes";
import {
  BANKER_ROLE_KIND,
  BASE_PUBLIC_DEBT_INTEREST_RATE,
  ensureStateBankerRole,
  getStateDebtInterestRate,
  MONEYLENDER_PERSONAL_SHARE,
  negotiateDebtInterestRate,
  resolveMoneylenderSyndicate,
  splitCreditorPayout
} from "./moneylenders";

function makeMerchant(id: number, name: string, greed: number, wealth = 10): Character {
  return {
    i: id,
    name,
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
      greed,
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

describe("moneylenders (PR-10)", () => {
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

  it("resolves capital market manager and rivals as a syndicate", () => {
    const manager = makeMerchant(1, "Aldo", 80, 20);
    const rival = makeMerchant(2, "Berta", 40, 5);
    const state = { i: 1, capital: 1 } as unknown as State;
    worldContext.pack = {
      characters: [manager, rival],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        managerCharacterId: 1,
        rivalCharacterIds: [2]
      } as Market
    ]);

    const syndicate = resolveMoneylenderSyndicate(state);
    expect(syndicate.members).toHaveLength(2);
    expect(syndicate.primary?.characterId).toBe(1);
    expect(syndicate.primary?.name).toBe("Aldo");
    expect(syndicate.averageGreed).toBeGreaterThan(50);
  });

  it("raises interest rate when syndicate greed is high", () => {
    const greedy = makeMerchant(1, "Greedy", 100, 30);
    const state = { i: 1, form: "Monarchy", capital: 1, councilSupport: 50 } as unknown as State;
    worldContext.pack = {
      characters: [greedy],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {}, managerCharacterId: 1 } as Market]);

    const rate = getStateDebtInterestRate(state);
    expect(rate).toBeGreaterThan(BASE_PUBLIC_DEBT_INTEREST_RATE);
  });

  it("splits creditor payouts into pool remainder and personal wealth", () => {
    const manager = makeMerchant(1, "Aldo", 70, 0);
    const state = { i: 1, capital: 1 } as unknown as State;
    worldContext.pack = {
      characters: [manager],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {}, managerCharacterId: 1 } as Market]);

    const result = splitCreditorPayout(state, 100);
    expect(result.toLenders).toBe(100 * MONEYLENDER_PERSONAL_SHARE);
    expect(result.toPool).toBe(100 - result.toLenders);
    expect(manager.wealth).toBe(result.toLenders);
    expect(result.primaryName).toBe("Aldo");
  });

  it("keeps full payout in the pool when no named lenders exist", () => {
    const state = { i: 1, capital: 1 } as unknown as State;
    worldContext.pack = {
      characters: [],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market]);

    const result = splitCreditorPayout(state, 50);
    expect(result.toPool).toBe(50);
    expect(result.toLenders).toBe(0);
    expect(result.primaryName).toBeNull();
  });

  it("negotiates a lower rate when treasury can pay the bribe", () => {
    const manager = makeMerchant(1, "Aldo", 50, 10);
    const state = {
      i: 1,
      form: "Monarchy",
      capital: 1,
      treasury: 20,
      councilSupport: 60,
      creditPoolBalance: 50,
      debtRateNegotiation: 0
    } as unknown as State;
    worldContext.pack = {
      characters: [manager],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {}, managerCharacterId: 1 } as Market]);

    const before = getStateDebtInterestRate(state);
    const result = negotiateDebtInterestRate(state, -1);
    expect(result.ok).toBe(true);
    expect(state.debtRateNegotiation).toBeLessThan(0);
    expect(getStateDebtInterestRate(state)).toBeLessThan(before);
    expect(state.treasury).toBeLessThan(20);
  });

  it("tags the primary moneylender with a Banker role (PR-12)", () => {
    const manager = makeMerchant(1, "Aldo", 70, 20);
    const state = { i: 1, capital: 1 } as unknown as State;
    worldContext.pack = {
      characters: [manager],
      states: [undefined, state],
      burgs: [undefined, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {}, managerCharacterId: 1 } as Market]);

    const banker = ensureStateBankerRole(state);
    expect(banker?.i).toBe(1);
    expect(manager.roles?.some(r => r.kind === BANKER_ROLE_KIND && r.entityId === 1)).toBe(true);
  });
});
