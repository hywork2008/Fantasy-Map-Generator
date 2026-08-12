import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { getDisplayedGoodIds, setGoodDisplayed } from "../store/goodsDisplaySelection";
import { getGoodsEditorTableState, setGoodsEditorTableState } from "../store/goodsEditorTableState";
import { goodsEditorAddLines } from "./goods-editor";

describe("goodsEditorAddLines", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { gunpowderEraEnabled: false } as typeof worldContext.options;
    worldContext.pack = {
      cells: { i: [] },
      burgs: [],
      deals: [],
      goods: [
        {
          i: 1,
          name: "Wood",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-wood",
          color: "#654321",
          distribution: "true"
        },
        {
          i: 2,
          name: "Gunpowder",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-gunpowder",
          color: "#222222",
          distribution: "true"
        },
        {
          i: 3,
          name: "Figs",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-unknown",
          color: "#74503f",
          distribution: "true"
        },
        {
          i: 4,
          name: "Lemons",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-unknown",
          color: "#d9c94b",
          distribution: "true"
        },
        {
          i: 5,
          name: "Grapes",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-grapes",
          color: "#6f2da8",
          distribution: "true"
        },
        {
          i: 6,
          name: "Pears",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-unknown",
          color: "#b8b947",
          distribution: "true"
        },
        {
          i: 7,
          name: "Plums",
          tags: [],
          value: 1,
          unit: "unit",
          icon: "good-unknown",
          color: "#6b407b",
          distribution: "true"
        }
      ],
      markets: []
    } as unknown as PackedGraph;
    Goods.sync();
    setGoodsEditorTableState({
      goods: [],
      totalProduced: 0,
      totalStock: 0,
      displayedCount: 0,
      isPercentageMode: false,
      hasTagFilter: false,
      isAssignMode: false,
      selectedAssignGoodId: null,
      sortBy: "isDisplayed",
      sortOrder: "desc"
    });
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("ignores unavailable goods while calculating stock totals", () => {
    expect(() => goodsEditorAddLines()).not.toThrow();

    expect(getGoodsEditorTableState()).toMatchObject({
      totalStock: 0
    });
    expect(getGoodsEditorTableState().goods).toContainEqual(expect.objectContaining({ i: 1, name: "Wood", stock: 0 }));
  });

  it("exposes placement and per-capita production diagnostics for goods", () => {
    goodsEditorAddLines();

    expect(getGoodsEditorTableState().goods.find(good => good.name === "Wood")).toMatchObject({
      resourceCells: 0,
      productionPerThousand: 0
    });
  });

  it("selects the default food-production goods and sorts them above unchecked goods", () => {
    goodsEditorAddLines();

    expect(getDisplayedGoodIds()).toEqual(new Set([3, 4, 5, 6, 7]));
    expect(getGoodsEditorTableState().goods.map(good => good.isDisplayed)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false
    ]);

    setGoodDisplayed(1, false);

    expect(getDisplayedGoodIds()).toEqual(new Set([3, 4, 5, 6, 7]));
  });
});
