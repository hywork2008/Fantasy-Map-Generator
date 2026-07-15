import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { BiomesData, ExtensionAPI, Grid, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import { GoodsModule } from "./goods-generator";

describe("GoodsModule", () => {
  let goodsModule: GoodsModule;

  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(async () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.grid = { cells: { temp: [20, 20, 20, 20] } } as unknown as Grid;
    worldContext.options = { gunpowderEraEnabled: true } as typeof worldContext.options;
    worldContext.biomesData = {
      habitability: Array(20).fill(50),
      i: [],
      name: [],
      color: [],
      biomesMatrix: [],
      iconsDensity: [],
      icons: [],
      cost: []
    } as unknown as BiomesData;
    worldContext.pack = {
      cells: {
        i: [0, 1, 2, 3],
        biome: Uint8Array.from([0, 0, 0, 0]),
        h: Uint8Array.from([20, 20, 20, 20]),
        t: Uint16Array.from([1, 1, 1, 1]),
        r: Uint16Array.from([0, 0, 0, 0]),
        g: Uint16Array.from([0, 0, 0, 0]),
        f: Uint16Array.from([0, 0, 0, 0]),
        good: Uint16Array.from([1, 2, 1, 2])
      },
      features: [{ type: "land" }],
      goods: [
        {
          i: 1,
          name: "Custom A",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "icon-a",
          color: "#ffffff",
          chance: 100,
          distribution: "true"
        },
        {
          i: 2,
          name: "Custom B",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "icon-b",
          color: "#000000",
          chance: 100,
          distribution: "true"
        }
      ]
    } as unknown as PackedGraph;

    goodsModule = new GoodsModule();
  });

  it("keeps the current catalogue when rerolling placement", () => {
    goodsModule.generate({ randomSeed: 123 });

    expect(worldContext.pack.goods).toHaveLength(2);
    expect(worldContext.pack.goods[0].name).toBe("Custom A");
    expect(worldContext.pack.goods[1].name).toBe("Custom B");
  });

  it("restores the default catalogue when requested explicitly", () => {
    goodsModule.restoreDefaults();

    expect(worldContext.pack.goods.some(good => good.name === "Wood")).toBe(true);
    expect(worldContext.pack.goods[0].name).not.toBe("Custom A");
  });

  it("restores default goods with trade cargo profiles", () => {
    goodsModule.restoreDefaults();

    expect(worldContext.pack.goods.every(good => good.trade)).toBe(true);
    expect(worldContext.pack.goods.find(good => good.name === "Gold")?.trade?.distancePremium).toBe(3);
    expect(worldContext.pack.goods.find(good => good.name === "Fish")?.trade?.timeValueTrend).toBe(-2);
  });

  it("replaces the generic Ships Good with sea-only ship-class Goods", () => {
    goodsModule.restoreDefaults();

    expect(worldContext.pack.goods.find(good => good.name === "Ships")).toBeUndefined();
    expect(
      ["Sloop", "Caravel", "Galleon"].map(name => {
        const good = worldContext.pack.goods.find(candidate => candidate.name === name);
        return { name, value: good?.value, seaOnly: good?.seaOnly, recipes: good?.recipes, trade: good?.trade };
      })
    ).toEqual([
      { name: "Sloop", value: 80, seaOnly: true, recipes: undefined, trade: expect.any(Object) },
      { name: "Caravel", value: 200, seaOnly: true, recipes: undefined, trade: expect.any(Object) },
      { name: "Galleon", value: 480, seaOnly: true, recipes: undefined, trade: expect.any(Object) }
    ]);
  });

  it("restores the original defaults even after the current catalogue was edited", () => {
    goodsModule.generate();
    worldContext.pack.goods[0].name = "Edited Wood";

    goodsModule.restoreDefaults();

    expect(worldContext.pack.goods[0].name).toBe("Wood");
  });

  it("initialises the catalogue from defaults when none exists yet", () => {
    worldContext.pack.goods = [];
    goodsModule.generate();

    expect(worldContext.pack.goods.some(good => good.name === "Wood")).toBe(true);
  });

  it("does not corrupt the default template when a restored good is edited", () => {
    goodsModule.restoreDefaults();
    const wood = worldContext.pack.goods.find(good => good.name === "Wood")!;
    wood.name = "Edited Wood";

    goodsModule.restoreDefaults();

    expect(worldContext.pack.goods.find(good => good.name === "Edited Wood")).toBeUndefined();
    expect(worldContext.pack.goods.some(good => good.name === "Wood")).toBe(true);
  });

  it("clears a single good when it is no longer placeable", () => {
    worldContext.pack.goods[0].chance = 0;
    goodsModule.regeneratePlacement(1);

    const goodIds = Array.from(worldContext.pack.cells.good);
    expect(goodIds.some(id => id === 1)).toBe(false);
    expect(goodIds.filter(id => id === 2)).toHaveLength(2);
  });

  it("does not place Gunpowder or Artillery when the gunpowder era is disabled", () => {
    worldContext.pack.goods[0].name = "Gunpowder";
    worldContext.pack.goods[1].name = "Artillery";
    worldContext.options.gunpowderEraEnabled = false;

    goodsModule.generate({ randomSeed: 123 });

    expect(Array.from(worldContext.pack.cells.good)).toEqual([0, 0, 0, 0]);
  });
});
