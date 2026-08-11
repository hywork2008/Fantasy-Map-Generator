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
import { hasViableFoodProcessingMargin } from "./foodProcessingEconomics";
import {
  GoodsModule,
  isGoodEnabled,
  migrateFoodProcessingLotContracts,
  migrateFreshFoodTags,
  migrateGrapesGood,
  migrateLegacyOreIngotGoods,
  migrateLiveAnimalTags,
  migrateLiveCatsGood,
  migrateLiveDogsGood,
  migrateRaisinsGood,
  migrateStapleCropGoods,
  migrateWineRecipe
} from "./goods-generator";
import { getDefaultGoodsUnitFlavor } from "./goodsUnitFlavor";

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

  it("keeps every default manufacturing recipe above production-generator's own viability margin", () => {
    // Regression guard for the Preserved food / Jewelry bug class (docs/simulation/salt-logistics.md
    // value audit, 2026-08-12): a recipe whose ingredient cost merely ties its output's value (rather
    // than staying strictly below it) is not "break-even and fine" — production-generator.ts's
    // hasViableFoodProcessingMargin() rejects it outright (via buildImmediateManufactureCandidate()'s
    // `if (!hasViableFoodProcessingMargin(...)) return null;` guard), so that recipe alternative is
    // mathematically dead and can never actually be selected, no matter how much of its ingredients a
    // market holds. The previous version of this test used `toBeLessThanOrEqual`, which let an exact
    // tie (e.g. Shellfish(2) + Salt(3) = 5 == Preserved food's old value of 5) pass silently. Reusing
    // the real gate here — instead of a hand-rolled `<`/`<=` comparison — keeps this test honest if
    // that gate's rule (e.g. the FOOD_PROCESSING_GOODS 10% margin allowance) ever changes.
    //
    // salesTaxRate is fixed at 0, the most lenient case a live burg can ever see: a state's sales tax
    // only makes a marginal recipe *harder* to clear, never easier, so a recipe that fails here is
    // guaranteed dead in every real game state regardless of tax policy.
    goodsModule.restoreDefaults();
    const goodsById = new Map(getGoods().map(good => [good.i, good]));

    for (const good of getGoods()) {
      for (const recipe of good.recipes ?? []) {
        const ingredientCost = Object.entries(recipe).reduce((sum, [goodId, amount]) => {
          const ingredient = goodsById.get(Number(goodId));
          if (!ingredient) throw new Error(`Unknown ingredient ${goodId} in ${good.name}`);
          return sum + ingredient.value * amount;
        }, 0);
        const recipeLabel = Object.entries(recipe)
          .map(([goodId, amount]) => `${goodsById.get(Number(goodId))?.name ?? goodId}:${amount}`)
          .join(", ");

        expect(
          hasViableFoodProcessingMargin(good.name, good.value, ingredientCost, 0),
          `${good.name} recipe { ${recipeLabel} } costs ${ingredientCost} against a value of ${good.value} — no viable production margin`
        ).toBe(true);
      }
    }
  });

  it("keeps common clothing on ordinary fibres and reserves silk for luxury goods", () => {
    goodsModule.restoreDefaults();
    const byName = new Map(getGoods().map(good => [good.name, good]));
    const cloth = byName.get("Cloth");
    const garments = byName.get("Garments");
    const silk = byName.get("Silk");
    const linen = byName.get("Linen");
    const furs = byName.get("Furs");
    if (!cloth || !garments || !silk || !linen || !furs) throw new Error("Missing default textile goods");

    expect(cloth).toMatchObject({ value: 15, unit: "wardrobe bolt", recipes: expect.any(Array) });
    expect(cloth.recipes).toEqual([
      { [byName.get("Wool")!.i]: 6 },
      { [byName.get("Hemp")!.i]: 6 },
      { [byName.get("Cotton")!.i]: 6 }
    ]);
    expect(garments.recipes).toEqual([{ [cloth.i]: 1 }, { [linen.i]: 0.75 }, { [cloth.i]: 0.5, [furs.i]: 1 }]);
    expect(garments).toMatchObject({ value: 20, unit: "wardrobe lot", demandCoverage: { clothing: 1 } });
    expect(cloth.recipes?.some(recipe => Object.hasOwn(recipe, silk.i))).toBe(false);
  });

  it("defines display-only batch and tavern references without changing Goods", () => {
    expect(getDefaultGoodsUnitFlavor("Boots")).toEqual({ itemsPerUnit: 20, itemNoun: "pairs" });
    expect(getDefaultGoodsUnitFlavor("Bread")).toEqual({ itemsPerUnit: 20, itemNoun: "loaves" });
    expect(getDefaultGoodsUnitFlavor("Wine")).toEqual({ retailReference: { label: "cup", copperPrice: 1 } });
    expect(getDefaultGoodsUnitFlavor("Custom good")).toBeUndefined();
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

  it("defines Cats as a live, locally produced pest-control good", () => {
    goodsModule.restoreDefaults();

    const cats = getGoods().find(good => good.name === "Cats");
    expect(cats).toMatchObject({
      unit: "head",
      tags: expect.arrayContaining(["liveAnimal", "pestControl"]),
      biomeOutputByTag: { arable: 0.005, grassland: 0.003 }
    });
    expect(cats?.trade).toMatchObject({ distancePremium: -2, lossRisk: 5 });
    expect(cats?.cargo?.handlingClass).toBe("live");
  });

  it("tags every default head-counted animal as live while excluding carcass goods", () => {
    goodsModule.restoreDefaults();

    const headCountedGoods = getGoods().filter(good => good.unit === "head");
    expect(headCountedGoods).not.toHaveLength(0);
    expect(headCountedGoods.every(good => good.tags.includes("liveAnimal"))).toBe(true);
    expect(getGoods().find(good => good.name === "Game")?.tags).not.toContain("liveAnimal");
    expect(getGoods().find(good => good.name === "Whales")?.tags).not.toContain("liveAnimal");
  });

  it("adds Cats once to catalogues saved before the good existed", () => {
    setGoods([{ i: 7, name: "Legacy good", tags: [], value: 1, unit: "unit", icon: "legacy", color: "#000000" }]);

    expect(migrateLiveCatsGood()).toBe(true);
    expect(getGoods().find(good => good.name === "Cats")).toMatchObject({ i: 8, unit: "head" });
    expect(migrateLiveCatsGood()).toBe(false);
  });

  it("defines Dogs as a live, locally produced herding good (docs/plan/biome-goods-producer-ecosystem.md §5.4)", () => {
    goodsModule.restoreDefaults();

    const dogs = getGoods().find(good => good.name === "Dogs");
    expect(dogs).toMatchObject({
      unit: "head",
      tags: expect.arrayContaining(["liveAnimal", "herding"]),
      biomeOutputByTag: { grassland: 0.02, nomadic: 0.02, scrub: 0.015, mountain: 0.01 }
    });
    expect(dogs?.trade).toMatchObject({ distancePremium: -2, lossRisk: 5 });
    expect(dogs?.cargo?.handlingClass).toBe("live");
  });

  it("adds Dogs once to catalogues saved before the good existed", () => {
    setGoods([{ i: 7, name: "Legacy good", tags: [], value: 1, unit: "unit", icon: "legacy", color: "#000000" }]);

    expect(migrateLiveDogsGood()).toBe(true);
    expect(getGoods().find(good => good.name === "Dogs")).toMatchObject({ i: 8, unit: "head" });
    expect(migrateLiveDogsGood()).toBe(false);
  });

  it("adds the crop-level staple catalogue once to older saves without replacing Grain", () => {
    setGoods([
      { i: 7, name: "Grain", tags: ["food", "stapleFood"], value: 1, unit: "wain", icon: "grain", color: "#fff" }
    ]);

    expect(migrateStapleCropGoods()).toBe(true);
    expect(getGoods().find(good => good.name === "Wheat")?.crop?.kind).toBe("cereal");
    expect(getGoods().find(good => good.name === "Peas")?.crop?.kind).toBe("legume");
    expect(getGoods().find(good => good.name === "Turnips")?.crop?.kind).toBe("tuber");
    expect(getGoods().find(good => good.name === "Grain")?.i).toBe(7);
    expect(migrateStapleCropGoods()).toBe(false);
  });

  it("defines Grapes as a harvested good with no biomeOutputByTag (docs/plan/biome-goods-producer-ecosystem.md §5.3)", () => {
    goodsModule.restoreDefaults();

    const grapes = getGoods().find(good => good.name === "Grapes");
    expect(grapes).toMatchObject({ unit: "1,000 kg grape lot", tags: expect.arrayContaining(["food", "freshFood"]) });
    expect(grapes?.biomeOutputByTag).toBeUndefined();
    expect(grapes?.biomeOutput).toBeUndefined();
  });

  it("defines Wine as a { Grapes, Barrels } recipe good, no longer directly biome-produced", () => {
    goodsModule.restoreDefaults();

    const wine = getGoods().find(good => good.name === "Wine");
    const grapes = getGoods().find(good => good.name === "Grapes");
    const barrels = getGoods().find(good => good.name === "Barrels");
    expect(wine?.biomeOutputByTag).toBeUndefined();
    expect(wine?.distribution).toBeUndefined();
    expect(wine?.recipes).toEqual([{ [grapes!.i]: 0.26, [barrels!.i]: 0.08 }]);
  });

  it("adds Grapes once to catalogues saved before Phase 4", () => {
    setGoods([{ i: 7, name: "Legacy good", tags: [], value: 1, unit: "unit", icon: "legacy", color: "#000000" }]);

    expect(migrateGrapesGood()).toBe(true);
    expect(getGoods().find(good => good.name === "Grapes")).toMatchObject({ i: 8, unit: "1,000 kg grape lot" });
    expect(migrateGrapesGood()).toBe(false);
  });

  it("does not add Raisins until Grapes has been migrated into the save first", () => {
    setGoods([{ i: 7, name: "Legacy good", tags: [], value: 1, unit: "unit", icon: "legacy", color: "#000000" }]);
    expect(migrateRaisinsGood()).toBe(false);
    expect(getGoods().find(good => good.name === "Raisins")).toBeUndefined();
  });

  it("adds Raisins once Grapes exists, recipe keyed by this save's actual Grapes id", () => {
    setGoods([
      { i: 7, name: "Legacy good", tags: [], value: 1, unit: "unit", icon: "legacy", color: "#000000" },
      { i: 8, name: "Grapes", tags: ["food", "freshFood"], value: 2, unit: "basket", icon: "icon", color: "#fff" }
    ]);

    expect(migrateRaisinsGood()).toBe(true);
    const raisins = getGoods().find(good => good.name === "Raisins");
    expect(raisins).toMatchObject({ i: 9, unit: "250 kg raisins lot", recipes: [{ 8: 1 }] });
    expect(migrateRaisinsGood()).toBe(false);
  });

  it("does not upgrade Wine's recipe until Grapes and Barrels both exist in the save", () => {
    setGoods([
      {
        i: 7,
        name: "Wine",
        tags: ["food", "luxury"],
        value: 5,
        unit: "barrel",
        icon: "icon",
        color: "#fff",
        chance: 3,
        distribution: 'biomeTag("scrub")',
        biomeOutputByTag: { scrub: 0.12 }
      }
    ]);
    expect(migrateWineRecipe()).toBe(false);
    expect(getGoods()[0].recipes).toBeUndefined();
    expect(getGoods()[0].distribution).toBeDefined(); // untouched — migration didn't partially apply
  });

  it("upgrades a pre-Phase-4 Wine entry to the { Grapes, Barrels } recipe using this save's actual ids", () => {
    setGoods([
      {
        i: 7,
        name: "Wine",
        tags: ["food", "luxury"],
        value: 5,
        unit: "barrel",
        icon: "icon",
        color: "#fff",
        chance: 3,
        distribution: 'biomeTag("scrub")',
        biomeOutputByTag: { scrub: 0.12 }
      },
      { i: 8, name: "Grapes", tags: ["food", "freshFood"], value: 2, unit: "basket", icon: "icon", color: "#fff" },
      { i: 9, name: "Barrels", tags: ["naval", "storage"], value: 2, unit: "barrel", icon: "icon", color: "#fff" }
    ]);

    expect(migrateWineRecipe()).toBe(true);
    const wine = getGoods().find(good => good.name === "Wine");
    expect(wine).toMatchObject({ recipes: [{ 8: 0.26, 9: 0.08 }], chance: 0 });
    expect(wine?.distribution).toBeUndefined();
    expect(wine?.biomeOutputByTag).toBeUndefined();
    expect(migrateWineRecipe()).toBe(false); // already has recipes now
  });

  it("normalizes legacy food-processing lots without changing their Good ids", () => {
    goodsModule.restoreDefaults();
    const milk = getGoods().find(good => good.name === "Milk")!;
    const cheese = getGoods().find(good => good.name === "Cheese")!;
    const grapes = getGoods().find(good => good.name === "Grapes")!;
    const raisins = getGoods().find(good => good.name === "Raisins")!;
    const wine = getGoods().find(good => good.name === "Wine")!;
    const beer = getGoods().find(good => good.name === "Beer")!;
    const barrels = getGoods().find(good => good.name === "Barrels")!;
    const barley = getGoods().find(good => good.name === "Barley")!;
    const originalIds = [milk.i, cheese.i, grapes.i, raisins.i, wine.i, beer.i];
    milk.unit = "jug";
    milk.value = 0.1;
    cheese.unit = "wheel";
    cheese.value = 5;
    grapes.unit = "basket";
    raisins.unit = "bag";
    wine.unit = "barrel";
    wine.value = 5;
    beer.unit = "barrel";
    beer.tags = ["food"];
    beer.demandCoverage = { food: 1 };
    beer.recipes = [{ [barley.i]: 1, [barrels.i]: 1 }];

    expect(migrateFoodProcessingLotContracts()).toBe(true);
    expect([milk.i, cheese.i, grapes.i, raisins.i, wine.i, beer.i]).toEqual(originalIds);
    expect(milk).toMatchObject({ unit: "1,000 L dairy lot", value: 1 });
    expect(cheese).toMatchObject({ unit: "1,000 kg cheese lot", value: 14 });
    expect(grapes.unit).toBe("1,000 kg grape lot");
    expect(raisins.unit).toBe("250 kg raisins lot");
    expect(wine).toMatchObject({ unit: "200 L cask", value: 8 });
    expect(beer).toMatchObject({
      unit: "200 L ale cask",
      tags: expect.arrayContaining(["food", "beverage"]),
      demandCoverage: {},
      recipes: expect.arrayContaining([{ [barley.i]: 1, [barrels.i]: 0.08 }])
    });
    expect(migrateFoodProcessingLotContracts()).toBe(false);
  });

  it("backfills liveAnimal only for shipped living animals in old catalogues", () => {
    setGoods([
      { i: 1, name: "Cattle", tags: ["food"], value: 5, unit: "head", icon: "good-cattle", color: "#56b000" },
      { i: 2, name: "Game", tags: ["food"], value: 2, unit: "wain", icon: "good-game", color: "#c38a8a" },
      { i: 3, name: "Whales", tags: ["food"], value: 3, unit: "barrel", icon: "good-whales", color: "#7fcdff" }
    ]);

    expect(migrateLiveAnimalTags()).toBe(true);
    expect(getGoods()[0].tags).toEqual(["food", "liveAnimal"]);
    expect(getGoods()[1].tags).not.toContain("liveAnimal");
    expect(getGoods()[2].tags).not.toContain("liveAnimal");
    expect(migrateLiveAnimalTags()).toBe(false);
  });

  it("backfills the no-cold-chain tag for old raw-food catalogues without changing Whales", () => {
    setGoods([
      { i: 1, name: "Game", tags: ["food"], value: 2, unit: "wain", icon: "good-game", color: "#c38a8a" },
      { i: 2, name: "Fish", tags: ["food", "aquatic"], value: 1, unit: "wain", icon: "good-fish", color: "#7fcdff" },
      {
        i: 3,
        name: "Whales",
        tags: ["food", "aquatic", "fuel"],
        value: 3,
        unit: "barrel",
        icon: "good-whales",
        color: "#7fcdff"
      }
    ]);

    expect(migrateFreshFoodTags()).toBe(true);
    expect(getGoods()[0].tags).toContain("freshFood");
    expect(getGoods()[1].tags).toContain("freshFood");
    expect(getGoods()[2].tags).not.toContain("freshFood");
    expect(migrateFreshFoodTags()).toBe(false);
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

  it("recognises only unedited default catalogue entries", () => {
    goodsModule.restoreDefaults();
    const boots = getGoods().find(good => good.name === "Boots");
    if (!boots) throw new Error("Boots must be present in the default catalogue");

    expect(goodsModule.isUnmodifiedDefault(boots)).toBe(true);
    boots.value += 1;
    expect(goodsModule.isUnmodifiedDefault(boots)).toBe(false);
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
