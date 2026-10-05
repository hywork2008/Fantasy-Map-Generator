/**
 * Region Editor (RE) Core Data Types
 *
 * 地方・地域地図（Region Map）のデータモデル。
 * 大陸地図（FMG）と都市地図（CE）の中間に位置し、
 * 個別の山岳、森林群、蛇行河川、街道、直角橋、地方集落、ダンジョンなどを保持する。
 */

export const REGION_DOCUMENT_FORMAT = "fmg-region-editor";
export const REGION_DOCUMENT_VERSION = 1;

export type Point = [number, number];

export type BiomeKind =
  | "ocean"
  | "grassland"
  | "deciduous_forest"
  | "coniferous_forest"
  | "tropical_forest"
  | "savanna"
  | "hills"
  | "mountains"
  | "snow_mountains"
  | "glacier"
  | "swamp"
  | "marsh"
  | "desert"
  | "tundra"
  | "badlands";

export interface RegionBiomeArea {
  id: string;
  kind: BiomeKind;
  polygon: Point[];
  color?: string; // CE-compatible ground/face fill color override
  isWater?: boolean;
}

export type SymbolType =
  | "mountain_peak_major"
  | "mountain_peak_minor"
  | "mountain_snow"
  | "hill_single"
  | "hill_cluster"
  | "tree_deciduous"
  | "tree_pine"
  | "tree_jungle"
  | "tree_palm"
  | "tree_acacia"
  | "tree_dead"
  | "cactus"
  | "grass_tuft"
  | "swamp_grass"
  | "marsh_reed"
  | "sand_dune"
  | "rock_cluster";

export interface RegionSymbol {
  id: string;
  type: SymbolType;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  elevationMeters?: number;
  locked?: boolean;
}

export interface RegionRiver {
  id: string;
  name: string;
  points: Point[];
  widths: number[];
  dischargeM3s: number;
}

export interface RegionBridge {
  id: string;
  riverId: string;
  routeId: string;
  center: Point;
  lengthMeters: number;
  widthMeters: number;
  /** 河川の局所接線に対して厳格に直角（90°） */
  angleDeg: number;
  style: "stone_arch" | "wooden" | "suspension";
}

export interface RegionRoute {
  id: string;
  kind: "highway" | "road" | "trail" | "sea_lane";
  points: Point[];
  name?: string;
}

export type SettlementType =
  | "capital"
  | "city"
  | "town"
  | "village"
  | "hamlet"
  | "fort"
  | "monastery"
  | "caravanserai"
  | "trading_post"
  | "metropolis"
  | "castle"
  | "port";

export interface RegionSettlement {
  id: string;
  burgId?: number;
  name: string;
  position: Point;
  type: SettlementType;
  group?: string;
  population?: number;
  isCapital?: boolean;
  hasWalls?: boolean;
  hasCitadel?: boolean;
  hasPort?: boolean;
  cityEditorSeed?: string;
}

export interface RegionLandmark {
  id: string;
  dungeonId?: number;
  name: string;
  position: Point;
  kind: "ruins" | "dungeon" | "tower" | "tomb" | "mine" | "cave" | "shrine" | "monolith";
  dangerLevel?: number;
  dungeonPreset?: "caravanserai" | "room-corridor";
}

export interface RegionLabel {
  id: string;
  text: string;
  position: Point;
  category: "region" | "natural" | "settlement" | "water" | "landmark";
  fontSizePt: number;
  fontStyle: "serif" | "italic" | "gothic" | "uncial";
  curvaturePoints?: Point[];
}

export type RegionTheme = "schley" | "perilous" | "parchment" | "monochrome";

export interface RegionDecoration {
  theme: RegionTheme;
  showCompassRose: boolean;
  compassPosition: Point;
  showScaleBar: boolean;
  scaleBarPosition: Point;
  showBorder: boolean;
  borderStyle: "ornate" | "simple" | "none";
}

export interface RegionContourLine {
  id: string;
  elevationMeters: number;
  points: Point[];
  /** 主等高線（Index contour: 太線・注記対象） */
  isIndex?: boolean;
  /** 閉曲線（孤立峰や凹地） */
  isClosed?: boolean;
}

export interface RegionHeightfield {
  cols: number;
  rows: number;
  minElevationMeters: number;
  maxElevationMeters: number;
  elevationsMeters: number[];
}

export interface RegionTerrain {
  coastlinePolygons: Point[][];
  lakePolygons: Point[][];
  heightfield?: RegionHeightfield;
  contours?: RegionContourLine[];
  contourIntervalMeters?: number;
  showContours?: boolean;
}

export interface RegionDocument {
  format: typeof REGION_DOCUMENT_FORMAT;
  version: typeof REGION_DOCUMENT_VERSION;
  id: string;
  title: string;
  seed: string;

  bounds: {
    widthMeters: number;
    heightMeters: number;
    metersPerUnit: number;
  };

  source?: {
    fmgMapSeed: string;
    provinceId?: number;
    provinceName?: string;
    stateId?: number;
    stateName?: string;
    fmgBBox: [number, number, number, number];
  };

  terrain: RegionTerrain;

  biomes: RegionBiomeArea[];
  symbols: RegionSymbol[];
  rivers: RegionRiver[];
  bridges: RegionBridge[];
  routes: RegionRoute[];
  settlements: RegionSettlement[];
  landmarks: RegionLandmark[];
  labels: RegionLabel[];
  decoration: RegionDecoration;
}

/**
 * FMG から Region Editor へ渡されるサイト記述子
 */
export const REGION_SITE_KEY = "fmg.regionSite";
export const REGION_SITE_VERSION = 1;

export interface RegionSiteCell {
  point: Point;
  elevationMeters: number;
  height?: number; // FMG raw 0-100 height index
  inProvince?: boolean; // true if cell is inside the selected province
  provinceId?: number;
  biomeId: number;
  biomeName: string;
  polygon?: Point[]; // Voronoi cell boundary polygon in FMG coordinates
  isWater?: boolean; // true if sea / ocean / water cell
}

export interface RegionSiteDescriptor {
  version: typeof REGION_SITE_VERSION;
  sourceSeed: string;
  provinceId?: number;
  provinceName?: string;
  stateId?: number;
  stateName?: string;
  /** [minX, minY, maxX, maxY] in FMG world coordinate units */
  boundsMapUnits: [number, number, number, number];
  metersPerMapUnit: number;
  extentMeters: {
    width: number;
    height: number;
  };
  coastlines: Point[][];
  lakes: Point[][];
  rivers: Array<{
    id: number;
    name: string;
    points: Point[];
    widthMeters: number;
    dischargeM3s: number;
  }>;
  burgs: Array<{
    id: number;
    name: string;
    point: Point;
    population: number;
    capital: boolean;
    port: boolean;
    walls: boolean;
    citadel: boolean;
    group?: string;
  }>;
  roads: Array<{
    routeId: number;
    type: "highway" | "road" | "trail";
    points: Point[];
  }>;
  dungeons?: Array<{
    id: number;
    name: string;
    point: Point;
    type: string;
  }>;
  elevationStats?: {
    minElevationMeters: number;
    maxElevationMeters: number;
    maxBorderRelief: number;
  };
  cells: RegionSiteCell[];
}

export interface RegionGenerationSettings {
  seed: string;
  title: string;
  widthMeters: number;
  heightMeters: number;
  metersPerUnit: number;
  theme: RegionTheme;
  treeDensity: number; // 0.0 - 1.0
  mountainDensity: number; // 0.0 - 1.0
}

export const DEFAULT_REGION_SETTINGS: RegionGenerationSettings = {
  seed: "region-seed-1",
  title: "Sword Coast Regional Map",
  widthMeters: 120_000, // 120km
  heightMeters: 80_000, // 80km
  metersPerUnit: 100, // 1 unit = 100m -> 1200 x 800 units
  theme: "schley",
  treeDensity: 0.5,
  mountainDensity: 0.5
};
