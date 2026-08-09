import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { PackedGraph } from "../types/PackedGraph";
import { MIN_NAVIGABLE_FLUX, Rivers } from "./river-generator";

describe("RiverModule helpers", () => {
  beforeEach(() => {
    worldContext.pack = {
      cells: { r: [], fl: [], f: [] },
      features: [],
      rivers: []
    } as unknown as PackedGraph;
  });

  function setCells(cells: { r?: number[]; fl?: number[]; f?: number[] }) {
    worldContext.pack.cells = { r: [], fl: [], f: [], ...cells } as unknown as PackedGraph["cells"];
  }

  describe("isNavigable", () => {
    it("returns true when cell has a river and flux meets the threshold", () => {
      setCells({ r: [0, 1, 1], fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50] });
      expect(Rivers.isNavigable(1)).toBe(true);
      expect(Rivers.isNavigable(2)).toBe(true);
    });

    it("returns false for cells with no river", () => {
      setCells({ r: [0, 0], fl: [500, 500] });
      expect(Rivers.isNavigable(0)).toBe(false);
    });

    it("returns false for river cells below the threshold", () => {
      setCells({ r: [0, 1], fl: [0, MIN_NAVIGABLE_FLUX - 1] });
      expect(Rivers.isNavigable(1)).toBe(false);
    });
  });

  describe("orientRiverCellsDownhill", () => {
    it("reverses a manually-selected river whose higher endpoint was clicked last", () => {
      setCells({});
      worldContext.pack.cells.h = [20, 26, 32] as unknown as PackedGraph["cells"]["h"];

      expect(Rivers.orientRiverCellsDownhill([0, 1, 2])).toEqual([2, 1, 0]);
    });

    it("keeps the selected order when the first endpoint is already higher", () => {
      setCells({});
      worldContext.pack.cells.h = [32, 26, 20] as unknown as PackedGraph["cells"]["h"];

      expect(Rivers.orientRiverCellsDownhill([0, 1, 2])).toEqual([0, 1, 2]);
    });

    it("keeps the selected order when endpoint elevations are equal", () => {
      setCells({});
      worldContext.pack.cells.h = [24, 22, 24] as unknown as PackedGraph["cells"]["h"];

      expect(Rivers.orientRiverCellsDownhill([0, 1, 2])).toEqual([0, 1, 2]);
    });
  });

  describe("resolveDrainFeature", () => {
    it("returns the ocean feature id when river drains into the sea", () => {
      // cell 5 is the river-bearing land cell; cell 6 is the sea cell at the mouth
      setCells({ r: [0, 0, 0, 0, 0, 1, 0], f: [0, 0, 0, 0, 0, 0, 2] });
      worldContext.pack.features = [null, null, { i: 2, type: "ocean" }] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [{ i: 1, cells: [5, 6] }] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveDrainFeature(5)).toBe(2);
    });

    it("returns the closed lake feature id when river terminates in a closed lake", () => {
      setCells({ r: [0, 0, 1, 0], f: [0, 0, 0, 3] });
      worldContext.pack.features = [
        null,
        null,
        null,
        { i: 3, type: "lake" } // no outlet => closed
      ] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [{ i: 1, cells: [2, 3] }] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveDrainFeature(2)).toBe(3);
    });

    it("follows lake outlet onward to the final receiving sea", () => {
      // river 1 ends in lake (feature 3, has outlet to river 2); river 2 ends in ocean (feature 4)
      setCells({ r: [0, 1, 0, 2, 0], f: [0, 0, 3, 0, 4] });
      worldContext.pack.features = [
        null,
        null,
        null,
        { i: 3, type: "lake", outlet: 2 },
        { i: 4, type: "ocean" }
      ] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [
        { i: 1, cells: [1, 2] },
        { i: 2, cells: [3, 4] }
      ] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveDrainFeature(1)).toBe(4);
    });

    it("returns null when river leaves the map", () => {
      setCells({ r: [0, 1], f: [0, 0] });
      worldContext.pack.features = [null, null] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [{ i: 1, cells: [1, -1] }] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveDrainFeature(1)).toBeNull();
    });

    it("returns null for a cell with no river", () => {
      setCells({ r: [0, 0] });
      expect(Rivers.resolveDrainFeature(0)).toBeNull();
    });
  });

  describe("resolveLakeDrainFeature", () => {
    it("returns the ocean feature id when the lake outlet chain reaches the sea", () => {
      // lake feature 2 has outlet river 1; river 1 ends in ocean feature 3
      setCells({ r: [0, 1, 0], f: [0, 0, 3] });
      worldContext.pack.features = [
        null,
        null,
        { i: 2, type: "lake", outlet: 1 },
        { i: 3, type: "ocean" }
      ] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [{ i: 1, cells: [1, 2] }] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(3);
    });

    it("follows a chain through an intermediate open lake to reach the ocean", () => {
      // lake 2 → river 1 → lake 3 (open) → river 2 → ocean 4
      setCells({ r: [0, 1, 0, 2, 0], f: [0, 0, 3, 0, 4] });
      worldContext.pack.features = [
        null,
        null,
        { i: 2, type: "lake", outlet: 1 },
        { i: 3, type: "lake", outlet: 2 },
        { i: 4, type: "ocean" }
      ] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [
        { i: 1, cells: [1, 2] }, // river 1 drains lake 2 into lake 3
        { i: 2, cells: [3, 4] } // river 2 drains lake 3 into ocean 4
      ] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(4);
    });

    it("returns the closed downstream lake feature id when the chain terminates there", () => {
      // lake 2 (open) → river 1 → lake 3 (closed, no outlet)
      setCells({ r: [0, 1, 0], f: [0, 0, 3] });
      worldContext.pack.features = [
        null,
        null,
        { i: 2, type: "lake", outlet: 1 },
        { i: 3, type: "lake" } // no outlet — closed
      ] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [{ i: 1, cells: [1, 2] }] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(3);
    });

    it("returns null when the outlet river exits the map", () => {
      setCells({ r: [0, 1], f: [0, 0] });
      worldContext.pack.features = [
        null,
        null,
        { i: 2, type: "lake", outlet: 1 }
      ] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [{ i: 1, cells: [1, -1] }] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(2)).toBeNull();
    });

    it("returns the lake's own feature id when the lake has no outlet (closed lake)", () => {
      worldContext.pack.features = [null, null, { i: 2, type: "lake" }] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(2)).toBe(2);
    });

    it("returns null for a non-lake feature id", () => {
      worldContext.pack.features = [null, null, { i: 2, type: "ocean" }] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(2)).toBeNull();
    });

    it("returns null for an unknown feature id", () => {
      worldContext.pack.features = [null] as unknown as PackedGraph["features"];
      worldContext.pack.rivers = [] as unknown as PackedGraph["rivers"];

      expect(Rivers.resolveLakeDrainFeature(99)).toBeNull();
    });
  });
});
