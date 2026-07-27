import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getMilitaryResourceLedgers,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { MilitaryResources } from "./militaryResources";

describe("MilitaryResourcesModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1;
    worldContext.options.gunpowderEraEnabled = true;
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, cell: 0, x: 0, y: 0, market: 1, state: 1, population: 100 }],
      states: [
        { i: 0 },
        {
          i: 1,
          military: [{ i: 1, u: { artillery: 12, musketeers: 30 } }]
        }
      ]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Iron", tags: ["metal"], value: 3, unit: "ton", icon: "iron", color: "#777" },
      { i: 2, name: "Lead", tags: ["metal"], value: 3, unit: "ton", icon: "lead", color: "#777" },
      { i: 3, name: "Gunpowder", tags: ["military"], value: 4, unit: "barrel", icon: "powder", color: "#333" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 10, price: 3 },
          2: { stock: 10, price: 3 },
          3: { stock: 10, price: 4 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("consumes iron, lead and gunpowder while exposing their recipe-level inputs", () => {
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.annualDemand.iron).toBeGreaterThan(0);
    expect(ledger.annualDemand.lead).toBeGreaterThan(0);
    expect(ledger.annualDemand.gunpowder).toBeGreaterThan(0);
    expect(ledger.annualDemand.saltpeter).toBeGreaterThan(0);
    expect(ledger.annualDemand.sulfur).toBeGreaterThan(0);
    expect(ledger.annualDemand.coal).toBeGreaterThan(0);
    expect(ledger.lastConsumed.lead).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[1].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[3].stock).toBeLessThan(10);
  });

  it("does not create gunpowder-era demand when the era is disabled", () => {
    worldContext.options.gunpowderEraEnabled = false;
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    expect(getMilitaryResourceLedgers()[0].annualDemand).toEqual({});
    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(getMarkets()[0].goods[2].stock).toBe(10);
    expect(getMarkets()[0].goods[3].stock).toBe(10);
  });
});
