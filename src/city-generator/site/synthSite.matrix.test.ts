// Combinatorial site matrix — every coast shape × river set runs without NaN /
// crash and yields a tagged, non-empty urban core, with rivers on the grid that
// stop at the shoreline. This is the regression net that must stay green before
// S4 (walls/streets) is built on top.

import { describe, expect, it } from "vitest";
import { nearestOnPolyline, pointInPolygon } from "../core/geom";
import { generateCity } from "../core/pipeline";
import type { CellTag, Point } from "../core/types";
import type { CoastShape, RiverShape, SiteConfig } from "./siteConfig";
import { siteToGeography, siteToParams } from "./siteInput";
import { synthSite } from "./synthSite";

const COASTS: CoastShape[] = ["none", "straight", "bay", "cape"];
const RIVER_SETS: RiverShape[][] = [
  [],
  ["through"],
  ["beside"],
  ["toCoast"],
  ["through", "through"],
  ["through", "toCoast"]
];
const VALID_TAGS: CellTag[] = ["land", "sea", "water", "urban", "outskirts", "rural"];

const combos: SiteConfig[] = [];
for (const coast of COASTS) {
  for (const rivers of RIVER_SETS) combos.push({ coast, rivers, relief: false });
}

const finite = (n: number): boolean => Number.isFinite(n);

describe("site matrix", () => {
  it.each(combos)("%j runs and produces a valid tagged map", config => {
    for (const seed of ["s1", "s2"]) {
      const site = synthSite("smallCity", config, seed);
      const result = generateCity(siteToParams(site), siteToGeography(site));

      expect(result.steps).toHaveLength(4);
      for (const step of result.steps) {
        expect(step.cells).toHaveLength(result.cells.length);
        for (const cell of step.cells) {
          expect(VALID_TAGS).toContain(cell.tag);
          expect(cell.polygon.every(([x, y]) => finite(x) && finite(y))).toBe(true);
        }
      }

      const finalTags = result.steps[3].cells;
      expect(finalTags.filter(c => c.tag === "urban").length).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < finalTags.length; i++) {
        if (finalTags[i].tag === "urban") expect(["sea", "water"]).not.toContain(finalTags[i].tag);
      }

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
      if (config.coast === "none" && config.rivers.some(s => s === "through")) {
        expect(result.steps[2].cells.filter(c => c.tag === "water").length).toBeGreaterThan(0);
      }

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
        const site = synthSite("smallCity", { coast, rivers: ["through"], relief: false }, seed);
        const result = generateCity(siteToParams(site), siteToGeography(site));
        expect(result.riverPaths.length).toBe(1);
        const mouth = result.riverPaths[0].points.at(-1) as Point;
        expect(nearestOnPolyline(mouth, result.shoreline as Point[]).dist).toBeLessThan(
          result.params.cellSizeMeters * 2.5
        );
      }
    }
  });
});
