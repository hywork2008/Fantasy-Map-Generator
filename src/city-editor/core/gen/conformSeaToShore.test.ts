import { expect, it } from "vitest";
import { conformSeaToShore } from "./classifySea";
import type { Cell } from "./types";

// A 3x3 grid of 200 m cells; FMG's shore runs north–south at x = 100, sea east.
const cells: Cell[] = [];
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 3; col++) {
    const x = -200 + col * 200,
      y = -200 + row * 200,
      id = row * 3 + col;
    cells.push({
      id,
      centroid: [x, y],
      polygon: [
        [x - 100, y - 100],
        [x + 100, y - 100],
        [x + 100, y + 100],
        [x - 100, y + 100]
      ],
      neighbors: [id - 3, id + 3, col ? id - 1 : -1, col < 2 ? id + 1 : -1].filter(n => n >= 0 && n < 9),
      onBorder: row !== 1 || col !== 1
    } as unknown as Cell);
  }
const shore: [number, number][] = [
  [100, -300],
  [100, 300]
];

it("holds the walked coast to FMG's shore beyond the tolerance band", () => {
  // The walk took the eastern column but also wandered into the middle one
  // (an invented 200 m bay) and left an eastern cell dry (an invented cape).
  const walked = new Set([2, 4, 8]);
  const sea = conformSeaToShore(cells, walked, shore, 300, 40, () => false);
  expect([...sea].sort()).toEqual([2, 5, 8]);
});

it("keeps cells within the band and protected cells as the walk left them", () => {
  const near: [number, number][] = [
    [20, -300],
    [20, 300]
  ];
  const sea = conformSeaToShore(cells, new Set([2, 5, 8]), near, 300, 40, cell => cell.id === 5);
  expect(sea.has(1)).toBe(false); // centroid 20 m off the line: the walk's choice stands
  expect(sea.has(5)).toBe(true);
});
