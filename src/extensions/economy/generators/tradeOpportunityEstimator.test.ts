import { describe, expect, it } from "vitest";
import type { Good } from "./goodsGeneratorTypes";
import { estimateSpeculativeTrade, getTransportCost } from "./tradeOpportunityEstimator";

describe("estimateSpeculativeTrade", () => {
  it("admits a hundredth-unit military shipment when it is a valid retail lot", () => {
    const gunpowder = {
      i: 999,
      name: "Gunpowder",
      tags: ["military"],
      value: 12,
      unit: "barrel",
      icon: "good-gunpowder",
      color: "#b0c4de",
      recipes: [{ 1: 0.75 }]
    } as Good;

    const estimate = estimateSpeculativeTrade({
      good: gunpowder,
      sourceMarketId: 3,
      targetMarketId: 4,
      sourceGood: { stock: 0.05, price: 5 },
      targetGood: { stock: 0, price: 100 },
      sourcePopulation: 0,
      targetPopulation: 0,
      distance: 1,
      mapDiagonal: 1000,
      durationDays: 1
    });

    expect(estimate?.maxUnits).toBe(0.01);
  });
});

/**
 * docs/plan/economy-coupling-audit.md L6: transport cost is proportional to a good's physical
 * bulk (`trade.weight + trade.bulk`), not its price — the opposite of the old
 * `distanceFactor * good.value` formula, which made the same trip cost more for gold than for
 * grain purely because gold is worth more.
 */
describe("getTransportCost", () => {
  function goodWith(trade: { weight: number; bulk: number }, value: number): Good {
    return {
      i: 1,
      name: "Test Good",
      tags: [],
      value,
      unit: "unit",
      icon: "icon",
      color: "#fff",
      trade: {
        weight: trade.weight,
        bulk: trade.bulk,
        rarity: 1,
        distancePremium: 0,
        timeValueTrend: 0,
        durability: 3,
        lossRisk: 1
      }
    } as Good;
  }

  it("is independent of the good's price", () => {
    const cheap = goodWith({ weight: 3, bulk: 3 }, 1);
    const expensive = goodWith({ weight: 3, bulk: 3 }, 500);

    expect(getTransportCost(100, 1000, cheap)).toBe(getTransportCost(100, 1000, expensive));
  });

  it("charges a bulky good more than a compact good over the same distance", () => {
    const bulky = goodWith({ weight: 8, bulk: 8 }, 10); // e.g. Grain-shaped: heavy, cheap
    const compact = goodWith({ weight: 1, bulk: 1 }, 10); // e.g. Gold-shaped: light, same price

    const bulkyCost = getTransportCost(100, 1000, bulky);
    const compactCost = getTransportCost(100, 1000, compact);

    expect(bulkyCost).toBeGreaterThan(compactCost);
    expect(bulkyCost).toBeCloseTo(compactCost * 8, 5); // linear in weight+bulk
  });

  it("scales linearly with distance", () => {
    const good = goodWith({ weight: 4, bulk: 4 }, 10);
    const near = getTransportCost(100, 1000, good);
    const far = getTransportCost(300, 1000, good);

    expect(far).toBeCloseTo(near * 3, 10);
  });

  it("falls back to the good's default trade profile when none is set", () => {
    // value kept below 8 and untagged so getDefaultGoodTradeProfile's isLuxury/isMineral/
    // isLiveCargo heuristics all stay false and it returns the plain DEFAULT_TRADE_PROFILE
    // (weight 3 / bulk 3) instead of one of their overrides.
    const noTradeProfile = { i: 2, name: "Untagged Good", tags: [], value: 5, unit: "unit" } as Good;
    expect(getTransportCost(100, 1000, noTradeProfile)).toBeCloseTo((100 / 1000) * 0.5 * 6, 10);
  });
});
