import { describe, expect, it } from "vitest";
import { STANDARD_BIOME_DEFINITIONS } from "../../../data/biomeCatalog";
import { renderRegionSvg } from "../../render/svg";
import { createEmptyRegionDocument } from "../document";
import type { Point, RegionSiteCell } from "../types";
import {
  buildLandscapeFromCells,
  CE_BIOME_PALETTE,
  CE_SEA_COLOR,
  isForestBiome,
  resolveCellLandscape
} from "./landscapeBiomes";

describe("landscapeBiomes (CE Biome & Landscape Alignment)", () => {
  it("海セルをCEの海色 (#456d7f) として解決し、シンボルを配置しない", () => {
    const sea1 = resolveCellLandscape("Marine", -5, true);
    expect(sea1.isWater).toBe(true);
    expect(sea1.fillColor).toBe(CE_SEA_COLOR);
    expect(sea1.fillColor).toBe("#456d7f");
    expect(sea1.kind).toBe("ocean");
    expect(sea1.symbolTypes).toHaveLength(0);

    const sea2 = resolveCellLandscape("Oceanic Trench", -200, false);
    expect(sea2.isWater).toBe(true);
    expect(sea2.fillColor).toBe("#456d7f");
  });

  it("CEの各陸地バイオーム色とシンボル候補を正確に解決する", () => {
    // 砂漠
    const desert = resolveCellLandscape("Hot desert", 150, false);
    expect(desert.fillColor).toBe(CE_BIOME_PALETTE.desert);
    expect(desert.fillColor).toBe("#e8ddba");
    expect(desert.symbolTypes).toContain("cactus");
    expect(desert.symbolTypes).toContain("sand_dune");

    // 針葉樹林 / タイガ
    const taiga = resolveCellLandscape("Taiga", 300, false);
    expect(taiga.fillColor).toBe(CE_BIOME_PALETTE.coniferous_forest);
    expect(taiga.fillColor).toBe("#b5c4a7");
    expect(taiga.symbolTypes).toContain("tree_pine");

    // サバナ
    const savanna = resolveCellLandscape("Savanna", 200, false);
    expect(savanna.fillColor).toBe(CE_BIOME_PALETTE.savanna);
    expect(savanna.fillColor).toBe("#ded8aa");
    expect(savanna.symbolTypes).toContain("tree_acacia");

    // 熱帯雨林
    const tropical = resolveCellLandscape("Tropical rainforest", 100, false);
    expect(tropical.fillColor).toBe(CE_BIOME_PALETTE.tropical_forest);
    expect(tropical.fillColor).toBe("#b9cca0");
    expect(tropical.symbolTypes).toContain("tree_palm");

    // 湿原
    const swamp = resolveCellLandscape("Swamp", 50, false);
    expect(swamp.fillColor).toBe(CE_BIOME_PALETTE.swamp);
    expect(swamp.fillColor).toBe("#b4c5a5");
    expect(swamp.symbolTypes).toContain("swamp_grass");

    // 草原
    const grassland = resolveCellLandscape("Grassland", 200, false);
    expect(grassland.fillColor).toBe(CE_BIOME_PALETTE.grassland);
    expect(grassland.fillColor).toBe("#d2dab2");

    // 標高2000m以上の雪山
    const alpine = resolveCellLandscape("Grassland", 2500, false);
    expect(alpine.kind).toBe("snow_mountains");
    expect(alpine.symbolTypes).toContain("mountain_snow");
  });

  it("buildLandscapeFromCells で海セルと陸地セルからバイオーム面とシンボルを構築する", () => {
    const dummyPoly: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ];
    const cells: RegionSiteCell[] = [
      {
        cellId: 1,
        point: [50, 50],
        elevationMeters: -10,
        biomeName: "Marine",
        polygon: dummyPoly,
        isWater: true,
        height: 10
      },
      {
        cellId: 2,
        point: [150, 150],
        elevationMeters: 200,
        biomeName: "Hot desert",
        polygon: dummyPoly.map(([x, y]) => [x + 100, y + 100] as Point),
        isWater: false,
        height: 35
      },
      {
        cellId: 3,
        point: [250, 250],
        elevationMeters: 2200,
        biomeName: "Grassland",
        polygon: dummyPoly.map(([x, y]) => [x + 200, y + 200] as Point),
        isWater: false,
        height: 80
      }
    ];

    const toLocal = (p: Point): Point => [p[0], p[1]];
    const { biomes, symbols } = buildLandscapeFromCells(cells, toLocal, "test-seed");

    // バイオーム面の検証
    expect(biomes).toHaveLength(3);
    const seaBiome = biomes.find(b => b.kind === "ocean");
    expect(seaBiome).toBeDefined();
    expect(seaBiome?.color).toBe("#456d7f");
    expect(seaBiome?.isWater).toBe(true);

    const desertBiome = biomes.find(b => b.kind === "desert");
    expect(desertBiome).toBeDefined();
    expect(desertBiome?.color).toBe("#e8ddba");

    const mtnBiome = biomes.find(b => b.kind === "snow_mountains");
    expect(mtnBiome).toBeDefined();

    // シンボルの検証（海セルにはシンボルが配置されない）
    const seaSymbols = symbols.filter(s => s.x < 100 && s.y < 100);
    expect(seaSymbols).toHaveLength(0);

    // 陸地セルのシンボルが存在すること
    expect(symbols.length).toBeGreaterThan(0);

    // シンボルが Y 昇順でソートされていること
    for (let i = 1; i < symbols.length; i++) {
      expect(symbols[i].y).toBeGreaterThanOrEqual(symbols[i - 1].y);
    }
  });

  it("森林セルでは一本木の個別シンボルを散布せず、上空視点の一体化キャノピーとして解決されること", () => {
    const dummyPoly: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ];
    const forestCells: RegionSiteCell[] = [
      {
        cellId: 10,
        point: [50, 50],
        elevationMeters: 120,
        biomeName: "Temperate deciduous forest",
        polygon: dummyPoly,
        isWater: false,
        height: 25
      },
      {
        cellId: 11,
        point: [150, 50],
        elevationMeters: 200,
        biomeName: "Taiga",
        polygon: dummyPoly.map(([x, y]) => [x + 100, y] as Point),
        isWater: false,
        height: 30
      },
      {
        cellId: 12,
        point: [250, 50],
        elevationMeters: 80,
        biomeName: "Tropical rainforest",
        polygon: dummyPoly.map(([x, y]) => [x + 200, y] as Point),
        isWater: false,
        height: 22
      }
    ];

    const toLocal = (p: Point): Point => [p[0], p[1]];
    const { biomes, symbols } = buildLandscapeFromCells(forestCells, toLocal, "forest-test-seed");

    expect(biomes).toHaveLength(3);
    expect(biomes[0].kind).toBe("deciduous_forest");
    expect(biomes[1].kind).toBe("coniferous_forest");
    expect(biomes[2].kind).toBe("tropical_forest");

    // 森林セルには木シンボルが無数に配置されず0件であること（上空視点キャノピーとして一体描画される）
    expect(symbols).toHaveLength(0);
  });
});

describe("catalog biome visuals", () => {
  it.each(STANDARD_BIOME_DEFINITIONS)("renders $key with catalog color and forest identity", definition => {
    const cell: RegionSiteCell = {
      sourceCellId: 1,
      biomeId: 99,
      biomeName: "Renamed biome",
      biomeDefinition: definition,
      point: [50, 50],
      elevationMeters: 100,
      height: definition.key === "marine" ? 10 : 25,
      forestCover: 1,
      polygon: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100]
      ]
    };
    const landscape = buildLandscapeFromCells([cell], p => p, "catalog-test");
    const biome = landscape.biomes[0];
    expect(isForestBiome(biome.kind)).toBe(definition.tags.includes("forest"));
    expect(biome.isWater).toBe(definition.key === "marine");
    expect(biome.color).toBe(definition.key === "marine" ? CE_SEA_COLOR : definition.color);
    const doc = createEmptyRegionDocument();
    doc.biomes = landscape.biomes;
    doc.symbols = landscape.symbols;
    const svg = renderRegionSvg(doc);
    expect(svg).toContain(`fill="${biome.color}"`);
    if (definition.tags.includes("forest")) {
      expect(biome.forestPolygons).toHaveLength(1);
      expect(svg).toContain(`forest-canopy-cell forest-${biome.kind}`);
    }
  });

  it("recognizes flooded forest in legacy descriptors before wetland", () => {
    expect(resolveCellLandscape("Flooded forest & riparian woodland", 50, false).kind).toBe("deciduous_forest");
    expect(resolveCellLandscape("Temperate rainforest", 50, false).kind).toBe("deciduous_forest");
  });
});
