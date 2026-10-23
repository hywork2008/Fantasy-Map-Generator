import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createObserveViews } from "../../../../scripts/lib/observeViews.mts";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getOrCreateCumulativeMarketIntake,
  getOrCreateFaunaStockTable,
  getSaltShipments,
  getSaltworks,
  getStateSaltLedgers,
  initEconomyContext,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setMineralDeposits,
  setSaltShipments
} from "../economyContext";
import { Goods } from "./goods-generator";
import { recordGoodFlow, setGoodFlowObserver } from "./goodsBalanceLedger";
import { Markets } from "./markets-generator";
import {
  auditSaltPopulationCoverage,
  SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR,
  SALT_KILOGRAMS_PER_BAG,
  SaltLogistics
} from "./saltLogistics";
import { createSaltProductionBudget, SALT_PRODUCTION_POLICY, saltSolarWeights } from "./saltProduction";
import { setCargoDepartureObserver, setLotDispatchObserver, setTradeStageObserver } from "./tradeStageObserver";
import { WOOD_KG_PER_LOT } from "./woodRecipeContracts";

function setUpWorld(): void {
  worldContext.pack = {
    burgs: [
      { i: 0, removed: true },
      { i: 1, cell: 0, x: 0, y: 0, market: 1, state: 1, population: 10 },
      { i: 2, cell: 1, x: 80, y: 0, market: 2, state: 2, population: 20 }
    ],
    states: [
      { i: 0, name: "Neutral", removed: true },
      { i: 1, name: "North", capital: 1 },
      { i: 2, name: "South", capital: 2 }
    ],
    cells: {
      i: [0, 1, 2],
      p: [
        [0, 0],
        [80, 0],
        [40, 20]
      ],
      h: Uint8Array.from([35, 55, 10]),
      c: [[2], [2], [0, 1]],
      r: Uint16Array.from([0, 0, 0]),
      f: Uint16Array.from([0, 0, 1]),
      state: Uint16Array.from([1, 2, 0]),
      pop: Uint16Array.from([10, 20, 0]),
      routes: {}
    },
    features: [null, { i: 1, type: "ocean" }]
  } as unknown as PackedGraph;
  worldContext.populationRate = 1000;
  worldContext.urbanization = 1;
  setGoods([
    { i: 1, name: "Salt", tags: ["preservative", "mineral"], value: 3, unit: "bag", icon: "salt", color: "#fff" }
  ]);
  setMarkets([
    { i: 1, centerBurgId: 1, color: "#111", goods: {} },
    { i: 2, centerBurgId: 2, color: "#222", goods: {} }
  ]);
  setMarketCellColumn(Uint16Array.from([1, 2, 0]));
  Goods.sync();
  Markets.sync();
}

describe("SaltLogisticsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { extensions: {} } } as unknown as ExtensionAPI);
    setUpWorld();
  });
  afterEach(() => {
    setGoodFlowObserver(null);
    setCargoDepartureObserver(null);
    setLotDispatchObserver(null);
    setTradeStageObserver(null);
    clearEconomyContext();
  });

  it("partitions all residents without hiding neutral or unmarketed demand", () => {
    worldContext.pack.cells.state[0] = 0;
    setMarketCellColumn(Uint16Array.from([1, 0, 0]));
    expect(auditSaltPopulationCoverage()).toEqual({
      coveredPeople: 30_000,
      neutralPeople: 10_000,
      inactiveStatePeople: 0,
      unmarketedPeople: 20_000
    });
  });

  it("requires geological evidence for inland mines and brine wells, including legacy discovery", () => {
    worldContext.pack.cells.c[1] = [0];
    SaltLogistics.generate();
    expect(getSaltworks().some(w => w.stateId === 2)).toBe(false);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "evaporite",
        primaryCommodity: "sulfur",
        commodities: ["sulfur"],
        yields: [],
        richness: 1,
        depth: "shallow",
        groundwaterPressure: 0.8
      }
    ]);
    const existingCapacity = getSaltworks()[0].annualCapacityBags;
    SaltLogistics.settleMonth();
    expect(getSaltworks().find(w => w.stateId === 2)?.kind).toBe("brineWell");
    expect(getSaltworks()[0].annualCapacityBags).toBe(existingCapacity);
    SaltLogistics.settleMonth();
    expect(getSaltworks().filter(w => w.stateId === 2)).toHaveLength(1);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "evaporite",
        primaryCommodity: "sulfur",
        commodities: ["sulfur"],
        yields: [],
        richness: 1,
        depth: "shallow",
        groundwaterPressure: 0
      }
    ]);
    SaltLogistics.generate();
    expect(getSaltworks().find(w => w.stateId === 2)?.kind).toBe("rockSaltMine");
  });

  it("shares real crews across sites and returns their exact debit to the craft cycle", () => {
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    operation.kind = "rockSaltMine";
    const budget = createSaltProductionBudget();
    budget.capacity(operation);
    const maximumBags =
      (10 * 1000 * SALT_PRODUCTION_POLICY.hoursPerWorkerMonth) / (60 * SALT_PRODUCTION_POLICY.miningHoursPerKg);
    expect(budget.produce(operation, maximumBags / 2)).toBeCloseTo(maximumBags / 2);
    expect(budget.produce({ ...operation, i: 99 }, maximumBags)).toBeCloseTo(maximumBags / 2);
    expect(budget.produce(operation, 1)).toBe(0);
    expect(budget.charged.get(1)).toBeCloseTo(10);
    expect(budget.charged.has(2)).toBe(false);
    worldContext.pack.burgs[1].population = 0;
    const noCrew = createSaltProductionBudget();
    noCrew.capacity(operation);
    expect(noCrew.produce(operation, 1)).toBe(0);
  });

  it("caps boiling by physical Wood and charges only actual output once", () => {
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    operation.kind = "brineWell";
    const budget = createSaltProductionBudget();
    budget.capacity(operation);
    expect(budget.produce(operation, 10)).toBe(0);
    const salt = Goods.get(1)!;
    setGoods([salt, { i: 2, name: "Wood", tags: [], value: 1, unit: "pile", icon: "", color: "" }]);
    const fuelForTwoBags = (120 * SALT_PRODUCTION_POLICY.boilingWoodKgPerKg) / WOOD_KG_PER_LOT;
    getMarkets()[0].goods[2] = { stock: fuelForTwoBags, price: 1 };
    const flows: { goodId: number; units: number }[] = [];
    setGoodFlowObserver(flow => {
      if (flow.direction === "sink") flows.push(flow);
    });
    expect(budget.produce(operation, 10)).toBeCloseTo(2);
    expect(getMarkets()[0].goods[2].stock).toBe(0);
    expect(budget.produce(operation, 1)).toBe(0);
    expect(operation.monthlyLaborHours).toBeCloseTo(120 * SALT_PRODUCTION_POLICY.boilingHoursPerKg);
    expect(operation.monthlyFuelWoodUnits).toBeCloseTo(fuelForTwoBags);
    expect(flows).toMatchObject([{ goodId: 2, units: fuelForTwoBags }]);
  });

  it("allocates solar capacity to the dry warm season without winter or rainy output", () => {
    const temperatures = [0, 0, 5, 10, 20, 25, 30, 25, 20, 10, 5, 0];
    const weights = saltSolarWeights(temperatures, [0, 0, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0]);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(weights[0]).toBe(0);
    expect(weights[4]).toBe(0);
    expect(weights[6]).toBeGreaterThan(weights[5]);
    expect(saltSolarWeights(new Array(12).fill(0), new Array(12).fill(0))).toEqual(new Array(12).fill(0));
  });

  it("observes monthly salt records without consuming or exposing mutable ledger state", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    const views = createObserveViews(
      () => worldContext,
      () => ({ year: 590, month: 1, day: 1, tick: 0 })
    );
    const before = JSON.stringify({
      works: getSaltworks(),
      shipments: getSaltShipments(),
      states: getStateSaltLedgers()
    });
    const first = views.salt()!;
    expect(views.salt()).toEqual(first);
    expect(first.kilogramsPerBag).toBe(60);
    expect(first.states.reduce((sum, row) => sum + row.population, 0)).toBe(60_000);
    first.states[0].saltworksIds.push(-1);
    first.states[0].population = 0;
    first.works[0].monthlyOutputBags = -1;
    first.shipments[0].bags = -1;
    expect(
      JSON.stringify({ works: getSaltworks(), shipments: getSaltShipments(), states: getStateSaltLedgers() })
    ).toBe(before);
  });

  it("creates at least one population-scaled saltworks for every populated state", () => {
    SaltLogistics.generate();

    const works = getSaltworks();
    expect(works.map(operation => operation.stateId).sort()).toEqual([1, 2]);
    expect(works.every(operation => operation.annualCapacityBags > 0)).toBe(true);
  });

  it("wholesales domestic Salt to each city market and sells the household share", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();

    const ledgers = getStateSaltLedgers();
    expect(ledgers).toHaveLength(2);
    expect(ledgers.every(ledger => ledger.monthlyDeliveredBags > 0)).toBe(true);
    expect(ledgers.every(ledger => ledger.monthlyHouseholdSalesBags > 0)).toBe(true);
    expect(ledgers.every(ledger => ledger.monthlyUnmetHouseholdBags === 0)).toBe(true);
    expect(getMarkets().every(market => (market.goods[1]?.stock ?? 0) > 0)).toBe(true);
    expect(getSaltShipments()).toHaveLength(2);
    expect(getOrCreateCumulativeMarketIntake()?.[1] ?? 0).toBeGreaterThan(0);
  });

  it("does not make one state pay another state's household requirement", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();

    const stateByMarket = new Map(
      getMarkets().map(market => [market.i, worldContext.pack.burgs[market.centerBurgId].state])
    );
    for (const shipment of getSaltShipments()) {
      expect(stateByMarket.get(shipment.fromMarketId)).toBe(shipment.exporterStateId);
      expect(stateByMarket.get(shipment.toMarketId)).toBe(shipment.importerStateId);
    }
    const expectedHouseholdBags =
      ((10_000 + 10_000) * SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12;
    expect(getStateSaltLedgers()[0].monthlyHouseholdSalesBags).toBeCloseTo(expectedHouseholdBags, 3);
  });

  it("stops landlocked production and supplies the country through a foreign market shipment", () => {
    // State 2 now touches State 1 but no sea or salt-lake water cell.
    worldContext.pack.cells.c[1] = [0];
    worldContext.pack.cells.c[2] = [0];

    SaltLogistics.generate();
    expect(getSaltworks().map(operation => operation.stateId)).toEqual([1]);

    SaltLogistics.settleMonth();
    SaltLogistics.settleMonth();

    const importShipment = getSaltShipments().find(
      shipment => shipment.exporterStateId === 1 && shipment.importerStateId === 2
    );
    expect(importShipment).toMatchObject({ fromMarketId: 1, toMarketId: 2, status: "inTransit" });
    const importerLedger = getStateSaltLedgers().find(ledger => ledger.stateId === 2);
    expect(importerLedger).toMatchObject({ monthlyOutputBags: 0 });
    expect(importerLedger?.monthlyImportedBags ?? 0).toBeGreaterThan(0);
  });

  it("keeps cargo in transit until its travel time elapses", () => {
    SaltLogistics.generate();
    setSaltShipments([
      {
        i: 99,
        exporterStateId: 1,
        importerStateId: 1,
        saltworksId: 1,
        fromMarketId: 1,
        toMarketId: 1,
        bags: 2,
        travelDays: 35,
        remainingDays: 35,
        status: "inTransit",
        unitPrice: 3
      }
    ]);

    SaltLogistics.settleMonth();
    expect(getSaltShipments().find(shipment => shipment.i === 99)).toMatchObject({
      status: "inTransit",
      remainingDays: 5
    });

    SaltLogistics.settleMonth();
    expect(getSaltShipments().find(shipment => shipment.i === 99)).toMatchObject({
      status: "delivered",
      remainingDays: 0
    });
  });

  it("records unmarketed neutral households as unmet instead of silently omitting them", () => {
    worldContext.pack.cells.state[0] = 0;
    setMarketCellColumn(Uint16Array.from([0, 2, 0]));
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 0)).toMatchObject({
      population: 10_000,
      unmarketedPeople: 10_000,
      monthlyHouseholdDemandBags: 50,
      monthlyHouseholdSalesBags: 0,
      monthlyUnmetHouseholdBags: 50
    });
    expect(getStateSaltLedgers().reduce((sum, row) => sum + row.population, 0)).toBe(60_000);
  });

  it("forecasts actual processing once without withdrawing its ingredients again", () => {
    SaltLogistics.generate();
    const market = getMarkets()[0];
    market.goods[1] = { stock: 10_000, price: 3 };
    market.goods[1].stock -= 2;
    recordGoodFlow({ direction: "sink", category: "recipeInput", goodId: 1, units: 2, marketId: market.i });
    SaltLogistics.settleMonth();
    expect(market.saltProcessingInputBags).toBe(0);
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyProcessingForecastBags).toBe(2);
    expect(market.goods[1].stock).toBeCloseTo(9898, 4);
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyProcessingForecastBags).toBe(0);
  });

  it("uses real herd heads without fabricating an unmeasured natural salt credit", () => {
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    SaltLogistics.generate();
    const market = getMarkets()[0];
    market.goods[1] = { stock: 10_000, price: 3 };
    SaltLogistics.settleMonth();
    const row = getStateSaltLedgers().find(row => row.stateId === 1)!;
    expect(row.monthlyLivestockTotalRequirementBags).toBeCloseTo(33.3333, 4);
    expect(row.monthlyLivestockNaturalBags).toBe(0);
    expect(row.monthlyLivestockSuppliedBags).toBeCloseTo(33.3333, 4);
    expect(row.monthlyUnmetLivestockBags).toBe(0);
    expect(market.goods[1].stock).toBeCloseTo(10_000 - 100 - 33.3333, 4);
  });

  it("shares one processing forecast across states using the same market", () => {
    worldContext.pack.burgs[2].market = 1;
    setMarketCellColumn(Uint16Array.from([1, 1, 0]));
    SaltLogistics.generate();
    getMarkets()[0].saltProcessingInputBags = 3;
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().reduce((sum, row) => sum + (row.monthlyProcessingForecastBags ?? 0), 0)).toBeCloseTo(
      3,
      4
    );
  });

  it("lets neutral households use local stock without commissioning state cargo", () => {
    worldContext.pack.cells.state[0] = 0;
    SaltLogistics.generate();
    getMarkets()[0].goods[1] = { stock: 60, price: 3 };
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 0)?.monthlyHouseholdSalesBags).toBe(10);
    expect(getSaltShipments().some(shipment => shipment.importerStateId === 0)).toBe(false);
    expect(getSaltworks().some(works => works.stateId === 0)).toBe(false);
  });

  it("reserves shared stock for all households before livestock", () => {
    worldContext.pack.burgs[2].market = 1;
    setMarketCellColumn(Uint16Array.from([1, 1, 0]));
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    SaltLogistics.generate();
    for (const works of getSaltworks()) works.active = false;
    getMarkets()[0].goods[1] = { stock: 300, price: 3 };
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().reduce((sum, row) => sum + row.monthlyHouseholdSalesBags, 0)).toBe(300);
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyLivestockSuppliedBags).toBe(0);
  });

  it("uses horse fauna heads without applying the market lot conversion", () => {
    getOrCreateFaunaStockTable()!["0:Horses"] = { young: 0, breeding: 120, old: 0 };
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyLivestockDemandBags).toBeCloseTo(3.8889, 4);
  });

  it("caps stock at the market reserve while output continues to replace household sales", () => {
    SaltLogistics.generate();
    // A 15% capacity margin fills the three-month reserve over twenty settlements.
    for (let month = 0; month < 24; month++) SaltLogistics.settleMonth();
    const initialStock = getMarkets().reduce((sum, market) => sum + (market.goods[1]?.stock ?? 0), 0);
    const initialOutput = getOrCreateCumulativeMarketIntake()?.[1] ?? 0;

    for (let month = 0; month < 24; month++) SaltLogistics.settleMonth();

    const finalStock = getMarkets().reduce((sum, market) => sum + (market.goods[1]?.stock ?? 0), 0);
    const finalOutput = getOrCreateCumulativeMarketIntake()?.[1] ?? 0;
    expect(finalStock).toBeCloseTo(initialStock, 2);
    expect(finalOutput).toBeGreaterThan(initialOutput);
  });
});
