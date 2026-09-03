import { describe, expect, it } from "vitest";
import { buildGridEvolution } from "./gridEvolution";
import { buildPatchCells, DEFAULT_PATCH_PARAMS, type PatchParams } from "./patches";
import { makeRng } from "./prng";

const params = (over: Partial<PatchParams> = {}): PatchParams => ({
  extentMeters: 1200,
  ...DEFAULT_PATCH_PARAMS,
  ...over
});

describe("buildGridEvolution", () => {
  it("is deterministic in the seed", () => {
    expect(buildGridEvolution(params(), makeRng("e"))).toEqual(buildGridEvolution(params(), makeRng("e")));
  });

  it("final stage cells are byte-identical to buildPatchCells for the same params + seed", () => {
    const evo = buildGridEvolution(params(), makeRng("same"));
    const direct = buildPatchCells(params(), makeRng("same"));
    expect(evo.at(-1)?.label).toBe("final");
    expect(evo.at(-1)?.cells).toEqual(direct);
  });

  it("has one scatter stage per point (small nPatches) plus one per relax pass plus a final", () => {
    const p = params({ nPatches: 12, relaxPasses: 3, relaxCount: 4 });
    const stages = buildGridEvolution(p, makeRng("c"));
    const scatter = stages.filter(s => s.label.startsWith("scatter"));
    const relax = stages.filter(s => s.label.startsWith("relax"));
    expect(scatter).toHaveLength(12 * 8); // per-point below the throttle
    expect(relax).toHaveLength(3);
    expect(stages).toHaveLength(12 * 8 + 3 + 1);
  });

  it("scatter stages add sites monotonically, one at a time below the throttle", () => {
    const stages = buildGridEvolution(params({ nPatches: 10 }), makeRng("s")).filter(s =>
      s.label.startsWith("scatter")
    );
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].sites.length).toBe(stages[i - 1].sites.length + 1);
    }
    expect(stages[0].sites).toHaveLength(1);
  });

  it("every stage carries Delaunay edges and clipped cells", () => {
    const stages = buildGridEvolution(params({ nPatches: 8 }), makeRng("d"));
    for (const stage of stages) {
      expect(Array.isArray(stage.delaunay)).toBe(true);
      expect(Array.isArray(stage.cells)).toBe(true);
    }
    // A well-populated stage has a real triangulation and clipped cells.
    const last = stages.at(-1);
    expect(last?.delaunay.length).toBeGreaterThan(5);
    expect(last?.cells.length).toBeGreaterThan(5);
  });

  it("relax stages only move the centre-most K sites", () => {
    const p = params({ nPatches: 12, relaxPasses: 2, relaxCount: 4 });
    const stages = buildGridEvolution(p, makeRng("r"));
    const lastScatter = stages.filter(s => s.label.startsWith("scatter")).at(-1)!;
    const firstRelax = stages.find(s => s.label.startsWith("relax"))!;
    let moved = 0;
    for (let i = 0; i < lastScatter.sites.length; i++) {
      if (lastScatter.sites[i][0] !== firstRelax.sites[i][0] || lastScatter.sites[i][1] !== firstRelax.sites[i][1]) {
        moved++;
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(4);
  });
});
