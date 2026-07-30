import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getQuarryOperations,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { computeQuarryCandidates, getQuarryRequiredWorkers, QuarryOperations } from "./quarryOperations";

function setUpWorld(neighborHeights: number[]): void {
  worldContext.pack = {
    // pack.burgs is index-aligned to burg.i (index 0 is an unused filler), matching the
    // convention QuarryOperationsModule.generate() relies on (pack.burgs[candidate.burgId]).
    burgs: [
      { i: 0, removed: 1 },
      { i: 1, cell: 0, x: 0, y: 0, market: 1, removed: 0 }
    ],
    cells: {
      i: [0, 1, 2, 3, 4],
      p: [[0, 0]],
      h: Uint8Array.from([10, ...neighborHeights]),
      c: [[1, 2, 3, 4]],
      r: Uint16Array.from([0, 0, 0, 0, 0]),
      routes: {}
    }
  } as unknown as PackedGraph;
  setGoods([
    { i: 1, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#979EA2" },
    {
      i: 2,
      name: "Marble",
      tags: ["construction", "luxury"],
      value: 8,
      unit: "pallet",
      icon: "good-marble",
      color: "#d6d0bf"
    }
  ]);
  setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
  setGoodCellColumn(new Uint16Array(5));
  setMarketCellColumn(Uint16Array.from([1, 0, 0, 0, 0]));
  Goods.sync();
  Markets.sync();
}

describe("computeQuarryCandidates", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("scores a burg by the share of tall neighbor cells", () => {
    setUpWorld([45, 45, 45, 10]); // 3/4 neighbors >= 40 (stone), 0/4 >= 60 (marble)

    const [candidate] = computeQuarryCandidates();

    expect(candidate).toMatchObject({ burgId: 1, stoneRatio: 0.75, marbleRatio: 0 });
  });

  it("excludes burgs below the minimum stone ratio", () => {
    setUpWorld([10, 10, 10, 10]);

    expect(computeQuarryCandidates()).toHaveLength(0);
  });

  it("scores marble alongside stone for very tall neighbor cells", () => {
    setUpWorld([65, 65, 45, 10]); // 3/4 >= 40, 2/4 >= 60

    const [candidate] = computeQuarryCandidates();

    expect(candidate).toMatchObject({ stoneRatio: 0.75, marbleRatio: 0.5 });
  });
});

describe("QuarryOperationsModule", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("creates a Burg-anchored operation and supplies Stone to its market", () => {
    setUpWorld([45, 45, 45, 10]);

    QuarryOperations.generate();
    QuarryOperations.produceMonth();

    const operations = getQuarryOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ burgId: 1, marketId: 1, stoneRatio: 0.75, marbleRatio: 0 });
    expect(operations[0].quarryWorkers).toBe(getQuarryRequiredWorkers(operations[0]));
    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
  });

  it("does not supply Marble when the site has no marble-grade neighbors", () => {
    setUpWorld([45, 45, 45, 10]);

    QuarryOperations.generate();
    QuarryOperations.produceMonth();

    expect(getMarkets()[0].goods[2]?.stock ?? 0).toBe(0);
  });

  it("supplies both Stone and Marble for a high-elevation site", () => {
    setUpWorld([65, 65, 45, 10]);

    QuarryOperations.generate();
    QuarryOperations.produceMonth();

    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[2].stock).toBeGreaterThan(0);
  });

  it("preserves an operation's current headcount across regeneration", () => {
    setUpWorld([45, 45, 45, 10]);
    QuarryOperations.generate();

    const [operation] = getQuarryOperations();
    operation.quarryWorkers = 1;

    QuarryOperations.generate();

    expect(getQuarryOperations()[0].quarryWorkers).toBe(1);
  });

  it("produces no operations once cleared", () => {
    setUpWorld([45, 45, 45, 10]);
    QuarryOperations.generate();

    QuarryOperations.clear();

    expect(getQuarryOperations()).toHaveLength(0);
  });
});
