import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getVolcanicAshOperations,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setMineralGeologicalProvinces
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import {
  computeVolcanicAshCandidates,
  getVolcanicAshRequiredWorkers,
  VolcanicAshOperations
} from "./volcanicAshOperations";

function setUpWorld(neighbors: number[]): void {
  worldContext.pack = {
    burgs: [
      { i: 0, removed: 1 },
      { i: 1, cell: 0, x: 0, y: 0, market: 1, removed: 0 }
    ],
    cells: {
      i: [0, 1, 2, 3, 4],
      p: [[0, 0]],
      h: Uint8Array.from([10, 80, 80, 80, 10]),
      c: [neighbors],
      r: Uint16Array.from([0, 0, 0, 0, 0]),
      routes: {}
    }
  } as unknown as PackedGraph;
  setGoods([
    {
      i: 1,
      name: "Volcanic Ash",
      tags: ["construction", "mineral"],
      value: 3,
      unit: "sack",
      icon: "good-clay",
      color: "#5a4d47"
    }
  ]);
  setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
  setGoodCellColumn(new Uint16Array(5));
  setMarketCellColumn(Uint16Array.from([1, 0, 0, 0, 0]));
  Goods.sync();
  Markets.sync();
}

describe("computeVolcanicAshCandidates", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("returns nothing when no volcanic province exists", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([]);

    expect(computeVolcanicAshCandidates()).toHaveLength(0);
  });

  it("scores a burg by how many neighbor cells belong to the volcanic province", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [1, 2] }]);

    const [candidate] = computeVolcanicAshCandidates();

    expect(candidate).toMatchObject({ burgId: 1, volcanicNeighborCount: 2 });
  });
});

describe("VolcanicAshOperationsModule", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("creates a Burg-anchored operation and supplies Volcanic Ash to its market", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [1, 2, 3] }]);

    VolcanicAshOperations.generate();
    VolcanicAshOperations.produceMonth();

    const operations = getVolcanicAshOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0].ashWorkers).toBe(getVolcanicAshRequiredWorkers(operations[0]));
    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
  });

  it("produces no operations for a Burg with no volcanic neighbors", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([]);

    VolcanicAshOperations.generate();

    expect(getVolcanicAshOperations()).toHaveLength(0);
  });

  it("produces no operations once cleared", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [1, 2, 3] }]);
    VolcanicAshOperations.generate();

    VolcanicAshOperations.clear();

    expect(getVolcanicAshOperations()).toHaveLength(0);
  });
});
