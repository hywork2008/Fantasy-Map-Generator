import { describe, expect, it } from "vitest";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import { applyBiomePredatorDanger, BIOME_PREDATOR_DANGER_CAP, getBiomePredatorBaseDanger } from "./biomePredators";
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
});
