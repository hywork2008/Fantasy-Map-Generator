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

function makeGrid(cellCount = 6, ambientCurrentSpeed?: number[]): Grid {
  return {
    cells: {
      temp: new Int8Array(cellCount).fill(12),
      prec: new Uint8Array(cellCount).fill(20),
      ambientCurrentSpeed: ambientCurrentSpeed ? Uint8Array.from(ambientCurrentSpeed) : new Uint8Array(cellCount)
    }
  } as unknown as Grid;
}

/**
 * A row of `landCount` flat land-coast cells (each paired with its own water-coast cell),
 * chained land-neighbor-to-land-neighbor (no wraparound). Height/river/temp are uniform unless
 * overridden per index via `landOverrides`. Used to isolate the exposure/sediment thresholds in
 * `classifySegmentBase()` from slope and segmentation effects covered elsewhere.
 */
function makeFlatCoastPack(
  landCount: number,
  landOverrides?: (i: number) => Partial<{ h: number; fl: number; r: number }>
): PackedGraph {
  const n = landCount * 2;
  const h = new Uint8Array(n);
  const t = new Int8Array(n);
  const fl = new Uint16Array(n);
  const r = new Uint16Array(n);
  const f = new Uint16Array(n).fill(1);
  const g = new Uint16Array(Array.from({ length: n }, (_, i) => i));
  const p: [number, number][] = [];
  const c: number[][] = [];

  for (let i = 0; i < landCount; i++) {
    const overrides = landOverrides?.(i) ?? {};
    h[i] = overrides.h ?? 22; // mild slope relative to water at h=18
    t[i] = 1;
    fl[i] = overrides.fl ?? 0;
    r[i] = overrides.r ?? 0;
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
      p,
      coastalHabitat: new Uint8Array(n),
      nearshoreHabitat: new Uint8Array(n)
    },
    features: [0, { i: 1, type: "island", land: true }, { i: 2, type: "ocean", land: false }]
  } as unknown as PackedGraph;
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

  it("reads calm, flat, sediment-starved coast as tidal flat (not swallowed sandy by default)", () => {
    const pack = makeFlatCoastPack(3, () => ({ h: 20 })); // slope 2, no river anywhere
    const grid = makeGrid(6); // ambientCurrentSpeed defaults to 0 everywhere: fully calm
    const tidalFlat = getCoastalHabitatCode("tidalFlat");

    assignCoastalHabitats(pack, grid, { profile: "mediterranean", seed: 3 });

    for (const id of [0, 1, 2]) expect(pack.cells.coastalHabitat[id]).toBe(tidalFlat);
  });

  it("reads exposed, flat coast as sandy from current/wave action alone, with zero sediment anywhere", () => {
    const pack = makeFlatCoastPack(3, () => ({ h: 22 })); // slope 4, no river anywhere
    const grid = makeGrid(6, [200, 200, 200, 200, 200, 200]); // high ambient current: exposed
    const sandy = getCoastalHabitatCode("sandyBeach");

    assignCoastalHabitats(pack, grid, { profile: "mediterranean", seed: 3 });

    for (const id of [0, 1, 2]) expect(pack.cells.coastalHabitat[id]).toBe(sandy);
  });

  it("diffuses river-mouth sediment to calm neighboring cells, turning them sandy instead of tidal flat", () => {
    // Only the middle cell has a river; the two flanking cells have zero sediment of their own.
    const pack = makeFlatCoastPack(3, i => (i === 1 ? { h: 20, fl: 40, r: 1 } : { h: 20 }));
    const grid = makeGrid(6); // fully calm everywhere, so without diffusion credit this would be tidal flat
    const sandy = getCoastalHabitatCode("sandyBeach");
    const tidalFlat = getCoastalHabitatCode("tidalFlat");

    assignCoastalHabitats(pack, grid, { profile: "mediterranean", seed: 3 });

    // Flanking cells (no river of their own) still read sandy thanks to diffused sediment credit.
    expect(pack.cells.coastalHabitat[0]).toBe(sandy);
    expect(pack.cells.coastalHabitat[2]).toBe(sandy);
    expect(pack.cells.coastalHabitat[0]).not.toBe(tidalFlat);
  });

  it("reads a fjord-like coast as rocky even with a mild land-side slope and high exposure", () => {
    // land 0 -- water 1 (shallow, 1 hop out) -- water 2 (much deeper, 2 hops out)
    const pack = {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        h: new Uint8Array([22, 19, 2]), // land mild slope; water shelf drops sharply one hop further out
        t: new Int8Array([1, -1, -1]),
        c: [[1], [0, 2], [1]],
        fl: new Uint16Array([0, 0, 0]),
        r: new Uint16Array([0, 0, 0]),
        f: new Uint16Array([1, 2, 2]),
        g: new Uint16Array([0, 1, 2]),
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ] as [number, number][],
        coastalHabitat: new Uint8Array(3),
        nearshoreHabitat: new Uint8Array(3)
      },
      features: [0, { i: 1, type: "island", land: true }, { i: 2, type: "ocean", land: false }]
    } as unknown as PackedGraph;
    const grid = makeGrid(3, [0, 200, 200]); // land cell reads high exposure, which alone would favor sandy
    const rocky = getCoastalHabitatCode("rockyIntertidal");

    assignCoastalHabitats(pack, grid, { profile: "mediterranean", seed: 3 });

    expect(pack.cells.coastalHabitat[0]).toBe(rocky);
  });

  it("measures sandy beach share", () => {
    const coastal = new Uint8Array([1, 1, 2, 0]);
    // codes: 1 sandy, 2 rocky
    const share = measureSandyBeachShare(coastal, [0, 1, 2]);
    expect(share).toBeCloseTo(2 / 3, 5);
    expect(getCoastalHabitatCode("sandyBeach")).toBe(1);
  });
});
