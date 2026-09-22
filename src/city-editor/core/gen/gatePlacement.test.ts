import { describe, expect, it } from "vitest";
import { shiftRiverCrossingGates } from "./interior";
import type { BorderLoop, Cell, Gate, Point } from "./types";

const cells: Cell[] = [];
for (let y = 0; y < 2; y++)
  for (let x = 0; x < 3; x++) {
    const id = y * 3 + x;
    const polygon: Point[] = [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1]
    ].map(([a, b]) => [a * 100, b * 100]);
    cells.push({
      id,
      polygon,
      site: [x * 100 + 50, y * 100 + 50],
      centroid: [x * 100 + 50, y * 100 + 50],
      onBorder: true,
      neighbors: [x > 0 ? id - 1 : -1, x < 2 ? id + 1 : -1, y > 0 ? id - 3 : id + 3].filter(n => n >= 0)
    });
  }
const border: BorderLoop = {
  points: [
    [0, 0],
    [100, 0],
    [200, 0],
    [300, 0],
    [300, 100],
    [300, 200],
    [200, 200],
    [100, 200],
    [0, 200],
    [0, 100]
  ],
  segments: Array(10).fill("land"),
  urbanCellIds: cells.map(c => c.id)
};
const river: Point[] = [
  [100, 0],
  [100, 100],
  [100, 200]
];
const gate = (point: Point): Gate => ({ point, borderIndex: 0, water: false });

describe("river gate placement", () => {
  it("balances gates per cell across the two banks", () => {
    const shifted = shiftRiverCrossingGates(
      [gate([0, 100]), gate([100, 0]), gate([100, 200])],
      cells,
      new Set(cells.map(c => c.id)),
      [border],
      [river]
    );
    expect(shifted.map(g => g.point)).toEqual([
      [0, 100],
      [200, 0],
      [200, 200]
    ]);
  });
  it("skips occupied neighbouring vertices without losing a gate", () => {
    const shifted = shiftRiverCrossingGates(
      [gate([0, 100]), gate([200, 0]), gate([100, 0])],
      cells,
      new Set(cells.map(c => c.id)),
      [border],
      [river]
    );
    expect(shifted).toHaveLength(3);
    expect(new Set(shifted.map(g => g.point.join())).size).toBe(3);
    expect(shifted[2].point).toEqual([300, 0]);
  });
});
