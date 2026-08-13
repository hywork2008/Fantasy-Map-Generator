import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getMilitaryResourceLedgers,
  initEconomyContext,
  setGoods,
  setMarkets,
  setStateSecretStocks
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
      { i: 1, name: "Iron Ingot", tags: ["ingot", "metal"], value: 3, unit: "ton", icon: "iron", color: "#777" },
      { i: 2, name: "Lead Ingot", tags: ["ingot", "metal"], value: 3, unit: "ton", icon: "lead", color: "#777" },
      { i: 3, name: "Gunpowder", tags: ["military"], value: 4, unit: "barrel", icon: "powder", color: "#333" },
      { i: 4, name: "Bullets", tags: ["military"], value: 6, unit: "pouch", icon: "lead", color: "#5c5c5c" },
      { i: 5, name: "Arms", tags: ["military"], value: 24, unit: "set", icon: "arms", color: "#333" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 10, price: 3 },
          2: { stock: 10, price: 3 },
          3: { stock: 10, price: 4 },
          4: { stock: 10, price: 6 },
          5: { stock: 10, price: 24 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("keeps finished arms, powder, and bullets for Metallurg fulfillment, while consuming direct artillery inputs", () => {
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.annualDemand.iron).toBeGreaterThan(0);
    expect(ledger.annualDemand.arms).toBeGreaterThan(0);
    expect(ledger.annualDemand.gunpowder).toBeGreaterThan(0);
    expect(ledger.annualDemand.bullets).toBeGreaterThan(0);
    expect(ledger.annualDemand.saltpeter).toBeGreaterThan(0);
    expect(ledger.annualDemand.sulfur).toBeGreaterThan(0);
    expect(ledger.annualDemand.coal).toBeGreaterThan(0);
    // 12 artillery pieces only — firearms' lead use now lives in Bullets, not this field.
    expect(ledger.annualDemand.lead).toBeCloseTo(0.36, 4);
    // 30 musketeers draw Muskets instead of Arms; Arms covers only the 12 artillery crews.
    expect(ledger.annualDemand.arms).toBeCloseTo(0.12, 4);
    expect(ledger.annualDemand.muskets).toBeCloseTo(0.3, 4);
    expect(ledger.lastConsumed.lead).toBeGreaterThan(0);
    expect(ledger.lastConsumed.arms).toBe(0);
    expect(ledger.lastConsumed.gunpowder).toBe(0);
    expect(ledger.lastConsumed.bullets).toBe(0);
    expect(ledger.lastConsumed.muskets).toBe(0);
    expect(getMarkets()[0].goods[1].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[3].stock).toBe(10);
    expect(getMarkets()[0].goods[4].stock).toBe(10);
    expect(getMarkets()[0].goods[5].stock).toBe(10);
  });

  it("reduces gunpowder-chain demand by the state's pyrotechnics state-secret stock", () => {
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();
    const baseline = getMilitaryResourceLedgers()[0];
    const baselineGunpowder = baseline.annualDemand.gunpowder ?? 0;
    const baselineSaltpeter = baseline.annualDemand.saltpeter ?? 0;

    setStateSecretStocks([{ stateId: 1, domain: "pyrotechnics", stock: 1 }]);
    MilitaryResources.settleMonthly();

    const ledger = getMilitaryResourceLedgers()[0];
    // STATE_SECRET_BONUS_MAX = 0.3 at stock = 1 cuts gunpowder-chain demand by 30%.
    expect(ledger.annualDemand.gunpowder).toBeCloseTo(baselineGunpowder * 0.7, 4);
    expect(ledger.annualDemand.saltpeter).toBeCloseTo(baselineSaltpeter * 0.7, 4);
  });

  it("credits a fulfilled Gunpowder work order against the current military demand", () => {
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();
    const requested = (getMilitaryResourceLedgers()[0].annualDemand.gunpowder ?? 0) / 12;

    MilitaryResources.recordFinishedGoodsDelivery(1, "Gunpowder", requested);

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.lastConsumed.gunpowder).toBeCloseTo(requested, 4);
    expect(ledger.unmetDemand.gunpowder).toBe(0);
  });

  it("does not create gunpowder-era demand when the era is disabled", () => {
    worldContext.options.gunpowderEraEnabled = false;
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    expect(getMilitaryResourceLedgers()[0].annualDemand).toEqual({ arms: 0.42 });
    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(getMarkets()[0].goods[2].stock).toBe(10);
    expect(getMarkets()[0].goods[3].stock).toBe(10);
    expect(getMarkets()[0].goods[4].stock).toBe(10);
    expect(getMarkets()[0].goods[5].stock).toBe(10);
  });

  it("consumes fodder for mounted units even when the gunpowder era is disabled", () => {
    worldContext.options.gunpowderEraEnabled = false;
    worldContext.options.military = [
      { name: "artillery", type: "ranged" },
      { name: "musketeers", type: "ranged" },
      { name: "cavalry", type: "mounted" }
    ] as unknown as typeof worldContext.options.military;
    worldContext.pack.states[1].military = [
      { i: 1, u: { cavalry: 20 } }
    ] as unknown as (typeof worldContext.pack.states)[1]["military"];
    setGoods([
      { i: 4, name: "Fodder", tags: ["fodder", "supply"], value: 1, unit: "bale", icon: "good-grain", color: "#c9b458" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 4: { stock: 10, price: 1 } } }]);
    Goods.sync();
    Markets.sync();

    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.annualDemand.fodder).toBeGreaterThan(0);
    expect(ledger.annualDemand.iron).toBeUndefined();
    expect(ledger.lastConsumed.fodder).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[4].stock).toBeLessThan(10);
  });

  it("exposes arrow demand for Metallurg fulfillment even when the gunpowder era is disabled", () => {
    worldContext.options.gunpowderEraEnabled = false;
    worldContext.pack.states[1].military = [
      { i: 1, u: { archers: 25 } }
    ] as unknown as (typeof worldContext.pack.states)[1]["military"];
    setGoods([
      {
        i: 5,
        name: "Arrows",
        tags: ["military", "hunting"],
        value: 3,
        unit: "quiver",
        icon: "good-arms",
        color: "#8b5a2b"
      }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 5: { stock: 10, price: 3 } } }]);
    Goods.sync();
    Markets.sync();

    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.annualDemand.arrows).toBeGreaterThan(0);
    expect(ledger.annualDemand.bullets).toBeUndefined();
    expect(ledger.lastConsumed.arrows).toBe(0);
    expect(getMarkets()[0].goods[5].stock).toBe(10);
  });
});
