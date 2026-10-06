import { describe, expect, it } from "vitest";
import { setForestDensityThreshold } from "../core/commands";
import { createEmptyRegionDocument } from "../core/document";
import type { Point, RegionDocument } from "../core/types";
import { describeCell } from "./cellInfo";
import { buildForestMass } from "./forestMass";

/** 1 辺 400 のセルを縦縞で 35% だけ森林ポリゴンにした、疎な森のセルを持つ文書 */
function sparseForestDoc(): RegionDocument {
  const doc = createEmptyRegionDocument();
  const cell: Point[] = [
    [0, 0],
    [400, 0],
    [400, 400],
    [0, 400]
  ];
  const stripes: Point[][] = [0, 1, 2, 3].map(i => {
    const x = i * 100;
    return [
      [x, 0],
      [x + 35, 0],
      [x + 35, 400],
      [x, 400]
    ];
  });
  doc.biomes = [
    {
      id: "bio-cell-7",
      kind: "coniferous_forest",
      polygon: cell,
      color: "#b5c4a7",
      isWater: false,
      forestCover: 0.7,
      forestStock: 0.7,
      forestPolygons: stripes
    }
  ];
  return doc;
}

describe("describeCell / forest density threshold", () => {
  it("reports a sparse forest cell as vanishing at the default threshold and drawn at a lower one", () => {
    const doc = sparseForestDoc();
    const strict = describeCell(doc, "bio-cell-7", buildForestMass(doc.biomes, [], 0.5));
    expect(strict?.cellId).toBe(7);
    expect(strict?.forestPolygonRatio).toBeCloseTo(0.35, 2);
    expect(strict?.vanishes).toBe(true);

    const lowered = setForestDensityThreshold(doc, 0.1);
    expect(lowered.terrain.forestDensityThreshold).toBe(0.1);
    const loose = describeCell(lowered, "bio-cell-7", buildForestMass(lowered.biomes, [], 0.1));
    expect(loose?.drawnRatio).toBeGreaterThan(0.5);
    expect(loose?.vanishes).toBe(false);
  });

  it("clamps the threshold and ignores non-finite input", () => {
    const doc = sparseForestDoc();
    expect(setForestDensityThreshold(doc, 5).terrain.forestDensityThreshold).toBe(0.95);
    expect(setForestDensityThreshold(doc, 0).terrain.forestDensityThreshold).toBe(0.05);
    expect(setForestDensityThreshold(doc, Number.NaN).terrain.forestDensityThreshold).toBe(0.5);
  });

  it("returns null for an unknown cell and aggregates land use by kind", () => {
    const doc = sparseForestDoc();
    expect(describeCell(doc, "bio-cell-99", null)).toBeNull();
    doc.landUse = {
      modelVersion: 1,
      revision: 1,
      year: 1000,
      seed: "x",
      provenance: "estimated",
      patches: [
        { id: "a", sourceCellId: 7, kind: "cultivation", areaHa: 10, polygon: [] },
        { id: "b", sourceCellId: 7, kind: "cultivation", areaHa: 5, polygon: [] },
        { id: "c", sourceCellId: 8, kind: "built", areaHa: 1, polygon: [] }
      ] as never,
      unplacedAreaHa: 0,
      diagnostics: []
    };
    expect(describeCell(doc, "bio-cell-7", null)?.landUse).toEqual([{ kind: "cultivation", areaHa: 15 }]);
  });
});
