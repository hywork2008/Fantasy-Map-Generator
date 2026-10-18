import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { Goods } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import { buyTownLuxuries, LUXURY_TIER_SHARES, luxuryBudget } from "./luxuryDemand";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";

const FURS = 1;
const INCENSE = 2;
const JEWELRY = 3;

const good = (i: number, name: string, value: number, luxury?: number) =>
  ({
    i,
    name,
    tags: ["luxury"],
    value,
    unit: "lot",
    icon: name,
    color: "#000",
    ...(luxury ? { demandCoverage: { luxury } } : {})
  }) as unknown as Good;

describe("buyTownLuxuries", () => {
  let burg: Burg;
  let market: Market;
  const stock = (stocks: Record<number, number>) => {
    for (const [id, units] of Object.entries(stocks)) market.goods[Number(id)].stock = units;
  };

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { ...worldContext.options, economyStartMode: "balanced" };
    // 100 population points holding 45 each: three times the 15 start endowment, the wealth cap.
    burg = { i: 1, cell: 0, x: 0, y: 0, market: 1, population: 100, capital: 1, treasury: 4500 } as unknown as Burg;
    worldContext.pack = { burgs: [undefined, burg], states: [] } as unknown as PackedGraph;
    // Jewelry has no catalogue coverage: the value demand still counts it as a precious good.
    setGoods([good(FURS, "Furs", 6, 0.5), good(INCENSE, "Incense", 12, 1), good(JEWELRY, "Jewelry", 55)]);
    market = {
      i: 1,
      centerBurgId: 1,
      color: "#111",
      goods: {
        [FURS]: { stock: 1000, price: 1.5 },
        [INCENSE]: { stock: 1000, price: 10 },
        [JEWELRY]: { stock: 0, price: 50 }
      },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 }
    } as unknown as Market;
    setMarkets([market]);
    Goods.sync();
    Markets.sync();
  });
  afterEach(() => clearEconomyContext());

  it("spends the budget across tiers, buys precious goods, and only moves money to the market", () => {
    stock({ [JEWELRY]: 10 });
    const budget = luxuryBudget(burg);
    expect(budget).toBeCloseTo(100 * 0.03 * 3, 4);
    const before = (burg.treasury ?? 0) + market.marketTreasury!.balance;
    const result = buyTownLuxuries(burg);
    const spentOn = (goodId: number) =>
      result.deals.filter(deal => deal.good === goodId).reduce((sum, deal) => sum + deal.units * deal.price, 0);
    expect(result.spent).toBeLessThanOrEqual(budget);
    expect(result.spent).toBeGreaterThan(budget - 0.05);
    // Whole 0.01 units only; the rest of the precious share moves down to the fine tier.
    expect(spentOn(JEWELRY)).toBeGreaterThan(0);
    expect(spentOn(JEWELRY)).toBeLessThanOrEqual(budget * LUXURY_TIER_SHARES.capital.precious);
    expect(market.goods[JEWELRY].stock).toBeLessThan(10);
    expect((burg.treasury ?? 0) + market.marketTreasury!.balance).toBeCloseTo(before, 1);
  });

  it("passes an unfilled tier's money down to the next cheaper tier", () => {
    const budget = luxuryBudget(burg);
    const result = buyTownLuxuries(burg);
    const spentOn = (goodId: number) =>
      result.deals.filter(deal => deal.good === goodId).reduce((sum, deal) => sum + deal.units * deal.price, 0);
    const shares = LUXURY_TIER_SHARES.capital;
    expect(spentOn(JEWELRY)).toBe(0);
    expect(spentOn(INCENSE)).toBeCloseTo(budget * (shares.precious + shares.fine), 1);
    expect(spentOn(FURS)).toBeCloseTo(budget * shares.common, 1);
  });
});
