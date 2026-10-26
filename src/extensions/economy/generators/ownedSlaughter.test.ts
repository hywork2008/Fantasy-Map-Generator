import { afterEach, beforeEach, expect, it } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { getEconomySlice } from "../context/economyApi";
import { getSlaughterLedger } from "../context/slaughter";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { livestockFeedPeriod } from "./livestockFeedState";
import { getLivestockLotLedger } from "./livestockLots";
import { commitOwnedSlaughter, type OwnedSlaughterRequest } from "./ownedSlaughter";
import type { CarcassProfile } from "./slaughterTransactions";

// Synthetic disjoint weights; these are not a production calibration profile.
const profile: CarcassProfile = {
  id: "test-pig",
  version: 1,
  species: "Pig",
  calibration: "verified",
  carcassKgPerHead: 20,
  leanKgPerHead: 12,
  edibleFatKgPerHead: 2,
  otherCarcassKgPerHead: 6
};
let request: OwnedSlaughterRequest;
let actor: Character;
let enabled: boolean;
const snapshot = () => JSON.stringify({ extensions: simulationContext.extensions, pack: worldContext.pack });
beforeEach(() => {
  actor = { i: 1, inventory: { 1: 2, 9: 7 } } as unknown as Character;
  simulationContext.currentYear = 1300;
  simulationContext.currentMonth = 1;
  simulationContext.extensions = { characters: { characters: [actor] } };
  // The compatibility pack deliberately has stale data. The namespaced record is authoritative.
  worldContext.pack.characters = [{ i: 1, inventory: { 1: 999 } }] as Character[];
  enabled = true;
  initEconomyContext({ worldContext, simulationContext, isExtensionEnabled: () => enabled } as unknown as ExtensionAPI);
  setGoods([{ i: 1, name: "Pig", value: 1, tags: ["liveAnimal", "food"] }] as never);
  const market = { i: 1, goods: { 1: { stock: 2, price: 1 } } };
  setMarkets([market] as never);
  recordGoodFlow({
    direction: "source",
    category: "ruralHarvest",
    goodId: 1,
    units: 2,
    marketId: 1,
    livestockSourceCellId: 7,
    livestockCohorts: { young: 0, breeding: 1, old: 1 }
  });
  market.goods[1].stock = 0;
  recordGoodFlow({
    direction: "sink",
    category: "burgDemand",
    goodId: 1,
    units: 2,
    marketId: 1,
    livestockBuyerId: "character:1",
    livestockOwnerLocationId: "character:1"
  });
  request = {
    operationId: "test-op-1",
    characterId: 1,
    goodId: 1,
    lotId: Object.values(getLivestockLotLedger()!.lots)[0].id,
    heads: 1,
    period: livestockFeedPeriod()
  };
});
afterEach(() => {
  clearEconomyContext();
  simulationContext.extensions = {};
});

it("publishes physical inventory, the shared live lot and persisted disjoint portions together", () => {
  expect(getSlaughterLedger()).toBeNull();
  const receipt = commitOwnedSlaughter(request, profile);
  expect(actor.inventory).toEqual({ 1: 1, 9: 7 });
  expect(worldContext.pack.characters![0].inventory).toEqual({ 1: 999 });
  expect(getLivestockLotLedger()!.lots[request.lotId].heads).toBe(1);
  expect(receipt).toMatchObject({ id: "slaughter-1", physicalInput: { characterId: 1, goodId: 1, marketUnits: 1 } });
  const saved = getSlaughterLedger()!;
  expect(saved.nextBatchId).toBe(2);
  expect(Object.values(saved.portions).reduce((sum, row) => sum + row.remainingKg, 0)).toBe(20);
  expect(
    Object.values(saved.portions).every(row => row.ownerId === "character:1" && row.locationId === "character:1")
  ).toBe(true);
  receipt.portionsKg.lean = 999;
  expect(saved.receipts["operation:test-op-1"].portionsKg.lean).toBe(12);
});

it("replays a saved receipt after full consumption and preserves already allocated portions", () => {
  request.heads = 2;
  const receipt = commitOwnedSlaughter(request, profile);
  expect(actor.inventory).toEqual({ 9: 7 });
  expect(getLivestockLotLedger()!.lots[request.lotId]).toBeUndefined();
  getSlaughterLedger()!.portions["slaughter-1:edibleFat"].remainingKg = 1;
  simulationContext.extensions = JSON.parse(JSON.stringify(simulationContext.extensions));
  simulationContext.currentMonth = 2;
  const before = snapshot();
  // A later edited profile with the same identity cannot reinterpret a committed yield.
  expect(commitOwnedSlaughter(request, { ...profile, leanKgPerHead: 999 })).toEqual(receipt);
  expect(snapshot()).toBe(before);
  expect(() => commitOwnedSlaughter({ ...request, goodId: 9 }, profile)).toThrow("Conflicting");
  expect(snapshot()).toBe(before);
});

it("rejects physical and attributed stock disagreement without repairing or consuming either", () => {
  actor.inventory![1] = 1.5;
  const before = snapshot();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow("disagree");
  expect(snapshot()).toBe(before);
  expect(getSlaughterLedger()).toBeNull();
});

it.each(["transit", "equipped", "differentOwner"])("rejects unavailable live property atomically: %s", reason => {
  const lot = getLivestockLotLedger()!.lots[request.lotId];
  if (reason === "transit") lot.status = "transit";
  if (reason === "equipped") lot.locationId = "loadout:1:mount";
  if (reason === "differentOwner") lot.ownerId = "character:2";
  const before = snapshot();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow();
  expect(snapshot()).toBe(before);
});

it("rejects unknown or unbalanced yield before creating a saved ledger", () => {
  const before = snapshot();
  expect(() => commitOwnedSlaughter(request, { ...profile, calibration: "unknown" })).toThrow();
  expect(() => commitOwnedSlaughter(request, { ...profile, leanKgPerHead: 30 })).toThrow();
  expect(snapshot()).toBe(before);
  expect(getSlaughterLedger()).toBeNull();
});

it("rejects unknown provenance, non-food livestock and a stale period", () => {
  const before = snapshot();
  expect(() => commitOwnedSlaughter({ ...request, period: request.period - 1 }, profile)).toThrow();
  expect(snapshot()).toBe(before);
  const lot = getLivestockLotLedger()!.lots[request.lotId];
  lot.shipmentId = "";
  const unknown = snapshot();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow("shipment");
  expect(snapshot()).toBe(unknown);
  lot.shipmentId = Object.keys(getLivestockLotLedger()!.shipments)[0];
  setGoods([{ i: 1, name: "Pig", value: 1, tags: ["liveAnimal"] }] as never);
  const nonFood = snapshot();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow("eligible");
  expect(snapshot()).toBe(nonFood);
});

it("rejects an occupied output or reused batch sequence without a partial physical debit", () => {
  commitOwnedSlaughter(request, profile);
  const saved = getSlaughterLedger()!;
  saved.portions["slaughter-2:lean"] = { ...saved.portions["slaughter-1:lean"] };
  const before = snapshot();
  const next = { ...request, operationId: "test-op-2" };
  expect(() => commitOwnedSlaughter(next, profile)).toThrow("portion");
  expect(snapshot()).toBe(before);
  saved.portions = {};
  saved.nextBatchId = 1;
  const rewound = snapshot();
  expect(() => commitOwnedSlaughter(next, profile)).toThrow("batch ID");
  expect(snapshot()).toBe(rewound);
});

it("does not create an Economy slice on a rejected first request or overwrite a foreign schema", () => {
  const root = getEconomySlice()!;
  root.slaughter = { schemaVersion: 2 };
  const foreign = snapshot();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow("Unsupported");
  expect(snapshot()).toBe(foreign);
  delete simulationContext.extensions!.economy;
  const missing = snapshot();
  expect(getSlaughterLedger()).toBeNull();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow("Missing Economy");
  expect(snapshot()).toBe(missing);
});

it("does not publish a new batch when Economy is disabled", () => {
  enabled = false;
  const before = snapshot();
  expect(() => commitOwnedSlaughter(request, profile)).toThrow("enabled");
  expect(snapshot()).toBe(before);
});
