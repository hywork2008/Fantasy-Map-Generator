import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import {
  CREDIT_POOL_BASE_SEED,
  ensureCreditPoolSeeded,
  lendFromCreditPool,
  payToCreditPool,
  routeTaxFarmProceeds,
  TAX_FARM_TO_CREDIT_POOL_SHARE
} from "./creditPool";
import type { Market } from "./marketTypes";

describe("creditPool (PR-9)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    worldContext.pack = { states: [], burgs: [] } as unknown as PackedGraph;
    setMarkets([]);
  });

  it("seeds a baseline credit pool on first touch", () => {
    const state = { i: 1, form: "Monarchy" } as unknown as State;
    const bal = ensureCreditPoolSeeded(state);
    expect(bal).toBe(CREDIT_POOL_BASE_SEED);
    expect(state.creditPoolBalance).toBe(CREDIT_POOL_BASE_SEED);
    // Second call does not re-seed
    expect(ensureCreditPoolSeeded(state)).toBe(CREDIT_POOL_BASE_SEED);
  });

  it("lends only up to pool balance and reduces the pool", () => {
    const state = { i: 1, creditPoolBalance: 30 } as unknown as State;
    const result = lendFromCreditPool(state, 50);
    expect(result.lent).toBe(30);
    expect(state.creditPoolBalance).toBe(0);
  });

  it("receives payments into the pool", () => {
    const state = { i: 1, creditPoolBalance: 10 } as unknown as State;
    const result = payToCreditPool(state, 5);
    expect(result.paid).toBe(5);
    expect(state.creditPoolBalance).toBe(15);
  });

  it("routes most tax-farm proceeds to the credit pool", () => {
    const state = { i: 1, capital: 1, creditPoolBalance: 0 } as unknown as State;
    const capital = { i: 1, treasury: 0, removed: false } as unknown as Burg;
    worldContext.pack = { states: [undefined, state], burgs: [undefined, capital] } as unknown as PackedGraph;

    const result = routeTaxFarmProceeds(state, 100);
    expect(result.toCreditPool).toBe(100 * TAX_FARM_TO_CREDIT_POOL_SHARE);
    expect(state.creditPoolBalance).toBeGreaterThanOrEqual(result.toCreditPool);
  });

  it("skims a share to the capital market manager when present", () => {
    const manager = {
      i: 9,
      wealth: 1,
      dead: false,
      name: "Merchant",
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
      pastTitles: []
    } as Character;
    const state = { i: 1, capital: 1, creditPoolBalance: 10 } as unknown as State;
    worldContext.pack = {
      characters: [manager],
      states: [undefined, state],
      burgs: [undefined, { i: 1, treasury: 0, removed: false } as Burg]
    } as unknown as PackedGraph;
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        managerCharacterId: 9,
        marketTreasury: { balance: 0, ruralGrainPayable: 0 }
      } as Market
    ]);

    const result = routeTaxFarmProceeds(state, 100);
    expect(result.toCreditPool).toBe(70);
    expect(result.toManager).toBeGreaterThan(0);
    expect(manager.wealth).toBeGreaterThan(1);
  });
});
