import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getBurgMarketLedgers,
  getMarkets,
  getMerchantOrganizations,
  initEconomyContext
} from "../economyContext";
import {
  BURG_MARKET_MERCHANT_ROLE_KIND,
  clearBurgMarketLedgers,
  creditHouseholdWealth,
  debitHouseholdWealth,
  getBurgMarketLedger,
  getDominantMerchant,
  getHouseholdWealth,
  syncBurgMarketLedgers
} from "./burgMarketLedgers";
import { syncMarketManagers } from "./marketManagers";
import {
  MERCHANT_ORGANIZATION_HEAD_ROLE_KIND,
  MERCHANT_ORGANIZATION_SECRETARY_ROLE_KIND
} from "./merchantOrganizations";

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

  it("assigns one to three merchants from the market pool and derives share from revenue", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    const northLedger = getBurgMarketLedger(1);
    const southLedger = getBurgMarketLedger(2);

    expect(northLedger).toBeDefined();
    expect(southLedger).toBeDefined();
    expect(northLedger!.merchants.length).toBeGreaterThan(1);
    expect(southLedger!.merchants.length).toBe(1);
    const marketPool = new Set([getMarkets()[0].managerCharacterId!, ...getMarkets()[0].rivalCharacterIds!]);
    expect(
      [...northLedger!.merchants, ...southLedger!.merchants].every(merchant => marketPool.has(merchant.characterId))
    ).toBe(true);

    const northRevenue = northLedger!.merchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
    const southRevenue = southLedger!.merchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
    expect(northRevenue).toBeCloseTo(100, 1);
    expect(southRevenue).toBeCloseTo(50, 1);

    const northShare = northLedger!.merchants.reduce((sum, merchant) => sum + merchant.share, 0);
    const southShare = southLedger!.merchants.reduce((sum, merchant) => sum + merchant.share, 0);
    expect(northShare).toBeCloseTo(100, 1);
    expect(southShare).toBeCloseTo(100, 1);
    expect(getDominantMerchant(northLedger)!.share).toBeGreaterThan(0);
    expect(getMerchantOrganizations()).toHaveLength(1);
    expect(northLedger!.merchants.every(merchant => merchant.organizationId !== undefined)).toBe(true);
    expect(getMerchantOrganizations().every(organization => organization.tradeRangeKm <= 400)).toBe(true);
  });

  it("assigns burg merchant roles and preserves the market manager as a center burg merchant", () => {
    syncMarketManagers();
    const managerId = getMarkets()[0].managerCharacterId;

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

  it("keeps economy character gender generation balanced", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    const economyCharacters = worldContext.pack.characters.filter(character =>
      character.roles?.some(role => role.source === "economy")
    );
    const maleCount = economyCharacters.filter(character => character.gender === "male").length;
    const femaleCount = economyCharacters.filter(character => character.gender === "female").length;

    expect(Math.abs(maleCount - femaleCount)).toBeLessThanOrEqual(1);
  });

  it("shares a market merchant pool and keeps merchant-organization staff disabled", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    const organization = getMerchantOrganizations().find(o => o.scale === "major")!;
    expect(organization).toBeDefined();
    expect(organization.chairpersonCharacterId).toBeDefined();
    expect(organization.secretaryCharacterId).toBeUndefined();
    expect(organization.bodyguardCharacterId).toBeUndefined();
    expect(organization.executiveCharacterIds).toBeUndefined();
    expect(organization.memberCharacterIds).toHaveLength(3);

    const chairperson = worldContext.pack.characters.find(c => c.i === organization.chairpersonCharacterId)!;

    expect(chairperson.roles?.[0]).toMatchObject({
      kind: MERCHANT_ORGANIZATION_HEAD_ROLE_KIND,
      organizationId: organization.i
    });
    expect(worldContext.pack.characters).toHaveLength(3);
  });

  it("clears burg ledgers and removes burg merchant roles", () => {
    syncMarketManagers();
    syncBurgMarketLedgers();

    clearBurgMarketLedgers();

    expect(getBurgMarketLedgers()).toEqual([]);
    expect(
      worldContext.pack.characters.some(character =>
        character.roles?.some(role => role.kind === BURG_MARKET_MERCHANT_ROLE_KIND)
      )
    ).toBe(false);
    expect(
      worldContext.pack.characters.some(character =>
        character.roles?.some(role => role.kind === MERCHANT_ORGANIZATION_SECRETARY_ROLE_KIND)
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

  it("seeds a fresh Burg's householdWealth from population, then accumulates across syncs (L2 Phase 2/3)", () => {
    // provisioned profile (the test's default): 30 population points × 12/head = 360 seed.
    creditHouseholdWealth(1, 4);
    expect(getBurgMarketLedger(1)?.householdWealth).toBeCloseTo(364, 6);

    syncMarketManagers();
    syncBurgMarketLedgers();
    creditHouseholdWealth(1, 2.5);

    expect(getBurgMarketLedger(1)?.householdWealth).toBeCloseTo(366.5, 6);
  });

  it("debits householdWealth up to the available balance, never past it (L2 Phase 2/3)", () => {
    creditHouseholdWealth(1, 4); // 360 seed + 4 = 364

    const debited = debitHouseholdWealth(1, 10);
    expect(debited).toBeCloseTo(10, 6);
    expect(getHouseholdWealth(1)).toBeCloseTo(354, 6);

    const overdrawn = debitHouseholdWealth(1, 10_000);
    expect(overdrawn).toBeCloseTo(354, 6);
    expect(getHouseholdWealth(1)).toBe(0);
  });
});
