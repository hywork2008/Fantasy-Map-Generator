import { describe, expect, it } from "vitest";
import type { Burg } from "../../hostTypes";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import {
  getManufactureWageRate,
  getStrategicLaborProductivity,
  type LaborMarket,
  reconcileStrategicLaborMarkets
} from "./strategicLaborMarkets";
import type { ProcurementOrder } from "./strategicProcurement";

const goods = [
  { i: 1, name: "Wood", value: 1 },
  { i: 2, name: "Sails", value: 8 },
  { i: 3, name: "Ropes", value: 3 },
  { i: 4, name: "Tar", value: 2 }
] as Good[];
const markets = [{ i: 1, centerBurgId: 1, color: "#111", goods: {} }] as Market[];
const burgs = [{ i: 1, market: 1, population: 100 }] as Burg[];

function sailOrder(): ProcurementOrder {
  return {
    id: 1,
    stateId: 1,
    destinationMarketId: 1,
    goodId: 2,
    requestedUnits: 1,
    fulfilledUnits: 0,
    maxLandedUnitPrice: 10,
    status: "blocked",
    priorityCycles: 12
  };
}

function reconcile(orders: ProcurementOrder[], existing: LaborMarket[] = []): LaborMarket[] {
  return reconcileStrategicLaborMarkets({ markets, burgs, goods, orders }, existing);
}

describe("strategic labor markets", () => {
  it("creates a persistent cohort from the market population", () => {
    const [laborMarket] = reconcile([]);

    expect(laborMarket.marketId).toBe(1);
    expect(
      Object.values(laborMarket.workersByOccupation).reduce((sum, workers) => sum + (workers ?? 0), 0)
    ).toBeCloseTo(30);
    expect(laborMarket.skillByOccupation.sailmaking).toBeCloseTo(0.99);
  });

  it("moves only a bounded share of workers toward an enduring strategic order", () => {
    const [initial] = reconcile([]);
    const [updated] = reconcile([sailOrder()], [initial]);
    const moved = (updated.workersByOccupation.sailmaking ?? 0) - (initial.workersByOccupation.sailmaking ?? 0);

    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(1.5);
    expect(updated.wageByOccupation.sailmaking).toBeGreaterThan(updated.wageByOccupation.forestry ?? 0);
  });

  it("builds skill and equipment capacity gradually instead of creating output immediately", () => {
    let laborMarkets = reconcile([]);
    const initialProductivity = getStrategicLaborProductivity(laborMarkets[0], "sailmaking");

    for (let cycle = 0; cycle < 12; cycle++) laborMarkets = reconcile([sailOrder()], laborMarkets);

    expect(getStrategicLaborProductivity(laborMarkets[0], "sailmaking")).toBeGreaterThan(initialProductivity);
    expect(laborMarkets[0].capacityByOccupation.sailmaking).toBeGreaterThan(
      laborMarkets[0].workersByOccupation.sailmaking ?? 0
    );
  });

  it("reads wageByOccupation for manufacture: occupation wage, else forestry baseline, else 0", () => {
    const [laborMarket] = reconcile([sailOrder()]);

    expect(getManufactureWageRate(undefined, { name: "Sails" })).toBe(0);
    expect(getManufactureWageRate(laborMarket, { name: "Sails" })).toBe(laborMarket.wageByOccupation.sailmaking);
    expect(getManufactureWageRate(laborMarket, { name: "Barrels" })).toBe(laborMarket.wageByOccupation.forestry);
    expect(getManufactureWageRate({ ...laborMarket, wageByOccupation: {} }, { name: "Barrels" })).toBe(1);
  });

  it("drops cohorts whose markets no longer exist", () => {
    const prior = reconcile([]);

    expect(reconcileStrategicLaborMarkets({ markets: [], burgs, goods, orders: [] }, prior)).toEqual([]);
  });

  describe("trade occupation (caravan arrival volume)", () => {
    function reconcileWithVolume(caravanArrivalVolume: number, existing: LaborMarket[] = []): LaborMarket[] {
      const busyMarkets = [{ i: 1, centerBurgId: 1, color: "#111", goods: {}, caravanArrivalVolume }] as Market[];
      return reconcileStrategicLaborMarkets({ markets: busyMarkets, burgs, goods, orders: [] }, existing);
    }

    it("keeps trade at the baseline share when no caravans have arrived", () => {
      const [laborMarket] = reconcileWithVolume(0);

      // No demand anywhere -> all five occupations split the workforce evenly.
      expect(laborMarket.workersByOccupation.trade).toBeCloseTo(6);
      expect(laborMarket.wageByOccupation.trade).toBeCloseTo(1);
    });

    it("pulls workers toward trade and raises its wage as caravan cargo volume rises", () => {
      let laborMarkets = reconcileWithVolume(0);
      const initialTradeWorkers = laborMarkets[0].workersByOccupation.trade ?? 0;

      for (let cycle = 0; cycle < 12; cycle++) laborMarkets = reconcileWithVolume(200, laborMarkets);

      expect(laborMarkets[0].workersByOccupation.trade ?? 0).toBeGreaterThan(initialTradeWorkers);
      expect(laborMarkets[0].wageByOccupation.trade).toBeGreaterThan(laborMarkets[0].wageByOccupation.forestry ?? 0);
      expect(getStrategicLaborProductivity(laborMarkets[0], "trade")).toBeGreaterThan(1);
    });
  });
});
