import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCoastalHabitatCode, getNearshoreHabitatCode } from "../../../data/coastalHabitatCatalog";
import { worldContext } from "../../hostCore";
import type { BiomesData, ExtensionAPI, Grid, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoodCellColumn,
  getGoods,
  initEconomyContext,
  setGoodCellColumn,
  setGoods
} from "../economyContext";
import { GoodsModule, isGoodEnabled, migrateLegacyOreIngotGoods } from "./goods-generator";

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
        biomeCode: Uint8Array.from([0, 0, 0, 0]),
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

    expect(getGoods()).toHaveLength(2);
    expect(getGoods()[0].name).toBe("Custom A");
    expect(getGoods()[1].name).toBe("Custom B");
  });

  it("restores the default catalogue when requested explicitly", () => {
    goodsModule.restoreDefaults();

    expect(getGoods().some(good => good.name === "Wood")).toBe(true);
    expect(getGoods()[0].name).not.toBe("Custom A");
  });

  it("restores default goods with trade cargo profiles", () => {
    goodsModule.restoreDefaults();

    expect(getGoods().every(good => good.trade)).toBe(true);
    expect(getGoods().find(good => good.name === "Gold Ore")?.trade?.distancePremium).toBe(0);
    expect(getGoods().find(good => good.name === "Gold Ingot")?.trade?.distancePremium).toBe(3);
    expect(getGoods().find(good => good.name === "Fish")?.trade?.timeValueTrend).toBe(-2);
  });

  it("includes lead and gunpowder-era sulfur in the default mineral supply chain", () => {
    goodsModule.restoreDefaults();

    const byName = new Map(getGoods().map(good => [good.name, good]));
    const leadOre = byName.get("Lead Ore");
    const leadIngot = byName.get("Lead Ingot");
    const sulfur = byName.get("Sulfur");
    const gunpowder = byName.get("Gunpowder");

    expect(leadOre?.tags).toEqual(expect.arrayContaining(["ore", "mineral"]));
    expect(leadOre?.trade?.distancePremium).toBeLessThan(leadIngot!.trade!.distancePremium);
    expect(leadIngot?.tags).toEqual(expect.arrayContaining(["ingot", "metal"]));
    expect(sulfur?.tags).toEqual(expect.arrayContaining(["mineral", "military"]));
    expect(sulfur?.trade).toBeDefined();
    expect(gunpowder?.recipes).toContainEqual(
      expect.objectContaining({
        [byName.get("Saltpeter")!.i]: 0.5,
        [sulfur!.i]: 0.25,
        [byName.get("Coal")!.i]: 0.5
      })
    );
  });

  it("migrates legacy metal stock to Ore and appends zero-stock-ready Ingot definitions", () => {
    setGoods([
      { i: 2, name: "Iron", tags: ["ore"], value: 4, unit: "wagon", icon: "good-iron", color: "#5D686E" },
      {
        i: 4,
        name: "Tools",
        tags: ["construction"],
        value: 14,
        unit: "set",
        icon: "good-tools",
        color: "#808080",
        recipes: [{ 2: 0.5 }]
      }
    ]);

    expect(migrateLegacyOreIngotGoods()).toBe(true);

    const byName = new Map(getGoods().map(good => [good.name, good]));
    const ore = byName.get("Iron Ore");
    const ingot = byName.get("Iron Ingot");
    expect(ore).toMatchObject({ i: 2, value: 2, tags: ["ore", "mineral"] });
    expect(ingot).toMatchObject({ value: 4, chance: 0, tags: ["ingot", "metal", "military"] });
    expect(byName.get("Tools")?.recipes).toEqual([{ [ingot!.i]: 0.5 }]);
    expect(migrateLegacyOreIngotGoods()).toBe(false);
  });

  it("treats Coins as a minting service rather than a second metal-consuming commodity", () => {
    goodsModule.restoreDefaults();

    const coins = getGoods().find(good => good.name === "Coins");
    expect(coins?.tags).toEqual(expect.arrayContaining(["currency", "service"]));
    expect(coins?.recipes).toBeUndefined();
  });

  it("adds biome-extension goods while retaining tag-based forest production", () => {
    goodsModule.restoreDefaults();

    const byName = new Map(getGoods().map(good => [good.name, good]));
    for (const name of ["Peat", "Resin", "Medicinal herbs", "Shellfish", "Reeds", "Goats"]) {
      expect(byName.get(name)).toBeDefined();
      expect(byName.get(name)?.trade).toBeDefined();
    }

    for (const name of ["Wood", "Game", "Honey", "Hemp", "Furs"]) {
      expect(byName.get(name)?.biomeOutput).toBeUndefined();
      expect(byName.get(name)?.biomeOutputByTag).toBeDefined();
    }
  });

  it("exposes coastal and nearshore habitat predicates to Goods distributions", () => {
    worldContext.pack.cells.coastalHabitat = Uint8Array.from([getCoastalHabitatCode("tidalFlat"), 0, 0, 0]);
    worldContext.pack.cells.nearshoreHabitat = Uint8Array.from([0, 0, getNearshoreHabitatCode("coralReef"), 0]);

    const tidalFlatMethods = goodsModule.getMethods(0);
    const coralReefMethods = goodsModule.getMethods(2);

    expect(tidalFlatMethods.coastalHabitat("tidalFlat")).toBe(true);
    expect(tidalFlatMethods.nearshoreHabitat("coralReef")).toBe(false);
    expect(coralReefMethods.nearshoreHabitat("coralReef")).toBe(true);
  });

  it("replaces the generic Ships Good with sea-only ship-class Goods", () => {
    goodsModule.restoreDefaults();

    expect(getGoods().find(good => good.name === "Ships")).toBeUndefined();
    expect(
      ["Sloop", "Caravel", "Galleon"].map(name => {
        const good = getGoods().find(candidate => candidate.name === name);
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
    getGoods()[0].name = "Edited Wood";

    goodsModule.restoreDefaults();

    expect(getGoods()[0].name).toBe("Wood");
  });

  it("initialises the catalogue from defaults when none exists yet", () => {
    setGoods([]);
    goodsModule.generate();

    expect(getGoods().some(good => good.name === "Wood")).toBe(true);
  });

  it("does not corrupt the default template when a restored good is edited", () => {
    goodsModule.restoreDefaults();
    const wood = getGoods().find(good => good.name === "Wood")!;
    wood.name = "Edited Wood";

    goodsModule.restoreDefaults();

    expect(getGoods().find(good => good.name === "Edited Wood")).toBeUndefined();
    expect(getGoods().some(good => good.name === "Wood")).toBe(true);
  });

  it("clears a single good when it is no longer placeable", () => {
    getGoods()[0].chance = 0;
    goodsModule.regeneratePlacement(1);

    const goodIds = Array.from(getGoodCellColumn());
    expect(goodIds.some(id => id === 1)).toBe(false);
    expect(goodIds.filter(id => id === 2)).toHaveLength(2);
  });

  it("does not place Gunpowder or Artillery when the gunpowder era is disabled", () => {
    getGoods()[0].name = "Gunpowder";
    getGoods()[1].name = "Artillery";
    worldContext.options.gunpowderEraEnabled = false;

    goodsModule.generate({ randomSeed: 123 });

    expect(Array.from(getGoodCellColumn())).toEqual([0, 0, 0, 0]);
    expect(isGoodEnabled({ name: "Sulfur" })).toBe(false);
  });

  it("assigns a biome-compatible product to a newly promoted settlement without replacing a deposit", () => {
    setGoods([
      { ...getGoods()[0], i: 1, biomeOutput: { 3: 0.1 } },
      { ...getGoods()[1], i: 2, biomeOutput: { 4: 0.1 } }
    ]);
    worldContext.pack.cells.biomeCode[0] = 3;
    worldContext.pack.cells.biomeCode[1] = 4;
    setGoodCellColumn(new Uint16Array(4));
    goodsModule.sync();

    expect(goodsModule.assignBiomeProduct(0)).toBe(1);
    expect(goodsModule.assignBiomeProduct(1)).toBe(2);
    expect(Array.from(getGoodCellColumn())).toEqual([1, 2, 0, 0]);
    expect(goodsModule.assignBiomeProduct(0)).toBeNull();
  });
});
