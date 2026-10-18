import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { beginGoodsBalanceInterval, clearGoodsBalanceLedger, closeGoodsBalanceInterval } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import { LUXURY_VALUE_DEMAND_SETTING, luxuryBudgetByMarketTier, luxuryStockTarget } from "./luxuryDemand";
import type { Market } from "./marketTypes";
import { NAVY_TRADE_MARKUP, payNavyCrew, settleNavyVoyageTrade } from "./navyTrade";

const good = (i: number, name: string, tags: string[], value: number) => ({ i, name, tags, value }) as unknown as Good;

describe("navyTrade", () => {
  let state: State;
  let market: Market;
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    state = { i: 1, treasury: 1000 } as unknown as State;
    worldContext.pack = {
      states: [{ i: 0 } as unknown as State, state],
      burgs: [{ i: 0 } as unknown as Burg, { i: 1, state: 1, market: 1, population: 10 } as unknown as Burg],
      cells: { i: [], h: [], pop: [], state: [] }
    } as unknown as PackedGraph;
    setGoods([
      good(1, "Wool", ["clothing"], 2),
      good(2, "Grain", ["food", "stapleFood"], 1),
      good(3, "Silk", ["luxury"], 20)
    ]);
    market = {
      i: 1,
      centerBurgId: 1,
      goods: { 1: { stock: 1000, price: 2 }, 2: { stock: 5000, price: 1 }, 3: { stock: 0, price: 20 } },
      marketTreasury: { balance: 500, ruralGrainPayable: 0 }
    } as unknown as Market;
    setMarkets([market]);
  });
  afterEach(() => {
    clearEconomyContext();
    delete simulationContext.worldSettings;
  });

  it("exports surplus goods, brings luxuries back and keeps only the markup, without creating money", () => {
    const before = (state.treasury ?? 0) + market.marketTreasury!.balance;
    const result = settleNavyVoyageTrade(1, 1, 10, 1);
    expect(result.exported).toBeCloseTo(160, 4); // sloop: 10 build points × 16
    expect(result.imported).toBeCloseTo(160 * (1 + NAVY_TRADE_MARKUP), 4);
    expect(market.goods[1].stock).toBeCloseTo(1000 - 80, 4); // wool out at price 2
    expect(market.goods[2].stock).toBe(5000); // food is never exported
    expect(market.goods[3].stock).toBeCloseTo(200 / 20, 4); // silk in
    expect(state.treasury).toBeCloseTo(1000 + 40, 4);
    expect((state.treasury ?? 0) + market.marketTreasury!.balance).toBeCloseTo(before, 4);
  });

  it("records the goods it ships out and brings back in the goods ledger", () => {
    const point = { year: 1, month: 1, day: 1, tickCount: 0 };
    beginGoodsBalanceInterval(point);
    settleNavyVoyageTrade(1, 1, 10, 1);
    const { intervals } = closeGoodsBalanceInterval({ ...point, month: 2, tickCount: 30 });
    clearGoodsBalanceLedger();
    const wool = intervals.find(row => row.goodName === "Wool")!;
    const silk = intervals.find(row => row.goodName === "Silk")!;
    expect(wool.navyExport).toBeCloseTo(80, 4);
    expect(silk.navyImport).toBeCloseTo(10, 4);
    expect(Math.abs(wool.accountingGap) + Math.abs(silk.accountingGap)).toBeLessThan(1e-3);
  });

  it("under the luxury value demand, trades only for what the home towns' budgets lack", () => {
    simulationContext.worldSettings = { [LUXURY_VALUE_DEMAND_SETTING]: "on" };
    const silk = { ...good(3, "Silk", ["luxury"], 20), demandCoverage: { luxury: 1 } } as Good;
    setGoods([good(1, "Wool", ["clothing"], 2), good(2, "Grain", ["food", "stapleFood"], 1), silk]);
    worldContext.pack.burgs[1].treasury = 1000;
    market.goods[3].stock = 1000; // already stocked: nothing short
    const before = (state.treasury ?? 0) + market.marketTreasury!.balance;
    // Nothing short: the ship does not sail, so the treasury buys no exports it cannot recoup.
    expect(settleNavyVoyageTrade(1, 1, 10, 1)).toEqual({ exported: 0, imported: 0, profit: 0 });
    expect(market.goods[1].stock).toBe(1000);
    expect(market.goods[3].stock).toBe(1000); // a stocked luxury is not shipped back out either

    market.goods[3].stock = 0;
    const target = luxuryStockTarget(luxuryBudgetByMarketTier(worldContext.pack.burgs).get(1), silk, 20);
    expect(target).toBeGreaterThan(0);
    const result = settleNavyVoyageTrade(1, 1, 10, 1);
    expect(result.imported).toBeGreaterThan(0);
    expect(result.imported).toBeCloseTo(Math.min(result.exported * (1 + NAVY_TRADE_MARKUP), target * 20), 3);
    expect(market.goods[3].stock).toBeLessThanOrEqual(target + 1e-6);
    expect((state.treasury ?? 0) + market.marketTreasury!.balance).toBeCloseTo(before, 4);
  });

  it("pays the crew from the treasury into the home port", () => {
    expect(payNavyCrew(1, 1, 100, 1)).toBeCloseTo(25, 4);
    expect(state.treasury).toBeCloseTo(975, 4);
    expect(getHouseholdWealth(1)).toBeGreaterThanOrEqual(25);
  });
});
