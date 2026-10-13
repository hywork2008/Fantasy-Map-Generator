import { describe, expect, it } from "vitest";
import type { PatchParams } from "../types/contracts/patches";
import { polygonArea } from "./geom";
import { buildPatchCells, DEFAULT_PATCH_PARAMS, guardRing, relaxCentralSites, scatterPatchSites } from "./patches";
import { makeRng } from "./prng";

const EXTENT = 1200;
const params = (over: Partial<PatchParams> = {}): PatchParams => ({
  extentMeters: EXTENT,
  ...DEFAULT_PATCH_PARAMS,
  ...over
});

describe("scatterPatchSites — TownGeneratorTS spiral", () => {
  it("returns nPatches·8 sites, the first at the origin, all inside the window", () => {
    const sites = scatterPatchSites(15, EXTENT, makeRng("s"));
    expect(sites).toHaveLength(15 * 8);
    expect(sites[0][0]).toBeCloseTo(0, 6);
    expect(sites[0][1]).toBeCloseTo(0, 6);
    const half = EXTENT / 2;
    for (const [x, y] of sites) {
      expect(Math.abs(x)).toBeLessThanOrEqual(half * 1.45);
      expect(Math.abs(y)).toBeLessThanOrEqual(half * 1.45);
    }
  });

  it("is centre-dense: the inner quarter-radius holds far more than its area share of sites", () => {
    const sites = scatterPatchSites(20, EXTENT, makeRng("d"));
    const half = EXTENT / 2;
    const inner = sites.filter(([x, y]) => Math.hypot(x, y) < half / 2).length / sites.length;
    // Uniform disc fill would put ~14% of points inside half the radius (¼ area);
    // the spiral's 1/r density puts ~37% there.
    expect(inner).toBeGreaterThan(0.3);
  });

  it("is deterministic in the seed", () => {
    expect(scatterPatchSites(12, EXTENT, makeRng("k"))).toEqual(scatterPatchSites(12, EXTENT, makeRng("k")));
  });
});

describe("relaxCentralSites", () => {
  const win = { minX: -600, minY: -600, maxX: 600, maxY: 600 };
  const guard = guardRing(win, EXTENT / 10);

  it("moves exactly the first K sites and leaves the rest byte-identical", () => {
    const sites = scatterPatchSites(15, EXTENT, makeRng("r"));
    const relaxed = relaxCentralSites(sites, guard, win, 3);
    expect(relaxed).toHaveLength(sites.length);
    for (let i = 0; i < 3; i++) expect(relaxed[i]).not.toEqual(sites[i]);
    for (let i = 3; i < sites.length; i++) expect(relaxed[i]).toBe(sites[i]);
  });

  it("K=0 is a no-op", () => {
    const sites = scatterPatchSites(10, EXTENT, makeRng("z"));
    expect(relaxCentralSites(sites, guard, win, 0)).toEqual(sites);
  });
});

describe("buildPatchCells", () => {
  it("is deterministic in the seed", () => {
    const a = buildPatchCells(params(), makeRng("seed-1"));
    const b = buildPatchCells(params(), makeRng("seed-1"));
    expect(a).toEqual(b);
  });

  it("produces more cells as nPatches grows", () => {
    const small = buildPatchCells(params({ nPatches: 10 }), makeRng("m")).length;
    const large = buildPatchCells(params({ nPatches: 40 }), makeRng("m")).length;
    expect(large).toBeGreaterThan(small);
  });

  it("is size-varied blue noise, not a uniform Lloyd grid", () => {
    const cells = buildPatchCells(params({ nPatches: 20 }), makeRng("g"));
    const areas = cells.map(c => Math.abs(polygonArea(c.polygon)));
    const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
    const cv = Math.sqrt(areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length) / mean;
    // A jittered-grid + heavy-Lloyd fill converges to near-equal areas (cv ≈ 0.1);
    // the spiral scatter + central-only relax keeps a strong size spread.
    expect(cv).toBeGreaterThan(0.4);
    expect(Math.max(...areas)).toBeGreaterThan(Math.min(...areas) * 5);
  });

  it("every cell is a simple polygon with ≥ 3 vertices and non-trivial area", () => {
    const cells = buildPatchCells(params(), makeRng("v"));
    expect(cells.length).toBeGreaterThan(10);
    for (const cell of cells) {
      expect(cell.polygon.length).toBeGreaterThanOrEqual(3);
      expect(Math.abs(polygonArea(cell.polygon))).toBeGreaterThan(1);
    }
  });
});

describe("rim growth and raised nPatches", () => {
  it("rimGrowthPercent 100 reproduces the reference scatter", () => {
    const a = scatterPatchSites(24, 1200, makeRng("rim"));
    const b = scatterPatchSites(24, 1200, makeRng("rim"), 100);
    expect(b).toEqual(a);
  });

  it("a lower rim growth narrows the rim-to-centre radius spread", () => {
    // r ∝ i^p: the 90th/10th percentile radius ratio is 9^p (9 at 100%, 3 at 0%).
    const spread = (rim: number) => {
      const r = scatterPatchSites(48, 2400, makeRng("rim"), rim)
        .map(([x, y]) => Math.hypot(x, y))
        .sort((a, b) => a - b);
      return r[Math.floor(r.length * 0.9)] / r[Math.floor(r.length * 0.1)];
    };
    expect(spread(100)).toBeGreaterThan(6);
    expect(spread(0)).toBeLessThan(4);
  });

  it("keeps small interior cells when nPatches is raised (no mesh holes)", () => {
    const extentMeters = 4800;
    const half = extentMeters / 2;
    const cells = buildPatchCells({ ...DEFAULT_PATCH_PARAMS, extentMeters, nPatches: 400 }, makeRng("lab-0"));
    const ids = new Set(cells.map(cell => cell.id));
    // An interior cell whose Voronoi neighbour is missing borders a hole.
    const holeNeighbours = cells.filter(
      cell => !cell.onBorder && cell.neighbors.some(n => !ids.has(n)) && Math.hypot(...cell.centroid) < half * 0.8
    );
    expect(holeNeighbours).toEqual([]);
    expect(
      cells.some(cell => !cell.onBorder && Math.abs(polygonArea(cell.polygon)) < (extentMeters / 40) ** 2 * 0.02)
    ).toBe(true);
  });
});
