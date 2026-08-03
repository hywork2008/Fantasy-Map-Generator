import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMerchantGoodSalesLedgers,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import type { Market } from "./marketTypes";
import { syncMarketMerchantPortfolios } from "./merchantPortfolios";
import { executePlayerMarketTrade } from "./playerCommerce";
import { planRetailReplenishment, reconcileRetailInventory, validateRetailInventory } from "./retailInventory";

function character(i: number, name: string, wealth: number, location?: number): Character {
  return {
    i,
    name,
    age: 30,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: { diplomacy: 1, martial: 1, stewardship: 1, intrigue: 1, learning: 1 },
    personality: { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 },
    family: { parents: [], children: [], siblings: [] },
    appearance: 0,
    prestige: 0,
    wealth,
    location,
    pastTitles: []
  } as Character;
}

describe("player commerce", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext: { tickCount: 4, extensions: {} }
    } as unknown as ExtensionAPI);
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { gunpowderEraEnabled: true } as typeof worldContext.options;
    worldContext.pack = {
      characters: [character(1, "Player", 100, 1), character(2, "Merchant", 0, 1)],
      states: [{ i: 0 }, { i: 1, salesTax: 0.1, treasury: 0 }],
      burgs: [{ i: 0 } as Burg, { i: 1, name: "Port", market: 1, state: 1, population: 100, x: 0, y: 0 } as Burg],
      cells: { i: [0, 1] }
    } as unknown as PackedGraph;
    setGoods([
      {
        i: 1,
        name: "Cloth",
        value: 10,
        tags: [],
        unit: "bale",
        icon: "🧵",
        color: "#fff",
        trade: { weight: 2, bulk: 2, rarity: 2, distancePremium: 0, timeValueTrend: 0, durability: 3, lossRisk: 1 }
      }
    ]);
    Goods.sync();
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      managerCharacterId: 2,
      goods: { 1: { stock: 100, price: 10 } },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 }
    };
    setMarkets([market]);
    syncMarketMerchantPortfolios();
    reconcileRetailInventory();
    planRetailReplenishment();
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("moves only shelf stock into the character and credits the assigned merchant", () => {
    const result = executePlayerMarketTrade({ characterId: 1, goodId: 1, units: 2, direction: "buy" });

    expect(result.ok).toBe(true);
    expect(result.receipt).toMatchObject({ direction: "buy", merchantId: 2, units: 2, goodsValue: 22, salesTax: 2.2 });
    expect(worldContext.pack.characters![0].inventory?.[1]).toBe(2);
    expect(worldContext.pack.characters![0].wealth).toBe(75.8);
    expect(worldContext.pack.characters![1].wealth).toBe(2.64);
    expect(worldContext.pack.states[1].treasury).toBe(2.2);
    expect(getMerchantGoodSalesLedgers()).toMatchObject([{ merchantId: 2, goodId: 1, playerUnitsSold: 2 }]);
    expect(validateRetailInventory()).toEqual([]);
  });

  it("leaves all balances and stock untouched when a purchase exceeds shelf stock", () => {
    const before = JSON.stringify({
      player: worldContext.pack.characters![0],
      merchant: worldContext.pack.characters![1],
      market: worldContext.pack.markets?.[0],
      state: worldContext.pack.states[1]
    });

    const result = executePlayerMarketTrade({ characterId: 1, goodId: 1, units: 21, direction: "buy" });

    expect(result).toMatchObject({ ok: false, message: "Not enough stock on this burg's shelves." });
    expect(
      JSON.stringify({
        player: worldContext.pack.characters![0],
        merchant: worldContext.pack.characters![1],
        market: worldContext.pack.markets?.[0],
        state: worldContext.pack.states[1]
      })
    ).toBe(before);
  });
});
