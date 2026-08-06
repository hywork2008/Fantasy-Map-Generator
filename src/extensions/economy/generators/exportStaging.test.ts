import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getExportStagingLots,
  getMarketById,
  initEconomyContext,
  setMarkets
} from "../economyContext";
import { ExportStaging } from "./exportStaging";
import type { Market } from "./marketTypes";

const HEAD_GOOD = {
  i: 5,
  name: "Cats",
  value: 3,
  tags: ["liveAnimal"],
  unit: "head",
  icon: "",
  color: "",
  distribution: "1",
  recipes: []
};

describe("ExportStaging warehouse", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: { 0: { stock: 50, price: 10 }, 1: { stock: 5, price: 2 } }
      } as Market,
      {
        i: 2,
        centerBurgId: 2,
        color: "#111",
        goods: { 0: { stock: 0, price: 15 } }
      } as Market
    ]);
  });

  afterEach(() => {
    ExportStaging.clear();
    clearEconomyContext();
  });

  it("deducts retail once and merges same O/D/good lots", () => {
    const first = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 10,
      unitCost: 12,
      dealId: 0,
      requireCapital: false
    });
    const second = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 5,
      unitCost: 12,
      dealId: 1,
      requireCapital: false
    });

    expect(first).not.toBeNull();
    expect(second?.id).toBe(first?.id);
    expect(getExportStagingLots()).toHaveLength(1);
    expect(getExportStagingLots()[0].units).toBeCloseTo(15);
    expect(getMarketById(1)?.goods[0].stock).toBeCloseTo(35);
  });

  it("clamps booking to available retail stock", () => {
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 1,
      units: 10,
      unitCost: 2,
      requireCapital: false
    });
    // Stock is only 5 — book that amount rather than failing entirely.
    expect(lot).not.toBeNull();
    expect(lot!.units).toBeCloseTo(5);
    expect(getMarketById(1)?.goods[1].stock).toBeCloseTo(0);
  });

  it("returns null when retail stock is empty", () => {
    getMarketById(1)!.goods[1].stock = 0;
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 1,
      units: 10,
      unitCost: 2,
      requireCapital: false
    });
    expect(lot).toBeNull();
  });

  it("takeFromLot removes units and prunes empty lots", () => {
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 8,
      unitCost: 10,
      requireCapital: false
    });
    expect(lot).not.toBeNull();
    const taken = ExportStaging.takeFromLot(lot!.id, 5);
    expect(taken.units).toBeCloseTo(5);
    expect(getExportStagingLots()[0].units).toBeCloseTo(3);
    ExportStaging.takeFromLot(lot!.id, 3);
    expect(getExportStagingLots()).toHaveLength(0);
  });

  it("returnAllToRetail restores exporter stock and clears lots", () => {
    ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 7,
      unitCost: 1,
      requireCapital: false
    });
    expect(getMarketById(1)?.goods[0].stock).toBeCloseTo(43);

    ExportStaging.returnAllToRetail();
    expect(getExportStagingLots()).toHaveLength(0);
    expect(getMarketById(1)?.goods[0].stock).toBeCloseTo(50);
  });

  it("tracks route lots independently of the deals array", () => {
    ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 4,
      unitCost: 9,
      requireCapital: false
    });
    expect(ExportStaging.totalUnits()).toBeCloseTo(4);
    expect(ExportStaging.lotsForRoute(1, 2)).toHaveLength(1);
    expect(ExportStaging.lotsForRoute(2, 1)).toHaveLength(0);
  });

  it("locks trade working capital when booking and unlocks on cancel", () => {
    const market = getMarketById(1)!;
    market.marketTreasury = {
      balance: 100,
      ruralGrainPayable: 0,
      tradeWorkingCapital: 200,
      tradeCapitalLocked: 0
    };
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 10,
      unitCost: 5
    });
    expect(lot).not.toBeNull();
    expect(lot!.lockedCapital).toBeCloseTo(50);
    expect(market.marketTreasury!.tradeCapitalLocked).toBeCloseTo(50);
    ExportStaging.cancelLot(lot!.id);
    expect(market.marketTreasury!.tradeCapitalLocked).toBeCloseTo(0);
    expect(market.goods[0].stock).toBeCloseTo(50);
  });

  it("seedInheritedExportWarehouseIfNeeded() rounds indivisible-unit ('head') goods to a whole-unit lot", () => {
    worldContext.pack.goods = [HEAD_GOOD];
    const origin = getMarketById(1)!;
    // maxByStock = 4 * INHERITED_STOCK_SHARE(0.35) = 1.4 — deliberately fractional and, since it's
    // below the random destCount/lineCount pick's [2, 20) floor, always the binding constraint
    // regardless of Math.random(), which stays unmocked here.
    origin.goods[HEAD_GOOD.i] = { stock: 4, price: 3 };
    origin.marketTreasury = { balance: 0, ruralGrainPayable: 0, tradeWorkingCapital: 1000, tradeCapitalLocked: 0 };

    ExportStaging.seedInheritedExportWarehouseIfNeeded();

    const lots = getExportStagingLots().filter(lot => lot.goodId === HEAD_GOOD.i);
    expect(lots).toHaveLength(1);
    expect(lots[0].units).toBe(1);
  });

  it("caps booking by available trade capital", () => {
    const market = getMarketById(1)!;
    market.marketTreasury = {
      balance: 0,
      ruralGrainPayable: 0,
      tradeWorkingCapital: 20,
      tradeCapitalLocked: 0
    };
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 100,
      unitCost: 10
    });
    // Only 20 capital / 10 unitCost = 2 units.
    expect(lot).not.toBeNull();
    expect(lot!.units).toBeCloseTo(2);
    expect(market.goods[0].stock).toBeCloseTo(48);
  });
});
