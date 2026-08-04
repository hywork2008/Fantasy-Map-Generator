import { describe, expect, it } from "vitest";
import { rebuildDangerFromMonsters } from "./dangerField";

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
});
