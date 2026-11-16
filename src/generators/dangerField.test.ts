import { describe, expect, it } from "vitest";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import type { Monster } from "../types/models";
import { dangerSuitabilityMultiplier } from "./dangerExpandPolicy";
import {
  biomePredatorScaleForMode,
  type DangerFieldCells,
  paintMonsterDanger,
  rebuildDangerField,
  rebuildDangerFromMonsters
} from "./dangerField";

function lineCells(count: number, heights?: number[]): DangerFieldCells {
  return {
    i: Uint16Array.from({ length: count }, (_, index) => index),
    c: Array.from({ length: count }, (_, index) =>
      [index - 1, index + 1].filter(neighbor => neighbor >= 0 && neighbor < count)
    ),
    ...(heights ? { h: Uint8Array.from(heights) } : {}),
    danger: new Uint8Array(count)
  };
}

function monster(partial: Pick<Monster, "cell" | "rarity" | "power"> & { type?: string }): Monster {
  return {
    i: 0,
    cell: partial.cell,
    name: partial.type ?? "Beast",
    rarity: partial.rarity,
    power: partial.power,
    basePower: partial.power,
    type: partial.type ?? "Beast"
  };
}

describe("rebuildDangerFromMonsters", () => {
  it("paints a rarity-1 beast from the peak with quadratic falloff", () => {
    const cells = lineCells(8);
    rebuildDangerFromMonsters(cells, [monster({ cell: 0, rarity: 1, power: 5 })]);

    expect(cells.danger[0]).toBe(48);
    expect(cells.danger[1]).toBe(31);
    expect(cells.danger[2]).toBe(17);
    expect(cells.danger[5]).toBe(0);
    expect(cells.threatRarity?.[0]).toBe(1);
    expect(dangerSuitabilityMultiplier(cells.danger[0])).toBeGreaterThan(0);
  });

  it("does not let stacked beasts exceed the rarity-1 peak", () => {
    const cells = lineCells(3);
    rebuildDangerFromMonsters(cells, [
      monster({ cell: 1, rarity: 1, power: 5 }),
      monster({ cell: 1, rarity: 1, power: 5, type: "Beast" })
    ]);
    expect(cells.danger[1]).toBe(48);
  });

  it("ignores the retired aggregation mode", () => {
    const additive = lineCells(1);
    const maxMode = lineCells(1);
    const source = [monster({ cell: 0, rarity: 1, power: 5 })];
    rebuildDangerFromMonsters(additive, source, "additive");
    rebuildDangerFromMonsters(maxMode, source, "max");
    expect(additive.danger[0]).toBe(48);
    expect(maxMode.danger[0]).toBe(48);
  });

  it("clears danger and threat rarity when monsters are removed", () => {
    const cells = lineCells(5);
    rebuildDangerFromMonsters(cells, [monster({ cell: 2, rarity: 1, power: 4 })]);
    expect(cells.danger[2]).toBeGreaterThan(0);

    rebuildDangerFromMonsters(cells, []);
    expect(Array.from(cells.danger).every(value => value === 0)).toBe(true);
    expect(Array.from(cells.threatRarity ?? []).every(value => value === 0)).toBe(true);
  });

  it("keeps a calamity center at 255 and the uninhabitable ring at the fixed hops", () => {
    const cells = lineCells(51);
    rebuildDangerFromMonsters(cells, [monster({ cell: 0, rarity: 5, power: 50, type: "Calamity" })]);
    expect(cells.danger[0]).toBe(255);
    expect(cells.danger[22]).toBe(80);
    expect(cells.danger[23]).toBe(74);
    expect(cells.danger[30]).toBe(41);
    expect(cells.threatRarity?.[30]).toBe(5);
  });

  it("records the covering rarity when a beast core out-colors a calamity shoulder", () => {
    const cells = lineCells(36);
    rebuildDangerFromMonsters(cells, [
      monster({ cell: 0, rarity: 5, power: 50, type: "Calamity" }),
      monster({ cell: 30, rarity: 1, power: 5, type: "Beast" })
    ]);
    expect(cells.danger[30]).toBe(48);
    expect(cells.threatRarity?.[30]).toBe(5);
  });

  it("places rarity-3 habitability on the fixed hops", () => {
    const wide = lineCells(21);
    rebuildDangerFromMonsters(wide, [monster({ cell: 0, rarity: 3, power: 20, type: "Greater Monster" })]);
    expect(wide.danger[0]).toBe(140);
    expect(wide.danger[4]).toBe(90);
    expect(wide.danger[5]).toBe(79);

    const frontier = lineCells(15);
    rebuildDangerFromMonsters(frontier, [monster({ cell: 0, rarity: 3, power: 14, type: "Greater Monster" })]);
    expect(frontier.danger[3]).toBe(86);
    expect(frontier.danger[4]).toBe(71);
  });

  it("shrinks the radius when power is cut and does not also subtract power * 4", () => {
    const cells = lineCells(51);
    const source = [monster({ cell: 0, rarity: 5, power: 50, type: "Calamity" })];
    rebuildDangerFromMonsters(cells, source);
    expect(cells.danger[22]).toBe(80);

    source[0].power = 40;
    rebuildDangerFromMonsters(cells, source);
    expect(cells.danger[0]).toBe(255);
    expect(cells.danger[22]).toBe(52);
  });

  it("keeps a forest calamity at 255 when predators combine by max", () => {
    const biomesData = createDefaultBiomesData();
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const cells: DangerFieldCells = {
      i: Uint16Array.from([0]),
      c: [[]],
      h: new Uint8Array([25]),
      biomeCode: Uint8Array.from([forest]),
      state: new Uint16Array(1),
      danger: new Uint8Array(1)
    };
    rebuildDangerField(cells, [monster({ cell: 0, rarity: 5, power: 50, type: "Calamity" })], "additive", {
      biomesData,
      biomePredatorScale: 1
    });
    expect(cells.danger[0]).toBe(255);
    expect(cells.threatRarity?.[0]).toBe(5);
  });

  it("does not raise threat rarity from predators alone", () => {
    const biomesData = createDefaultBiomesData();
    const forest = biomesData.codesByKey?.temperateDeciduousForest ?? 6;
    const cells: DangerFieldCells = {
      i: Uint16Array.from([0, 1]),
      c: [[1], [0]],
      h: new Uint8Array([25, 25]),
      biomeCode: Uint8Array.from([forest, forest]),
      state: new Uint16Array(2),
      danger: new Uint8Array(2)
    };
    rebuildDangerField(cells, [], "max", { biomesData, biomePredatorScale: 1 });
    expect(cells.danger[0]).toBeGreaterThan(0);
    expect(cells.danger[0]).toBeLessThan(80);
    expect(cells.threatRarity?.[0]).toBe(0);
  });

  it("writes threat rarity where the rounded byte is zero", () => {
    const cells = lineCells(10);
    rebuildDangerFromMonsters(cells, [monster({ cell: 0, rarity: 1, power: 10 })]);
    expect(cells.danger[9]).toBe(0);
    expect(cells.threatRarity?.[9]).toBe(1);
  });

  it("paints the same byte for a named type and an unknown type of the same rarity", () => {
    const named = lineCells(6);
    const unknown = lineCells(6);
    rebuildDangerFromMonsters(named, [monster({ cell: 0, rarity: 1, power: 5, type: "Beast" })]);
    rebuildDangerFromMonsters(unknown, [monster({ cell: 0, rarity: 1, power: 5, type: "Drake" })]);
    expect(Array.from(unknown.danger)).toEqual(Array.from(named.danger));
  });

  it("is stable when rebuilt twice from the same sources", () => {
    const cells = lineCells(12);
    const sources = [
      monster({ cell: 0, rarity: 1, power: 5 }),
      monster({ cell: 8, rarity: 3, power: 6, type: "Greater Monster" })
    ];
    rebuildDangerFromMonsters(cells, sources);
    const danger = Uint8Array.from(cells.danger);
    const rarity = Uint8Array.from(cells.threatRarity ?? []);
    rebuildDangerFromMonsters(cells, sources, "nonlinear");
    expect(Array.from(cells.danger)).toEqual(Array.from(danger));
    expect(Array.from(cells.threatRarity ?? [])).toEqual(Array.from(rarity));
  });

  it("stops a land beast at open water", () => {
    const cells = lineCells(5, [25, 25, 5, 25, 25]);
    rebuildDangerFromMonsters(cells, [monster({ cell: 0, rarity: 1, power: 5 })]);
    expect(cells.danger[0]).toBe(48);
    expect(cells.danger[1]).toBeGreaterThan(0);
    expect(cells.danger[2]).toBe(0);
    expect(cells.danger[3]).toBe(0);
    expect(cells.danger[4]).toBe(0);
    expect(cells.threatRarity?.[3]).toBe(0);
  });

  it("lets air cross water at the same peak", () => {
    const cells = lineCells(5, [25, 25, 5, 25, 25]);
    paintMonsterDanger(cells, monster({ cell: 0, rarity: 1, power: 5 }), "air");
    expect(cells.danger[0]).toBe(48);
    expect(cells.danger[2]).toBeGreaterThan(0);
    expect(cells.danger[4]).toBeGreaterThan(0);
  });

  it("copies a water monster onto the adjacent shore and not one hop inland", () => {
    const cells = lineCells(4, [5, 5, 25, 25]);
    paintMonsterDanger(cells, monster({ cell: 0, rarity: 1, power: 5 }), "water");
    expect(cells.danger[0]).toBe(48);
    expect(cells.danger[1]).toBe(31);
    expect(cells.danger[2]).toBe(cells.danger[1]);
    expect(cells.danger[3]).toBe(0);
    expect(cells.threatRarity?.[2]).toBe(1);
    expect(cells.threatRarity?.[3]).toBe(0);
  });

  it("paints nothing for a water monster when height is missing", () => {
    const cells = lineCells(4);
    paintMonsterDanger(cells, monster({ cell: 0, rarity: 1, power: 5 }), "water");
    expect(Array.from(cells.danger).every(value => value === 0)).toBe(true);
  });

  it("maps fantasy modes to predator intensity scales", () => {
    expect(biomePredatorScaleForMode("highFantasy")).toBe(1);
    expect(biomePredatorScaleForMode("darkFantasy")).toBe(1.25);
    expect(biomePredatorScaleForMode("none")).toBe(0);
  });
});
