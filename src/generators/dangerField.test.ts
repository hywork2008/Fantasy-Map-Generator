import { describe, expect, it } from "vitest";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import { biomePredatorScaleForMode, rebuildDangerField, rebuildDangerFromMonsters } from "./dangerField";

function createCells(count: number) {
  return {
    i: Uint16Array.from({ length: count }, (_, index) => index),
    c: Array.from({ length: count }, (_, index) =>
      [index - 1, index + 1].filter(neighbor => neighbor >= 0 && neighbor < count)
    ),
    danger: new Uint8Array(count)
  };
}

describe("rebuildDangerFromMonsters", () => {
  it("paints an additive danger radius from a single monster", () => {
    const cells = createCells(9);
    rebuildDangerFromMonsters(
      cells,
      [{ i: 0, cell: 4, name: "Beast", rarity: 1, power: 3, basePower: 3, type: "Beast" }],
      "additive"
    );

    expect(cells.danger[4]).toBeGreaterThan(0);
    expect(cells.danger[3]).toBeGreaterThan(0);
    expect(cells.danger[5]).toBeGreaterThan(0);
    expect(cells.danger[0]).toBe(0);
    expect(cells.danger[8]).toBe(0);
  });

  it("clears previous danger when monsters are removed", () => {
    const cells = createCells(5);
    rebuildDangerFromMonsters(
      cells,
      [{ i: 0, cell: 2, name: "Beast", rarity: 1, power: 4, basePower: 4, type: "Beast" }],
      "max"
    );
    expect(cells.danger[2]).toBeGreaterThan(0);

    rebuildDangerFromMonsters(cells, [], "max");
    expect(Array.from(cells.danger).every(value => value === 0)).toBe(true);
  });

  it("maps fantasy modes to predator intensity scales", () => {
    expect(biomePredatorScaleForMode("highFantasy")).toBe(1);
    expect(biomePredatorScaleForMode("darkFantasy")).toBe(1.25);
    expect(biomePredatorScaleForMode("none")).toBe(0);
  });

  it("keeps forest predator texture after monster-only field would be empty", () => {
    const biomesData = createDefaultBiomesData();
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const cells = {
      i: Uint16Array.from([0, 1]),
      c: [[1], [0]],
      h: new Uint8Array([25, 25]),
      biomeCode: Uint8Array.from([forest, forest]),
      state: new Uint16Array(2),
      danger: new Uint8Array(2)
    };
    rebuildDangerField(cells, [], "max", { biomesData, biomePredatorScale: 1 });
    expect(cells.danger[0]).toBeGreaterThan(0);
  });

  it("dark fantasy calamity (power 50 additive) exceeds settlement-zero danger across a wide ring", () => {
    // Settlement zeros at danger ≥ 80 (expand ban). Additive peak is 200 at center.
    const cells = createCells(1);
    rebuildDangerFromMonsters(
      cells,
      [{ i: 0, cell: 0, name: "Calamity", rarity: 5, power: 50, basePower: 50, type: "Calamity" }],
      "additive"
    );
    expect(cells.danger[0]).toBeGreaterThanOrEqual(80);
    expect(cells.danger[0]).toBeGreaterThanOrEqual(200);
  });

  it("threatCalculation mode changes epicenter peak (max vs additive for a lone beast)", () => {
    const additive = createCells(1);
    const maxMode = createCells(1);
    const monster = [{ i: 0, cell: 0, name: "Beast", rarity: 1, power: 5, basePower: 5, type: "Beast" }];
    rebuildDangerFromMonsters(additive, monster, "additive");
    rebuildDangerFromMonsters(maxMode, monster, "max");
    // additive: remaining*4 = 20; max: remaining*5 = 25
    expect(additive.danger[0]).toBe(20);
    expect(maxMode.danger[0]).toBe(25);
  });
});
