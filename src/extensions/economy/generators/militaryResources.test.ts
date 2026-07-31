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
      { i: 4, name: "Bullets", tags: ["military"], value: 6, unit: "pouch", icon: "lead", color: "#5c5c5c" }
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
          4: { stock: 10, price: 6 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("consumes iron, gunpowder and bullets (not raw lead) for firearms, while artillery still draws lead directly", () => {
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.annualDemand.iron).toBeGreaterThan(0);
    expect(ledger.annualDemand.gunpowder).toBeGreaterThan(0);
    expect(ledger.annualDemand.bullets).toBeGreaterThan(0);
    expect(ledger.annualDemand.saltpeter).toBeGreaterThan(0);
    expect(ledger.annualDemand.sulfur).toBeGreaterThan(0);
    expect(ledger.annualDemand.coal).toBeGreaterThan(0);
    // 12 artillery pieces only — firearms' lead use now lives in Bullets, not this field.
    expect(ledger.annualDemand.lead).toBeCloseTo(0.36, 4);
    expect(ledger.lastConsumed.lead).toBeGreaterThan(0);
    expect(ledger.lastConsumed.bullets).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[1].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[3].stock).toBeLessThan(10);
    expect(getMarkets()[0].goods[4].stock).toBeLessThan(10);
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

  it("does not create gunpowder-era demand when the era is disabled", () => {
    worldContext.options.gunpowderEraEnabled = false;
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();

    expect(getMilitaryResourceLedgers()[0].annualDemand).toEqual({});
    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(getMarkets()[0].goods[2].stock).toBe(10);
    expect(getMarkets()[0].goods[3].stock).toBe(10);
    expect(getMarkets()[0].goods[4].stock).toBe(10);
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

  it("consumes arrows for archer units even when the gunpowder era is disabled", () => {
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
    expect(ledger.lastConsumed.arrows).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[5].stock).toBeLessThan(10);
  });
});
