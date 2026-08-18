import { describe, expect, it } from "vitest";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { getLakeVolcanism, indexLakeVolcanism } from "./volcanicTerrain";

function buildPack(): { pack: PackedGraph; grid: Grid } {
  const pack = {
    cells: {
      i: [0, 1, 2, 3],
      g: [10, 11, 12, 13],
      f: [2, 0, 3, 1],
      h: [19, 40, 19, 5]
    },
    features: [
      0,
      { i: 1, type: "ocean", firstCell: 3 },
      { i: 2, type: "lake", firstCell: 0 },
      { i: 3, type: "lake", firstCell: 2 }
    ]
  } as unknown as PackedGraph;

  const grid = {
    cells: {
      volcanic: new Float32Array(14),
      volcanicActive: new Uint8Array(14)
    },
    volcanoes: [
      { peakCell: 10, active: true },
      { peakCell: 12, active: false }
    ]
  } as unknown as Grid;
  grid.cells.volcanic![10] = 1;
  grid.cells.volcanic![12] = 1;
  grid.cells.volcanicActive![10] = 1;

  return { pack, grid };
}

describe("volcanicTerrain", () => {
  it("indexes active and dormant crater lakes from tagged peaks", () => {
    const { pack, grid } = buildPack();
    const index = indexLakeVolcanism(pack, grid);
    expect(index.get(2)).toBe("active");
    expect(index.get(3)).toBe("dormant");
    expect(index.has(1)).toBe(false);
  });

  it("classifies a single lake from the same peak list", () => {
    const { pack, grid } = buildPack();
    expect(getLakeVolcanism(pack.features[2], pack, grid)).toBe("active");
    expect(getLakeVolcanism(pack.features[3], pack, grid)).toBe("dormant");
  });
});
