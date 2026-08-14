import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { getDisplayedGoodIds, resetDisplayedGoodSelection, setGoodDisplayed } from "./goodsDisplaySelection";

// Mirrors the defaults declared in goodsDisplaySelection.ts. Kept as literal name lists (rather
// than importing the private consts) so the test fails loudly if either default set is edited.
const AGE_OF_EXPLORATION_NAMES = [
  "Artillery",
  "Bullets",
  "Caravel",
  "Charcoal",
  "Galleon",
  "Gunpowder",
  "Iron Ingot",
  "Iron Ore",
  "Lead Ingot",
  "Muskets",
  "Obsidian",
  "Pumice",
  "Roman Concrete",
  "Slaves",
  "Sloop",
  "Sulfur"
];
const MEDIEVAL_NAMES = ["Cheese", "Grapes", "Milk", "Pomace Wine", "Raisins", "Wine"];

function makeGoods(names: readonly string[]) {
  return names.map((name, index) => ({
    i: index + 1,
    name,
    tags: [],
    value: 1,
    unit: "unit",
    icon: "good-unknown",
    color: "#000000",
    distribution: "true"
  }));
}

// One good from each candidate default set, plus a control good that belongs to neither.
const GOODS = [...makeGoods(AGE_OF_EXPLORATION_NAMES), ...makeGoods(MEDIEVAL_NAMES), { i: 0, name: "Wood" }].map(
  (good, index) => ({ ...good, i: index + 1 })
);
const AGE_OF_EXPLORATION_IDS = new Set(
  GOODS.filter(good => AGE_OF_EXPLORATION_NAMES.includes(good.name)).map(good => good.i)
);
const MEDIEVAL_IDS = new Set(GOODS.filter(good => MEDIEVAL_NAMES.includes(good.name)).map(good => good.i));

function setHistoricalPeriod(
  historicalPeriod?: "earlyMedieval" | "highMedieval" | "lateMedieval" | "ageOfExploration"
) {
  worldContext.options = { gunpowderEraEnabled: true, historicalPeriod } as typeof worldContext.options;
}

describe("goodsDisplaySelection", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { goods: GOODS } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("defaults to the Age of Exploration goods when historicalPeriod is ageOfExploration", () => {
    setHistoricalPeriod("ageOfExploration");
    expect(getDisplayedGoodIds()).toEqual(AGE_OF_EXPLORATION_IDS);
  });

  it("defaults to the Age of Exploration goods when historicalPeriod is unset", () => {
    setHistoricalPeriod(undefined);
    expect(getDisplayedGoodIds()).toEqual(AGE_OF_EXPLORATION_IDS);
  });

  it.each(["earlyMedieval", "highMedieval", "lateMedieval"] as const)(
    "defaults to the Medieval agricultural goods when historicalPeriod is %s",
    historicalPeriod => {
      setHistoricalPeriod(historicalPeriod);
      expect(getDisplayedGoodIds()).toEqual(MEDIEVAL_IDS);
    }
  );

  it("still excludes gunpowder-era goods disabled by gunpowderEraEnabled from the Age of Exploration default", () => {
    worldContext.options = {
      gunpowderEraEnabled: false,
      historicalPeriod: "ageOfExploration"
    } as typeof worldContext.options;

    const displayed = getDisplayedGoodIds();
    // sulfur/gunpowder/artillery/bullets/muskets are hidden by isGoodEnabled regardless of period.
    const disabledIds = GOODS.filter(good =>
      ["Sulfur", "Gunpowder", "Artillery", "Bullets", "Muskets"].includes(good.name)
    ).map(good => good.i);
    for (const id of disabledIds) expect(displayed.has(id)).toBe(false);
    // The rest of the Age of Exploration set is still selected by default.
    expect(displayed.size).toBe(AGE_OF_EXPLORATION_IDS.size - disabledIds.length);
  });

  it("keeps an explicit selection instead of falling back to the period default", () => {
    setHistoricalPeriod("ageOfExploration");
    const [firstMedievalGood] = GOODS.filter(good => MEDIEVAL_NAMES.includes(good.name));

    setGoodDisplayed(firstMedievalGood.i, true);

    expect(getDisplayedGoodIds()).toEqual(new Set([...AGE_OF_EXPLORATION_IDS, firstMedievalGood.i]));
  });

  it("drops a prior map's explicit selection on resetDisplayedGoodSelection and adopts the new map's period default", () => {
    // Simulate the previous map: the user hand-picked goods under Age of Exploration.
    setHistoricalPeriod("ageOfExploration");
    const [firstMedievalGood] = GOODS.filter(good => MEDIEVAL_NAMES.includes(good.name));
    setGoodDisplayed(firstMedievalGood.i, true);
    expect(getDisplayedGoodIds()).toEqual(new Set([...AGE_OF_EXPLORATION_IDS, firstMedievalGood.i]));

    // New map generation resets the selection before the new map's historicalPeriod is applied.
    resetDisplayedGoodSelection();
    setHistoricalPeriod("earlyMedieval");

    expect(getDisplayedGoodIds()).toEqual(MEDIEVAL_IDS);
  });
});
