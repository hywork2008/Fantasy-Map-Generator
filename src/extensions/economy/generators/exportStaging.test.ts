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
      dealId: 0
    });
    const second = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 5,
      unitCost: 12,
      dealId: 1
    });

    expect(first).not.toBeNull();
    expect(second?.id).toBe(first?.id);
    expect(getExportStagingLots()).toHaveLength(1);
    expect(getExportStagingLots()[0].units).toBeCloseTo(15);
    expect(getMarketById(1)?.goods[0].stock).toBeCloseTo(35);
  });

  it("refuses to book more than retail stock", () => {
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 1,
      units: 10,
      unitCost: 2
    });
    expect(lot).toBeNull();
    expect(getExportStagingLots()).toHaveLength(0);
    expect(getMarketById(1)?.goods[1].stock).toBeCloseTo(5);
  });

  it("takeFromLot removes units and prunes empty lots", () => {
    const lot = ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 0,
      units: 8,
      unitCost: 10
    });
    expect(lot).not.toBeNull();
    const taken = ExportStaging.takeFromLot(lot!.id, 5);
    expect(taken).toBeCloseTo(5);
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
      unitCost: 1
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
      unitCost: 9
    });
    expect(ExportStaging.totalUnits()).toBeCloseTo(4);
    expect(ExportStaging.lotsForRoute(1, 2)).toHaveLength(1);
    expect(ExportStaging.lotsForRoute(2, 1)).toHaveLength(0);
  });
});
