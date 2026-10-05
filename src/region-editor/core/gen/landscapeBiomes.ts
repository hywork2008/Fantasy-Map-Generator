import { STANDARD_BIOME_DEFINITIONS } from "../../../data/biomeCatalog";
import type { BiomeDefinition, StandardBiomeKey } from "../../../types/biome";
import type { BiomeKind, Point, RegionBiomeArea, RegionSiteCell, RegionSymbol, SymbolType } from "../types";
import { clipConvex, landscapeNoise, polygonArea, rectangle } from "./landUseGeometry";
import { makeRng } from "./prng";

/**
 * City Editor (CE) 準拠の海・水域カラー
 * .ce-svg--town .ce-face--sea { fill: #456d7f; }
 */
export const CE_SEA_COLOR = "#456d7f";
export const CE_LAKE_COLOR = "#527f8b";

/**
 * City Editor (CE) の resolveLandscapeTheme 準拠のバイオーム色彩パレット
 */
export const CE_BIOME_PALETTE: Record<BiomeKind, string> = {
  ocean: CE_SEA_COLOR,
  grassland: "#d2dab2",
  deciduous_forest: "#c2d4ac",
  coniferous_forest: "#b5c4a7",
  tropical_forest: "#b9cca0",
  savanna: "#ded8aa",
  desert: "#e8ddba",
  swamp: "#b4c5a5",
  marsh: "#adbe9e",
  tundra: "#c9beaa",
  glacier: "#d8e5e8",
  snow_mountains: "#d8e5e8",
  hills: "#cfcaa8",
  mountains: "#b5a897",
  badlands: "#ded8aa"
};

// Every standard catalog key has an explicit visual family. Forest identity must
// not depend on overlapping words such as "flooded", "tropical" or "forest-steppe".
const STANDARD_VISUAL_KINDS = {
  marine: "ocean",
  hotDesert: "desert",
  coldDesert: "desert",
  savanna: "savanna",
  grassland: "grassland",
  tropicalSeasonalForest: "tropical_forest",
  temperateDeciduousForest: "deciduous_forest",
  tropicalRainforest: "tropical_forest",
  temperateRainforest: "deciduous_forest",
  taiga: "coniferous_forest",
  tundra: "tundra",
  glacier: "glacier",
  wetland: "swamp",
  centralEuropeanGreatForest: "deciduous_forest",
  mediterraneanWoodlandScrub: "savanna",
  temperateConiferousForest: "coniferous_forest",
  montaneForest: "coniferous_forest",
  alpineTundra: "tundra",
  mangrove: "tropical_forest",
  xericShrubland: "desert",
  cloudForest: "tropical_forest",
  heathMoorland: "marsh",
  floodedForest: "deciduous_forest",
  coldSteppe: "grassland",
  tropicalDryForest: "tropical_forest",
  borealPeatland: "marsh",
  volcanicBarrens: "badlands",
  lavaField: "badlands",
  volcanicSoil: "grassland"
} satisfies Record<StandardBiomeKey, BiomeKind>;

const RELIEF_SYMBOLS: Record<string, SymbolType> = {
  dune: "sand_dune",
  cactus: "cactus",
  deadTree: "tree_dead",
  acacia: "tree_acacia",
  grass: "grass_tuft",
  palm: "tree_palm",
  deciduous: "tree_deciduous",
  conifer: "tree_pine",
  swamp: "marsh_reed",
  vulcan: "rock_cluster"
};

function catalogLandscape(definition: BiomeDefinition): ResolvedCellLandscape {
  const tags = definition.tags;
  const kind =
    STANDARD_VISUAL_KINDS[definition.key as StandardBiomeKey] ??
    (tags.includes("marine")
      ? "ocean"
      : tags.includes("forest")
        ? tags.includes("tropical")
          ? "tropical_forest"
          : tags.includes("cold")
            ? "coniferous_forest"
            : "deciduous_forest"
        : tags.includes("snow")
          ? "glacier"
          : tags.includes("wetland")
            ? "marsh"
            : tags.includes("desert")
              ? "desert"
              : tags.includes("cold")
                ? "tundra"
                : "grassland");
  const symbolTypes = Object.entries(definition.relief.icons).flatMap(([icon, weight]) =>
    RELIEF_SYMBOLS[icon] ? Array.from({ length: Math.max(0, Math.round(weight)) }, () => RELIEF_SYMBOLS[icon]) : []
  );
  return {
    kind,
    fillColor: kind === "ocean" ? CE_SEA_COLOR : definition.color,
    isWater: kind === "ocean",
    symbolTypes
  };
}

export interface ResolvedCellLandscape {
  kind: BiomeKind;
  fillColor: string;
  isWater: boolean;
  symbolTypes: SymbolType[];
}

/**
 * FMG のバイオーム名と標高から、CE 準拠の風景テーマ・カラー・シンボル候補を判定
 */
export function resolveCellLandscape(
  biomeName: string,
  elevationMeters: number,
  isWater: boolean
): ResolvedCellLandscape {
  const name = biomeName.toLowerCase();

  // 海洋・水域セル
  if (isWater || elevationMeters < 0 || name.includes("marine") || name.includes("ocean") || name.includes("water")) {
    return {
      kind: "ocean",
      fillColor: CE_SEA_COLOR,
      isWater: true,
      symbolTypes: []
    };
  }

  // バイオーム名準拠の分類（CE landscape.ts と完全一致）
  if (
    name.includes("hot desert") ||
    name.includes("cold desert") ||
    name.includes("desert") ||
    name.includes("dune") ||
    name.includes("xeric")
  ) {
    return {
      kind: "desert",
      fillColor: CE_BIOME_PALETTE.desert,
      isWater: false,
      symbolTypes: ["sand_dune", "cactus", "tree_dead", "rock_cluster"]
    };
  }

  if (name.includes("glacier") || name.includes("snowfield") || name.includes("ice")) {
    return {
      kind: "snow_mountains",
      fillColor: CE_BIOME_PALETTE.snow_mountains,
      isWater: false,
      symbolTypes: ["mountain_snow"]
    };
  }

  if (name.includes("tundra") || name.includes("alpine")) {
    return {
      kind: "tundra",
      fillColor: CE_BIOME_PALETTE.tundra,
      isWater: false,
      symbolTypes: ["rock_cluster", "tree_pine"]
    };
  }

  if (
    name.includes("taiga") ||
    name.includes("conifer") ||
    name.includes("pine") ||
    name.includes("boreal") ||
    name.includes("spruce")
  ) {
    return {
      kind: "coniferous_forest",
      fillColor: CE_BIOME_PALETTE.coniferous_forest,
      isWater: false,
      symbolTypes: ["tree_pine"]
    };
  }

  if (name.includes("savanna")) {
    return {
      kind: "savanna",
      fillColor: CE_BIOME_PALETTE.savanna,
      isWater: false,
      symbolTypes: ["tree_acacia", "grass_tuft"]
    };
  }

  if (
    name.includes("tropical") ||
    (name.includes("rainforest") && !name.includes("temperate")) ||
    name.includes("jungle") ||
    name.includes("mangrove")
  ) {
    return {
      kind: "tropical_forest",
      fillColor: CE_BIOME_PALETTE.tropical_forest,
      isWater: false,
      symbolTypes: ["tree_jungle", "tree_palm"]
    };
  }

  if (name.includes("deciduous") || name.includes("forest") || name.includes("wood") || name.includes("grove")) {
    return {
      kind: "deciduous_forest",
      fillColor: CE_BIOME_PALETTE.deciduous_forest,
      isWater: false,
      symbolTypes: ["tree_deciduous", "grass_tuft"]
    };
  }

  if (
    name.includes("swamp") ||
    name.includes("wetland") ||
    name.includes("marsh") ||
    name.includes("peatland") ||
    name.includes("flooded")
  ) {
    return {
      kind: "swamp",
      fillColor: CE_BIOME_PALETTE.swamp,
      isWater: false,
      symbolTypes: ["swamp_grass", "marsh_reed"]
    };
  }

  // 標高による山岳・丘陵判定
  if (elevationMeters >= 2000) {
    return {
      kind: "snow_mountains",
      fillColor: CE_BIOME_PALETTE.snow_mountains,
      isWater: false,
      symbolTypes: ["mountain_snow", "mountain_peak_major"]
    };
  }
  if (elevationMeters >= 1200) {
    return {
      kind: "mountains",
      fillColor: CE_BIOME_PALETTE.mountains,
      isWater: false,
      symbolTypes: ["mountain_peak_major", "mountain_peak_minor"]
    };
  }
  if (elevationMeters >= 650) {
    return {
      kind: "hills",
      fillColor: CE_BIOME_PALETTE.hills,
      isWater: false,
      symbolTypes: ["hill_cluster", "hill_single"]
    };
  }

  // デフォルト: 平原・草原（Grassland）
  return {
    kind: "grassland",
    fillColor: CE_BIOME_PALETTE.grassland,
    isWater: false,
    symbolTypes: ["grass_tuft", "tree_deciduous", "hill_single"]
  };
}

/**
 * FMG から渡されたセル情報群から、CE 準拠のバイオーム面と風景シンボル群を構築する
 */
export function buildLandscapeFromCells(
  cells: RegionSiteCell[],
  toLocal: (p: Point) => Point,
  seed: string,
  metersPerMapUnit = 1000
): { biomes: RegionBiomeArea[]; symbols: RegionSymbol[] } {
  const biomes: RegionBiomeArea[] = [];
  const symbols: RegionSymbol[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const stableId = cell.sourceCellId ?? `${cell.point[0]}:${cell.point[1]}`;
    const rng = makeRng(`${seed}:landscape:${stableId}`);
    const isWater = Boolean(cell.isWater || (cell.height !== undefined && cell.height < 20));
    const definition =
      cell.biomeDefinition ??
      STANDARD_BIOME_DEFINITIONS.find(d => d.label.toLowerCase() === cell.biomeName.toLowerCase());
    const landscape = isWater
      ? resolveCellLandscape(cell.biomeName, cell.elevationMeters, true)
      : definition
        ? catalogLandscape(definition)
        : resolveCellLandscape(cell.biomeName, cell.elevationMeters, false);
    const terrain = resolveCellLandscape("Grassland", cell.elevationMeters, isWater);
    if (!cell.biomeDefinition && definition) {
      landscape.fillColor = CE_BIOME_PALETTE[landscape.kind];
      if (definition.key === "grassland" && cell.elevationMeters >= 650) Object.assign(landscape, terrain);
    }

    // 1. バイオーム面（ポリゴン）の生成
    if (cell.polygon && cell.polygon.length >= 3) {
      const localPoly = cell.polygon.map(toLocal);
      biomes.push({
        id: `bio-cell-${stableId}`,
        kind: landscape.kind,
        polygon: localPoly,
        color: landscape.fillColor,
        isWater: landscape.isWater,
        terrainKind: terrain.kind,
        forestCover: cell.forestCover,
        forestStock: cell.forestStock,
        forestPolygons: isForestBiome(landscape.kind)
          ? (
              cell.landUse?.forestPolygons ??
              buildNaturalCanopy(cell.polygon, cell.forestCover ?? 0.7, seed, metersPerMapUnit)
            ).map(p => p.map(toLocal))
          : undefined
      });
    }

    // 2. 陸地セルの風景シンボルの散布
    if (!landscape.isWater && landscape.symbolTypes.length > 0) {
      const center = toLocal(cell.point);
      const symbolLandscape = isForestBiome(landscape.kind) && cell.elevationMeters >= 650 ? terrain : landscape;
      const symbolCount = getSymbolCountForBiome(symbolLandscape.kind, rng);

      for (let s = 0; s < symbolCount; s++) {
        const symType = pickSymbolType(symbolLandscape.symbolTypes, rng);
        // セル中心からのわずかな散布ジッター
        const jx = center[0] + (rng.next() - 0.5) * 22;
        const jy = center[1] + (rng.next() - 0.5) * 22;

        const scale = getSymbolScale(symType, rng, cell.elevationMeters);
        symbols.push({
          id: `sym-land-${stableId}-${s}`,
          type: symType,
          x: jx,
          y: jy,
          scale,
          rotationDeg: 0,
          elevationMeters: cell.elevationMeters
        });
      }
    }
  }

  // 北から南へ（Y座標昇順）ソートして立体的なアイソメトリック重ね合わせを成立させる
  symbols.sort((a, b) => a.y - b.y);

  return { biomes, symbols };
}

/**
 * 森林系バイオーム判定
 */
export function isForestBiome(kind: string): boolean {
  return kind === "deciduous_forest" || kind === "coniferous_forest" || kind === "tropical_forest";
}

function getSymbolCountForBiome(kind: BiomeKind, rng: { next: () => number }): number {
  switch (kind) {
    case "mountains":
    case "snow_mountains":
      return 1; // 1セルに1峰を基本として美しく配置
    case "hills":
      return rng.next() > 0.4 ? 1 : 0;
    case "deciduous_forest":
    case "coniferous_forest":
    case "tropical_forest":
      // ★森林セルは上空視点の一体化茂み（キャノピー）として描画するため、個別の木シンボルは散布しない
      return 0;
    case "savanna":
      return rng.next() > 0.5 ? 1 : 0;
    case "desert":
      return rng.next() > 0.55 ? 1 : 0;
    case "swamp":
    case "marsh":
      return rng.next() > 0.4 ? 1 : 0;
    case "grassland":
      return rng.next() > 0.75 ? 1 : 0; // まばらな草むらまたは単独木
    default:
      return rng.next() > 0.6 ? 1 : 0;
  }
}

function pickSymbolType(candidates: SymbolType[], rng: { next: () => number }): SymbolType {
  if (candidates.length === 1) return candidates[0];
  const idx = Math.floor(rng.next() * candidates.length);
  return candidates[idx];
}

function getSymbolScale(type: SymbolType, rng: { next: () => number }, elevation: number): number {
  if (type.startsWith("mountain")) {
    const elevBonus = Math.min(0.4, (elevation / 3000) * 0.4);
    return 0.85 + rng.next() * 0.25 + elevBonus;
  }
  if (type.startsWith("hill")) {
    return 0.75 + rng.next() * 0.25;
  }
  if (type.startsWith("tree")) {
    return 0.7 + rng.next() * 0.25;
  }
  if (type === "cactus" || type === "grass_tuft") {
    return 0.65 + rng.next() * 0.25;
  }
  return 0.7 + rng.next() * 0.2;
}

/** Canopy is vegetation over forest land, not a second land-area or timber ledger.
 * World noise is contoured across cells; a per-cell quota would create artificial boundary gaps.
 */
function buildNaturalCanopy(poly: Point[], cover: number, seed: string, metersPerMapUnit: number): Point[][] {
  if (cover <= 0) return [];
  if (cover >= 1) return [poly];
  const step = Math.max(1000 / metersPerMapUnit, Math.sqrt(polygonArea(poly) / 512));
  const xs = poly.map(p => p[0]),
    ys = poly.map(p => p[1]);
  const threshold = 0.5 + (0.5 - cover) * 0.55;
  const result: Point[][] = [];
  const noise = (p: Point) => landscapeNoise((p[0] * metersPerMapUnit) / 5000, (p[1] * metersPerMapUnit) / 5000, seed);
  for (let ix = Math.floor(Math.min(...xs) / step); ix * step < Math.max(...xs); ix++)
    for (let iy = Math.floor(Math.min(...ys) / step); iy * step < Math.max(...ys); iy++) {
      const square = rectangle(ix * step, iy * step, step, step);
      for (const triangle of [
        [square[0], square[1], square[2]],
        [square[0], square[2], square[3]]
      ]) {
        const contour: Point[] = [];
        for (let i = 0; i < 3; i++) {
          const a = triangle[i],
            b = triangle[(i + 1) % 3],
            va = noise(a) - threshold,
            vb = noise(b) - threshold;
          if (va >= 0) contour.push(a);
          if (va >= 0 !== vb >= 0) {
            const t = va / (va - vb);
            contour.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
          }
        }
        const clipped = clipConvex(contour, poly);
        if (polygonArea(clipped) > 1e-8) result.push(clipped);
      }
    }
  return result;
}
