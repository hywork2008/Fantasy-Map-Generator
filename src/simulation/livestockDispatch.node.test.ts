// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { offerGift } from "../extensions/characters/backstoryProfile";
import { getCharacters, replaceCharacters } from "../extensions/characters/charactersContext";
import type { Character } from "../extensions/characters/characterTypes";
import { equipFromInventory, unequipSlot } from "../extensions/characters/loadoutEquip";
import { getLivestockDispatchTable } from "../extensions/economy/context/cellTables";
import { getGoods, getMarkets } from "../extensions/economy/context/trade";
import { getLivestockLotLedger, moveOwnedLivestock } from "../extensions/economy/generators/livestockLots";
import { advanceWorld, createNodeSimulationHost, loadWorld } from "./adapters/node";

it("preserves live dispatch, herds and market stocks across a mid-cycle archive reload", async () => {
  const fixture = new Uint8Array(
    readFileSync(resolve(__dirname, "../../docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg"))
  );
  const run = async (reload: boolean) => {
    const host = createNodeSimulationHost();
    try {
      await loadWorld(host, fixture);
      await advanceWorld(host, { days: 47 });
      const receipts = JSON.parse(JSON.stringify(getLivestockDispatchTable()));
      expect(Object.keys(receipts).length).toBeGreaterThan(0);
      if (reload) {
        await loadWorld(host, await host.saveArchive());
        expect(JSON.parse(JSON.stringify(getLivestockDispatchTable()))).toEqual(receipts);
        expect(Object.values(getLivestockDispatchTable()!).every(row => !row.observation)).toBe(true);
      }
      await advanceWorld(host, { days: 30 });
      const ledger = getLivestockLotLedger();
      expect(ledger).not.toBeNull();
      expect(Object.keys(ledger!.exits).length).toBeGreaterThan(0);
      const aged = Object.values(ledger!.shipments).filter(row => row.cohortHeads);
      expect(aged.length).toBeGreaterThan(0);
      for (const shipment of aged) {
        const ages = shipment.cohortHeads!;
        expect(ages.young + ages.breeding + ages.old).toBeCloseTo(shipment.heads, 8);
      }
      expect(Object.values(ledger!.lots).every(lot => Number.isFinite(lot.heads) && lot.heads >= 0)).toBe(true);
      const economy = host.simulation.extensions?.economy as Record<string, unknown>;
      const liveIds = getGoods()
        .filter(good => good.tags.includes("liveAnimal"))
        .map(good => good.i);
      return JSON.parse(
        JSON.stringify({
          lots: economy.livestockLots,
          dispatch: economy.livestockDispatch,
          herds: economy.faunaStock,
          phases: economy.cadencePhases,
          stocks: getMarkets().map(market => ({
            marketId: market.i,
            goods: liveIds.map(id => [id, market.goods[id]?.stock ?? 0])
          }))
        })
      );
    } finally {
      host.dispose();
    }
  };
  // Scope the comparison to the persisted livestock chain and its production cadence.
  expect(await run(true)).toEqual(await run(false));
}, 300_000);

it("connects personal inventory events through the real Economy lifecycle after archive reload", async () => {
  const fixture = new Uint8Array(
    readFileSync(resolve(__dirname, "../../docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg"))
  );
  const host = createNodeSimulationHost();
  try {
    await loadWorld(host, fixture);
    // This fixture has no materialized people at prepare time. Add explicit test actors.
    const actor = (i: number): Character => ({
      i,
      name: `Test actor ${i}`,
      age: 30,
      gender: "male",
      culture: 0,
      state: 0,
      titles: [],
      affinities: {},
      marriages: [],
      pastTitles: [],
      appearance: 50,
      prestige: 0,
      wealth: 0,
      family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
      skills: {
        artistry: 50,
        diplomacy: 50,
        engineering: 50,
        geography: 50,
        intrigue: 50,
        learning: 50,
        martial: 50,
        prowess: 50,
        stewardship: 50
      },
      personality: {
        boldness: 50,
        compassion: 50,
        greed: 50,
        honor: 50,
        rationality: 50,
        sociability: 50,
        vengefulness: 50,
        zeal: 50,
        energy: 50,
        piety: 50,
        guile: 50,
        confidence: 50
      }
    });
    const from = actor(900001),
      to = actor(900002);
    replaceCharacters([...getCharacters(), from, to]);
    const horse = getGoods().find(good => good.name === "Horses")!;
    from.inventory = { [horse.i]: 1 };
    from.loadout = {};
    // A synthetic legacy-owned team: no source herd or calibrated meat is invented.
    moveOwnedLivestock({
      species: "Horses",
      units: 1,
      fromOwnerId: "test-only",
      toOwnerId: `character:${from.i}`,
      marketId: 0,
      locationId: `character:${from.i}`
    });
    expect(equipFromInventory({ character: from, slot: "mount", goodId: horse.i, goods: getGoods() }).ok).toBe(true);
    const inSlot = () =>
      Object.values(getLivestockLotLedger()!.lots)
        .filter(lot => lot.ownerId === `character:${from.i}` && lot.locationId === `loadout:${from.i}:mount`)
        .reduce((sum, lot) => sum + lot.heads, 0);
    expect(inSlot()).toBe(25);
    await loadWorld(host, await host.saveArchive());
    expect(inSlot()).toBe(25);
    const restoredFrom = getCharacters().find(row => row.i === from.i)!;
    const restoredTo = getCharacters().find(row => row.i === to.i)!;
    const recipientBefore = Object.values(getLivestockLotLedger()!.lots)
      .filter(lot => lot.ownerId === `character:${to.i}`)
      .reduce((sum, lot) => sum + lot.heads, 0);
    expect(unequipSlot({ character: restoredFrom, slot: "mount" }).ok).toBe(true);
    expect(inSlot()).toBe(0);
    offerGift(restoredFrom, restoredTo, { goodId: horse.i, goodName: "Horses", amount: 1, intent: "courtesy" });
    const recipientAfter = Object.values(getLivestockLotLedger()!.lots)
      .filter(lot => lot.ownerId === `character:${to.i}`)
      .reduce((sum, lot) => sum + lot.heads, 0);
    expect(recipientAfter - recipientBefore).toBe(25);
  } finally {
    host.dispose();
  }
}, 300_000);
