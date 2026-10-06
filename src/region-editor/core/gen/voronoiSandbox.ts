import { buildGrid } from "../../../city-editor/core/gen/grid";
import { makeRng } from "../../../city-editor/core/gen/prng";
import type { Cell, CityGeography, Point } from "../../../city-editor/core/gen/types";
import { STANDARD_BIOME_DEFINITIONS } from "../../../data/biomeCatalog";
import { forestAttributesForKey } from "../../../generators/biomeAttributes";
import type { RegionDocument, RegionSiteCell, RegionSiteDescriptor } from "../types";
import { REGION_SITE_VERSION } from "../types";
import { generateFromFmgDescriptor } from "./pipeline";

/** FMG へ行かず RE 単体で森林・バイオーム描画を確認するための、CE と同じ Voronoi グリッドの実験地図 */
export interface VoronoiSandboxOptions {
  seed: string;
  /** 生成するセル数（1〜MAX_SANDBOX_CELLS）。中心に近い順に残す */
  cellCount: number;
  /** 地図の一辺（km） */
  extentKm: number;
  /** セルごとのバイオーム。足りない分は最後の指定を使う */
  biomeKeys: string[];
  elevationMeters: number;
}

export const MAX_SANDBOX_CELLS = 12;
export const DEFAULT_SANDBOX_OPTIONS: VoronoiSandboxOptions = {
  seed: "voronoi-sandbox",
  cellCount: 1,
  extentKm: 10,
  biomeKeys: ["temperateDeciduousForest"],
  elevationMeters: 100
};

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };

/** 陸のバイオームだけを選択肢にする（海は森林確認の対象外） */
export const SANDBOX_BIOMES = STANDARD_BIOME_DEFINITIONS.filter(d => d.key !== "marine");

/** CE と同じ buildGrid で、おおよそ count 個のセルを持つ Voronoi を作り、中心に近い count 個を返す */
export function buildSandboxCells(seed: string, extentMeters: number, count: number): Cell[] {
  let cellSize = (extentMeters / Math.sqrt(count)) * 1.1;
  let cells: Cell[] = [];
  for (let i = 0; i < 40; i++) {
    cells =
      buildGrid(
        {
          seed,
          extentMeters,
          cityRadiusMeters: extentMeters * 0.33,
          cellSizeMeters: cellSize,
          lloydPasses: 1
        },
        EMPTY_GEO,
        makeRng(seed)
      ).at(-1)?.cells ?? [];
    if (cells.length >= count) break;
    cellSize *= 0.9;
  }
  const dist = (c: Cell) => Math.hypot(c.centroid[0], c.centroid[1]);
  return [...cells].sort((a, b) => dist(a) - dist(b)).slice(0, count);
}

export function buildVoronoiSandboxDescriptor(options: VoronoiSandboxOptions): RegionSiteDescriptor {
  const count = Math.max(1, Math.min(MAX_SANDBOX_CELLS, Math.round(options.cellCount)));
  const extent = Math.max(1, options.extentKm) * 1000;
  const half = extent / 2;
  // buildGrid は中心原点なので、左上原点（RE の座標系）へずらす。1 地図単位 = 1 m
  const shift = (p: Point): Point => [p[0] + half, p[1] + half];

  const cells: RegionSiteCell[] = buildSandboxCells(options.seed, extent, count).map((cell, i) => {
    const key = options.biomeKeys[Math.min(i, options.biomeKeys.length - 1)] ?? "grassland";
    const def = STANDARD_BIOME_DEFINITIONS.find(d => d.key === key) ?? STANDARD_BIOME_DEFINITIONS[0];
    const isForest = def.tags.includes("forest");
    const attr = isForest ? forestAttributesForKey(def.key) : undefined;
    return {
      point: shift(cell.site),
      polygon: cell.polygon.map(shift),
      sourceCellId: i,
      elevationMeters: options.elevationMeters,
      height: 30,
      biomeId: STANDARD_BIOME_DEFINITIONS.indexOf(def),
      biomeName: def.label,
      biomeDefinition: def,
      isWater: false,
      forestCover: attr?.cover ?? 0
    };
  });

  return {
    version: REGION_SITE_VERSION,
    sourceSeed: options.seed,
    provinceName: "Voronoi Sandbox",
    boundsMapUnits: [0, 0, extent, extent],
    metersPerMapUnit: 1,
    extentMeters: { width: extent, height: extent },
    coastlines: [],
    lakes: [],
    rivers: [],
    burgs: [],
    roads: [],
    cells
  };
}

export function generateVoronoiSandbox(options: VoronoiSandboxOptions): RegionDocument {
  return generateFromFmgDescriptor(buildVoronoiSandboxDescriptor(options));
}
