import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext } from "../economyContext";
import {
  clearMarketManagers,
  MARKET_MANAGER_ROLE_KIND,
  MARKET_RIVAL_MERCHANT_ROLE_KIND,
  syncMarketManagers
} from "./marketManagers";
import type { Market } from "./marketTypes";

describe("market managers", () => {
  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);

    worldContext.seed = "market-managers";
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals", culture: 0 },
        { i: 1, name: "Kingdom of Foo", culture: 0 }
      ],
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, name: "Northport", culture: 0, state: 1, cell: 1 } as unknown as Burg,
        { i: 2, name: "Southport", culture: 0, state: 1, cell: 2 } as unknown as Burg
      ],
      cells: { i: [0, 1, 2], culture: Uint16Array.from([0, 0, 0]) },
      markets: [
        { i: 1, centerBurgId: 1, color: "#f00", goods: {} },
        { i: 2, centerBurgId: 2, color: "#0f0", goods: {} }
      ] satisfies Market[]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("creates one manager and two rivals per market even within the same state", () => {
    syncMarketManagers();

    const [northMarket, southMarket] = getMarkets();
    expect(northMarket.managerCharacterId).toBeDefined();
    expect(southMarket.managerCharacterId).toBeDefined();
    expect(northMarket.managerCharacterId).not.toBe(southMarket.managerCharacterId);

    const managers = worldContext.pack.characters.filter(c =>
      c.roles?.some(role => role.kind === MARKET_MANAGER_ROLE_KIND)
    );
    expect(managers).toHaveLength(2);
    expect(managers.map(c => c.location).sort()).toEqual([1, 2]);

    expect(northMarket.rivalCharacterIds).toHaveLength(2);
    expect(southMarket.rivalCharacterIds).toHaveLength(2);
    expect(new Set([...northMarket.rivalCharacterIds!, ...southMarket.rivalCharacterIds!]).size).toBe(4);
    expect(
      worldContext.pack.characters.filter(c => c.roles?.some(role => role.kind === MARKET_RIVAL_MERCHANT_ROLE_KIND))
    ).toHaveLength(4);
  });

  it("clears economy-only managers but keeps characters that still have titles", () => {
    syncMarketManagers();
    const retainedManager = worldContext.pack.characters.find(c => c.i === getMarkets()[0].managerCharacterId)!;
    retainedManager.titles.push({
      title: "Patrician",
      landed: false,
      entityType: "state",
      entityId: 1
    });

    clearMarketManagers();

    expect(getMarkets().every(m => m.managerCharacterId === undefined)).toBe(true);
    expect(worldContext.pack.characters).toHaveLength(1);
    expect(worldContext.pack.characters[0].i).toBe(retainedManager.i);
    expect(worldContext.pack.characters[0].roles).toBeUndefined();
  });
});
