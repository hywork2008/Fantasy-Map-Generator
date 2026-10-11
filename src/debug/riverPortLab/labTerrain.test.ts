import { describe, expect, it } from "vitest";
import { shapeLabTerrain } from "./labTerrain";

/** n×n square grid with 4-neighbours; border flag on the outer ring. */
function squareGrid(n: number) {
  const points: [number, number][] = [];
  const c: number[][] = [];
  const b: number[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      points.push([x, y]);
      const around = [];
      if (x > 0) around.push(y * n + x - 1);
      if (x < n - 1) around.push(y * n + x + 1);
      if (y > 0) around.push((y - 1) * n + x);
      if (y < n - 1) around.push((y + 1) * n + x);
      c.push(around);
      b.push(x === 0 || y === 0 || x === n - 1 || y === n - 1 ? 1 : 0);
    }
  }
  return { points, cells: { c, b } };
}

const _sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("shapeLabTerrain", () => {
  it("turns the two outer rings into sea", () => {
    const grid = squareGrid(8);
    const heights = new Uint8Array(64).fill(40);
    const report = shapeLabTerrain(grid, heights, { seaBorder: true, landShare: 0, lakes: 0 });
    expect(report.borderCells).toBe(48);
    grid.points.forEach(([x, y], i) => {
      expect(heights[i] < 20).toBe(Math.min(x, y, 7 - x, 7 - y) <= 1);
    });
  });

  it("tops land up to the target share with a low plain, leaving existing land alone", () => {
    const grid = squareGrid(10);
    // Interior heights 0..31 spread: about 37% land before the top-up.
    const heights = Uint8Array.from({ length: 100 }, (_, i) => (i * 37) % 32);
    const before = Uint8Array.from(heights);
    const report = shapeLabTerrain(grid, heights, { seaBorder: true, landShare: 0.6, lakes: 0 });
    const interior = [...heights.keys()].filter(i => {
      const [x, y] = grid.points[i];
      return Math.min(x, y, 9 - x, 9 - y) >= 2;
    });
    const land = interior.filter(i => heights[i] >= 20);
    expect(land.length / interior.length).toBeGreaterThanOrEqual(0.6);
    expect(report.raisedCells).toBeGreaterThan(0);
    for (const i of interior) {
      if (before[i] >= 20) expect(heights[i]).toBe(before[i]);
      else if (heights[i] >= 20) expect(heights[i]).toBeLessThanOrEqual(25);
    }
    // Order is kept among raised cells.
    const raised = interior.filter(i => before[i] < 20 && heights[i] >= 20);
    for (const a of raised)
      for (const b of raised) if (before[a] < before[b]) expect(heights[a]).toBeLessThanOrEqual(heights[b]);
  });

  it("leaves a map with enough land unchanged", () => {
    const grid = squareGrid(8);
    const heights = new Uint8Array(64).fill(40);
    const report = shapeLabTerrain(grid, heights, { seaBorder: false, landShare: 0.6, lakes: 0 });
    expect(report.raisedCells).toBe(0);
    expect([...heights].every(h => h === 40)).toBe(true);
  });

  it("carves spaced inland lakes away from the sea", () => {
    const grid = squareGrid(14);
    const heights = new Uint8Array(196).fill(50);
    const report = shapeLabTerrain(grid, heights, { seaBorder: true, landShare: 0, lakes: 2 });
    expect(report.lakeCells).toHaveLength(2);
    const [a, b] = report.lakeCells;
    for (const lake of report.lakeCells) expect(heights[lake]).toBe(15);
    // Each lake has a neighbour no higher than lake + 19 (an open spillway toward the sea).
    for (const lake of report.lakeCells) {
      expect(Math.min(...grid.cells.c[lake].map(n => heights[n]))).toBeLessThanOrEqual(34);
    }
    const [ax, ay] = grid.points[a];
    const [bx, by] = grid.points[b];
    expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBeGreaterThan(2);
    for (const lake of report.lakeCells) {
      const [x, y] = grid.points[lake];
      expect(Math.min(x, y, 13 - x, 13 - y)).toBeGreaterThanOrEqual(3);
    }
  });
});
