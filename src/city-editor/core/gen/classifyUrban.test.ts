import { describe, expect, it } from "vitest";
import { classifyUrban } from "./classifyUrban";
import { polygonArea } from "./geom";
import { buildGrid } from "./grid";
import { buildHexGrid } from "./hexGrid";
import { buildPatchCells, DEFAULT_PATCH_PARAMS } from "./patches";
import { makeRng } from "./prng";
import type { Cell, CityGeography, CityParams } from "./types";

const EXTENT = 1200;
const CITY_R = EXTENT * 0.33 * 0.92;
const DRY = { sea: new Set<number>(), bank: new Map<number, number>() };
const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };

const urbanArea = (cells: Cell[], urban: Set<number>): number =>
  cells.reduce((sum, cell) => (urban.has(cell.id) ? sum + Math.abs(polygonArea(cell.polygon)) : sum), 0);

const voronoiCells = (seed = "urban-area"): Cell[] => {
  const params: CityParams = {
    seed,
    extentMeters: EXTENT,
    cityRadiusMeters: EXTENT * 0.33,
    cellSizeMeters: 44.8,
    lloydPasses: 1
  };
  return buildGrid(params, EMPTY_GEO, makeRng(seed)).at(-1)?.cells ?? [];
};

describe("classifyUrban — accumulated area", () => {
  for (const grid of ["hex", "voronoi", "evolution"] as const) {
    it(`${grid}: reaches the area budget with at most one cell of overshoot`, () => {
      const cells =
        grid === "hex"
          ? buildHexGrid(EXTENT, 50)
          : grid === "voronoi"
            ? voronoiCells()
            : buildPatchCells({ extentMeters: EXTENT, ...DEFAULT_PATCH_PARAMS }, makeRng("analysis-grid"));
      const result = classifyUrban(cells, DRY, [], CITY_R);
      const actual = urbanArea(cells, result.urban);
      const target = Math.PI * CITY_R ** 2;
      const last = cells.find(c => c.id === result.stages.at(-1)!.cellId)!;
      expect(actual).toBeGreaterThanOrEqual(target);
      expect(actual - Math.abs(polygonArea(last.polygon))).toBeLessThan(target);
      expect(result.stages.map(s => s.cellId)).toEqual([...result.urban]);
      expect(classifyUrban(cells, DRY, [], CITY_R, null, null, 50, false)).toEqual({ ...result, stages: [] });
    });
  }

  it("stops at the connected eligible land when the area is unattainable", () => {
    const cells = buildHexGrid(EXTENT, 50);
    const available = new Set([cells[0].id]);
    const ctx = {
      sea: new Set(cells.filter(c => !available.has(c.id)).map(c => c.id)),
      bank: new Map<number, number>()
    };
    expect(classifyUrban(cells, ctx, [], EXTENT).urban).toEqual(available);
    expect(
      classifyUrban(cells, { sea: new Set(), bank: new Map(cells.map(c => [c.id, 1])) }, [], EXTENT).urban.size
    ).toBe(0);
  });

  it("ignores cellSizeMeters when polygons have area — same mesh, same N", () => {
    const cells = buildHexGrid(EXTENT, 50);
    const a = classifyUrban(cells, DRY, [], CITY_R, null, null, 50);
    const b = classifyUrban(cells, DRY, [], CITY_R, null, null, 25);
    expect(a.urban.size).toBe(b.urban.size);
    expect([...a.urban].sort()).toEqual([...b.urban].sort());
  });

  it("hex 50 m and hex 25 m cover a similar urban area (not 4× from 1/s²)", () => {
    const coarse = buildHexGrid(EXTENT, 50);
    const fine = buildHexGrid(EXTENT, 25);
    const coarseFill = classifyUrban(coarse, DRY, [], CITY_R);
    const fineFill = classifyUrban(fine, DRY, [], CITY_R);
    const coarseArea = urbanArea(coarse, coarseFill.urban);
    const fineArea = urbanArea(fine, fineFill.urban);
    expect(fineFill.urban.size).toBeGreaterThan(coarseFill.urban.size * 2);
    expect(fineArea / coarseArea).toBeGreaterThan(0.8);
    expect(fineArea / coarseArea).toBeLessThan(1.25);
  });

  it("hex 50 m and Voronoi cover a similar urban area", () => {
    const hex = buildHexGrid(EXTENT, 50);
    const voronoi = voronoiCells();
    const hexArea = urbanArea(hex, classifyUrban(hex, DRY, [], CITY_R).urban);
    const voronoiArea = urbanArea(voronoi, classifyUrban(voronoi, DRY, [], CITY_R).urban);
    const intended = Math.PI * CITY_R * CITY_R;
    expect(hexArea / intended).toBeGreaterThan(0.8);
    expect(hexArea / intended).toBeLessThan(1.3);
    expect(voronoiArea / intended).toBeGreaterThan(0.8);
    expect(voronoiArea / intended).toBeLessThan(1.3);
    expect(hexArea / voronoiArea).toBeGreaterThan(0.8);
    expect(hexArea / voronoiArea).toBeLessThan(1.25);
  });

  it("hex 50 m core stays inside the Small frame (does not flood to the rim)", () => {
    const cells = buildHexGrid(EXTENT, 50);
    const { urban } = classifyUrban(cells, DRY, [], CITY_R);
    const half = EXTENT / 2;
    let maxAbs = 0;
    for (const cell of cells) {
      if (!urban.has(cell.id)) continue;
      for (const [x, y] of cell.polygon) maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
    }
    expect(maxAbs).toBeLessThan(half * 0.9);
  });

  it("an explicit nPatches still caps to exactly N cells", () => {
    const cells = buildHexGrid(EXTENT, 50);
    expect(classifyUrban(cells, DRY, [], CITY_R, null, 8).urban.size).toBe(8);
  });
});
