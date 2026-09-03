// S3 urban-core growth — the `urbanNPatches` count cutoff (TownGeneratorTS
// "first nPatches", towngen-comparison.md §2.1 improvement A-1) and the
// per-iteration `urbanStages` capture that lets a debug slider step through
// the flood-fill one loop at a time.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "../site/siteConfig";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { generateCity } from "./pipeline";
import type { CityParams } from "./types";

const DRY: SiteConfig = { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: [], relief: false };

const run = (params: Partial<CityParams>, config: SiteConfig = DRY, seed = "urban-npatches") => {
  const site = synthSite("smallCity", config, seed);
  const geo = siteToGeography(site);
  const base = siteToParams(site);
  return generateCity({ ...base, ...params }, geo);
};

const urbanCount = (r: ReturnType<typeof run>) => r.steps[3].cells.filter(c => c.tag === "urban").length;

describe("classifyUrban — urbanNPatches count cutoff", () => {
  it("is unset by default and leaves the radius cutoff unchanged", () => {
    const withDefault = run({});
    const withExplicitUndefined = run({ urbanNPatches: undefined });
    expect(urbanCount(withDefault)).toBe(urbanCount(withExplicitUndefined));
    expect(withDefault.steps[3].cells.map(c => c.tag)).toEqual(withExplicitUndefined.steps[3].cells.map(c => c.tag));
  });

  it("caps the urban core to exactly N cells when N is well inside the eligible area", () => {
    const result = run({ urbanNPatches: 8 });
    expect(urbanCount(result)).toBe(8);
  });

  it.each([1, 5, 12, 30])("caps to exactly N=%i cells", n => {
    const result = run({ urbanNPatches: n });
    expect(urbanCount(result)).toBe(n);
  });

  it("takes all eligible land cells (without throwing) when N exceeds the eligible area", () => {
    const uncapped = run({});
    const overshoot = run({ urbanNPatches: uncapped.cells.length * 10 });
    // Every land cell not cut off by the window edge is eligible on a dry, riverless
    // site — the flood-fill exhausts the frontier and simply stops.
    expect(urbanCount(overshoot)).toBeGreaterThan(0);
    expect(urbanCount(overshoot)).toBeLessThanOrEqual(overshoot.cells.length);
  });

  it("is deterministic for a given seed + nPatches", () => {
    expect(urbanCount(run({ urbanNPatches: 10 }))).toBe(urbanCount(run({ urbanNPatches: 10 })));
  });

  it("stays one connected flood-fill component under the count cutoff", () => {
    const result = run({ urbanNPatches: 15 });
    const byId = new Map(result.cells.map(c => [c.id, c]));
    const isUrban = (id: number) => result.steps[3].cells[result.cells.findIndex(c => c.id === id)].tag === "urban";
    const urbanIds = result.cells.filter(c => isUrban(c.id)).map(c => c.id);
    expect(urbanIds).toHaveLength(15);

    const seen = new Set<number>([urbanIds[0]]);
    const queue = [urbanIds[0]];
    while (queue.length > 0) {
      const cell = byId.get(queue.pop() as number) as (typeof result.cells)[number];
      for (const n of cell.neighbors) {
        if (isUrban(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(urbanIds.length);
  });
});

describe("classifyUrban — urbanStages (step-through debug capture)", () => {
  it("records exactly one stage per admitted cell, in growth order", () => {
    const result = run({ urbanNPatches: 12 });
    expect(result.urbanStages).toHaveLength(12);
    result.urbanStages.forEach((stage, i) => {
      expect(stage.urban).toHaveLength(i + 1);
      expect(stage.urban.at(-1)).toBe(stage.cellId);
    });
  });

  it("each stage's set is a strict superset of the previous one, ending at the final urban set", () => {
    const result = run({ urbanNPatches: 12 });
    for (let i = 1; i < result.urbanStages.length; i++) {
      const prev = new Set(result.urbanStages[i - 1].urban);
      const cur = new Set(result.urbanStages[i].urban);
      expect(cur.size).toBe(prev.size + 1);
      for (const id of prev) expect(cur.has(id)).toBe(true);
    }
    const finalUrban = new Set(result.steps[3].cells.filter(c => c.tag === "urban").map(c => c.id));
    expect(new Set(result.urbanStages.at(-1)?.urban)).toEqual(finalUrban);
  });

  it("is captured for the default radius cutoff too, not only the count cutoff", () => {
    const result = run({});
    expect(result.urbanStages.length).toBe(urbanCount(result));
    expect(result.urbanStages.length).toBeGreaterThan(5);
  });
});
