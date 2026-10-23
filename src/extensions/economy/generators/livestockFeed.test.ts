import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const climate = vi.hoisted(() => ({ temperatures: Array(12).fill(12) as number[] }));
vi.mock("./seasonalCropClimate", async original => ({
  ...(await original<typeof import("./seasonalCropClimate")>()),
  readAgriculturalClimate: () => ({ year: 1000, monthlyMeanTemperatureC: climate.temperatures })
}));

import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { getCadencePhase, setCadencePhase } from "../context/cadencePhases";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  getMilitaryResourceLedgers,
  getOrCreateFaunaStockTable,
  getOrCreateLivestockFeedTable,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers,
  setMarketCellColumn,
  setMarkets,
  setMilitaryResourceLedgers
} from "../economyContext";
import { getMilkOutput } from "./dairy";
import { type Good, Goods } from "./goods-generator";
import { type GoodFlowRecord, setGoodFlowObserver } from "./goodsBalanceLedger";
import { getGrazedCarryingCapacity } from "./husbandry";
import { getLivestockFodderOrderLots, harvestLivestockForage, settleLivestockFeed } from "./livestockFeed";
import { FODDER_DM_KG_PER_LOT } from "./livestockFeedPolicy";
import { scheduleLivestockFeedPeriods } from "./livestockFeedSchedule";
import {
  getAnnualLivestockFeedFactor,
  getLivestockFeedCoverage,
  livestockFeedMonth,
  livestockFeedPeriod,
  withLivestockFeedPeriod
} from "./livestockFeedState";
import { Markets } from "./markets-generator";
import type { FoodLedger } from "./marketTypes";
import { MilitaryResources } from "./militaryResources";
import { getRuralProductionContributions } from "./production-utils";
import { getWoolOutput } from "./woolProduction";

const good = (name: string) => getGoods().find(good => good.name === name)!;
const rows = () => getOrCreateLivestockFeedTable()!;

describe("physical livestock feed budget", () => {
  let flows: GoodFlowRecord[];
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 4;
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.options = { ...worldContext.options, ruralEcosystemDetail: "detailed" };
    worldContext.pack = {
      cells: {
        i: Uint16Array.from([0, 1]),
        h: Uint8Array.from([30, 30]),
        biomeCode: Uint8Array.from([1, 1]),
        pop: Float32Array.from([100, 100]),
        g: Uint16Array.from([0, 1]),
        burg: Uint16Array.from([0, 0]),
        area: Float32Array.from([100, 100]),
        state: Uint16Array.from([1, 1]),
        c: [[], []]
      },
      burgs: [{ i: 0 }, { i: 1, cell: 0, market: 1, state: 1, population: 1 }],
      states: [{ i: 0 }, { i: 1, military: [] }],
      cultures: [],
      landUse: {
        cells: [0, 1].map(() => ({
          diagnostics: ["resolved-livestock-land"],
          allocatedAreaHa: 100,
          patches: [{ kind: "pasture", areaHa: 100 }]
        }))
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = { tags: [[], ["grassland"]], habitability: [0, 100] } as never;
    climate.temperatures = Array(12).fill(12);
    setGoods(["Fodder", "Sheep", "Milk", "Wool"].map(name => Goods.getDefaultGood(name)!));
    Goods.sync();
    setHusbandryWorkers(Float32Array.from([100, 100]));
    setHusbandryRequiredWorkers(Float32Array.from([100, 100]));
    setMarketCellColumn(Uint16Array.from([1, 1]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "",
        goods: { [good("Fodder").i]: { stock: 0, price: 1 } },
        foodLedger: { ruralHouseholdWealth: 10_000 } as FoodLedger,
        marketTreasury: { balance: 10_000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();
    const herds = getOrCreateFaunaStockTable()!;
    for (const cell of [0, 1]) herds[`${cell}:Sheep`] = { young: 15, breeding: 30, old: 15 };
    flows = [];
    setGoodFlowObserver(flow => flows.push(flow));
  });
  it("settles every deferred cadence period once, using its season rather than the execution month", () => {
    simulationContext.currentMonth = 1;
    const schedule = scheduleLivestockFeedPeriods;
    schedule(0);
    simulationContext.currentMonth = 4;
    const periods = schedule(3);
    expect(periods).toEqual([12001, 12002, 12003]);
    climate.temperatures = [0, 12, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const period of periods)
      withLivestockFeedPeriod(period, () => {
        expect(livestockFeedMonth()).toBe((period % 12) + 1);
        harvestLivestockForage();
        settleLivestockFeed();
        const row = rows()[0];
        const expectedGrowth = period === 12001 ? 12500 : period === 12002 ? 25000 : 0;
        expect(row.pastureGrownKg).toBeCloseTo(expectedGrowth);
        const settled = structuredClone(row);
        harvestLivestockForage();
        settleLivestockFeed();
        expect(row).toEqual(settled);
      });
    expect(rows()[0].samples.map(sample => sample.period)).toEqual(periods);
    const final = structuredClone(rows()[0]);
    withLivestockFeedPeriod(periods[0], () => {
      harvestLivestockForage();
      settleLivestockFeed();
    });
    expect(rows()[0]).toEqual(final);
    expect(livestockFeedPeriod()).toBe(periods[2]);
  });

  it("continues the saved next period after reload and across the year boundary", () => {
    simulationContext.currentMonth = 11;
    const schedule = scheduleLivestockFeedPeriods;
    schedule(0);
    expect(schedule(2)).toEqual([12011, 12012]);
    // The cadence column is serialized on the Economy slice; reconstruct the scheduler
    // against its restored value rather than anchoring again to the execution date.
    const savedNext = getCadencePhase("livestockFeedNextPeriod");
    simulationContext.currentYear = 1001;
    simulationContext.currentMonth = 3;
    setCadencePhase("livestockFeedNextPeriod", savedNext);
    expect(scheduleLivestockFeedPeriods(2)).toEqual([12013, 12014]);
    expect(getCadencePhase("livestockFeedNextPeriod")).toBe(12015);
  });

  it("restores the active period when a production cycle throws", () => {
    const before = livestockFeedPeriod();
    expect(() =>
      withLivestockFeedPeriod(11999, () => {
        throw new Error("interrupted");
      })
    ).toThrow("interrupted");
    expect(livestockFeedPeriod()).toBe(before);
  });

  afterEach(() => {
    setGoodFlowObserver(null);
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("adds retained custom consumer and industrial demand to farm and military Fodder orders", () => {
    const market = getMarkets()[0];
    const fodder = good("Fodder");
    fodder.demandCoverage = { utilities: 0.4, military: 0.6 };
    fodder.priceElasticity = -1;
    setMilitaryResourceLedgers([
      { stateId: 1, supplyMarketId: 1, annualDemand: { fodder: 120 }, lastConsumed: {}, unmetDemand: {} }
    ]);
    const demand = Markets as unknown as {
      calculateGoodDemand(
        good: Good,
        urban: number,
        textile: number,
        consumer: number,
        industrial: number,
        price: number,
        marketId: number
      ): number;
    };
    const farmOrders = getLivestockFodderOrderLots(market);
    expect(farmOrders).toBeGreaterThan(0);
    expect(demand.calculateGoodDemand(fodder, 10, 10, 0.4, 0.2, fodder.value, 1)).toBeCloseTo(farmOrders + 10 + 6);
    expect(demand.calculateGoodDemand(fodder, 10, 10, 0.4, 0.2, fodder.value * 2, 1)).toBeCloseTo(farmOrders + 10 + 3);
    fodder.demandCoverage = {};
    expect(demand.calculateGoodDemand(fodder, 10, 10, 0, 0, fodder.value * 2, 1)).toBeCloseTo(farmOrders + 10);
  });

  it("uses each pasture kilogram once and transfers real cash for surplus hay", () => {
    const market = getMarkets()[0];
    const beforeMoney = market.marketTreasury!.balance + market.foodLedger!.ruralHouseholdWealth!;
    harvestLivestockForage();
    for (const row of Object.values(rows())) {
      expect(row.pastureGrownKg).toBeCloseTo(row.grazingReservedKg + row.harvestedKg + row.unharvestedKg, 8);
      expect(row.harvestedKg).toBeCloseTo(row.harvestLossKg + row.hayKg + row.soldKg, 8);
      expect(row.hayKg).toBeCloseTo(7500, 8);
    }
    expect(market.goods[good("Fodder").i].stock * FODDER_DM_KG_PER_LOT).toBeCloseTo(
      rows()[0].soldKg + rows()[1].soldKg,
      8
    );
    expect(market.marketTreasury!.balance + market.foodLedger!.ruralHouseholdWealth!).toBeCloseTo(beforeMoney, 8);
    settleLivestockFeed();
    expect(rows()[0].coverage).toBe(1);
    const snapshot = JSON.stringify({ rows: rows(), market });
    harvestLivestockForage();
    settleLivestockFeed();
    expect(JSON.stringify({ rows: rows(), market })).toBe(snapshot);
  });

  it("caps haymaking by assigned shared herder labor, with no population bonus Fodder source", () => {
    setHusbandryWorkers(Float32Array.from([0, 0]));
    harvestLivestockForage();
    expect(rows()[0].harvestedKg).toBe(0);
    expect(rows()[0].unharvestedKg).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[good("Fodder").i].stock).toBe(0);
    setGoodCellColumn(Uint16Array.from([good("Fodder").i, 0]));
    const output = getRuralProductionContributions(
      0,
      { 1: [{ goodId: good("Fodder").i, production: 1000 }] },
      { preview: true }
    );
    expect(output.some(row => row.goodId === good("Fodder").i)).toBe(false);
  });

  it("carries actual summer hay into winter with one storage loss and no invented opening reserve", () => {
    climate.temperatures = [0, 0, 0, 4, 12, 20, 24, 24, 16, 8, 4, 0];
    simulationContext.currentMonth = 7;
    harvestLivestockForage();
    settleLivestockFeed();
    const before = rows()[0].hayKg;
    expect(before).toBeGreaterThan(0);
    simulationContext.currentMonth = 8;
    climate.temperatures[7] = 0;
    getMarkets()[0].foodLedger!.ruralHouseholdWealth = 0;
    getMarkets()[0].goods[good("Fodder").i].stock = 0;
    harvestLivestockForage();
    settleLivestockFeed();
    expect(rows()[0].pastureGrownKg).toBe(0);
    expect(rows()[0].hayKg).toBeCloseTo(before * 0.99 - 2500, 8);
    expect(rows()[0].coverage).toBe(1);
    expect(rows()[0].storageLossKg).toBeCloseTo(before * 0.01, 8);
  });

  it("retains enough real harvest for a six-month winter and feeds it without purchases", () => {
    climate.temperatures = [...Array(6).fill(22), ...Array(6).fill(0)];
    simulationContext.currentMonth = 6;
    harvestLivestockForage();
    settleLivestockFeed();
    expect(rows()[0].hayKg).toBeGreaterThan(15000);
    const market = getMarkets()[0];
    market.foodLedger!.ruralHouseholdWealth = 0;
    market.goods[good("Fodder").i].stock = 0;
    for (let month = 7; month <= 12; month++) {
      simulationContext.currentMonth = month;
      harvestLivestockForage();
      settleLivestockFeed();
      expect(rows()[0].unmetKg).toBeLessThan(1e-8);
      expect(rows()[0].purchasedKg).toBe(0);
      expect(rows()[0].pastureGrownKg).toBe(0);
    }
    expect(rows()[0].hayKg).toBeCloseTo(0, 7);
  });

  it("shares scarce purchases across cells, pays from rural cash and gates milk/wool after actual shortage", () => {
    climate.temperatures = Array(12).fill(0);
    const market = getMarkets()[0];
    market.goods[good("Fodder").i].stock = 10;
    market.foodLedger!.ruralHouseholdWealth = 1;
    const milk = getMilkOutput(0);
    const wool = getWoolOutput(0);
    harvestLivestockForage();
    settleLivestockFeed();
    expect(rows()[0].hayConsumedKg).toBeCloseTo(4.25, 8);
    expect(rows()[1].hayConsumedKg).toBeCloseTo(4.25, 8);
    expect(market.foodLedger!.ruralHouseholdWealth).toBe(0.95);
    expect(market.marketTreasury!.balance).toBe(10000.05);
    expect(getMilkOutput(0)).toBeCloseTo(milk * rows()[0].coverage, 10);
    expect(getWoolOutput(0)).toBeCloseTo(wool * rows()[0].coverage, 10);
    expect(rows()[0].unmetKg).toBeGreaterThan(0);
    const feed = flows.filter(flow => flow.category === "livestockFeed");
    expect(feed.reduce((sum, row) => sum + row.units, 0)).toBeCloseTo(0.05, 8);
    simulationContext.currentMonth++;
    expect(getLivestockFeedCoverage(0)).toBe(rows()[0].coverage);
    simulationContext.currentMonth++;
    expect(getLivestockFeedCoverage(0)).toBe(1);
  });

  it("lets army and farms draw only the remaining portion of the same stock", () => {
    climate.temperatures = Array(12).fill(0);
    worldContext.options.military = [{ name: "cavalry", type: "mounted" }] as never;
    worldContext.pack.states[1].military = [{ i: 1, u: { cavalry: 20 } }] as never;
    const market = getMarkets()[0];
    market.goods[good("Fodder").i].stock = 1;
    harvestLivestockForage();
    MilitaryResources.generate();
    MilitaryResources.settleMonthly();
    const army = getMilitaryResourceLedgers()[0].lastConsumed.fodder ?? 0;
    expect(army).toBeGreaterThan(0);
    settleLivestockFeed();
    const farms = (rows()[0].purchasedKg + rows()[1].purchasedKg) / FODDER_DM_KG_PER_LOT;
    expect(army + farms + market.goods[good("Fodder").i].stock).toBeCloseTo(1, 8);
    expect(farms).toBeLessThanOrEqual(1 - army + 1e-8);
  });

  it("tracks a rolling 12-month annual feed budget without counting carried local hay as new forage", () => {
    const market = getMarkets()[0];
    market.marketTreasury!.balance = 0;
    market.foodLedger!.ruralHouseholdWealth = 0;
    let grown = 0;
    let pasture = 0;
    let harvested = 0;
    let loss = 0;
    let storageLoss = 0;
    let hayConsumed = 0;
    for (let month = 1; month <= 12; month++) {
      simulationContext.currentMonth = month;
      harvestLivestockForage();
      settleLivestockFeed();
      const row = rows()[0];
      grown += row.pastureGrownKg;
      pasture += row.pastureConsumedKg;
      harvested += row.harvestedKg;
      loss += row.harvestLossKg;
      storageLoss += row.storageLossKg;
      hayConsumed += row.hayConsumedKg;
    }
    expect(grown).toBeCloseTo(150000, 8);
    expect(rows()[0].hayKg + hayConsumed + storageLoss + loss).toBeCloseTo(harvested, 7);
    expect(pasture + harvested).toBeLessThanOrEqual(grown + 1e-8);
    expect(rows()[0].samples).toHaveLength(12);
    const capacity = getGrazedCarryingCapacity(0, good("Sheep"));
    expect(capacity).toBeLessThan(300);
    rows()[0].hayKg += 100_000;
    expect(getGrazedCarryingCapacity(0, good("Sheep"))).toBe(capacity);
    expect(getAnnualLivestockFeedFactor(0, 100, [{ goodName: "Sheep", capacityHeads: 300 }])).toBeLessThan(1);
    simulationContext.currentYear++;
    simulationContext.currentMonth = 1;
    harvestLivestockForage();
    settleLivestockFeed();
    expect(rows()[0].samples).toHaveLength(12);
  });
});
