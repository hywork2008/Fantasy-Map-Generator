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
const levels = (patches: ReturnType<typeof buildWetlandPatches>) =>
  [...new Set(patches.map(p => p.level))].sort((a, b) => (a ?? 0) - (b ?? 0));
const levelArea = (patches: ReturnType<typeof buildWetlandPatches>, level: number) =>
  patches.filter(p => p.level === level).reduce((sum, p) => sum + polygonArea(p.polygon), 0);

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
    // 各段階は入れ子の面なので、段階が上がるほど面積は単調に減り、どれもセルを超えない
    const found = levels(patches) as number[];
    for (const level of found) expect(levelArea(patches, level)).toBeLessThanOrEqual(16 + 1e-6);
    for (let i = 1; i < found.length; i++)
      expect(levelArea(patches, found[i])).toBeLessThanOrEqual(levelArea(patches, found[i - 1]) + 1e-6);
  });
  it("keeps open water a minority of an average wetland instead of flooding it", () => {
    const patches = buildWetlandPatches(cell, [cell], "wetland-test", 1000);
    expect(area(patches)).toBeLessThan(16 * 0.4);
  });
  it("draws between 5 and 10 inundation levels depending on climate, surroundings and temperature", () => {
    const count = (c: RegionSiteCell, others: RegionSiteCell[] = [c]) =>
      levels(buildWetlandPatches(c, others, "wetland-test", 1000)).length;
    const arid = count({
      ...cell,
      annualPrecipitationMm: 200,
      annualTemperatureC: 25
    });
    const humid = count({
      ...cell,
      annualPrecipitationMm: 2200,
      annualTemperatureC: 5
    });
    expect(arid).toBeGreaterThanOrEqual(5);
    expect(humid).toBeGreaterThan(arid);
    expect(humid).toBeLessThanOrEqual(10);
    // 同じ降水量でも高温（蒸発散が大きい）ほど冠水は浅い
    const hot = buildWetlandPatches({ ...cell, annualTemperatureC: 28 }, [cell], "wetland-test", 1000);
    const cold = buildWetlandPatches({ ...cell, annualTemperatureC: 2 }, [cell], "wetland-test", 1000);
    expect(Math.max(...(levels(cold) as number[]))).toBeGreaterThan(Math.max(...(levels(hot) as number[])));
    // 周囲の乾燥度: 乾いた土地に囲まれた湿地は水が少ない
    const dryNeighbour = {
      ...cell,
      point: [6, 2] as [number, number],
      annualPrecipitationMm: 150
    };
    const wetNeighbour = {
      ...cell,
      point: [6, 2] as [number, number],
      annualPrecipitationMm: 2000
    };
    expect(count(cell, [cell, wetNeighbour])).toBeGreaterThanOrEqual(count(cell, [cell, dryNeighbour]));
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
    expect(svg).toContain("wetland-mud wetland-level-");
    expect(svg).toContain("wetland-level-0");
    expect(svg).toContain("forest-canopy-cell");
    expect(renderRegionSvg(doc, null, { zoom: 0.4 })).toContain("wetland-level-");
    expect(renderRegionSvg(JSON.parse(JSON.stringify(doc)))).toContain("wetland-level-");
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
  });
});
