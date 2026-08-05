import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { Features } from "./features";

// ---------------------------------------------------------------------------
// Fixture: 4 pack cells sharing one small graph.
//   0 – ocean water cell (feature 1, "ocean"), maps to grid cell 10
//   1 – ocean water cell (feature 1, "ocean"), maps to grid cell 11
//   2 – land cell (feature 0)
//   3 – lake water cell (feature 2, "lake"), maps to grid cell 12
//
// Neighbor graph: 0↔1, 0↔2, 1↔2, 2↔3 (2 is the only link into the lake).
// calculateEnclosure()'s radius BFS gives cell 0 and 1 a 50% blocked ratio
// (one land neighbor, one open-water neighbor) and cell 3 a 100% blocked
// ratio (its only neighbor is land).
// ---------------------------------------------------------------------------
function buildFixture(): { pack: PackedGraph; grid: Grid } {
  const pack = {
    cells: {
      i: [0, 1, 2, 3],
      h: [5, 5, 30, 5],
      f: [1, 1, 0, 2],
      g: [10, 11, 0, 12],
      c: [[1, 2], [0, 2], [0, 1, 3], [2]],
      area: [10, 10, 10, 10],
      enclosure: new Uint8Array(4)
    },
    features: [0, { i: 1, type: "ocean" }, { i: 2, type: "lake" }]
  } as unknown as PackedGraph;

  const grid = {
    cells: {
      currentSpeed: new Uint8Array(13)
    }
  } as unknown as Grid;

  return { pack, grid };
}

describe("FeatureModule ocean-current enclosure", () => {
  const originalPack = worldContext.pack;
  const originalGrid = worldContext.grid;
  const originalMode = useOptionsState.getState().enclosureCalculationMode;

  afterEach(() => {
    worldContext.pack = originalPack;
    worldContext.grid = originalGrid;
    useOptionsState.setState({ enclosureCalculationMode: originalMode });
  });

  describe("applyOceanCurrentEnclosure()", () => {
    beforeEach(() => {
      useOptionsState.setState({ enclosureCalculationMode: "oceanCurrents" });
    });

    it("scores ocean cells from resolved current speed: fast/open water reads as open, calm water reads as fully enclosed", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]); // radius baseline, as calculateEnclosure() would leave it
      grid.cells.currentSpeed[10] = 160; // == BASE_SPEED: undamped, fully open
      grid.cells.currentSpeed[11] = 0; // dead calm: fully enclosed
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(pack.cells.enclosure[0]).toBe(0);
      expect(pack.cells.enclosure[1]).toBe(100);
    });

    it("leaves lake cells on their radius-based score even when the mapped grid cell has current data", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]);
      // Deliberately set current data for the lake's mapped grid cell to a value that WOULD
      // change the result if the lake exclusion were broken (100 -> 0).
      grid.cells.currentSpeed[12] = 160;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(pack.cells.enclosure[3]).toBe(100);
    });

    it("leaves land cells at 0", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]);
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(pack.cells.enclosure[2]).toBe(0);
    });

    it("is a no-op when the legacy radius mode is selected", () => {
      useOptionsState.setState({ enclosureCalculationMode: "radius" });
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]);
      grid.cells.currentSpeed[10] = 160;
      grid.cells.currentSpeed[11] = 0;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(Array.from(pack.cells.enclosure)).toEqual([50, 50, 0, 100]);
    });

    it("is a no-op when OceanCurrents.generate() has not populated grid.cells.currentSpeed yet", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]);
      (grid.cells as unknown as Record<string, unknown>).currentSpeed = undefined;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(Array.from(pack.cells.enclosure)).toEqual([50, 50, 0, 100]);
    });
  });

  describe("recalculateEnclosure()", () => {
    it("rebuilds the radius baseline and layers the current overlay on top when mode is oceanCurrents", () => {
      useOptionsState.setState({ enclosureCalculationMode: "oceanCurrents" });
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([255, 255, 255, 255]); // stale values from a previous mode/run
      grid.cells.currentSpeed[10] = 160;
      grid.cells.currentSpeed[11] = 0;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.recalculateEnclosure();

      // cell 0: radius baseline 50 -> overridden to 0 by the current overlay (open water)
      expect(pack.cells.enclosure[0]).toBe(0);
      // cell 1: radius baseline 50 -> overridden to 100 by the current overlay (calm water)
      expect(pack.cells.enclosure[1]).toBe(100);
      // cell 2: land, always 0
      expect(pack.cells.enclosure[2]).toBe(0);
      // cell 3: lake, radius baseline stands (100)
      expect(pack.cells.enclosure[3]).toBe(100);
    });

    it("restores the plain radius baseline when the user switches back to the legacy mode", () => {
      useOptionsState.setState({ enclosureCalculationMode: "radius" });
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([255, 255, 255, 255]); // stale values from a previous oceanCurrents run
      grid.cells.currentSpeed[10] = 160;
      grid.cells.currentSpeed[11] = 0;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.recalculateEnclosure();

      expect(Array.from(pack.cells.enclosure)).toEqual([50, 50, 0, 100]);
    });
  });
});
