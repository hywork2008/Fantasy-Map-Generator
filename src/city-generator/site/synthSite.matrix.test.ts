// Combinatorial site matrix — every coast shape × river set runs without NaN /
// crash and yields a tagged, non-empty urban core, with rivers on the grid that
// stop at the shoreline. This is the regression net that must stay green before
// S4 (walls/streets) is built on top.

import { describe, expect, it } from "vitest";
import { nearestOnPolyline, pointInPolygon } from "../core/geom";
import { generateCity } from "../core/pipeline";
import type { CellTag, Point } from "../core/types";
import { type CoastShape, DEFAULT_SITE_CONFIG, type RiverShape, type SiteConfig } from "./siteConfig";
import { siteToGeography, siteToParams } from "./siteInput";
import { synthSite } from "./synthSite";

const COASTS: CoastShape[] = ["none", "straight", "bay", "cape"];
const RIVER_SETS: RiverShape[][] = [
  [],
  ["through"],
  ["beside"],
  ["toCoast"],
  ["straight"],
  ["meander"],
  ["greatBend"],
  ["through", "through"],
  ["through", "toCoast"],
  ["meander", "meander"]
];
const VALID_TAGS: CellTag[] = ["land", "sea", "urban", "outskirts", "rural"];

const combos: SiteConfig[] = [];
for (const coast of COASTS) {
  for (const rivers of RIVER_SETS) combos.push({ ...DEFAULT_SITE_CONFIG, coast, rivers, relief: false });
}

const finite = (n: number): boolean => Number.isFinite(n);

describe("site matrix", () => {
  it.each(combos)("%j runs and produces a valid tagged map", config => {
    for (const seed of ["s1", "s2"]) {
      const site = synthSite("smallCity", config, seed);
      const result = generateCity(siteToParams(site), siteToGeography(site));

      expect(result.steps).toHaveLength(6);
      for (const step of result.steps) {
        expect(step.cells).toHaveLength(result.cells.length);
        for (const cell of step.cells) {
          expect(VALID_TAGS).toContain(cell.tag);
          expect(cell.polygon.every(([x, y]) => finite(x) && finite(y))).toBe(true);
        }
      }

      const finalTags = result.steps[3].cells;
      expect(finalTags.filter(c => c.tag === "urban").length).toBeGreaterThanOrEqual(1);

      // every routed river lies on the grid (vertices near cell vertices)
      const cellVerts = result.cells.flatMap(c => c.polygon);
      for (const path of result.riverPaths) {
        expect(path.points.length).toBeGreaterThanOrEqual(3);
        const maxToVert = Math.max(
          ...path.points.map(p => Math.min(...cellVerts.map(v => Math.hypot(v[0] - p[0], v[1] - p[1]))))
        );
        expect(maxToVert).toBeLessThan(result.params.cellSizeMeters * 1.5);
      }

      const seaCount = result.steps[1].cells.filter(c => c.tag === "sea").length;
      if (config.coast === "none") expect(seaCount).toBe(0);
      else expect(seaCount).toBeGreaterThan(0);

      // landlocked rivers are always placeable; a coast may drop an offshore one
      if (config.coast === "none") expect(result.riverPaths.length).toBe(config.rivers.length);
      else expect(result.riverPaths.length).toBeLessThanOrEqual(config.rivers.length);

      // a river reaches the sea and stops at the edge: its mouth touches the
      // shoreline, and nothing runs out across the open water.
      if (result.waterPolygon && result.shoreline) {
        const wp = result.waterPolygon;
        const sl = result.shoreline;
        const cell = result.params.cellSizeMeters;
        for (const path of result.riverPaths) {
          expect(nearestOnPolyline(path.points[path.points.length - 1], sl).dist).toBeLessThan(cell * 2.5);
          const deep = path.points.filter(
            p => pointInPolygon(p, wp) && nearestOnPolyline(p, sl).dist > cell * 2
          ).length;
          expect(deep).toBe(0);
        }
      }
    }
  });

  it("through river with a coast flows out to sea", () => {
    for (const coast of ["straight", "bay", "cape"] as const) {
      for (const seed of ["1809gwj", "m8ss9r", "wo2e70"]) {
        const site = synthSite(
          "smallCity",
          { ...DEFAULT_SITE_CONFIG, coast, rivers: ["through"], relief: false },
          seed
        );
        const result = generateCity(siteToParams(site), siteToGeography(site));
        expect(result.riverPaths.length).toBe(1);
        const mouth = result.riverPaths[0].points.at(-1) as Point;
        expect(nearestOnPolyline(mouth, result.shoreline as Point[]).dist).toBeLessThan(
          result.params.cellSizeMeters * 2.5
        );
      }
    }
  });

  it("both ends of every rendered river are resolved — at a map edge or the sea", () => {
    // The endpoint invariant (riverPath.finalizeEnds). Regression net for a run of
    // reports: greatBend/beside stopping short (lgds9i), the stranded cape stub
    // (1btkcma), the long oblique bridge ignoring the grid (k9eeoz), and the
    // upstream end drawn straight off-map (ffn8b) — the last two on `relief`,
    // which is part of the RNG seed so it is a distinct config space.
    const shapes: RiverShape[] = ["meander", "greatBend", "beside", "toCoast"];
    for (const coast of COASTS) {
      for (const shape of shapes) {
        for (const seed of ["1btkcma", "lgds9i", "k9eeoz", "ffn8b"]) {
          for (const relief of [false, true]) {
            const config: SiteConfig = { ...DEFAULT_SITE_CONFIG, coast, rivers: [shape, "through"], relief };
            const result = generateCity(...runArgs("smallCity", config, seed));
            const half = result.params.extentMeters / 2;
            const cell = result.params.cellSizeMeters;
            const wp = result.waterPolygon;
            const sl = result.shoreline;
            for (const path of result.riverPaths) {
              const gap = (p: Point): number => Math.min(half - Math.abs(p[0]), half - Math.abs(p[1]));
              const resolved = (p: Point): boolean =>
                gap(p) < cell * 1.8 ||
                (wp != null && pointInPolygon(p, wp)) ||
                (sl != null && nearestOnPolyline(p, sl).dist < cell * 1.8);
              expect(resolved(path.points[0])).toBe(true);
              expect(resolved(path.points[path.points.length - 1])).toBe(true);
              // no single segment is a long straight bridge that skips the cell grid
              const maxSeg = Math.max(
                ...path.points.slice(1).map((p, i) => Math.hypot(p[0] - path.points[i][0], p[1] - path.points[i][1]))
              );
              expect(maxSeg).toBeLessThan(cell * 9.5);
            }
            if (coast === "none") expect(result.riverPaths.length).toBe(2);
          }
        }
      }
    }
  }, 20000);
});

function runArgs(preset: "smallCity", config: SiteConfig, seed: string) {
  const site = synthSite(preset, config, seed);
  return [siteToParams(site), siteToGeography(site)] as const;
}
