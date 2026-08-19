import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { VolcanoConstants } from "../data/constants";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { LavaFlows } from "./lavaFlows";
import { lavaFlowLandCells } from "./volcanicTerrain";

/**
 * Linear downhill: crater lake (cell 0, grid 10) → land 50 → 40 → 30 → water.
 * Neighbors: 0-1-2-3-4.
 */
function buildDownhillWorld(): WorldState {
  const pack = {
    cells: {
      i: [0, 1, 2, 3, 4],
      g: [10, 11, 12, 13, 14],
      f: [2, 0, 0, 0, 1],
      h: [19, 50, 40, 30, 5],
      c: [[1], [0, 2], [1, 3], [2, 4], [3]],
      p: [
        [10, 10],
        [20, 10],
        [30, 10],
        [40, 10],
        [50, 10]
      ]
    },
    features: [0, { i: 1, type: "ocean" }, { i: 2, type: "lake", firstCell: 0 }],
    lavaFlows: []
  } as unknown as PackedGraph;

  const grid = {
    volcanoes: [{ peakCell: 10, active: true }]
  } as unknown as Grid;

  return { pack, grid, seed: "1" } as unknown as WorldState;
}

describe("LavaFlows.generate", () => {
  it("walks steepest descent from an active crater and does not write water-river columns", () => {
    const state = buildDownhillWorld();
    const cells = state.pack.cells as unknown as { r?: number[] };
    cells.r = [0, 0, 0, 0, 0];

    LavaFlows.generate(worldContext, viewContext, appServices, state);

    expect(state.pack.lavaFlows).toHaveLength(1);
    const flow = state.pack.lavaFlows![0];
    expect(flow.source).toBe(0);
    expect(flow.cells[0]).toBe(0);
    expect(flow.cells.slice(1)).toEqual([1, 2, 3, 4].slice(0, VolcanoConstants.LAVA_FLOW_MAX_CELLS - 1));
    expect(flow.cells.length).toBeLessThanOrEqual(VolcanoConstants.LAVA_FLOW_MAX_CELLS + 1);
    expect(cells.r).toEqual([0, 0, 0, 0, 0]);
  });

  it("skips dormant volcanoes and peaks with no downhill land", () => {
    const state = buildDownhillWorld();
    state.grid.volcanoes = [{ peakCell: 10, active: false }];
    LavaFlows.generate(worldContext, viewContext, appServices, state);
    expect(state.pack.lavaFlows).toEqual([]);

    state.grid.volcanoes = [{ peakCell: 10, active: true }];
    state.pack.cells.c[0] = [];
    LavaFlows.generate(worldContext, viewContext, appServices, state);
    expect(state.pack.lavaFlows).toEqual([]);
  });

  it("marks only land cells of a flow as lava-field candidates", () => {
    const state = buildDownhillWorld();
    LavaFlows.generate(worldContext, viewContext, appServices, state);
    const land = lavaFlowLandCells(state.pack);
    expect(land.has(0)).toBe(false);
    expect(land.has(1)).toBe(true);
    expect(land.has(4)).toBe(false);
  });
});
