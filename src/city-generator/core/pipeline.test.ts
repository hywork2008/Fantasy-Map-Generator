import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "../site/siteConfig";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { nearestOnPolyline, sideOfPolyline } from "./geom";
import { generateCity } from "./pipeline";

const run = (config: SiteConfig, seed = "m25") => {
  const site = synthSite("smallCity", config, seed);
  const result = generateCity(siteToParams(site), siteToGeography(site));
  return { site, result };
};

const tagString = (r: ReturnType<typeof run>["result"]) => r.steps.map(s => s.cells.map(c => c.tag).join("")).join("|");

const RIVER: SiteConfig = { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["through"], relief: false };
const HARBOR: SiteConfig = { ...DEFAULT_SITE_CONFIG, coast: "bay", rivers: [], relief: false };
const DRY: SiteConfig = { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: [], relief: false };

describe("pipeline S0–S3", () => {
  it("is deterministic per (preset, config, seed)", () => {
    for (const cfg of [RIVER, HARBOR, DRY]) {
      expect(tagString(run(cfg).result)).toEqual(tagString(run(cfg).result));
    }
  });

  it("diverges when the seed changes", () => {
    expect(tagString(run(RIVER, "a").result)).not.toEqual(tagString(run(RIVER, "b").result));
  });

  it("produces six fully-tagged steps (through S5) and an urban core", () => {
    for (const cfg of [RIVER, HARBOR, DRY]) {
      const { result } = run(cfg);
      expect(result.steps).toHaveLength(6);
      expect(result.steps.map(s => s.label)).toEqual([
        "S0 · Grid",
        "S1 · Sea & land",
        "S2 · River",
        "S3 · Urban core",
        "S4 · Inner perimeter & gates",
        "S5 · Streets"
      ]);
      for (const step of result.steps) {
        expect(step.cells).toHaveLength(result.cells.length);
        expect(step.cells.every(c => typeof c.tag === "string")).toBe(true);
      }
      expect(result.steps[3].cells.filter(c => c.tag === "urban").length).toBeGreaterThan(5);
    }
  });

  it("carries sea cells only when there is a coast", () => {
    expect(run(HARBOR).result.steps[1].cells.filter(c => c.tag === "sea").length).toBeGreaterThan(10);
    expect(run(DRY).result.steps[1].cells.filter(c => c.tag === "sea").length).toBe(0);
    expect(run(RIVER).result.steps[1].cells.filter(c => c.tag === "sea").length).toBe(0);
  });

  it("harbor: the urban core touches no water", () => {
    const { result } = run(HARBOR);
    expect(result.steps[3].cells.some(c => c.tag === "sea")).toBe(true);
    expect(result.steps[3].cells.filter(c => c.tag === "urban").length).toBeGreaterThan(5);
  });

  it.each(["l144fd", "hb7ej6", "44pj12"])(
    "bay (seed %s): a substantial sea, and the urban core is a ribbon along the shore",
    seed => {
      const { result } = run(HARBOR, seed);
      const total = result.cells.length;
      const seaFrac = result.steps[1].cells.filter(c => c.tag === "sea").length / total;
      expect(seaFrac).toBeGreaterThan(0.28); // an open bay, not a sliver

      const t = nearestOnPolyline([0, 0], result.shoreline as [number, number][]);
      const a = (result.shoreline as [number, number][])[t.segIndex];
      const b = (result.shoreline as [number, number][])[
        Math.min(t.segIndex + 1, (result.shoreline as unknown[]).length - 1)
      ];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const tx = (b[0] - a[0]) / len;
      const ty = (b[1] - a[1]) / len;

      const urban = result.cells.filter((_, i) => result.steps[3].cells[i].tag === "urban").map(c => c.centroid);
      const along = urban.map(p => p[0] * tx + p[1] * ty);
      const cross = urban.map(p => -p[0] * ty + p[1] * tx);
      const span = (v: number[]) => Math.max(...v) - Math.min(...v);
      expect(span(along) / span(cross)).toBeGreaterThan(1.4); // elongated along the coast
    }
  );

  it.each(["a", "b", "c", "d"])("through river (seed %s): the urban core is one blob on the town bank", seed => {
    const { site, result } = run(RIVER, seed);
    const river = site.rivers[0];
    const centerline = result.riverPaths[0].points;
    const R = result.params.cityRadiusMeters;

    expect(result.riverPaths).toHaveLength(1);
    expect(Math.abs(nearestOnPolyline([0, 0], centerline).dist - river.offsetMeters)).toBeLessThan(R * 0.4);

    // Strong invariant: the urban cells are one connected component — the core
    // never jumps the river.
    const byId = new Map(result.cells.map(c => [c.id, c]));
    const idxById = new Map(result.cells.map((c, i) => [c.id, i]));
    const isUrban = (id: number): boolean => result.steps[3].cells[idxById.get(id) as number].tag === "urban";
    const urbanIds = result.cells.filter(c => isUrban(c.id)).map(c => c.id);
    const seen = new Set<number>([urbanIds[0]]);
    const queue = [urbanIds[0]];
    while (queue.length > 0) {
      const c = byId.get(queue.pop() as number) as (typeof result.cells)[number];
      for (const n of c.neighbors) {
        if (isUrban(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(urbanIds.length);

    // Soft: the majority of the core sits on the descriptor's bank.
    const wantLeft = river.cityBank === "left";
    const onBank = result.cells
      .filter(c => isUrban(c.id))
      .filter(c => sideOfPolyline(c.centroid, centerline) > 0 === wantLeft).length;
    expect(onBank / seen.size).toBeGreaterThan(0.55);
  });

  it("two through rivers: the town sits in the component between them", () => {
    const { result } = run(
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["through", "through"], relief: false },
      "between"
    );
    // origin cell is on bank component 0 (the classifier's 'town side')
    const originCell = [...result.cells].sort((a, b) => Math.hypot(...a.centroid) - Math.hypot(...b.centroid))[0];
    const tag = result.steps[3].cells[result.cells.indexOf(originCell)].tag;
    expect(["urban", "outskirts"]).toContain(tag);
    expect(result.riverPaths).toHaveLength(2);
  });
});
