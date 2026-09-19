import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { validate } from "../mesh";
import { polygonArea } from "./geom";
import { buildHexGrid, DEFAULT_HEX_SIZE_METERS } from "./hexGrid";
import type { Point } from "./types";

const EXTENT = 1200;
const SIZE = DEFAULT_HEX_SIZE_METERS;

const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

const edgeLengths = (poly: Point[]): number[] => poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]));

const horizontalEdgeCount = (poly: Point[]): number => {
  let n = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.abs(a[1] - b[1]) < 1e-6) n++;
  }
  return n;
};

describe("buildHexGrid", () => {
  it("tiles the window with flat-top hexes: interior cells have 6 equal sides and 2 horizontal edges", () => {
    const cells = buildHexGrid(EXTENT, SIZE);
    const interior = cells.filter(c => !c.onBorder);
    expect(interior.length).toBeGreaterThan(20);
    for (const cell of interior) {
      expect(cell.polygon).toHaveLength(6);
      expect(cell.neighbors).toHaveLength(6);
      expect(horizontalEdgeCount(cell.polygon)).toBe(2);
      for (const len of edgeLengths(cell.polygon)) expect(len).toBeCloseTo(SIZE, 5);
    }
  });

  it("clips rim cells to the square window and covers nearly the whole frame", () => {
    const cells = buildHexGrid(EXTENT, SIZE);
    const half = EXTENT / 2;
    expect(cells.some(c => c.onBorder)).toBe(true);
    const covered = cells.reduce((sum, c) => sum + Math.abs(polygonArea(c.polygon)), 0);
    expect(covered / (EXTENT * EXTENT)).toBeGreaterThan(0.97);
    for (const cell of cells) {
      for (const [x, y] of cell.polygon) {
        expect(x).toBeGreaterThanOrEqual(-half - 1e-6);
        expect(x).toBeLessThanOrEqual(half + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-half - 1e-6);
        expect(y).toBeLessThanOrEqual(half + 1e-6);
      }
    }
  });

  it("a larger hex size produces fewer cells", () => {
    const dense = buildHexGrid(EXTENT, 30);
    const coarse = buildHexGrid(EXTENT, 80);
    expect(dense.length).toBeGreaterThan(coarse.length * 2);
  });

  it("is deterministic (no rng)", () => {
    expect(buildHexGrid(EXTENT, SIZE)).toEqual(buildHexGrid(EXTENT, SIZE));
  });
});

describe("createGridDocument — hex", () => {
  it("builds a valid Small hexagonal mesh", () => {
    const document = createGridDocument({ size: "small", grid: "hex", hexSizeMeters: SIZE });
    expect(validate(document)).toEqual([]);
    expect(Object.keys(document.mesh.faces).length).toBeGreaterThan(100);
    expect(document.frame.blockSizeMeters).toBe(SIZE);
  });
});
