import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { ADVENTURING_KIT, adventuringKitValue } from "./adventuringKitContracts";
import { GOODS_DATA } from "./goods-generator";
import { buyOutfitterPiece, getOutfitterSnapshot } from "./outfitterShop";

function character(i: number, wealth: number, location?: number): Character {
  return {
    i,
    name: "Traveller",
    age: 30,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: { diplomacy: 1, martial: 1, stewardship: 1, intrigue: 1, learning: 1 },
    personality: { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 },
    family: { parents: [], children: [], siblings: [] },
    appearance: 0,
    prestige: 0,
    wealth,
    location,
    pastTitles: []
  } as Character;
}

describe("outfitter shop", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext: { tickCount: 0, extensions: {} }
    } as unknown as ExtensionAPI);
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      characters: [character(1, 1, 1)],
      burgs: [{ i: 0 } as Burg, { i: 1, name: "Port", removed: false } as Burg]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("prices each piece from its recorded pence and stays out of the bulk catalog", () => {
    expect(ADVENTURING_KIT.map(piece => [piece.id, piece.pence, adventuringKitValue(piece)])).toEqual([
      ["hand-axe", 5, 0.04],
      ["lantern", 6, 0.04],
      ["costrel", 8, 0.06],
      ["purse", 1.5, 0.01]
    ]);
    const bulkNames = new Set(GOODS_DATA.map(good => good.name));
    for (const piece of ADVENTURING_KIT) expect(bulkNames.has(piece.name)).toBe(false);
  });

  it("debits wealth into kit and leaves the market inventory empty", () => {
    const bought = buyOutfitterPiece(1, "costrel", 2);
    expect(bought).toEqual({ ok: true, message: "Purchase completed." });
    const holder = worldContext.pack.characters?.[0];
    expect(holder?.wealth).toBe(0.88);
    expect(holder?.kit).toEqual({ costrel: 2 });
    expect(holder?.inventory).toBeUndefined();

    const again = buyOutfitterPiece(1, "hand-axe", 1);
    expect(again.ok).toBe(true);
    expect(holder?.wealth).toBe(0.84);
    expect(holder?.kit).toEqual({ costrel: 2, "hand-axe": 1 });
    expect(getOutfitterSnapshot(1)?.rows.find(row => row.id === "purse")?.held).toBe(0);
  });

  it("refuses a short purse, a fraction, and an unknown piece", () => {
    expect(buyOutfitterPiece(1, "costrel", 100).ok).toBe(false);
    expect(buyOutfitterPiece(1, "lantern", 1.5).ok).toBe(false);
    expect(buyOutfitterPiece(1, "torch", 1).ok).toBe(false);
    expect(worldContext.pack.characters?.[0]?.wealth).toBe(1);
    expect(worldContext.pack.characters?.[0]?.kit).toBeUndefined();
  });
});
