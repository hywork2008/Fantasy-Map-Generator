import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subsistenceWage", () => ({ getSubsistenceWage: () => 1 }));

import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  getOrCreateTextileCommissionTable,
  initEconomyContext,
  setBurgMarketLedgers,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setStrategicLaborMarkets
} from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { Goods } from "./goods-generator";
import { type GoodFlowRecord, setGoodFlowObserver } from "./goodsBalanceLedger";
import type { FoodLedger } from "./marketTypes";
import type { RuralTextileProduction } from "./ruralTextileProduction";
import {
  estimateTextileCommissions,
  settleTextileCommissions,
  type TextileCommissionRequest
} from "./textileCommissions";
import { getTextileMarketOrders, settleTextileHouseholdDemand } from "./textileDemand";
import { getUrbanCraftCapacityRecords, recordUrbanCraftCapacity } from "./urbanCraftCapacity";

const home: RuralTextileProduction = {
  garments: 0,
  blankets: 0,
  garmentSpending: 0,
  blanketSpending: 0,
  laborUsed: 0,
  laborCapacity: 0
};
const request: TextileCommissionRequest = {
  budget: 100,
  garmentNeed: 1,
  wardrobeNeed: 1,
  wardrobePrice: 130,
  blanketNeed: 2,
  blanketStock: 0,
  blanketPrice: 8
};
const good = (name: string) => getGoods().find(good => good.name === name)!;

describe("same-market paid textile commissions", () => {
  let flows: GoodFlowRecord[];
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 4;
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.grid = { cells: { temp: [10] } } as typeof worldContext.grid;
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, market: 1, population: 1 }],
      states: [],
      cells: { i: [0], h: [30], pop: [1], g: [0], maleAdults: [0], femaleAdults: [0] }
    } as unknown as PackedGraph;
    setGoods(["Wool Cloth", "Wool Garments", "Wool Blankets"].map(name => Goods.getDefaultGood(name)!));
    setMarketCellColumn(Uint16Array.from([1]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "",
        goods: Object.fromEntries(
          getGoods().map(good => [
            good.i,
            { stock: good.name === "Wool Cloth" ? 100 : 0, price: good.name === "Wool Cloth" ? 10 : good.value }
          ])
        ),
        foodLedger: { ruralHouseholdWealth: 1000 } as FoodLedger,
        marketTreasury: { balance: 10, ruralGrainPayable: 0 }
      }
    ]);
    setBurgMarketLedgers([{ burgId: 1, marketId: 1, merchants: [], householdWealth: 0 }]);
    setStrategicLaborMarkets([
      {
        marketId: 1,
        workersByOccupation: {},
        wageByOccupation: { forestry: 1 },
        skillByOccupation: {},
        capacityByOccupation: {}
      }
    ]);
    recordUrbanCraftCapacity(1, 1, 1.2, 0.2, 0.1, true);
    flows = [];
    setGoodFlowObserver(flow => flows.push(flow));
  });
  afterEach(() => {
    setGoodFlowObserver(null);
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("delivers privately owned products, pays material and service to separate recipients and charges only unused work", () => {
    const market = getMarkets()[0];
    const initial = structuredClone(market);
    const worker = getUrbanCraftCapacityRecords()[0];
    const beforeWork = structuredClone(worker);
    const quote = estimateTextileCommissions(market, home, request);
    expect(quote.garments).toBeGreaterThan(0);
    expect(market).toEqual(initial);
    expect(worker).toEqual(beforeWork);
    expect(flows).toHaveLength(0);
    const onLabor = vi.fn();
    const result = settleTextileCommissions(market, home, request, onLabor);
    expect(result.jobs).toEqual(quote.jobs);
    expect(result.garments).toBeLessThanOrEqual(1);
    expect(result.blankets).toBeLessThanOrEqual(2);
    const spent = result.garmentSpending + result.blanketSpending;
    expect(spent).toBeLessThanOrEqual(100);
    expect(spent).toBeCloseTo(result.materialSpending + result.serviceSpending, 8);
    expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(1000 - spent, 8);
    expect(market.marketTreasury!.balance).toBeCloseTo(10 + result.materialSpending, 8);
    expect(getHouseholdWealth(1)).toBeCloseTo(result.serviceSpending, 8);
    expect(worker.chargedPoints + worker.unusedPoints).toBeCloseTo(1.2, 8);
    expect(worker.commissionPoints).toBeCloseTo(
      result.jobs.reduce((sum, job) => sum + job.laborPoints, 0),
      8
    );
    expect(onLabor.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBeCloseTo(worker.commissionPoints!, 8);
    expect(market.goods[good("Wool Cloth").i].stock).toBeCloseTo(
      100 - result.jobs.reduce((sum, job) => sum + job.inputUnits, 0),
      8
    );
    for (const job of result.jobs) {
      expect(job.status).toBe("delivered");
      expect(job.inputUnits * 10).toBeCloseTo(job.materialPayment, 8);
      expect(job.servicePayment).toBeGreaterThan(0);
      expect(market.goods[job.productGoodId].stock).toBe(0);
    }
    const after = structuredClone({ market, worker, ledger: getOrCreateTextileCommissionTable() });
    expect(settleTextileCommissions(market, home, request).jobs).toHaveLength(0);
    expect({ market, worker, ledger: getOrCreateTextileCommissionTable() }).toEqual(after);
  });

  it.each(["old work", "no work", "uncalibrated", "no cash", "no cloth", "no wage", "gated recipe"])(
    "does not create a job with %s",
    missing => {
      const market = getMarkets()[0];
      if (missing === "old work") simulationContext.currentMonth = 5;
      if (missing === "no work") recordUrbanCraftCapacity(1, 1, 1, 1, 0, true);
      if (missing === "uncalibrated") recordUrbanCraftCapacity(1, 1, 1, 0, 0, false);
      if (missing === "no cloth") market.goods[good("Wool Cloth").i].stock = 0;
      if (missing === "no wage") setStrategicLaborMarkets([]);
      if (missing === "gated recipe") good("Wool Garments").requiredTechnology = "restricted";
      const result = settleTextileCommissions(market, home, {
        ...request,
        blanketNeed: 0,
        budget: missing === "no cash" ? 0 : 100
      });
      expect(result.jobs).toHaveLength(0);
      expect(market.foodLedger!.ruralHouseholdWealth).toBe(1000);
      expect(getHouseholdWealth(1)).toBe(0);
      expect(flows).toHaveLength(0);
    }
  );

  it.each([0.01, 0.99])("keeps material and rounded service payments within an actual wallet of %s", wallet => {
    const market = getMarkets()[0];
    market.foodLedger!.ruralHouseholdWealth = wallet;
    const result = settleTextileCommissions(market, home, { ...request, budget: 1, blanketNeed: 0 });
    const spent = result.garmentSpending + result.blanketSpending;
    expect(spent).toBeLessThanOrEqual(wallet);
    expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(wallet - spent, 8);
    if (wallet === 0.01) expect(result.jobs).toHaveLength(0);
    else expect(result.jobs.length).toBeGreaterThan(0);
  });

  it("integrates deliveries with the shared household need and monthly wallet instead of buying products twice", () => {
    const market = getMarkets()[0];
    const before = structuredClone(market);
    const orders = getTextileMarketOrders(market);
    expect(orders.inputs[good("Wool Cloth").i]).toBeGreaterThan(0);
    expect(market).toEqual(before);
    const onLabor = vi.fn();
    settleTextileHouseholdDemand(onLabor);
    const deliveries = getOrCreateTextileCommissionTable()![1];
    expect(deliveries.garments).toBeGreaterThan(0);
    expect(market.textileLedger!.ruralHomeProduction).toBe(0);
    expect(market.textileLedger!.commissionDeliveries).toBe(deliveries.garments);
    expect(market.textileLedger!.householdConsumption).toBeCloseTo(deliveries.garments, 2);
    expect(market.textileLedger!.householdSpending! + market.blanketLedger!.householdSpending!).toBeLessThanOrEqual(50);
    expect(onLabor).toHaveBeenCalled();
    expect(market.goods[good("Wool Garments").i].stock).toBe(0);
  });
});
