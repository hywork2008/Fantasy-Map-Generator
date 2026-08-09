import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { getCharacterMarketSnapshot } from "../controllers/characterMarket";
import {
  clearEconomyContext,
  getCharacterInventoryCostBases,
  getMarkets,
  getMerchantGoodSalesLedgers,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import type { Market } from "./marketTypes";
import { syncMarketMerchantPortfolios } from "./merchantPortfolios";
import { executePlayerMarketTrade, migrateLegacyPlayerGrainInventory, quotePlayerMarketTrade } from "./playerCommerce";
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
    expect(getCharacterInventoryCostBases()).toEqual([{ characterId: 1, goodId: 1, units: 2, averageUnitCost: 12.1 }]);
    expect(worldContext.pack.characters![1].wealth).toBe(2.64);
    expect(worldContext.pack.states[1].treasury).toBe(2.2);
    expect(getMerchantGoodSalesLedgers()).toMatchObject([{ merchantId: 2, goodId: 1, playerUnitsSold: 2 }]);
    expect(validateRetailInventory()).toEqual([]);
  });

  it("leaves all balances and stock untouched when a purchase exceeds locally held stock", () => {
    const before = JSON.stringify({
      player: worldContext.pack.characters![0],
      merchant: worldContext.pack.characters![1],
      market: worldContext.pack.markets?.[0],
      state: worldContext.pack.states[1]
    });

    const result = executePlayerMarketTrade({ characterId: 1, goodId: 1, units: 101, direction: "buy" });

    expect(result).toMatchObject({ ok: false, message: "Not enough stock is available in this burg." });
    expect(
      JSON.stringify({
        player: worldContext.pack.characters![0],
        merchant: worldContext.pack.characters![1],
        market: worldContext.pack.markets?.[0],
        state: worldContext.pack.states[1]
      })
    ).toBe(before);
  });

  it("rejects a quantity below the product's retail lot before changing any balance", () => {
    const before = JSON.stringify(worldContext.pack);

    const quote = quotePlayerMarketTrade({ characterId: 1, goodId: 1, units: 1.231, direction: "buy" });
    const result = executePlayerMarketTrade({ characterId: 1, goodId: 1, units: 1.231, direction: "buy" });

    expect(quote).toMatchObject({ ok: false, message: "This good is traded in increments of 0.01 bale." });
    expect(result).toMatchObject({ ok: false, message: "This good is traded in increments of 0.01 bale." });
    expect(JSON.stringify(worldContext.pack)).toBe(before);
  });

  it("keeps the remaining average acquisition cost when the character sells part of a holding", () => {
    expect(executePlayerMarketTrade({ characterId: 1, goodId: 1, units: 2, direction: "buy" }).ok).toBe(true);
    expect(executePlayerMarketTrade({ characterId: 1, goodId: 1, units: 1, direction: "sell" }).ok).toBe(true);

    expect(worldContext.pack.characters![0].inventory).toEqual({ 1: 1 });
    expect(getCharacterInventoryCostBases()).toEqual([{ characterId: 1, goodId: 1, units: 1, averageUnitCost: 12.1 }]);
  });

  it("sells the named staple crop from the Food Ledger instead of its Grain summary", () => {
    setGoods([
      {
        i: 1,
        name: "Grain",
        value: 1,
        tags: ["food", "stapleFood"],
        unit: "wain",
        icon: "🌾",
        color: "#fff"
      },
      {
        i: 2,
        name: "Wheat",
        value: 1,
        tags: ["food", "stapleCrop", "crop", "cereal"],
        unit: "wain",
        icon: "🌾",
        color: "#f5d76e"
      }
    ]);
    Goods.sync();
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        managerCharacterId: 2,
        goods: { 1: { stock: 5, price: 1 } },
        foodLedger: {
          foodProduced: 0,
          ruralNeed: 0,
          urbanNeed: 0,
          exportable: 5,
          importNeed: 0,
          targetStock: 0,
          satisfiedImport: 0,
          importCapacityBonus: 0,
          foodStockAge0: 5,
          foodStockAge1: 5,
          foodStockAge2: 0,
          foodStockAge0UnitCost: 0.8,
          foodStockAge1UnitCost: 0.8,
          foodStockAge2UnitCost: 0,
          storageOverflow: 0,
          stapleCropInventories: {
            2: { age0: 5, age1: 5, age2: 0, age0UnitCost: 0.8, age1UnitCost: 0.8, age2UnitCost: 0, overflow: 0 }
          },
          ruralFoodStressQuarters: 0,
          urbanFoodStressQuarters: 0,
          ruralSevereDeficitQuarters: 0,
          urbanSevereDeficitQuarters: 0
        },
        marketTreasury: { balance: 0, ruralGrainPayable: 0 }
      }
    ]);
    syncMarketMerchantPortfolios();

    const snapshot = getCharacterMarketSnapshot(1);
    expect(snapshot?.rows.map(row => row.goodName)).toEqual(["Wheat"]);
    expect(snapshot?.rows[0]?.availableStock).toBe(5);
    expect(quotePlayerMarketTrade({ characterId: 1, goodId: 1, units: 1, direction: "buy" })).toMatchObject({
      ok: false,
      message: "Grain is a food-ledger summary; buy a named staple crop instead."
    });

    const purchase = executePlayerMarketTrade({ characterId: 1, goodId: 2, units: 2, direction: "buy" });
    const market = getMarkets()[0]!;
    expect(purchase.ok).toBe(true);
    expect(worldContext.pack.characters?.[0]?.inventory).toEqual({ 2: 2 });
    expect(market.foodLedger?.stapleCropInventories?.[2]).toMatchObject({ age0: 5, age1: 3 });
    expect(market.foodLedger).toMatchObject({ foodStockAge0: 5, foodStockAge1: 3, exportable: 3 });
    expect(market.goods[1]?.stock).toBe(3);
  });

  it("migrates an existing player Grain holding to Wheat", () => {
    setGoods([
      { i: 1, name: "Grain", value: 1, tags: ["food", "stapleFood"], unit: "wain", icon: "🌾", color: "#fff" },
      { i: 2, name: "Wheat", value: 1, tags: ["food", "stapleCrop"], unit: "wain", icon: "🌾", color: "#f5d76e" }
    ]);
    Goods.sync();
    worldContext.pack.characters![0]!.inventory = { 1: 3 };

    expect(migrateLegacyPlayerGrainInventory()).toBe(true);
    expect(worldContext.pack.characters![0]!.inventory).toEqual({ 2: 3 });
  });
});
