import { describe, expect, it } from "vitest";
import { getCoastalHabitatCode } from "../data/coastalHabitatCatalog";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { assignCoastalHabitats, measureSandyBeachShare } from "./coastalHabitatAssignment";

function makeCoastPack(): PackedGraph {
  // 6 cells: land coast 0,1,2 ; water coast 3,4,5
  // Layout as a strip of land (h=25) above water (h=15)
  const h = new Uint8Array([25, 25, 25, 15, 15, 15]);
  const t = new Int8Array([1, 1, 1, -1, -1, -1]);
  const c = [
    [1, 3],
    [0, 2, 4],
    [1, 5],
    [0, 4],
    [1, 3, 5],
    [2, 4]
  ];
  const fl = new Uint16Array([0, 40, 0, 0, 0, 0]); // cell 1 has river sediment
  const r = new Uint16Array([0, 1, 0, 0, 0, 0]);
  const f = new Uint16Array([1, 1, 1, 2, 2, 2]);
  const g = new Uint16Array([0, 1, 2, 3, 4, 5]);
  const enclosure = new Uint8Array([10, 20, 10, 0, 0, 0]);
  const p: [number, number][] = [
    [0, 0],
    [10, 0],
    [20, 0],
    [0, 10],
    [10, 10],
    [20, 10]
  ];

  return {
    cells: {
      i: new Uint16Array([0, 1, 2, 3, 4, 5]),
      h,
      t,
      c,
      fl,
      r,
      f,
      g,
      enclosure,
      p,
      coastalHabitat: new Uint8Array(6),
      nearshoreHabitat: new Uint8Array(6)
    },
    features: [0, { i: 1, type: "island", land: true }, { i: 2, type: "ocean", land: false }]
  } as unknown as PackedGraph;
}

function makeGrid(cellCount = 6): Grid {
  return {
    cells: {
      temp: new Int8Array(cellCount).fill(12),
      prec: new Uint8Array(cellCount).fill(20)
    }
  } as unknown as Grid;
}

/**
 * 8 land-coast cells (0-3 steep/bare, 4-7 flat/sedimented) paired with 8 water-coast
 * cells, all part of a single connected landmass coastline. Used to verify segmentation
 * splits at the local terrain shift instead of collapsing the whole coastline into one
 * segment (which previously forced a uniform habitat over the entire landmass).
 */
function makeSplitTerrainCoastPack(): PackedGraph {
  const landCount = 8;
  const n = landCount * 2;
  const h = new Uint8Array(n);
  const t = new Int8Array(n);
  const fl = new Uint16Array(n);
  const r = new Uint16Array(n);
  const f = new Uint16Array(n).fill(1);
  const g = new Uint16Array(Array.from({ length: n }, (_, i) => i));
  const enclosure = new Uint8Array(n);
  const p: [number, number][] = [];
  const c: number[][] = [];

  for (let i = 0; i < landCount; i++) {
    const steep = i < 4;
    h[i] = steep ? 60 : 22; // steep vs mild slope relative to water
    t[i] = 1;
    if (!steep) {
      fl[i] = 40;
      r[i] = 1;
    }
    const waterId = landCount + i;
    h[waterId] = 18;
    t[waterId] = -1;
    f[waterId] = 2;
    p.push([i, 0]);
  }
  for (let i = 0; i < landCount; i++) p.push([i, 1]);

  for (let i = 0; i < landCount; i++) {
    const neighbors = [landCount + i];
    if (i > 0) neighbors.push(i - 1);
    if (i < landCount - 1) neighbors.push(i + 1);
    c.push(neighbors);
  }
  for (let i = 0; i < landCount; i++) c.push([i]);

  return {
    cells: {
      i: new Uint16Array(Array.from({ length: n }, (_, i) => i)),
      h,
      t,
      c,
      fl,
      r,
      f,
      g,
      enclosure,
      p,
      coastalHabitat: new Uint8Array(n),
      nearshoreHabitat: new Uint8Array(n)
    },
    features: [0, { i: 1, type: "island", land: true }, { i: 2, type: "ocean", land: false }]
  } as unknown as PackedGraph;
}

describe("coastalHabitatAssignment", () => {
  it("assigns coastal and nearshore habitats without wiping climate biomes", () => {
    const pack = makeCoastPack();
    const grid = makeGrid();
    assignCoastalHabitats(pack, grid, { profile: "global", seed: 99 });

    // Land coast cells get a non-zero habitat (or dune)
    for (const id of [0, 1, 2]) {
      expect(pack.cells.coastalHabitat[id]).toBeGreaterThanOrEqual(0);
    }
    // At least one coastal habitat painted on land coast
    const landPainted = [0, 1, 2].some(id => (pack.cells.coastalHabitat[id] ?? 0) > 0);
    expect(landPainted).toBe(true);

    // Water coast may get nearshore
    const near = [3, 4, 5].map(id => pack.cells.nearshoreHabitat[id] ?? 0);
    expect(near.every(v => v >= 0)).toBe(true);
  });

  it("splits a landmass's coastline at local terrain shifts instead of one uniform segment", () => {
    const pack = makeSplitTerrainCoastPack();
    const grid = makeGrid(16);
    const sandy = getCoastalHabitatCode("sandyBeach");
    const rocky = getCoastalHabitatCode("rockyIntertidal");

    // "mediterranean" applies no global sandy-share balancing, isolating segmentation itself.
    assignCoastalHabitats(pack, grid, { profile: "mediterranean", seed: 7 });

    // Steep, bare cells away from the transition should read rocky...
    expect(pack.cells.coastalHabitat[0]).toBe(rocky);
    expect(pack.cells.coastalHabitat[1]).toBe(rocky);
    // ...and mild, sedimented cells away from the transition should read sandy.
    expect(pack.cells.coastalHabitat[6]).toBe(sandy);
    expect(pack.cells.coastalHabitat[7]).toBe(sandy);

    // The whole 8-cell coastline must not collapse into a single uniform habitat.
    const codes = new Set(Array.from({ length: 8 }, (_, i) => pack.cells.coastalHabitat[i]));
    expect(codes.size).toBeGreaterThan(1);
  });

  it("measures sandy beach share", () => {
    const coastal = new Uint8Array([1, 1, 2, 0]);
    // codes: 1 sandy, 2 rocky
    const share = measureSandyBeachShare(coastal, [0, 1, 2]);
    expect(share).toBeCloseTo(2 / 3, 5);
    expect(getCoastalHabitatCode("sandyBeach")).toBe(1);
  });
});
