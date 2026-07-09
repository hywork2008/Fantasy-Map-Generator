import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import {
  BURG_MARKET_MERCHANT_ROLE_KIND,
  clearBurgMarketLedgers,
  getBurgMarketLedger,
  getDominantMerchant,
  syncBurgMarketLedgers
} from "./burgMarketLedgers";
import { syncMarketManagers } from "./marketManagers";

describe("burg market ledgers", () => {
  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);

    worldContext.seed = "burg-market-ledgers";
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals", culture: 0 },
        { i: 1, name: "Kingdom of Foo", culture: 0 }
      ],
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, name: "Northport", culture: 0, state: 1, cell: 1, market: 1, population: 30 } as unknown as Burg,
        { i: 2, name: "Southport", culture: 0, state: 1, cell: 2, market: 1, population: 10 } as unknown as Burg
      ],
      cells: { i: [0, 1, 2], culture: Uint16Array.from([0, 0, 0]) },
      deals: [
        { i: 0, seller: 1, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 10, price: 10, tax: 0 },
        { i: 1, seller: 2, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 5, price: 10, tax: 0 }
      ],
      markets: [{ i: 1, centerBurgId: 1, color: "#f00", goods: {} }]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("creates multiple merchant entries per burg and derives share from revenue", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    const northLedger = getBurgMarketLedger(1);
    const southLedger = getBurgMarketLedger(2);

    expect(northLedger).toBeDefined();
    expect(southLedger).toBeDefined();
    expect(northLedger!.merchants.length).toBeGreaterThan(1);
    expect(southLedger!.merchants.length).toBeGreaterThan(1);

    const northRevenue = northLedger!.merchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
    const southRevenue = southLedger!.merchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
    expect(northRevenue).toBeCloseTo(100, 1);
    expect(southRevenue).toBeCloseTo(50, 1);

    const northShare = northLedger!.merchants.reduce((sum, merchant) => sum + merchant.share, 0);
    const southShare = southLedger!.merchants.reduce((sum, merchant) => sum + merchant.share, 0);
    expect(northShare).toBeCloseTo(100, 1);
    expect(southShare).toBeCloseTo(100, 1);
    expect(getDominantMerchant(northLedger)!.share).toBeGreaterThan(0);
  });

  it("assigns burg merchant roles and preserves the market manager as a center burg merchant", () => {
    syncMarketManagers();
    const managerId = worldContext.pack.markets[0].managerCharacterId;

    syncBurgMarketLedgers();

    const northLedger = getBurgMarketLedger(1)!;
    expect(northLedger.merchants.some(merchant => merchant.characterId === managerId)).toBe(true);

    const merchants = worldContext.pack.characters.filter(character =>
      character.roles?.some(role => role.kind === BURG_MARKET_MERCHANT_ROLE_KIND)
    );
    expect(merchants.length).toBeGreaterThan(0);
    expect(
      merchants.every(character =>
        character.roles?.some(role => role.kind === BURG_MARKET_MERCHANT_ROLE_KIND && role.entityType === "burg")
      )
    ).toBe(true);
  });

  it("clears burg ledgers and removes burg merchant roles", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    clearBurgMarketLedgers();

    expect(worldContext.pack.burgMarketLedgers).toEqual([]);
    expect(
      worldContext.pack.characters.some(character =>
        character.roles?.some(role => role.kind === BURG_MARKET_MERCHANT_ROLE_KIND)
      )
    ).toBe(false);
  });

  it("removes stale burg merchant roles when a burg leaves all markets", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    const southMerchantIds = getBurgMarketLedger(2)!.merchants.map(merchant => merchant.characterId);
    worldContext.pack.burgs[2].market = 0;
    syncBurgMarketLedgers();

    expect(getBurgMarketLedger(2)).toBeUndefined();
    expect(
      worldContext.pack.characters.some(
        character =>
          southMerchantIds.includes(character.i) &&
          character.roles?.some(role => role.kind === BURG_MARKET_MERCHANT_ROLE_KIND && role.entityId === 2)
      )
    ).toBe(false);
  });
});
