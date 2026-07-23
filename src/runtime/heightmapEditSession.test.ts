import { afterEach, describe, expect, it } from "vitest";
import type { Grid } from "../types/Grid";
import {
  applyHeightmapEditSession,
  beginHeightmapEditSession,
  discardHeightmapEditSession,
  getHeightmapEditingGrid,
  getHeightmapEditingHeights,
  replaceHeightmapEditingHeights
} from "./heightmapEditSession";

function createGrid(): Grid {
  return { cells: { h: new Uint8Array([10, 20]) } } as Grid;
}

afterEach(() => {
  discardHeightmapEditSession();
});

describe("HeightmapEditSession", () => {
  it("keeps preview changes out of the live grid until finalize applies them", () => {
    const grid = createGrid();
    beginHeightmapEditSession(grid);

    const preview = getHeightmapEditingHeights(grid);
    preview[0] = 42;
    replaceHeightmapEditingHeights(preview);

    expect(Array.from(grid.cells.h)).toEqual([10, 20]);
    expect(Array.from(getHeightmapEditingGrid(grid).cells.h)).toEqual([42, 20]);

    applyHeightmapEditSession(grid);

    expect(Array.from(grid.cells.h)).toEqual([42, 20]);
    expect(getHeightmapEditingHeights(grid)).toBe(grid.cells.h);
  });

  it("discards a preview without changing the live grid", () => {
    const grid = createGrid();
    beginHeightmapEditSession(grid);
    getHeightmapEditingHeights(grid)[1] = 99;

    discardHeightmapEditSession();

    expect(Array.from(grid.cells.h)).toEqual([10, 20]);
  });
});
