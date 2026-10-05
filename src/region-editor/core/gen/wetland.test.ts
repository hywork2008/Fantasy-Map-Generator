import { describe, expect, it } from "vitest";
import { STANDARD_BIOME_DEFINITIONS } from "../../../data/biomeCatalog";
import { getCoastalHabitatCode } from "../../../data/coastalHabitatCatalog";
import { renderRegionSvg } from "../../render/svg";
import { createEmptyRegionDocument } from "../document";
import type { RegionSiteCell } from "../types";
import { buildLandscapeFromCells } from "./landscapeBiomes";
import { polygonArea } from "./landUseGeometry";
import { buildWetlandPatches } from "./wetland";

const cell: RegionSiteCell = {
  biomeId: 12,
  biomeName: "Wetland",
  point: [2, 2],
  elevationMeters: 30,
  height: 25,
  polygon: [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4]
  ],
  annualPrecipitationMm: 900
};
const area = (patches: ReturnType<typeof buildWetlandPatches>) =>
  patches.filter(p => p.kind === "water").reduce((sum, p) => sum + polygonArea(p.polygon), 0);

describe("wetland mosaics", () => {
  it("persists deterministic, bounded pools and mud, with grass left between them", () => {
    const patches = buildWetlandPatches(cell, [cell], "wetland-test", 1000);
    expect(patches).toEqual(buildWetlandPatches(cell, [cell], "wetland-test", 1000));
    expect(area(patches)).toBeGreaterThan(0);
    expect(area(patches)).toBeLessThan(16);
    expect(patches.some(p => p.kind === "mud")).toBe(true);
    expect(patches.some(p => p.kind === "sand")).toBe(false);
    for (const patch of patches)
      for (const [x, y] of patch.polygon) {
        expect(x).toBeGreaterThanOrEqual(-1e-8);
        expect(x).toBeLessThanOrEqual(4 + 1e-8);
        expect(y).toBeGreaterThanOrEqual(-1e-8);
        expect(y).toBeLessThanOrEqual(4 + 1e-8);
      }
    expect(patches.reduce((sum, p) => sum + polygonArea(p.polygon), 0)).toBeLessThanOrEqual(16);
  });
  it("increases inundation with rainfall and nearby water", () => {
    const dry = buildWetlandPatches({ ...cell, annualPrecipitationMm: 100 }, [cell], "wetland-test", 1000);
    const rainy = buildWetlandPatches({ ...cell, annualPrecipitationMm: 1700 }, [cell], "wetland-test", 1000);
    expect(area(rainy)).toBeGreaterThan(area(dry));
    const coastal = buildWetlandPatches(
      cell,
      [cell, { ...cell, point: [4, 2], isWater: true, height: 10 }],
      "wetland-test",
      1000
    );
    expect(area(coastal)).toBeGreaterThan(area(buildWetlandPatches(cell, [cell], "wetland-test", 1000)));
  });
  it("requires sandy habitat for exposed sand and keeps tidal flats muddy", () => {
    const sandy = buildWetlandPatches(
      { ...cell, coastalHabitat: getCoastalHabitatCode("sandyBeach") },
      [cell],
      "wetland-test",
      1000
    );
    expect(sandy.some(p => p.kind === "sand")).toBe(true);
    const tidal = buildWetlandPatches(
      { ...cell, coastalHabitat: getCoastalHabitatCode("tidalFlat") },
      [cell],
      "wetland-test",
      1000
    );
    expect(tidal.some(p => p.kind === "sand")).toBe(false);
  });
  it("renders wetland forest pools below canopy and clears trees from water", () => {
    const forest = {
      ...cell,
      forestCover: 1,
      biomeDefinition: STANDARD_BIOME_DEFINITIONS.find(d => d.key === "floodedForest")
    };
    const landscape = buildLandscapeFromCells([forest], p => p, "wetland-test", 1000);
    const doc = createEmptyRegionDocument();
    doc.biomes = landscape.biomes;
    const svg = renderRegionSvg(doc);
    expect(svg).toContain('id="layer-wetlands"');
    expect(svg).toContain('class="wetland-water"');
    expect(svg).toContain('class="wetland-mud"');
    expect(svg).toContain("forest-canopy-cell");
    expect(renderRegionSvg(doc, null, { zoom: 0.4 })).toContain('class="wetland-water"');
    expect(renderRegionSvg(JSON.parse(JSON.stringify(doc)))).toContain('class="wetland-water"');
    expect(
      buildLandscapeFromCells([{ ...cell, biomeName: "Grassland" }], p => p, "wetland-test").biomes[0].wetlandPatches
    ).toBeUndefined();
  });
  it("scatters reed marks over a wide wetland, seamlessly and deterministically", () => {
    const wide = {
      ...cell,
      point: [30, 30] as [number, number],
      polygon: [
        [0, 0],
        [60, 0],
        [60, 60],
        [0, 60]
      ] as [number, number][]
    };
    const landscape = buildLandscapeFromCells([{ ...wide, biomeName: "Wetland" }], p => p, "wetland-test", 1000);
    const doc = createEmptyRegionDocument();
    doc.biomes = landscape.biomes;
    const svg = renderRegionSvg(doc, null, { quality: "high" });
    expect(svg).toContain('class="wetland-reeds"');
    expect(svg).toContain('class="wetland-bank"');
    expect(renderRegionSvg(doc, null, { quality: "high" })).toBe(svg);
    const low = renderRegionSvg(doc);
    expect(low).toContain('fill="url(#re-wetland-marks)"');
    expect(low).not.toContain('class="wetland-bank"');
    expect(low.length).toBeLessThan(svg.length);
  });
});
