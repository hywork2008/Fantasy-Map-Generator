import { describe, expect, it } from "vitest";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import {
  applyBiomePredatorDanger,
  BIOME_PREDATOR_DANGER_CAP,
  DEEP_FOREST_DANGER_CAP,
  getBiomePredatorBaseDanger
} from "./biomePredators";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";
import { rebuildDangerField } from "./dangerField";

describe("biome predators (Phase 5)", () => {
  const biomesData = createDefaultBiomesData();

  it("scores forest and mountain biomes, not open grassland alone", () => {
    const grassland = biomesData.codesByKey?.grassland ?? 4;
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const montane = biomesData.codesByKey?.montaneForest ?? forest;

    expect(getBiomePredatorBaseDanger(grassland, 30, biomesData)).toBe(0);
    expect(getBiomePredatorBaseDanger(forest, 30, biomesData)).toBeGreaterThanOrEqual(8);
    expect(getBiomePredatorBaseDanger(montane, 70, biomesData)).toBeGreaterThan(
      getBiomePredatorBaseDanger(forest, 30, biomesData)
    );
    expect(getBiomePredatorBaseDanger(forest, 30, biomesData)).toBeLessThanOrEqual(BIOME_PREDATOR_DANGER_CAP);
  });

  it("adds low danger without creating monster_domain by itself", () => {
    const cells = {
      i: Uint16Array.from([0, 1, 2]),
      c: [[1], [0, 2], [1]],
      h: new Uint8Array([25, 25, 25]),
      biomeCode: Uint8Array.from([
        biomesData.codesByKey?.grassland ?? 4,
        biomesData.codesByKey?.temperateDeciduousForest ?? 6,
        biomesData.codesByKey?.temperateDeciduousForest ?? 6
      ]),
      state: new Uint16Array([0, 0, 0]),
      danger: new Uint8Array(3)
    };

    const touched = applyBiomePredatorDanger(cells, biomesData, { intensityScale: 1 });
    expect(touched).toBeGreaterThan(0);
    expect(cells.danger[1]).toBeGreaterThan(0);
    expect(cells.danger[0]).toBeGreaterThan(0); // edge bleed
    expect(Math.max(...Array.from(cells.danger))).toBeLessThan(STATE_EXPAND_DANGER_BAN);
  });

  it("halves pressure on governed land", () => {
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const wild = {
      i: Uint16Array.from([0]),
      c: [[]],
      h: new Uint8Array([25]),
      biomeCode: Uint8Array.from([forest]),
      state: new Uint16Array([0]),
      danger: new Uint8Array(1)
    };
    const owned = {
      i: Uint16Array.from([0]),
      c: [[]],
      h: new Uint8Array([25]),
      biomeCode: Uint8Array.from([forest]),
      state: new Uint16Array([1]),
      danger: new Uint8Array(1)
    };
    applyBiomePredatorDanger(wild, biomesData, { intensityScale: 1 });
    applyBiomePredatorDanger(owned, biomesData, { intensityScale: 1 });
    expect(owned.danger[0]).toBeLessThan(wild.danger[0]);
    expect(owned.danger[0]).toBeGreaterThan(0);
  });

  it("zeroes predator contribution when pest suppression is 1.0", () => {
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const cells = {
      i: Uint16Array.from([0]),
      c: [[] as number[]],
      h: new Uint8Array([25]),
      biomeCode: Uint8Array.from([forest]),
      state: new Uint16Array([0]),
      danger: new Uint8Array(1)
    };
    applyBiomePredatorDanger(cells, biomesData, {
      intensityScale: 1,
      pestSuppressionByCell: { 0: 1 }
    });
    expect(cells.danger[0]).toBe(0);
  });

  it("layers predators on top of monster danger in rebuildDangerField", () => {
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const cells = {
      i: Uint16Array.from([0, 1, 2, 3, 4]),
      c: [[1], [0, 2], [1, 3], [2, 4], [3]],
      h: new Uint8Array([25, 25, 25, 25, 25]),
      biomeCode: Uint8Array.from([forest, forest, forest, forest, forest]),
      state: new Uint16Array(5),
      danger: new Uint8Array(5)
    };
    rebuildDangerField(
      cells,
      [{ i: 0, cell: 0, name: "Beast", rarity: 1, power: 2, basePower: 2, type: "Beast" }],
      "max",
      { biomesData, biomePredatorScale: 1 }
    );
    // Far forest cell still has predator texture even if outside tiny monster radius.
    expect(cells.danger[4]).toBeGreaterThan(0);
    expect(cells.danger[0]).toBeGreaterThan(cells.danger[4]);
  });

  describe("deep-forest interior scaling (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase I)", () => {
    const grassland = biomesData.codesByKey?.grassland ?? 4;
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;

    /** grassland(0) - forest(1) - forest(2) - forest(3) - forest(4) - forest(5), a straight chain. */
    function forestChainCells(length: number) {
      const biomeCode = Uint8Array.from([grassland, ...Array.from({ length: length - 1 }, () => forest)]);
      const c = Array.from({ length }, (_, i) => {
        const neighbors: number[] = [];
        if (i > 0) neighbors.push(i - 1);
        if (i < length - 1) neighbors.push(i + 1);
        return neighbors;
      });
      return {
        i: Uint16Array.from({ length }, (_, i) => i),
        c,
        h: new Uint8Array(length).fill(25),
        biomeCode,
        state: new Uint16Array(length),
        danger: new Uint8Array(length)
      };
    }

    it("gives a forest-edge cell (depth 1) no bonus over the flat per-biome base", () => {
      const cells = forestChainCells(2); // grassland(0), forest edge(1)
      applyBiomePredatorDanger(cells, biomesData, { intensityScale: 1 });
      const base = getBiomePredatorBaseDanger(forest, 25, biomesData);
      expect(cells.danger[1]).toBe(base);
    });

    it("scores a forest-interior cell strictly higher than a forest-edge cell", () => {
      const cells = forestChainCells(6); // grassland(0), forest depth 1..5
      applyBiomePredatorDanger(cells, biomesData, { intensityScale: 1 });
      expect(cells.danger[5]).toBeGreaterThan(cells.danger[1]);
      // Monotonically non-decreasing with depth along the chain.
      for (let i = 2; i <= 5; i++) expect(cells.danger[i]).toBeGreaterThanOrEqual(cells.danger[i - 1]);
    });

    it("caps combined base+depth danger at DEEP_FOREST_DANGER_CAP, still short of the annex ban", () => {
      const cells = forestChainCells(12); // a long, deep forest interior
      applyBiomePredatorDanger(cells, biomesData, { intensityScale: 1 });
      const deepest = cells.danger[cells.danger.length - 1];
      expect(deepest).toBeLessThanOrEqual(DEEP_FOREST_DANGER_CAP);
      expect(deepest).toBeLessThan(STATE_EXPAND_DANGER_BAN);
    });

    it("does not change danger for an all-forest cell set with no reachable non-forest edge", () => {
      // Mirrors the "layers predators..." fixture above: an isolated forest chain with no
      // grassland/water source cell at all — depth is undefined (0) everywhere, same as pre-Phase-I.
      const length = 5;
      const cells = {
        i: Uint16Array.from({ length }, (_, i) => i),
        c: Array.from({ length }, (_, i) => [i - 1, i + 1].filter(n => n >= 0 && n < length)),
        h: new Uint8Array(length).fill(25),
        biomeCode: Uint8Array.from({ length }, () => forest),
        state: new Uint16Array(length),
        danger: new Uint8Array(length)
      };
      applyBiomePredatorDanger(cells, biomesData, { intensityScale: 1 });
      const base = getBiomePredatorBaseDanger(forest, 25, biomesData);
      expect(cells.danger[2]).toBe(base); // center cell — would be "deepest" if depth were computed
    });
  });
});
