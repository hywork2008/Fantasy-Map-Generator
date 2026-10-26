// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { getCharacters, replaceCharacters } from "../extensions/characters/charactersContext";
import type { Character } from "../extensions/characters/characterTypes";
import { getSlaughterLedger } from "../extensions/economy/context/slaughter";
import { getGoods, getMarkets } from "../extensions/economy/context/trade";
import { recordGoodFlow } from "../extensions/economy/generators/goodsBalanceLedger";
import { livestockFeedPeriod } from "../extensions/economy/generators/livestockFeedState";
import { getLivestockLotLedger } from "../extensions/economy/generators/livestockLots";
import { commitOwnedSlaughter } from "../extensions/economy/generators/ownedSlaughter";
import type { CarcassProfile } from "../extensions/economy/generators/slaughterTransactions";
import { createNodeSimulationHost, loadWorld } from "./adapters/node";

it("persists carcass stock, input debits and receipt replay across a real archive reload", async () => {
  const fixture = new Uint8Array(
    readFileSync(resolve(__dirname, "../../docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg"))
  );
  const host = createNodeSimulationHost();
  try {
    await loadWorld(host, fixture);
    // Explicit test owner and source batch. Neither this stock nor these weights are production calibration.
    const actor: Character = {
      i: 900003,
      name: "Test carcass owner",
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
    };
    replaceCharacters([...getCharacters(), actor]);
    const pig = getGoods().find(row => row.name === "Pig")!;
    const market = getMarkets().find(row => row.i > 0)!;
    market.goods[pig.i] = { stock: 2, price: pig.value };
    recordGoodFlow({
      direction: "source",
      category: "ruralHarvest",
      goodId: pig.i,
      units: 2,
      marketId: market.i,
      livestockSourceCellId: 0,
      livestockCohorts: { young: 0, breeding: 1, old: 1 }
    });
    market.goods[pig.i].stock = 0;
    actor.inventory = { [pig.i]: 2 };
    recordGoodFlow({
      direction: "sink",
      category: "burgDemand",
      goodId: pig.i,
      units: 2,
      marketId: market.i,
      livestockBuyerId: `character:${actor.i}`,
      livestockOwnerLocationId: `character:${actor.i}`
    });
    const lot = Object.values(getLivestockLotLedger()!.lots).find(row => row.ownerId === `character:${actor.i}`)!;
    expect(lot.heads).toBe(2);
    const profile: CarcassProfile = {
      id: "test-only",
      version: 1,
      species: "Pig",
      calibration: "verified",
      carcassKgPerHead: 20,
      leanKgPerHead: 12,
      edibleFatKgPerHead: 2,
      otherCarcassKgPerHead: 6
    };
    const request = {
      operationId: "archive-op-1",
      characterId: actor.i,
      goodId: pig.i,
      lotId: lot.id,
      heads: 1,
      period: livestockFeedPeriod()
    };
    const receipt = commitOwnedSlaughter(request, profile);
    getSlaughterLedger()!.portions[`${receipt.id}:edibleFat`].remainingKg = 1;
    const savedLedger = structuredClone(getSlaughterLedger());
    await loadWorld(host, await host.saveArchive());
    expect(getSlaughterLedger()).toEqual(savedLedger);
    expect(getCharacters().find(row => row.i === actor.i)!.inventory?.[pig.i]).toBe(1);
    expect(getLivestockLotLedger()!.lots[lot.id].heads).toBe(1);
    expect(commitOwnedSlaughter(request, profile)).toEqual(receipt);
    expect(getSlaughterLedger()).toEqual(savedLedger);
    const second = commitOwnedSlaughter({ ...request, operationId: "archive-op-2" }, profile);
    expect(second.id).toBe("slaughter-2");
    expect(getCharacters().find(row => row.i === actor.i)!.inventory?.[pig.i]).toBeUndefined();
    expect(getLivestockLotLedger()!.lots[lot.id]).toBeUndefined();
    expect(getSlaughterLedger()!.nextBatchId).toBe(3);
    // Forty kg recovered, one kg allocated before save; replay must not replace it.
    expect(Object.values(getSlaughterLedger()!.portions).reduce((sum, row) => sum + row.remainingKg, 0)).toBe(39);
    expect(getMarkets().find(row => row.i === market.i)!.goods[pig.i].stock).toBe(0);
  } finally {
    host.dispose();
  }
}, 300_000);
