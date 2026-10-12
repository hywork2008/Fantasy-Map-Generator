import Alea from "alea";
import { describe, expect, it } from "vitest";
import { buildIsletHeights } from "./isletHeightmap";

/** A 9×5 square-lattice stand-in for the islet grid (4-neighbors, border flagged). */
function lattice(cols: number, rows: number) {
  const points: [number, number][] = [];
  const c: number[][] = [];
  const b: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      points.push([x * 10 + 5, y * 10 + 5]);
      const n: number[] = [];
      if (x > 0) n.push(y * cols + x - 1);
      if (x < cols - 1) n.push(y * cols + x + 1);
      if (y > 0) n.push((y - 1) * cols + x);
      if (y < rows - 1) n.push((y + 1) * cols + x);
      c.push(n);
      b.push(x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 1 : 0);
    }
  return { points, cells: { c, b } };
}

describe("buildIsletHeights", () => {
  const grid = lattice(9, 5);
  const land = (heights: Uint8Array) => [...heights.keys()].filter(i => heights[i] >= 20);

  it("raises exactly the requested number of connected land cells at the center", () => {
    for (const count of [1, 3, 6]) {
      const heights = buildIsletHeights(grid, 90, 50, count, Alea("seed"));
      const cells = land(heights);
      expect(cells).toHaveLength(count);
      expect(cells).toContain(22); // center of the 9×5 lattice
      for (const cell of cells) expect(grid.cells.b[cell]).toBe(0);
    }
  });

  it("draws 1–4 land cells when the count is random", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const count = land(buildIsletHeights(grid, 90, 50, 0, Alea(seed))).length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  it("deepens the sea away from the island", () => {
    const heights = buildIsletHeights(grid, 90, 50, 1, Alea("seed"));
    expect(heights[21]).toBe(18); // coastal shelf next to the center
    expect(heights[0]).toBeLessThan(heights[21]);
  });
});
