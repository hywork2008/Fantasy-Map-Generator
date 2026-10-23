import { afterEach, beforeEach, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { getEconomySlice } from "../context/economyApi";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { getLivestockLotLedger } from "./livestockLots";
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
