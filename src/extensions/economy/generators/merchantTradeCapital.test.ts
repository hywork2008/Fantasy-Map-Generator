import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext, setMarkets, setMintLedgers } from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { MONEY_TRADE_CAPACITY_FLOOR } from "./currencySufficiency";
import type { Market } from "./marketTypes";
import {
  getTradeCapitalMoney,
  MerchantTradeCapital,
  TRADE_ARRIVAL_PROFIT_RATE,
  TRADE_LOSS_RECOVERY_RATE
} from "./merchantTradeCapital";

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

describe("MerchantTradeCapital with paid cargo (fmg-long-distance-trade)", () => {
  const treasuryOf = (id: number) => getMarkets().find(market => market.i === id)!.marketTreasury!;
  /** Cash in both markets and the carriers' households; taxes leave with the deal. */
  const money = () =>
    [1, 2].reduce((sum, id) => sum + treasuryOf(id).balance + getTradeCapitalMoney(treasuryOf(id)), 0) +
    getHouseholdWealth(1);

  beforeEach(() => {
    simulationContext.worldSettings = { "fmg-long-distance-trade": "on" };
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, population: 10, market: 1, state: 1 } as Burg],
      states: [{ i: 0 } as State, { i: 1 } as State],
      markets: []
    } as unknown as PackedGraph;
    const market = (i: number, balance: number): Market =>
      ({
        i,
        centerBurgId: i,
        color: "#000",
        goods: {},
        marketTreasury: { balance, ruralGrainPayable: 0, tradeWorkingCapital: 100, tradeCapitalLocked: 0 }
      }) as Market;
    setMarkets([market(1, 80), market(2, 30)]);
  });

  afterEach(() => {
    clearEconomyContext();
    delete simulationContext.worldSettings;
  });

  it("pays the exporting market and the carriers when cargo is booked", () => {
    const before = money();
    const households = getHouseholdWealth(1);
    expect(MerchantTradeCapital.lock(1, 50, { goods: 40, freight: 6 })).toBe(true);
    const treasury = treasuryOf(1);
    expect(treasury.tradeWorkingCapital).toBeCloseTo(50);
    expect(treasury.tradeCapitalLocked).toBeCloseTo(50);
    expect(treasury.balance).toBeCloseTo(120);
    expect(getHouseholdWealth(1) - households).toBeCloseTo(6);
    // The remaining 4 are the deal's taxes, credited to the treasuries by collectTaxes.
    expect(money()).toBeCloseTo(before - 4);
    expect(MerchantTradeCapital.availableCapital(1)).toBeCloseTo(50);
  });

  it("is paid by the importer on arrival, owing what it cannot pay and repaying it later", () => {
    MerchantTradeCapital.lock(1, 50, { goods: 50, freight: 0 });
    const before = money();
    MerchantTradeCapital.settleArrival(1, 50, 2, 70);
    expect(treasuryOf(1).tradeCapitalLocked).toBeCloseTo(0);
    expect(treasuryOf(1).tradeWorkingCapital).toBeCloseTo(80);
    expect(treasuryOf(2).balance).toBeCloseTo(0);
    expect(treasuryOf(2).tradePayables).toEqual({ 1: 40 });
    expect(money()).toBeCloseTo(before);

    treasuryOf(2).balance = 25;
    expect(MerchantTradeCapital.repayPayables(getMarkets()[1])).toBeCloseTo(25);
    expect(treasuryOf(2).tradePayables).toEqual({ 1: 15 });
    expect(treasuryOf(1).tradeWorkingCapital).toBeCloseTo(105);
  });

  it("gives no arrival profit and recovers nothing from lost cargo", () => {
    MerchantTradeCapital.lock(1, 50, { goods: 50, freight: 0 });
    MerchantTradeCapital.settleLoss(1, 50);
    expect(treasuryOf(1).tradeCapitalLocked).toBeCloseTo(0);
    expect(treasuryOf(1).tradeWorkingCapital).toBeCloseTo(50);
  });

  it("refunds the goods' price when the exporting market takes them back", () => {
    MerchantTradeCapital.lock(1, 50, { goods: 40, freight: 10 });
    MerchantTradeCapital.unlock(1, 50, 40);
    expect(treasuryOf(1).tradeCapitalLocked).toBeCloseTo(0);
    expect(treasuryOf(1).tradeWorkingCapital).toBeCloseTo(90);
    expect(treasuryOf(1).balance).toBeCloseTo(80);
  });

  it("turns a legacy reservation into paid cargo once", () => {
    treasuryOf(1).tradeCapitalLocked = 30;
    MerchantTradeCapital.ensureTradeCapital(getMarkets()[0]);
    expect(treasuryOf(1).tradeCapitalPaid).toBe(true);
    expect(treasuryOf(1).tradeWorkingCapital).toBeCloseTo(70);
    expect(treasuryOf(1).balance).toBeCloseTo(110);
    MerchantTradeCapital.ensureTradeCapital(getMarkets()[0]);
    expect(treasuryOf(1).tradeWorkingCapital).toBeCloseTo(70);
  });
});
