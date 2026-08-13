import { describe, expect, it } from "vitest";
import type { Good } from "./goodsGeneratorTypes";
import { estimateSpeculativeTrade } from "./tradeOpportunityEstimator";

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
