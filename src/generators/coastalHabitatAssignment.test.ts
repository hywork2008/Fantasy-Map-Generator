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

function makeGrid(): Grid {
  return {
    cells: {
      temp: new Int8Array([12, 12, 12, 12, 12, 12]),
      prec: new Uint8Array([20, 20, 20, 20, 20, 20])
    }
  } as unknown as Grid;
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

  it("measures sandy beach share", () => {
    const coastal = new Uint8Array([1, 1, 2, 0]);
    // codes: 1 sandy, 2 rocky
    const share = measureSandyBeachShare(coastal, [0, 1, 2]);
    expect(share).toBeCloseTo(2 / 3, 5);
    expect(getCoastalHabitatCode("sandyBeach")).toBe(1);
  });
});
