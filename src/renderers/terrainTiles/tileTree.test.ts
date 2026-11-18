import { describe, expect, it } from "vitest";
import {
  isAncestor,
  projectionFactor,
  resolveDrawable,
  selectTiles,
  type TileKey,
  tileBounds,
  tilePyramid
} from "./tileTree";

const pyramid = tilePyramid({ width: 1000, height: 800, rootSizePx: 256, maxZoom: 6, samples: 65 });
const projection = projectionFactor(1000, 45);
const area = (b: { minX: number; minY: number; maxX: number; maxY: number }) => (b.maxX - b.minX) * (b.maxY - b.minY);

describe("selectTiles", () => {
  it("covers the roots exactly once and refines near the camera", () => {
    const tiles = selectTiles(pyramid, { view: { x: 100, y: 100, elevation: 20, projection }, maxTiles: 400 });
    const total = tiles.reduce((sum, t) => sum + area(t.bounds), 0);
    expect(total).toBeCloseTo(pyramid.cols * pyramid.rows * 256 * 256);
    for (const a of tiles) for (const b of tiles) expect(isAncestor(a.key, b.key)).toBe(false);
    const near = tiles.find(
      t => t.bounds.minX <= 100 && t.bounds.maxX > 100 && t.bounds.minY <= 100 && t.bounds.maxY > 100
    );
    const far = tiles.find(t => t.bounds.maxX >= 1000 && t.bounds.maxY >= 800);
    expect(near?.key.z).toBeGreaterThan(far?.key.z ?? 0);
  });

  it("respects the tile budget", () => {
    const tiles = selectTiles(pyramid, { view: { x: 500, y: 400, elevation: 1, projection }, maxTiles: 40 });
    expect(tiles.length).toBeLessThanOrEqual(40);
    expect(tiles.some(t => t.key.z > 0)).toBe(true);
  });

  it("drops excluded subtrees and stops at canSplit", () => {
    const window = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    const tiles = selectTiles(pyramid, {
      view: { x: 150, y: 150, elevation: 5, projection },
      include: (_k, b) => b.minX < window.maxX && b.maxX > window.minX && b.minY < window.maxY && b.maxY > window.minY,
      canSplit: k => k.z < 3
    });
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t.bounds.minX).toBeLessThan(300);
      expect(t.bounds.minY).toBeLessThan(300);
      expect(t.key.z).toBeLessThanOrEqual(3);
    }
  });

  it("keeps a far view coarse", () => {
    const tiles = selectTiles(pyramid, { view: { x: 500, y: 400, elevation: 5000, projection } });
    expect(tiles.every(t => t.key.z === 0)).toBe(true);
  });
});

describe("resolveDrawable", () => {
  it("falls back to the nearest ready ancestor without overlap", () => {
    const a: TileKey = { z: 2, x: 0, y: 0 };
    const b: TileKey = { z: 2, x: 1, y: 0 };
    const c: TileKey = { z: 2, x: 2, y: 0 };
    const ready = new Set(["2/0/0", "1/0/0", "2/2/0"]);
    const drawn = resolveDrawable([a, b, c], k => ready.has(`${k.z}/${k.x}/${k.y}`));
    // b is not ready, so its parent 1/0/0 is drawn and hides a; c stays.
    expect(drawn.map(k => `${k.z}/${k.x}/${k.y}`).sort()).toEqual(["1/0/0", "2/2/0"]);
    expect(area(tileBounds(pyramid, drawn[0]))).toBeGreaterThan(0);
  });
});
