import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getPortWarehouses, initEconomyContext, setCaravans } from "../economyContext";
import type { Caravan } from "./marketTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import {
  accruePortStorage,
  beginPortProductionCycle,
  clearPortWarehouseCache,
  collectSeaBacklogSlots,
  collectSeaDemandSlots,
  getMarketPortBurgId,
  PORT_WAREHOUSE_COST_PER_SLOT,
  portWarehouseLayout,
  portWarehouseOwner,
  recordSeaDeparture
} from "./portWarehouses";

const SEA_ROUTE = [
  {
    type: "sea" as const,
    points: [
      [0, 0],
      [100, 0]
    ] as [number, number][]
  }
];

function seaCaravan(slots: number): Caravan {
  return {
    i: 1,
    seller: 1,
    sellerType: "market",
    buyer: 2,
    buyerType: "market",
    payload: [{ goodId: 1, dealId: 0, units: slots, value: slots, cargoSlotsPerUnit: 1 }],
    routeSegments: SEA_ROUTE,
    state: "transit"
  } as unknown as Caravan;
}

describe("port warehouses", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [
        { i: 0 } as Burg,
        { i: 1, market: 1, population: 2, port: 1 } as Burg,
        { i: 2, market: 2, population: 1, port: 1 } as Burg,
        { i: 3, market: 1, population: 5 } as Burg
      ],
      markets: [
        { i: 1, centerBurgId: 3, color: "#000", goods: {} },
        { i: 2, centerBurgId: 2, color: "#111", goods: {} }
      ],
      caravans: [],
      merchantTransportLedgers: [],
      portWarehouses: []
    } as unknown as PackedGraph;
    clearPortWarehouseCache();
  });

  afterEach(() => {
    MerchantTransportAssets.clear();
    MerchantTransportAssets.setWaterAssetModeActive(false);
    clearPortWarehouseCache();
    clearEconomyContext();
  });

  it("keeps a market's sea cargo at its largest port, not at an inland centre", () => {
    expect(getMarketPortBurgId(1)).toBe(1);
    expect(getMarketPortBurgId(2)).toBe(2);
  });

  it("builds a warehouse after a year of sea trade beyond its room, and keeps it when trade stops", () => {
    beginPortProductionCycle(30);
    const start = getPortWarehouses().find(state => state.burgId === 1)?.capacitySlots ?? 0;
    expect(start).toBeGreaterThan(0);

    for (let month = 0; month < 36; month++) {
      recordSeaDeparture(seaCaravan(2000), 1);
      beginPortProductionCycle(30);
    }
    const built = getPortWarehouses().find(state => state.burgId === 1);
    expect(built?.capacitySlots).toBeGreaterThan(start);
    expect(built?.lastBuiltYear).not.toBeNull();

    const capacity = built?.capacitySlots ?? 0;
    for (let month = 0; month < 24; month++) beginPortProductionCycle(30);
    expect(getPortWarehouses().find(state => state.burgId === 1)?.capacitySlots).toBeGreaterThanOrEqual(capacity);
  });

  it("has the port market's house pay for the building and take its share of the rent (T6)", () => {
    simulationContext.worldSettings = { "fmg-long-distance-trade": "on" };
    try {
      const treasury = { balance: 0, ruralGrainPayable: 0, tradeWorkingCapital: 0, tradeCapitalPaid: true };
      (worldContext.pack.markets as unknown as { marketTreasury?: unknown }[])[0].marketTreasury = treasury;
      const trade = (months: number) => {
        for (let month = 0; month < months; month++) {
          recordSeaDeparture(seaCaravan(2000), 1);
          beginPortProductionCycle(30);
        }
      };
      beginPortProductionCycle(30);
      const start = getPortWarehouses().find(state => state.burgId === 1)?.capacitySlots ?? 0;
      trade(24);
      // A house with no cash builds nothing.
      expect(getPortWarehouses().find(state => state.burgId === 1)?.buildingSlots).toBeUndefined();
      expect(getPortWarehouses().find(state => state.burgId === 1)?.capacitySlots).toBe(start);

      treasury.tradeWorkingCapital = 100_000;
      trade(14);
      const state = getPortWarehouses().find(entry => entry.burgId === 1);
      const built = (state?.capacitySlots ?? 0) - start;
      expect(built).toBeGreaterThan(0);
      expect(state?.houseSlots).toBe(built);
      expect(treasury.tradeWorkingCapital).toBeCloseTo(100_000 - built * PORT_WAREHOUSE_COST_PER_SLOT, 0);
      expect(portWarehouseOwner(1)).toEqual({ marketId: 1, share: built / (state?.capacitySlots ?? 1) });
    } finally {
      delete simulationContext.worldSettings;
    }
  });

  it("expects about a month of a port's usual departures as demand for hulls", () => {
    for (let month = 0; month < 24; month++) {
      recordSeaDeparture(seaCaravan(60), 1);
      beginPortProductionCycle(30);
    }
    // 60 slots sail from market 1's port each month; the arrival port expects none.
    expect(collectSeaDemandSlots().get(1)).toBeGreaterThan(50);
    expect(collectSeaDemandSlots().get(1)).toBeLessThanOrEqual(60);
    expect(collectSeaDemandSlots().get(2)).toBeUndefined();
  });

  it("separates gathering demand from failed departures and unbooked cargo (T9)", () => {
    Object.assign(worldContext.pack.burgs[1], { x: 0, y: 0 });
    Object.assign(worldContext.pack.burgs[2], { x: 100, y: 0 });
    const caravan = {
      ...seaCaravan(10),
      state: "loading",
      departReason: "waiting",
      loading: { plannedCapacitySlots: 100, waitedDays: 0 }
    } as Caravan;
    setCaravans([caravan]);
    expect(collectSeaBacklogSlots().get(1)).toBeUndefined();
    expect(collectSeaDemandSlots().get(1)).toBe(100);
    caravan.departReason = "depart-overdue";
    MerchantTransportAssets.setWaterAssetModeActive(true);
    expect(collectSeaBacklogSlots().get(1)).toBe(100);
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 7, shipClassId: "sloop", homeBurgId: 1, ownerId: 1, status: "docked", currentBurgId: 1 }
    ]);
    // A hull available for this load means another constraint caused the departure failure.
    expect(collectSeaBacklogSlots().get(1)).toBeUndefined();
    setCaravans([]);
    MerchantTransportAssets.recordSeaHullShortfall(1, 15, 1);
    expect(collectSeaBacklogSlots().get(1)).toBe(15);
    // A refused purchase is not physical cargo occupying a warehouse.
    beginPortProductionCycle(30);
    expect(getPortWarehouses().find(state => state.burgId === 1)?.queuedSlots).toBe(0);
  });

  it("spoils staple food left outside the port's warehouses half as fast again (§4.4)", () => {
    simulationContext.worldSettings = { "fmg-long-distance-trade": "on" };
    try {
      worldContext.pack.goods = [{ i: 1, name: "Grain", tags: ["food", "stapleFood"] }] as never;
      const spoiledAfterAMonth = (capacitySlots: number): number => {
        const caravan = {
          ...seaCaravan(1000),
          state: "loading",
          loading: { waitedDays: 0 },
          portTransfer: { seaSegmentIndex: 0, atKm: 0, portBurgId: 1, atPort: true }
        } as unknown as Caravan;
        setCaravans([caravan]);
        worldContext.pack.portWarehouses = [{ burgId: 1, capacitySlots }] as never;
        for (let day = 0; day < 30; day++) accruePortStorage(1);
        return caravan.loading?.portSpoiledUnits?.[1] ?? 0;
      };
      const inside = spoiledAfterAMonth(5000);
      const outside = spoiledAfterAMonth(0);
      // About 1.5% a quarter in a temperate granary.
      expect(inside).toBeGreaterThan(3);
      expect(inside).toBeLessThan(10);
      expect(outside / inside).toBeCloseTo(1.5, 1);
    } finally {
      delete simulationContext.worldSettings;
    }
  });

  it("chooses the historical layout by size and standing", () => {
    const base = { steam: false, capital: false, merchantHome: false };
    expect(portWarehouseLayout({ ...base, floorAreaM2: 100 })).toBe("merchantHouses");
    expect(portWarehouseLayout({ ...base, floorAreaM2: 1000 })).toBe("quayRow");
    expect(portWarehouseLayout({ ...base, floorAreaM2: 5000, merchantHome: true })).toBe("compound");
    expect(portWarehouseLayout({ ...base, floorAreaM2: 9000, capital: true, merchantHome: true })).toBe("stateStore");
    expect(portWarehouseLayout({ ...base, floorAreaM2: 20000, steam: true, capital: true })).toBe("dock");
    expect(portWarehouseLayout({ ...base, floorAreaM2: 5000, steam: true })).toBe("quayRow");
  });
});
