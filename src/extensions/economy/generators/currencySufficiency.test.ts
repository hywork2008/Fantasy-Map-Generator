import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMintLedgers } from "../economyContext";
import {
  getCurrencySufficiency,
  getMoneyPriceLevel,
  getMoneyPriceLevelForMarket,
  getMoneyTradeCapacityFactor,
  getMoneyTradeCapacityFactorForMarket,
  INITIAL_MONTHS_OF_CURRENCY,
  MONEY_NEUTRAL_MIN_SUFFICIENCY,
  MONEY_PRICE_CEILING,
  MONEY_PRICE_FLOOR,
  MONEY_TRADE_CAPACITY_FLOOR,
  TARGET_MONTHS_OF_CURRENCY
} from "./currencySufficiency";
import type { Market } from "./marketTypes";

describe("getCurrencySufficiency", () => {
  it("is a no-op without a ledger or a positive demand", () => {
    expect(getCurrencySufficiency(undefined)).toBe(1);
    expect(getCurrencySufficiency({ circulation: 0, currencyDemand: 0 })).toBe(1);
  });

  it("is circulating coin over the 12-month target", () => {
    expect(getCurrencySufficiency({ circulation: 120, currencyDemand: 10 })).toBe(1);
    expect(getCurrencySufficiency({ circulation: 60, currencyDemand: 10 })).toBe(
      INITIAL_MONTHS_OF_CURRENCY / TARGET_MONTHS_OF_CURRENCY
    );
    expect(getCurrencySufficiency({ circulation: 0, currencyDemand: 10 })).toBe(0);
    expect(getCurrencySufficiency({ circulation: 240, currencyDemand: 10 })).toBe(2);
  });
});

describe("getMoneyPriceLevel", () => {
  it("deflates toward the floor below the generate-time 6-month seed", () => {
    expect(getMoneyPriceLevel(0)).toBe(MONEY_PRICE_FLOOR);
    expect(getMoneyPriceLevel(MONEY_NEUTRAL_MIN_SUFFICIENCY / 2)).toBeCloseTo(
      MONEY_PRICE_FLOOR + (1 - MONEY_PRICE_FLOOR) * 0.5,
      6
    );
  });

  it("is identically 1 from the generate-time seed through the 12-month target", () => {
    expect(getMoneyPriceLevel(MONEY_NEUTRAL_MIN_SUFFICIENCY)).toBe(1);
    expect(getMoneyPriceLevel(0.75)).toBe(1);
    expect(getMoneyPriceLevel(1)).toBe(1);
  });

  it("inflates toward the ceiling above the 12-month target", () => {
    expect(getMoneyPriceLevel(2)).toBe(MONEY_PRICE_CEILING);
    expect(getMoneyPriceLevel(1.5)).toBeCloseTo(1 + (MONEY_PRICE_CEILING - 1) * 0.5, 6);
    expect(getMoneyPriceLevel(10)).toBe(MONEY_PRICE_CEILING);
  });
});

describe("getMoneyTradeCapacityFactor", () => {
  it("does not constrain a healthy or generate-time mint", () => {
    expect(getMoneyTradeCapacityFactor(MONEY_NEUTRAL_MIN_SUFFICIENCY)).toBe(1);
    expect(getMoneyTradeCapacityFactor(1)).toBe(1);
    expect(getMoneyTradeCapacityFactor(2)).toBe(1);
  });

  it("scales liquidity down toward the floor as circulation empties", () => {
    expect(getMoneyTradeCapacityFactor(0)).toBe(MONEY_TRADE_CAPACITY_FLOOR);
    expect(getMoneyTradeCapacityFactor(MONEY_NEUTRAL_MIN_SUFFICIENCY / 2)).toBeCloseTo(
      MONEY_TRADE_CAPACITY_FLOOR + (1 - MONEY_TRADE_CAPACITY_FLOOR) * 0.5,
      6
    );
  });
});

describe("market lookups (docs/plan/economy-coupling-audit.md L7)", () => {
  const market: Pick<Market, "centerBurgId"> = { centerBurgId: 1 };

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, state: 1, market: 1 } as Burg],
      states: [{ i: 0 } as State, { i: 1 } as State]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("is a no-op when Economy context is missing or the state has no ledger", () => {
    expect(getMoneyPriceLevelForMarket(market)).toBe(1);
    expect(getMoneyTradeCapacityFactorForMarket(market)).toBe(1);
    clearEconomyContext();
    expect(getMoneyPriceLevelForMarket(market)).toBe(1);
    expect(getMoneyTradeCapacityFactorForMarket(market)).toBe(1);
  });

  it("reads the mint ledger of the market's center burg state", () => {
    setMintLedgers([
      {
        stateId: 1,
        mintMarketId: 1,
        currencyDemand: 10,
        circulation: 0,
        lastMintedValue: 0,
        totalMintedValue: 0,
        lastSeigniorage: 0
      }
    ]);
    expect(getMoneyPriceLevelForMarket(market)).toBe(MONEY_PRICE_FLOOR);
    expect(getMoneyTradeCapacityFactorForMarket(market)).toBe(MONEY_TRADE_CAPACITY_FLOOR);
  });
});
