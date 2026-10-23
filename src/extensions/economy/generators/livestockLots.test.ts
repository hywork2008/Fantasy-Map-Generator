import { afterEach, beforeEach, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { getEconomySlice } from "../context/economyApi";
import { clearEconomyContext, initEconomyContext, setCaravans, setGoods, setMarkets } from "../economyContext";
import { Caravans } from "./caravans";
import { ExportStaging } from "./exportStaging";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { discardLivestockCargo, getLivestockLotLedger } from "./livestockLots";
import type { Caravan } from "./marketTypes";
import { commitSlaughter } from "./slaughterTransactions";

beforeEach(() => {
  simulationContext.extensions = {};
  initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  setGoods([{ i: 1, name: "Pig", tags: ["liveAnimal", "food"], value: 1 }] as never);
  setMarkets([{ i: 1, goods: { 1: { stock: 0, price: 1 } } }] as never);
});
afterEach(() => {
  clearEconomyContext();
  simulationContext.extensions = {};
});

function move(
  direction: "source" | "sink",
  units: number,
  closing: number,
  extra: Partial<Parameters<typeof recordGoodFlow>[0]> = {}
) {
  const market = (getEconomySlice()!.markets as { goods: Record<number, { stock: number }> }[])[0];
  market.goods[1].stock = closing;
  recordGoodFlow({
    direction,
    category: direction === "source" ? "ruralHarvest" : "recipeInput",
    goodId: 1,
    marketId: 1,
    units,
    ...extra
  });
}

it("keeps unknown opening stock separate, then debits legacy processing without duplicating live property", () => {
  move("source", 2, 2.5, { livestockSourceCellId: 7 });
  const ledger = getLivestockLotLedger()!;
  expect(Object.values(ledger.lots).map(lot => [lot.sourceCellId, lot.heads])).toEqual([
    [null, 0.5],
    [7, 2]
  ]);
  move("sink", 1, 1.5);
  expect(Object.values(ledger.lots).map(lot => [lot.sourceCellId, lot.heads])).toEqual([[7, 1.5]]);
  expect(Object.values(ledger.lots)[0].ownerId).toBeNull();
  move("sink", 1.5, 0);
  expect(Object.values(ledger.lots)).toEqual([]);
  expect(ledger.exits.unknown.recipeInput).toBe(0.5);
  expect(Object.values(ledger.shipments)[0]).toMatchObject({ sourceCellId: 7, species: "Pig", heads: 2 });
});

it("restores a live purchase with its origin and owner and feeds the common carcass transaction", () => {
  move("source", 2, 2, { livestockSourceCellId: 7 });
  const source = Object.values(getLivestockLotLedger()!.lots)[0].shipmentId;
  move("sink", 1, 1, { category: "burgDemand", livestockBuyerId: "burg:3" });
  getEconomySlice()!.livestockLots = JSON.parse(JSON.stringify(getLivestockLotLedger()));
  const ledger = getLivestockLotLedger()!;
  const owned = Object.values(ledger.lots).find(lot => lot.status === "owned")!;
  expect(owned.shipmentId).toBe(source);
  expect(owned.sourceCellId).toBe(7);
  const state = { lots: ledger.lots, receipts: {}, portions: {} };
  const request = {
    id: "test-batch",
    lotId: owned.id,
    ownerId: "burg:3",
    locationId: "market:1",
    period: 15601,
    heads: 1
  };
  // Synthetic fixture; no production yield is configured by this test.
  const profile = {
    id: "test-only",
    version: 1,
    species: "Pig",
    calibration: "verified" as const,
    carcassKgPerHead: 10,
    leanKgPerHead: 6,
    edibleFatKgPerHead: 1,
    otherCarcassKgPerHead: 3
  };
  commitSlaughter(state, request, profile);
  commitSlaughter(state, request, profile);
  expect(owned.heads).toBe(0);
  move("sink", 1, 0);
  expect(Object.values(ledger.lots).filter(lot => lot.status === "market")).toEqual([]);
  expect(Object.keys(state.receipts)).toHaveLength(1);
});

it("drops attribution on unrecorded depletion and never invents import provenance", () => {
  move("source", 2, 2, { livestockSourceCellId: 7 });
  // An uninstrumented change has already removed one head before this import.
  move("source", 1, 2, { category: "importArrival" });
  const lots = Object.values(getLivestockLotLedger()!.lots);
  expect(lots.reduce((sum, lot) => sum + lot.heads, 0)).toBe(2);
  expect(lots.every(lot => lot.sourceCellId === null && !lot.shipmentId && lot.ownerId === null)).toBe(true);
});

it("preserves aggregate ages through staging, partial loading, reload, arrival and cancellation", () => {
  move("source", 4, 4, { livestockSourceCellId: 7, livestockCohorts: { young: 1, breeding: 2, old: 1 } });
  const lot = ExportStaging.bookFromRetail({
    marketId: 1,
    destinationMarketId: 2,
    goodId: 1,
    units: 3,
    unitCost: 0,
    requireCapital: false
  })!;
  const loaded = ExportStaging.takeFromLot(lot.id, 1);
  getEconomySlice()!.livestockLots = JSON.parse(JSON.stringify(getLivestockLotLedger()));
  const ledger = getLivestockLotLedger()!;
  const transit = loaded.livestockCargoIds!.map(id => ledger.lots[id]);
  expect(transit[0].cohortHeads).toEqual({ young: 0.25, breeding: 0.5, old: 0.25 });
  expect(transit[0].status).toBe("transit");
  // Return at another market uses the same arrival path as unloaded cargo.
  const markets = getEconomySlice()!.markets as {
    i: number;
    centerBurgId?: number;
    goods: Record<number, { stock: number; price: number }>;
  }[];
  markets.push({ i: 2, goods: { 1: { stock: 0, price: 1 } } });
  worldContext.distanceScale = 1;
  worldContext.pack.burgs = [{ i: 0 }, { i: 1, cell: 1, x: 0, y: 0, market: 2 }] as never;
  worldContext.pack.states = [];
  markets[1].centerBurgId = 1;
  setCaravans([
    {
      i: 1,
      seller: 1,
      sellerType: "market",
      buyer: 2,
      buyerType: "market",
      payload: [{ goodId: 1, dealId: 1, units: 1, value: 1, livestockCargoIds: loaded.livestockCargoIds }],
      units: 1,
      value: 1,
      routeSegments: [],
      totalDistance: 0,
      currentDistance: 0,
      travelLegs: [{ endKm: 0, speedKmPerDay: 1 }],
      state: "transit"
    } as unknown as Caravan
  ]);
  expect(Caravans.tick(1).arrived).toHaveLength(1);
  const arrived = Object.values(ledger.lots).find(row => row.status === "market" && row.marketId === 2)!;
  expect(arrived.sourceCellId).toBe(7);
  expect(arrived.cohortProvenance).toBe("aggregate");
  expect(arrived.cohortHeads).toEqual({ young: 0.25, breeding: 0.5, old: 0.25 });
  expect(ExportStaging.cancelLot(lot.id)).toBe(2);
  expect(Object.values(ledger.lots).filter(row => row.status === "transit")).toEqual([]);
  expect(Object.values(ledger.lots).reduce((sum, row) => sum + row.heads, 0)).toBe(4);
  discardLivestockCargo(loaded.livestockCargoIds);
  expect(arrived.heads).toBe(1);
});

it("removes transport losses from cargo without debiting market stock again", () => {
  move("source", 3, 3, { livestockSourceCellId: 7, livestockCohorts: { young: 0, breeding: 2, old: 1 } });
  const lot = ExportStaging.bookFromRetail({
    marketId: 1,
    destinationMarketId: 2,
    goodId: 1,
    units: 2,
    unitCost: 0,
    requireCapital: false
  })!;
  const loaded = ExportStaging.takeFromLot(lot.id, 2);
  discardLivestockCargo(loaded.livestockCargoIds, 0.5);
  ExportStaging.returnUnitsToRetail(1, 1, 1.5, loaded.livestockCargoIds);
  const ledger = getLivestockLotLedger()!;
  expect(Object.values(ledger.lots).reduce((sum, row) => sum + row.heads, 0)).toBe(2.5);
  expect(Object.values(ledger.lots).filter(row => row.status === "transit")).toEqual([]);
  expect(Object.values(ledger.exits).reduce((sum, row) => sum + (row.transportLoss ?? 0), 0)).toBe(0.5);
});
