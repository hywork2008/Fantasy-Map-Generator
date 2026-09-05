import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext, setMarkets, setMintLedgers } from "../economyContext";
import { MONEY_TRADE_CAPACITY_FLOOR } from "./currencySufficiency";
import type { Market } from "./marketTypes";
import { MerchantTradeCapital, TRADE_ARRIVAL_PROFIT_RATE, TRADE_LOSS_RECOVERY_RATE } from "./merchantTradeCapital";

describe("MerchantTradeCapital", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [
        { i: 0 } as Burg,
        { i: 1, population: 10, market: 1, treasury: 100, state: 1 } as Burg,
        { i: 2, population: 5, market: 1, treasury: 50, state: 1 } as Burg
      ],
      states: [{ i: 0 } as State, { i: 1 } as State],
      markets: []
    } as unknown as PackedGraph;
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: {},
        marketTreasury: {
          balance: 80,
          ruralGrainPayable: 0,
          tradeWorkingCapital: 100,
          tradeCapitalLocked: 0
        }
      } as Market
    ]);
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("locks and unlocks available capital", () => {
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(100);
    expect(MerchantTradeCapital.lock(1, 40)).toBe(true);
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(60);
    MerchantTradeCapital.unlock(1, 15);
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(75);
  });

  it("refuses to lock more than available capital", () => {
    expect(MerchantTradeCapital.lock(1, 150)).toBe(false);
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(100);
  });

  it("credits soft profit on arrival settlement", () => {
    MerchantTradeCapital.lock(1, 50);
    MerchantTradeCapital.settleArrival(1, 50);
    const m = getMarkets()[0];
    expect(m.marketTreasury!.tradeCapitalLocked).toBeCloseTo(0);
    expect(m.marketTreasury!.tradeWorkingCapital).toBeCloseTo(100 + 50 * TRADE_ARRIVAL_PROFIT_RATE);
  });

  it("writes off most locked capital on loss with a small recovery", () => {
    MerchantTradeCapital.lock(1, 50);
    MerchantTradeCapital.settleLoss(1, 50);
    const m = getMarkets()[0];
    expect(m.marketTreasury!.tradeCapitalLocked).toBeCloseTo(0);
    expect(m.marketTreasury!.tradeWorkingCapital).toBeCloseTo(100 - 50 * (1 - TRADE_LOSS_RECOVERY_RATE));
  });

  it("caps deployable capital when mint circulation is empty (L7)", () => {
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
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(100 * MONEY_TRADE_CAPACITY_FLOOR);
    expect(MerchantTradeCapital.lock(1, 50)).toBe(false);
    expect(MerchantTradeCapital.lock(1, 40)).toBe(true);
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(0);
  });

  it("does not cap capital when circulation is at the 12-month target (L7)", () => {
    setMintLedgers([
      {
        stateId: 1,
        mintMarketId: 1,
        currencyDemand: 10,
        circulation: 120,
        lastMintedValue: 0,
        totalMintedValue: 0,
        lastSeigniorage: 0
      }
    ]);
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(100);
    expect(MerchantTradeCapital.lock(1, 100)).toBe(true);
  });
});
