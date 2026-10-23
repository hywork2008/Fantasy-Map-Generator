import { afterEach, beforeEach, expect, it } from "vitest";
import { CHARACTER_INVENTORY_TRANSFER_EVENT } from "../../../simulation/characterInventoryEvents";
import { simEvents } from "../../../simulation/events";
import { offerGift } from "../../characters/backstoryProfile";
import type { Character } from "../../characters/characterTypes";
import { equipFromInventory, setLoadoutEditor, setSlotQuality, unequipSlot } from "../../characters/loadoutEquip";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { getEconomySlice } from "../context/economyApi";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { registerCharacterLivestockTransfers } from "./characterLivestockTransfers";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { getLivestockLotLedger } from "./livestockLots";

const goods = [{ i: 1, name: "Horses" }];
let from: Character;
let to: Character;
let enabled: boolean;
let unregister: () => void;
const character = (i: number) =>
  ({
    i,
    name: `Actor ${i}`,
    location: 1,
    inventory: {},
    affinities: {},
    personality: { honor: 50, piety: 50, greed: 50 },
    skills: { learning: 50 }
  }) as unknown as Character;
const held = (actor: number, location: string) =>
  Object.values(getLivestockLotLedger()!.lots).filter(
    lot => lot.ownerId === `character:${actor}` && lot.locationId === location
  );
const count = (actor: number, location: string) => held(actor, location).reduce((sum, lot) => sum + lot.heads, 0);

beforeEach(() => {
  simulationContext.extensions = {};
  initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  from = character(1);
  to = character(2);
  worldContext.pack.characters = [from, to];
  worldContext.pack.burgs = [{ i: 0 }, { i: 1, market: 1 }] as never;
  setGoods([{ i: 1, name: "Horses", tags: ["liveAnimal"], value: 1 }] as never);
  setMarkets([{ i: 1, goods: { 1: { stock: 3, price: 1 } } }] as never);
  recordGoodFlow({
    direction: "source",
    category: "ruralHarvest",
    goodId: 1,
    units: 3,
    marketId: 1,
    livestockSourceCellId: 7,
    livestockCohorts: { young: 15, breeding: 45, old: 15 }
  });
  const market = (getEconomySlice()!.markets as { goods: Record<number, { stock: number }> }[])[0];
  market.goods[1].stock = 0;
  from.inventory = { 1: 3 };
  recordGoodFlow({
    direction: "sink",
    category: "burgDemand",
    goodId: 1,
    units: 3,
    marketId: 1,
    livestockBuyerId: "character:1",
    livestockOwnerLocationId: "character:1"
  });
  enabled = true;
  unregister = registerCharacterLivestockTransfers(simEvents, () => enabled);
});
afterEach(() => {
  unregister();
  clearEconomyContext();
  simulationContext.extensions = {};
});

it("keeps inventory, an equipped mount and a gifted share separate through serialization", () => {
  expect(equipFromInventory({ character: from, slot: "mount", goodId: 1, goods }).ok).toBe(true);
  expect(count(1, "loadout:1:mount")).toBe(25);
  expect(count(1, "character:1")).toBe(50);
  offerGift(from, to, { goodId: 1, goodName: "Horses", amount: 1, intent: "courtesy" });
  expect(count(1, "loadout:1:mount")).toBe(25);
  expect(count(1, "character:1")).toBe(25);
  expect(count(2, "character:2")).toBe(25);
  expect(held(2, "character:2")[0].marketId).toBe(1);
  getEconomySlice()!.livestockLots = JSON.parse(JSON.stringify(getLivestockLotLedger()));
  expect(unequipSlot({ character: from, slot: "mount" }).ok).toBe(true);
  expect(unequipSlot({ character: from, slot: "mount" }).ok).toBe(false);
  expect(count(1, "character:1")).toBe(50);
  expect(count(1, "loadout:1:mount")).toBe(0);
  const lots = Object.values(getLivestockLotLedger()!.lots);
  expect(lots.every(lot => lot.sourceCellId === 7 && lot.cohortProvenance === "aggregate")).toBe(true);
  expect(lots.reduce((sum, lot) => sum + lot.heads, 0)).toBe(75);
});

it("does not move provenance for quality edits, rejected commands, self gifts or free editor equipment", () => {
  const baseline = structuredClone(getLivestockLotLedger());
  expect(equipFromInventory({ character: from, slot: "weapon", goodId: 1, goods }).ok).toBe(false);
  offerGift(from, from, { goodId: 1, goodName: "Horses", amount: 1, intent: "courtesy" });
  expect(getLivestockLotLedger()).toEqual(baseline);
  equipFromInventory({ character: from, slot: "mount", goodId: 1, goods });
  const equipped = structuredClone(getLivestockLotLedger());
  setSlotQuality({ character: from, slot: "mount", quality: 5 });
  expect(getLivestockLotLedger()).toEqual(equipped);
  setLoadoutEditor({
    character: from,
    loadout: { mount: { goodId: 1, quality: 3, source: "editor", styleKey: "riding_mount" } }
  });
  expect(count(1, "character:1")).toBe(75);
  expect(count(1, "loadout:1:mount")).toBe(0);
  const editor = structuredClone(getLivestockLotLedger());
  unequipSlot({ character: from, slot: "mount" });
  expect(getLivestockLotLedger()).toEqual(editor);
});

it("returns paid equipment once on editor clear and ignores malformed, disabled and unregistered events", () => {
  equipFromInventory({ character: from, slot: "mount", goodId: 1, goods });
  setLoadoutEditor({ character: from, loadout: null });
  setLoadoutEditor({ character: from, loadout: null });
  expect(count(1, "character:1")).toBe(75);
  const baseline = structuredClone(getLivestockLotLedger());
  simEvents.dispatchEvent(new CustomEvent(CHARACTER_INVENTORY_TRANSFER_EVENT, { detail: { units: -1 } }));
  enabled = false;
  offerGift(from, to, { goodId: 1, goodName: "Horses", amount: 1, intent: "courtesy" });
  expect(getLivestockLotLedger()).toEqual(baseline);
  enabled = true;
  unregister();
  offerGift(from, to, { goodId: 1, goodName: "Horses", amount: 1, intent: "courtesy" });
  expect(getLivestockLotLedger()).toEqual(baseline);
});

it("sells only the bag's share while the equipped mount retains its original lineage", () => {
  equipFromInventory({ character: from, slot: "mount", goodId: 1, goods });
  const market = (getEconomySlice()!.markets as { goods: Record<number, { stock: number }> }[])[0];
  market.goods[1].stock = 1;
  recordGoodFlow({
    direction: "source",
    category: "importArrival",
    goodId: 1,
    units: 1,
    marketId: 1,
    livestockSellerId: "character:1",
    livestockOwnerLocationId: "character:1",
    livestockOwnerOpeningUnits: 2
  });
  expect(count(1, "loadout:1:mount")).toBe(25);
  expect(held(1, "loadout:1:mount")[0].sourceCellId).toBe(7);
  expect(count(1, "character:1")).toBe(25);
});

it("reconciles an old paid mount still attributed to the bag without duplicating its headcount", () => {
  // Before transfer notifications existed, equipping changed physical inventory only.
  from.inventory = { 1: 2 };
  from.loadout = { mount: { goodId: 1, quality: 3, source: "equipped", styleKey: "riding_mount" } };
  expect(unequipSlot({ character: from, slot: "mount" }).ok).toBe(true);
  expect(from.inventory[1]).toBe(3);
  expect(count(1, "character:1")).toBe(75);
  expect(count(1, "loadout:1:mount")).toBe(0);
  expect(held(1, "character:1").every(lot => lot.sourceCellId === null && lot.cohortProvenance === "unknown")).toBe(
    true
  );
});
