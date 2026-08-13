import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getVolcanicOperations,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setMineralGeologicalProvinces
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { computeVolcanicSiteCandidates, getVolcanicRequiredWorkers, VolcanicOperations } from "./volcanicOperations";

/**
 * Cell 1 = lavaField (active core), cell 2 = volcanicBarrens (dormant core), cell 3 =
 * volcanicSoil (fertile flank), cell 4 = an ordinary non-volcanic biome. Only cells 1-3 belong
 * to the "volcanic" geological province, matching how mineralResources.ts's classifyProvince()
 * now derives that province from the real volcanic BiomeTag (docs/plan/volcanic-biome-goods.md
 * §3.1) — this test mocks the province slice directly, independent of that classification logic.
 */
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
      routes: {},
      biomeCode: Uint8Array.from([0, 1, 2, 3, 0])
    }
  } as unknown as PackedGraph;
  worldContext.biomesData = {
    keys: ["grassland", "lavaField", "volcanicBarrens", "volcanicSoil"],
    tags: [[], ["dry", "mountain", "volcanic"], ["dry", "mountain", "volcanic"], ["arable", "volcanic"]]
  } as unknown as typeof worldContext.biomesData;
  setGoods([
    {
      i: 1,
      name: "Volcanic Ash",
      tags: ["construction", "mineral"],
      value: 3,
      unit: "sack",
      icon: "good-clay",
      color: "#5a4d47"
    },
    {
      i: 2,
      name: "Sulfur",
      tags: ["mineral", "military"],
      value: 5,
      unit: "barrel",
      icon: "good-sulfur",
      color: "#e4d64b"
    },
    {
      i: 3,
      name: "Obsidian",
      tags: ["mineral", "luxury"],
      value: 12,
      unit: "shard",
      icon: "good-gemstones",
      color: "#1c1a1f"
    }
  ]);
  setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
  setGoodCellColumn(new Uint16Array(5));
  setMarketCellColumn(Uint16Array.from([1, 0, 0, 0, 0]));
  Goods.sync();
  Markets.sync();
}

describe("computeVolcanicSiteCandidates", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("returns nothing when no volcanic province exists", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([]);

    expect(computeVolcanicSiteCandidates()).toHaveLength(0);
  });

  it("scores a burg's neighbor ring per commodity: ash counts the whole province, sulfur counts the barren/lava core, obsidian counts lavaField only", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [1, 2, 3] }]);

    const [candidate] = computeVolcanicSiteCandidates();

    expect(candidate).toMatchObject({
      burgId: 1,
      ashNeighborCount: 3,
      sulfurNeighborCount: 2,
      obsidianNeighborCount: 1
    });
  });
});

describe("VolcanicOperationsModule", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("creates a Burg-anchored operation and supplies Ash/Sulfur/Obsidian to its market", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [1, 2, 3] }]);

    VolcanicOperations.generate();
    VolcanicOperations.produceMonth();

    const operations = getVolcanicOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0].volcanicWorkers).toBe(getVolcanicRequiredWorkers(operations[0]));

    const marketGoods = getMarkets()[0].goods;
    expect(marketGoods[1].stock).toBeGreaterThan(0); // Volcanic Ash
    expect(marketGoods[2].stock).toBeGreaterThan(0); // Sulfur
    expect(marketGoods[3].stock).toBeGreaterThan(0); // Obsidian
  });

  it("supplies no Sulfur/Obsidian when the site's ring is entirely the fertile volcanicSoil flank", () => {
    // Neighbor 3 (volcanicSoil) only — no lavaField/volcanicBarrens core in range.
    setUpWorld([3]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [3] }]);

    VolcanicOperations.generate();
    VolcanicOperations.produceMonth();

    const marketGoods = getMarkets()[0].goods;
    expect(marketGoods[1].stock).toBeGreaterThan(0); // Volcanic Ash still produced
    expect(marketGoods[2]).toBeUndefined(); // Sulfur never touched
    expect(marketGoods[3]).toBeUndefined(); // Obsidian never touched
  });

  it("produces no operations for a Burg with no volcanic neighbors", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([]);

    VolcanicOperations.generate();

    expect(getVolcanicOperations()).toHaveLength(0);
  });

  it("produces no operations once cleared", () => {
    setUpWorld([1, 2, 3, 4]);
    setMineralGeologicalProvinces([{ i: 1, kind: "volcanic", cells: [1, 2, 3] }]);
    VolcanicOperations.generate();

    VolcanicOperations.clear();

    expect(getVolcanicOperations()).toHaveLength(0);
  });
});
