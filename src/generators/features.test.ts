import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { OceanCurrentConstants } from "../data/constants";
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
// ratio (its only neighbor is land) — this radius baseline is mode-independent and unchanged
// by the ocean-current work; see the "lake enclosure by mode" describe block below for how the
// two modes diverge on a lake whose interior falls outside the BFS radius.
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
      currentSpeed: new Uint8Array(13),
      ambientCurrentSpeed: new Uint8Array(13)
    }
  } as unknown as Grid;

  return { pack, grid };
}

/**
 * A linear chain of `waterLength` water cells flanked by one land cell at each end
 * (`land - water×waterLength - land`), all belonging to a single feature of `featureType`.
 * `waterLength` large enough (> 2 * ENCLOSURE_BFS_RADIUS) leaves a genuine "middle" cell more
 * than ENCLOSURE_BFS_RADIUS (6) hops from land on either side — the shore-distance-BFS blind
 * spot `applyOceanCurrentEnclosure()`'s lake override (under `"oceanCurrents"` mode) fixes,
 * while `"radius"` mode keeps reading it as if it were open water.
 */
function buildChainFixture(waterLength: number, featureType: "lake" | "ocean"): PackedGraph {
  const n = waterLength + 2;
  const h = new Array(n).fill(5);
  h[0] = 30;
  h[n - 1] = 30;
  const f = new Array(n).fill(1);
  f[0] = 0;
  f[n - 1] = 0;
  const c: number[][] = [];
  for (let i = 0; i < n; i++) {
    const neighbors: number[] = [];
    if (i > 0) neighbors.push(i - 1);
    if (i < n - 1) neighbors.push(i + 1);
    c.push(neighbors);
  }

  return {
    cells: {
      i: Array.from({ length: n }, (_, i) => i),
      h,
      f,
      g: Array.from({ length: n }, (_, i) => i), // identity pack->grid mapping
      c,
      area: new Array(n).fill(10),
      enclosure: new Uint8Array(n)
    },
    features: [0, { i: 1, type: featureType }]
  } as unknown as PackedGraph;
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

    it("always overrides lake cells to fully enclosed (100), ignoring both current data and the radius baseline", () => {
      const { pack, grid } = buildFixture();
      // Baseline deliberately not 100, so the assertion below can only pass via an active
      // override, not by coincidentally matching an untouched baseline.
      pack.cells.enclosure.set([50, 50, 0, 40]);
      // Deliberately set current data for the lake's mapped grid cell to a value that WOULD
      // change the result if this were treated like an ocean cell (100 -> 0).
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

  describe("applyOceanCurrentEnclosure() - oceanCurrentsAmbient mode", () => {
    beforeEach(() => {
      useOptionsState.setState({ enclosureCalculationMode: "oceanCurrentsAmbient" });
    });

    it("scores ocean cells from ambientCurrentSpeed, not currentSpeed", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]);
      // currentSpeed set to the opposite of what ambientCurrentSpeed says, so a result matching
      // ambientCurrentSpeed's expectation can only come from reading the right array.
      grid.cells.currentSpeed[10] = 0;
      grid.cells.currentSpeed[11] = 160;
      grid.cells.ambientCurrentSpeed[10] = 160; // == BASE_SPEED: open
      grid.cells.ambientCurrentSpeed[11] = 0; // calm
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(pack.cells.enclosure[0]).toBe(0);
      expect(pack.cells.enclosure[1]).toBe(100);
    });

    it("still overrides lake cells to fully enclosed (100)", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 40]);
      grid.cells.ambientCurrentSpeed[12] = 160;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(pack.cells.enclosure[3]).toBe(100);
    });

    it("is a no-op when ambientCurrentSpeed is missing, even if currentSpeed is populated", () => {
      const { pack, grid } = buildFixture();
      pack.cells.enclosure.set([50, 50, 0, 100]);
      grid.cells.currentSpeed[10] = 160;
      (grid.cells as unknown as Record<string, unknown>).ambientCurrentSpeed = undefined;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.applyOceanCurrentEnclosure();

      expect(Array.from(pack.cells.enclosure)).toEqual([50, 50, 0, 100]);
    });
  });

  describe("lake enclosure by mode: a large lake's shore-distant interior", () => {
    it("'radius' mode: keeps the legacy shore-distance BFS unmodified — a deep-interior lake cell reads as if it were open water", () => {
      useOptionsState.setState({ enclosureCalculationMode: "radius" });
      const pack = buildChainFixture(20, "lake");
      const grid = { cells: { currentSpeed: undefined } } as unknown as Grid;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.recalculateEnclosure();

      // Cell 10: 10 hops from the land at index 0, 11 from the land at index 21 — well beyond
      // ENCLOSURE_BFS_RADIUS (6) from either shore, so the BFS never finds any land at all.
      // This is the exact legacy behavior calculateEnclosure() has always had — left untouched so
      // "radius" mode is a genuine, unmodified point of comparison against "oceanCurrents" mode
      // below, not silently patched for both modes at once.
      expect(pack.cells.enclosure[10]).toBe(0);
    });

    it("'oceanCurrents' mode: overrides every lake cell to fully enclosed (100), including the shore-distant interior", () => {
      useOptionsState.setState({ enclosureCalculationMode: "oceanCurrents" });
      const pack = buildChainFixture(20, "lake");
      // applyOceanCurrentEnclosure() requires a populated currentSpeed array to run at all
      // (see its no-op test above) — OceanCurrentsModule never actually models lake current, so
      // this stays all-zero, but the array itself must exist for the override to fire.
      const grid = { cells: { currentSpeed: new Uint8Array(22) } } as unknown as Grid;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.recalculateEnclosure();

      // Cell 1: right next to the shore — the radius baseline alone would score this low too
      // (only 8, from a real, non-fabricated BFS run — see the "radius" mode test above's sibling
      // topology), so this can only be 100 via the active override, not a coincidence.
      expect(pack.cells.enclosure[1]).toBe(100);
      // Cell 10: the same shore-distant interior cell that reads 0 under "radius" mode above.
      expect(pack.cells.enclosure[10]).toBe(100);
    });

    it("does not affect an ocean-type chain of the same shape under 'oceanCurrents' mode — its far cell has genuine current data, not a lake override", () => {
      useOptionsState.setState({ enclosureCalculationMode: "oceanCurrents" });
      const pack = buildChainFixture(20, "ocean");
      const grid = {
        cells: { currentSpeed: new Uint8Array(22).fill(80) } // arbitrary nonzero speed everywhere
      } as unknown as Grid;
      worldContext.pack = pack;
      worldContext.grid = grid;

      Features.recalculateEnclosure();

      // Speed-derived, not forced to 0 or 100 by any lake-specific logic.
      const expected = Math.round((1 - 80 / OceanCurrentConstants.BASE_SPEED) * 100);
      expect(pack.cells.enclosure[10]).toBe(expected);
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
