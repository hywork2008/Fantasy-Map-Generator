import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { emptyFoodLedger } from "./foodProduction";
import type { Market } from "./marketTypes";
import { moveProvisionsToNewMarkets } from "./newMarketProvisions";
import { getStapleCropInventory, refreshLegacyFoodLedgerTotals } from "./stapleCropInventory";

describe("moveProvisionsToNewMarkets", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [{ i: 0 } as unknown as Burg],
      cells: { i: [0, 1, 2, 3], h: [20, 20, 20, 20], pop: [10, 10, 10, 10], burg: [0, 0, 0, 0] }
    } as unknown as PackedGraph;
    setGoods([{ i: 1, name: "Salt", tags: [], value: 1, unit: "bag", icon: "", color: "" }]);
  });

  afterEach(() => clearEconomyContext());

  it("gives a new market the moved people's share of the old market's reserve, and leaves the surplus", () => {
    const old: Market = { i: 1, centerBurgId: 0, color: "", goods: { 1: { stock: 400, price: 1 } } } as Market;
    const founded: Market = { i: 2, centerBurgId: 0, color: "", goods: {} } as Market;
    old.foodLedger = emptyFoodLedger();
    const wheat = getStapleCropInventory(old.foodLedger, 5);
    wheat.age0 = 800;
    wheat.age0UnitCost = 0.9;
    refreshLegacyFoodLedgerTotals(old.foodLedger);
    old.foodLedger.exportReserve = 400;
    setMarkets([old, founded]);

    // The new market takes cells 2 and 3: half the old market's people.
    moveProvisionsToNewMarkets(Uint16Array.from([1, 1, 1, 1]), Uint16Array.from([1, 1, 2, 2]));

    const moved = getStapleCropInventory(founded.foodLedger!, 5);
    expect(moved.age0).toBeCloseTo(200, 6);
    expect(moved.age0UnitCost).toBeCloseTo(0.9, 6);
    expect(old.foodLedger.foodStockAge0).toBeCloseTo(600, 6);
    expect(founded.goods[1].stock).toBeCloseTo(200, 6);
    expect(old.goods[1].stock).toBeCloseTo(200, 6);

    // Already stocked: a later border move does not move it again.
    moveProvisionsToNewMarkets(Uint16Array.from([1, 1, 2, 2]), Uint16Array.from([1, 2, 2, 2]));
    expect(getStapleCropInventory(founded.foodLedger!, 5).age0).toBeCloseTo(200, 6);
  });
});
