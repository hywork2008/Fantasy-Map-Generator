import { describe, expect, it } from "vitest";
import type { BurgSiteArchetype } from "../site/burgSiteDescriptor";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { nearestOnPolyline, sideOfPolyline } from "./geom";
import { generateCity } from "./pipeline";

const ARCHETYPES: BurgSiteArchetype[] = ["crossroads", "riverCrossing", "harbor", "hillTop"];

const run = (archetype: BurgSiteArchetype, seed = "m2") => {
  const site = synthSite("smallCity", archetype, seed);
  const result = generateCity(siteToParams(site), siteToGeography(site));
  return { site, result };
};

const tags = (result: ReturnType<typeof run>["result"]) => result.steps.map(s => s.cells.map(c => c.tag).join(""));

describe("pipeline S0–S3", () => {
  it("is deterministic per (preset, archetype, seed)", () => {
    for (const a of ARCHETYPES) {
      expect(tags(run(a).result)).toEqual(tags(run(a).result));
    }
  });

  it("diverges when the seed changes", () => {
    expect(tags(run("riverCrossing", "a").result)).not.toEqual(tags(run("riverCrossing", "b").result));
  });

  it.each(ARCHETYPES)("produces four fully-tagged steps and an urban core (%s)", archetype => {
    const { result } = run(archetype);
    expect(result.steps).toHaveLength(4);
    for (const step of result.steps) {
      expect(step.cells).toHaveLength(result.cells.length);
      expect(step.cells.every(c => typeof c.tag === "string")).toBe(true);
    }
    const urban = result.steps[3].cells.filter(c => c.tag === "urban").length;
    expect(urban).toBeGreaterThan(5);
  });

  it("only the water archetypes carry sea cells; landlocked ones do not", () => {
    const seaCount = (a: BurgSiteArchetype) => run(a).result.steps[1].cells.filter(c => c.tag === "sea").length;
    expect(seaCount("harbor")).toBeGreaterThan(10);
    expect(seaCount("crossroads")).toBe(0);
    expect(seaCount("hillTop")).toBe(0);
    expect(seaCount("riverCrossing")).toBe(0);
  });

  it("harbor: the urban core touches no water", () => {
    const { result } = run("harbor");
    const core = result.steps[3].cells.filter(c => c.tag === "urban");
    expect(core.every(c => c.tag === "urban")).toBe(true);
    expect(result.steps[3].cells.some(c => c.tag === "sea")).toBe(true);
    // no cell is both urban and sea/water — tags are exclusive by construction
    const urbanIds = new Set(core.map((_, i) => i));
    expect(urbanIds.size).toBe(core.length);
  });

  it.each(["a", "b", "c", "d"])(
    "riverCrossing (seed %s): a water band forms and the urban core stays on the descriptor bank",
    seed => {
      const { site, result } = run("riverCrossing", seed);
      const river = site.rivers[0];
      const centerline = result.riverPaths[0].points;
      const R = result.params.cityRadiusMeters;

      const water = result.steps[2].cells.filter(c => c.tag === "water");
      expect(water.length).toBeGreaterThan(4);

      // chord position preserved: the centerline's closest approach to the town
      // center is near the descriptor offset (within a meander amplitude).
      expect(Math.abs(nearestOnPolyline([0, 0], centerline).dist - river.offsetMeters)).toBeLessThan(R * 0.25);

      // bank preserved: > 85% of urban cells sit on the descriptor's cityBank side.
      const urban = result.steps[3].cells
        .map((c, i) => ({ c, i }))
        .filter(x => x.c.tag === "urban")
        .map(x => result.cells[x.i].centroid);
      const wantLeft = river.cityBank === "left";
      const onBank = urban.filter(p => sideOfPolyline(p, centerline) > 0 === wantLeft).length;
      expect(onBank / urban.length).toBeGreaterThan(0.85);
    }
  );
});
