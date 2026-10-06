import { describe, expect, it } from "vitest";
import { worldContext } from "../../../context/worldContext";
import { buildRegionSiteDescriptor } from "../../../controllers/region-editor-handshake";
import { getCoastalHabitatCode } from "../../../data/coastalHabitatCatalog";
import { renderRegionSvg } from "../../render/svg";
import { generateFromFmgDescriptor } from "./pipeline";

describe("FMG coastal habitats in RE", () => {
  it("preserves ocean edges and habitat through generation and SVG rendering, excluding lakes", () => {
    const originalPack = worldContext.pack;
    const originalBiomes = worldContext.biomesData;
    const originalGrid = worldContext.grid;
    try {
      worldContext.biomesData = { name: ["Water", "Grassland"] } as any;
      worldContext.grid = { cells: {}, points: [] } as any;
      worldContext.pack = {
        provinces: [undefined, { i: 1, name: "Coast", state: 0, center: 0 }],
        states: [],
        burgs: [],
        rivers: [],
        routes: [],
        features: [{ type: "land" }, { type: "ocean" }, { type: "lake" }],
        vertices: {
          p: [
            [100, 100],
            [110, 100],
            [110, 110],
            [100, 110],
            [120, 100],
            [120, 110],
            [100, 120],
            [110, 120]
          ]
        },
        cells: {
          i: [0, 1, 2],
          p: [
            [105, 105],
            [115, 105],
            [105, 115]
          ],
          c: [[1, 2], [0], [0]],
          h: [25, 10, 10],
          r: [],
          f: [0, 1, 2],
          v: [
            [0, 1, 2, 3],
            [1, 4, 5, 2],
            [3, 2, 7, 6]
          ],
          province: [1, 0, 0],
          state: [0, 0, 0],
          biomeCode: [1, 0, 0],
          coastalHabitat: [getCoastalHabitatCode("sandyBeach"), 0, 0]
        }
      } as any;
      const site = buildRegionSiteDescriptor(1)!;
      // Lake shores are coastline edges (smoothed like sea coasts) but carry no habitat band
      expect(site.coastlines).toEqual([
        [
          [110, 100],
          [110, 110]
        ],
        [
          [110, 110],
          [100, 110]
        ]
      ]);
      expect(site.coastalHabitats!.map(h => h.points)).toEqual([
        [
          [110, 100],
          [110, 110]
        ]
      ]);
      expect(site.cells.find(c => c.sourceCellId === 0)?.coastalHabitat).toBe(getCoastalHabitatCode("sandyBeach"));
      for (const key of ["sandyBeach", "rockyIntertidal", "tidalFlat", "coastalDune"] as const) {
        site.coastalHabitats![0].coastalHabitat = getCoastalHabitatCode(key);
        const doc = generateFromFmgDescriptor(site);
        expect(doc.terrain.coastalHabitats![0].points).toEqual(doc.terrain.coastlinePolygons[0]);
        expect(renderRegionSvg(doc)).toContain(`data-coastal-habitat="${key}"`);
        expect(renderRegionSvg(doc)).toContain('clip-path="url(#re-coastal-habitat-0)"');
      }
      delete site.coastalHabitats;
      expect(renderRegionSvg(generateFromFmgDescriptor(site))).not.toContain("data-coastal-habitat=");
    } finally {
      worldContext.pack = originalPack;
      worldContext.biomesData = originalBiomes;
      worldContext.grid = originalGrid;
    }
  });
});
