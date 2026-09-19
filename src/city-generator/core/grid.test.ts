import { describe, expect, it } from "vitest";
import { polygonArea } from "./geom";
import { generateCity } from "./pipeline";
import type { CityParams } from "./types";

const PARAMS: CityParams = {
  seed: "town-alpha",
  extentMeters: 3000,
  cityRadiusMeters: 500,
  cellSizeMeters: 50,
  lloydPasses: 3
};

const project = (r: ReturnType<typeof generateCity>) =>
  r.gridStages.map(s => s.cells.map(c => [c.id, c.centroid[0], c.centroid[1], c.polygon.length]));

describe("S0 grid", () => {
  it("is deterministic for a given seed + params", () => {
    expect(project(generateCity(PARAMS))).toEqual(project(generateCity({ ...PARAMS })));
  });

  it("diverges when the seed changes", () => {
    expect(project(generateCity(PARAMS))).not.toEqual(project(generateCity({ ...PARAMS, seed: "town-beta" })));
  });

  it("captures one stage per Lloyd pass plus the initial scatter", () => {
    const r = generateCity(PARAMS);
    expect(r.gridStages).toHaveLength(PARAMS.lloydPasses + 1);
    expect(r.gridStages[0].label).toMatch(/scatter/i);
    expect(r.gridStages.at(-1)?.label).toMatch(/final/i);
    expect(r.cells).toBe(r.gridStages.at(-1)?.cells);
  });

  it("produces only simple, non-degenerate clipped cells", () => {
    for (const cell of generateCity(PARAMS).cells) {
      expect(cell.polygon.length).toBeGreaterThanOrEqual(3);
      expect(Math.abs(polygonArea(cell.polygon))).toBeGreaterThan(1);
    }
  });

  it("relaxes sites toward their centroids", () => {
    const r = generateCity(PARAMS);
    const drift = (stage: (typeof r.gridStages)[number]) =>
      stage.cells.reduce((sum, c) => sum + Math.hypot(c.centroid[0] - c.site[0], c.centroid[1] - c.site[1]), 0) /
      stage.cells.length;
    expect(drift(r.gridStages.at(-1) as (typeof r.gridStages)[number])).toBeLessThan(drift(r.gridStages[0]));
  });
});
