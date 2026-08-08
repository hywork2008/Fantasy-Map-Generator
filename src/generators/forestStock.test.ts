import { describe, expect, it } from "vitest";
import type { PackedGraphCells } from "../types/PackedGraph";
import {
  getForestClearingRate,
  getForestStockRatio,
  harvestForestStock,
  initializeForestStock,
  regrowForestStock
} from "./forestStock";

function createCells(): PackedGraphCells {
  return {
    i: new Uint16Array([0, 1]),
    forestCover: new Float32Array([1, 0.7]),
    forestStock: new Float32Array(2)
  } as unknown as PackedGraphCells;
}

describe("forest stock", () => {
  it("derives clearance from one standing-timber stock", () => {
    const cells = createCells();
    initializeForestStock(cells);

    expect(harvestForestStock(cells, 0, 0.5)).toBeCloseTo(0.5, 5);
    expect(getForestStockRatio(cells, 0)).toBeCloseTo(0.5, 5);
    expect(getForestClearingRate(cells, 0)).toBeCloseTo(0.5, 5);
  });

  it("regrows only up to forest capacity", () => {
    const cells = createCells();
    initializeForestStock(cells);
    harvestForestStock(cells, 1, 0.7);

    expect(regrowForestStock(cells, 1, 100)).toBe(true);
    expect(cells.forestStock![1]).toBeCloseTo(0.7, 5);
  });
});
