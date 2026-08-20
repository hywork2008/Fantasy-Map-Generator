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
    worldContext.options.initialFirearmsUnstocked = false;
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

  it("keeps finished ammunition for Metallurg stockpiling, while consuming direct artillery inputs", () => {
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
    expect(ledger.consumableStock).toEqual({});
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

  it("adds a fulfilled Gunpowder work order to a persistent military stockpile", () => {
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();
    const requested = (getMilitaryResourceLedgers()[0].annualDemand.gunpowder ?? 0) / 12;

    MilitaryResources.recordFinishedGoodsDelivery(1, "Gunpowder", requested);

    const ledger = getMilitaryResourceLedgers()[0];
    expect(ledger.lastDelivered?.gunpowder).toBeCloseTo(requested, 4);
    expect(ledger.consumableStock?.gunpowder).toBeCloseTo(requested, 4);
    expect(MilitaryResources.getConsumableStockpileGap(1, "gunpowder")).toBeCloseTo(
      (ledger.annualDemand.gunpowder ?? 0) - requested,
      4
    );

    MilitaryResources.settleMonthly();

    expect(getMilitaryResourceLedgers()[0].consumableStock?.gunpowder).toBeCloseTo(requested, 4);
    expect(getMilitaryResourceLedgers()[0].lastDelivered).toEqual({});
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

  // docs/plan/military-era-progression.md §5 Phase 3 — armored/aviation/fieldArtillery/machineGunners'
  // Steel/Kerosene/Aluminum demand. Also covers Phase 4's rocketArtillery, which reuses this same
  // material-demand mechanism (needsAdvancedSteel()) rather than adding a new one.
  describe("Phase 3-4 — armored/aviation/fieldArtillery/machineGunners/rocketArtillery equipment demand", () => {
    function setPhase2Units() {
      worldContext.options.military = [
        { name: "artillery", type: "machinery" },
        { name: "musketeers", type: "ranged" },
        {
          name: "fieldArtillery",
          type: "machinery",
          requiresTechnology: { id: "modernSteelmaking", minimum: "adopted" }
        },
        {
          name: "machineGunners",
          type: "machinery",
          requiresTechnology: { id: "modernSteelmaking", minimum: "demonstrated" }
        },
        { name: "armored", type: "armored" },
        { name: "aviation", type: "aviation" },
        {
          name: "rocketArtillery",
          type: "machinery",
          requiresTechnology: { id: "militarySignalRockets", minimum: "adopted" }
        }
      ] as unknown as typeof worldContext.options.military;
    }

    function setPhase3Goods() {
      setGoods([
        { i: 1, name: "Iron Ingot", tags: ["ingot", "metal"], value: 3, unit: "ton", icon: "iron", color: "#777" },
        { i: 2, name: "Lead Ingot", tags: ["ingot", "metal"], value: 3, unit: "ton", icon: "lead", color: "#777" },
        { i: 3, name: "Gunpowder", tags: ["military"], value: 4, unit: "barrel", icon: "powder", color: "#333" },
        { i: 4, name: "Bullets", tags: ["military"], value: 6, unit: "pouch", icon: "lead", color: "#5c5c5c" },
        { i: 5, name: "Arms", tags: ["military"], value: 24, unit: "set", icon: "arms", color: "#333" },
        {
          i: 6,
          name: "Steel",
          tags: ["metal", "industrial"],
          value: 14,
          unit: "bar",
          icon: "good-unknown",
          color: "#7a8490"
        },
        {
          i: 7,
          name: "Kerosene",
          tags: ["fuel", "industrial"],
          value: 14,
          unit: "barrel",
          icon: "good-unknown",
          color: "#c9a869"
        },
        {
          i: 8,
          name: "Aluminum",
          tags: ["metal", "industrial"],
          value: 34,
          unit: "bar",
          icon: "good-unknown",
          color: "#c7c9cc"
        }
      ]);
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "#111",
          goods: {
            1: { stock: 100, price: 3 },
            2: { stock: 100, price: 3 },
            3: { stock: 100, price: 4 },
            4: { stock: 100, price: 6 },
            5: { stock: 100, price: 24 },
            6: { stock: 100, price: 14 },
            7: { stock: 100, price: 14 },
            8: { stock: 100, price: 34 }
          }
        }
      ]);
      Goods.sync();
      Markets.sync();
    }

    it("draws Steel/Kerosene/Aluminum for fieldArtillery/machineGunners/armored/aviation", () => {
      setPhase2Units();
      setPhase3Goods();
      worldContext.pack.states[1].military = [
        { i: 1, u: { fieldArtillery: 10, machineGunners: 8, armored: 5, aviation: 3 } }
      ] as unknown as (typeof worldContext.pack.states)[1]["military"];

      MilitaryResources.generate();
      MilitaryResources.settleMonthly();

      const ledger = getMilitaryResourceLedgers()[0];
      // steel = modernSteelHeads(10 fieldArtillery + 8 machineGunners = 18) * 0.05 + armored(5) * 0.15
      expect(ledger.annualDemand.steel).toBeCloseTo(18 * 0.05 + 5 * 0.15, 4);
      // kerosene = armored(5) * 0.06 + aviation(3) * 0.08
      expect(ledger.annualDemand.kerosene).toBeCloseTo(5 * 0.06 + 3 * 0.08, 4);
      // aluminum = aviation(3) * 0.2
      expect(ledger.annualDemand.aluminum).toBeCloseTo(3 * 0.2, 4);
      // fieldArtillery also flows into the legacy artillery iron/gunpowder demand (broadened
      // isArtillery()), machineGunners into the existing firearm iron/gunpowder demand.
      expect(ledger.annualDemand.iron).toBeGreaterThan(0);
      expect(ledger.annualDemand.gunpowder).toBeGreaterThan(0);

      expect(ledger.lastConsumed.steel).toBeCloseTo((ledger.annualDemand.steel ?? 0) / 12, 4);
      expect(ledger.lastConsumed.kerosene).toBeCloseTo((ledger.annualDemand.kerosene ?? 0) / 12, 4);
      expect(ledger.lastConsumed.aluminum).toBeCloseTo((ledger.annualDemand.aluminum ?? 0) / 12, 4);
      expect(getMarkets()[0].goods[6].stock).toBeLessThan(100);
      expect(getMarkets()[0].goods[7].stock).toBeLessThan(100);
      expect(getMarkets()[0].goods[8].stock).toBeLessThan(100);
    });

    it("draws Steel for rocketArtillery (Phase 4) via the same needsAdvancedSteel() path as fieldArtillery/machineGunners", () => {
      setPhase2Units();
      setPhase3Goods();
      worldContext.pack.states[1].military = [
        { i: 1, u: { rocketArtillery: 6 } }
      ] as unknown as (typeof worldContext.pack.states)[1]["military"];

      MilitaryResources.generate();
      MilitaryResources.settleMonthly();

      const ledger = getMilitaryResourceLedgers()[0];
      expect(ledger.annualDemand.steel).toBeCloseTo(6 * 0.05, 4);
      // rocketArtillery also flows into isArtilleryLike()'s iron/lead/gunpowder demand, same as
      // fieldArtillery — a rocket launcher rack is still a gunpowder-fired weapon in this model.
      expect(ledger.annualDemand.iron).toBeGreaterThan(0);
      expect(ledger.annualDemand.gunpowder).toBeGreaterThan(0);
      // rocketArtillery has no engine/airframe — no Kerosene/Aluminum demand of its own.
      expect(ledger.annualDemand.kerosene).toBeUndefined();
      expect(ledger.annualDemand.aluminum).toBeUndefined();
    });

    it('does not draw Steel for the legacy "artillery" unit, only fieldArtillery', () => {
      setPhase2Units();
      setPhase3Goods();
      worldContext.pack.states[1].military = [
        { i: 1, u: { artillery: 20 } }
      ] as unknown as (typeof worldContext.pack.states)[1]["military"];

      MilitaryResources.generate();
      MilitaryResources.settleMonthly();

      const ledger = getMilitaryResourceLedgers()[0];
      expect(ledger.annualDemand.iron).toBeGreaterThan(0); // legacy artillery still draws iron/lead/gunpowder
      expect(ledger.annualDemand.steel).toBeUndefined(); // but not Steel — it predates modernSteelmaking
    });

    it('does not sweep fieldArtillery into a dormant plannedU slot the way legacy "artillery" is, since nothing can reactivate it yet', () => {
      // Regression guard: metallurgWork.ts's own isArtillery() (a separate, unbroadened function
      // that drives the "Artillery" Good work order reactivating a plannedU slot) does not
      // recognize "fieldArtillery" either — if unstockInitialFirearmForces() below ever starts
      // matching it too, those troops would be stranded in plannedU forever with no delivery path.
      worldContext.options.initialFirearmsUnstocked = true;
      setPhase2Units();
      setPhase3Goods();
      worldContext.pack.states[1].military = [
        { i: 1, u: { artillery: 12, fieldArtillery: 10 }, a: 22, t: 22 }
      ] as unknown as (typeof worldContext.pack.states)[1]["military"];

      MilitaryResources.generate();

      const regiment = worldContext.pack.states[1].military![0];
      expect(regiment.u.fieldArtillery).toBe(10); // stays active
      expect(regiment.plannedU?.fieldArtillery).toBeUndefined();
      expect(regiment.u.artillery).toBeUndefined(); // legacy artillery still swept, as before
      expect(regiment.plannedU?.artillery).toBe(12);
    });

    it("keeps armored/aviation Steel/Kerosene/Aluminum demand even when the gunpowder era is disabled", () => {
      worldContext.options.gunpowderEraEnabled = false;
      setPhase2Units();
      setPhase3Goods();
      worldContext.pack.states[1].military = [
        { i: 1, u: { armored: 5, aviation: 3 } }
      ] as unknown as (typeof worldContext.pack.states)[1]["military"];

      MilitaryResources.generate();
      MilitaryResources.settleMonthly();

      const ledger = getMilitaryResourceLedgers()[0];
      expect(ledger.annualDemand.steel).toBeCloseTo(5 * 0.15, 4);
      expect(ledger.annualDemand.kerosene).toBeCloseTo(5 * 0.06 + 3 * 0.08, 4);
      expect(ledger.annualDemand.aluminum).toBeCloseTo(3 * 0.2, 4);
      // firearm/artillery-chain demand stays absent, same as the pre-existing disabled-era test.
      expect(ledger.annualDemand.iron).toBeUndefined();
      expect(ledger.annualDemand.gunpowder).toBeUndefined();
      expect(getMarkets()[0].goods[6].stock).toBeLessThan(100);
      expect(getMarkets()[0].goods[7].stock).toBeLessThan(100);
      expect(getMarkets()[0].goods[8].stock).toBeLessThan(100);
    });
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
