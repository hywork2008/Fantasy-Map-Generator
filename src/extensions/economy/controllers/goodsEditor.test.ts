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
      sortBy: "name",
      sortOrder: "asc"
    });
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("ignores unavailable goods while calculating stock totals", () => {
    expect(() => goodsEditorAddLines()).not.toThrow();

    expect(getGoodsEditorTableState()).toMatchObject({
      goods: [expect.objectContaining({ i: 1, name: "Wood", stock: 0 })],
      totalStock: 0
    });
  });

  it("exposes placement and per-capita production diagnostics for goods", () => {
    goodsEditorAddLines();

    expect(getGoodsEditorTableState().goods[0]).toMatchObject({
      resourceCells: 0,
      productionPerThousand: 0
    });
  });

  it("keeps the map selection empty after the default Wood selection is disabled", () => {
    expect(getDisplayedGoodIds()).toEqual(new Set([1]));

    setGoodDisplayed(1, false);

    expect(getDisplayedGoodIds()).toEqual(new Set());
  });
});
