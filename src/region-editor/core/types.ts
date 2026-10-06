import type { BiomeDefinition } from "../../types/biome";
import type { CoastalHabitatCode } from "../../types/coastalHabitat";
import type { CellLandUseBudget, LandUsePatchBudget, LandUseProfile } from "../../types/landUse";
/**
 * Region Editor (RE) Core Data Types
 *
 * 地方・地域地図（Region Map）のデータモデル。
 * 大陸地図（FMG）と都市地図（CE）の中間に位置し、
 * 個別の山岳、森林群、蛇行河川、街道、直角橋、地方集落、ダンジョンなどを保持する。
 */

export const REGION_DOCUMENT_FORMAT = "fmg-region-editor";
export const REGION_DOCUMENT_VERSION = 2;

export type Point = [number, number];

export type BiomeKind =
  | "ocean"
  | "grassland"
  | "deciduous_forest"
  | "coniferous_forest"
  | "tropical_forest"
  | "savanna"
  | "woodland_scrub"
  | "hills"
  | "mountains"
  | "snow_mountains"
  | "glacier"
  | "swamp"
  | "marsh"
  | "desert"
  | "tundra"
  | "badlands";

/** 湿地の冠水段階 0（湿った地面）〜 9（深い開放水面）。 */
export const WETLAND_LEVELS = 10;

export interface RegionWetlandPatch {
  kind: "water" | "mud" | "sand";
  polygon: Point[];
  /**
   * 冠水段階。この段階「以上」の領域を表す入れ子の面で、段階の昇順に重ねて描く。
   * 未設定（旧データ）は kind から推定する。
   */
  level?: number;
}

export interface RegionBiomeArea {
  wetlandPatches?: RegionWetlandPatch[];
  id: string;
  kind: BiomeKind;
  polygon: Point[];
  color?: string; // CE-compatible ground/face fill color override
  isWater?: boolean;
  forestCover?: number;
  forestStock?: number;
  forestPolygons?: Point[][];
  terrainKind?: BiomeKind;
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
  sourceRiverId?: number;
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
  /** Cultivated area in hectares; 0 when no land can be allocated. */
  farmlandAreaHectares?: number;
  builtAreaHa?: number;
  landUseProfile?: LandUseProfile;
  isCapital?: boolean;
  hasWalls?: boolean;
  hasCitadel?: boolean;
  hasPort?: boolean;
  cityEditorSeed?: string;
  siteDescriptor?: unknown;
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
  /** 都市アイコンの拡大倍率（整数、最小1。未設定は1）。 */
  settlementIconScale?: number;
  /** 街道の線幅倍率（最小0.5。未設定は1）。 */
  routeWidthScale?: number;
  /** 河川の川幅倍率（最小0.5。未設定は1）。 */
  riverWidthScale?: number;
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

export interface RegionCoastalHabitat {
  points: Point[];
  landPolygon: Point[];
  coastalHabitat: CoastalHabitatCode;
}

export interface RegionTerrain {
  coastalHabitats?: RegionCoastalHabitat[];
  coastlinePolygons: Point[][];
  lakePolygons: Point[][];
  heightfield?: RegionHeightfield;
  contours?: RegionContourLine[];
  contourIntervalMeters?: number;
  showContours?: boolean;
  /** 等高線表示時に主等高線へ標高(m)を注記するか。未設定は非表示。 */
  showContourElevations?: boolean;
  /** 耕作地(cultivation)パッチを描画するか。未設定は非表示。 */
  showCultivation?: boolean;
  /** FMG セル(Voronoi)境界のポリゴン（ローカル座標）。 */
  cellPolygons?: Point[][];
  /** cellPolygons と同じ並びの FMG バイオーム色。 */
  cellBiomeColors?: string[];
  /** セルを FMG バイオーム色の単色で塗るか。未設定は非表示。 */
  showBiomeCells?: boolean;
  /** セル境界線を表示するか。未設定は非表示。 */
  showCellBorders?: boolean;
  /** セル境界線の重なり順（既定 top = 最前面） */
  cellBorderOrder?: "top" | "bottom";
  /** セル境界線の不透明度 0〜1（既定 0.6） */
  cellBorderOpacity?: number;
  /** 高山の真上視点表現（陰影・落ち影・高度帯）を描くか。未設定は非表示。 */
  showRelief?: boolean;
  relief?: RegionReliefSettings;
  /** FMG セルの気候サンプル [x, y, 標高 m, 年平均気温 °C]（ローカル座標）。高度帯の判定に使う。 */
  climateSamples?: Array<[number, number, number, number]>;
}

export interface RegionReliefSettings {
  /** 光源の方位（北から時計回り、既定 315 = 北西） */
  sunAzimuthDeg?: number;
  /** 光源の高度（既定 35°） */
  sunAltitudeDeg?: number;
  /** 陰影の垂直誇張（既定 3） */
  verticalExaggeration?: number;
  /** 斜め描きの峰シンボルを隠すか（既定 true） */
  hideMountainSymbols?: boolean;
}

export interface RegionLandUsePatch extends LandUsePatchBudget {
  polygon: Point[];
  userEdited?: boolean;
}
export interface RegionLandUse {
  modelVersion: number;
  revision: number;
  year: number;
  seed: string;
  provenance: "authoritative" | "estimated" | "legacy";
  patches: RegionLandUsePatch[];
  unplacedAreaHa: number;
  diagnostics: string[];
}

export interface RegionDocument {
  landUse?: RegionLandUse;
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
export const REGION_SITE_VERSION = 2;

export interface RegionSiteCell {
  biomeDefinition?: BiomeDefinition;
  coastalHabitat?: CoastalHabitatCode;
  cultureId?: number;
  sourceCellId?: number;
  physicalLandAreaHa?: number;
  ruralPeople?: number;
  forestCover?: number;
  forestStock?: number;
  forestCondition?: number;
  canopy?: number;
  specialFeature?: number;
  landUse?: CellLandUseBudget;
  point: Point;
  elevationMeters: number;
  height?: number; // FMG raw 0-100 height index
  inProvince?: boolean; // true if cell is inside the selected province
  provinceId?: number;
  annualPrecipitationMm?: number;
  annualTemperatureC?: number;
  biomeId: number;
  biomeName: string;
  /** FMG biomesData.color[biomeId]（セル単色表示用）。 */
  biomeColor?: string;
  polygon?: Point[]; // Voronoi cell boundary polygon in FMG coordinates
  isWater?: boolean; // true if sea / ocean / water cell
}

export interface RegionSiteDescriptor {
  landUse?: Omit<RegionLandUse, "patches" | "unplacedAreaHa" | "diagnostics">;
  version: 1 | typeof REGION_SITE_VERSION;
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
  coastalHabitats?: RegionCoastalHabitat[];
  coastlines: Point[][];
  lakes: Point[][];
  rivers: Array<{
    id: number;
    sourceRiverId?: number;
    name: string;
    points: Point[];
    widthMeters: number;
    widthsMeters?: number[];
    dischargeM3s: number;
  }>;
  burgs: Array<{
    id: number;
    name: string;
    point: Point;
    population: number;
    cultureId?: number;
    raceKey?: string;
    landUseProfile?: LandUseProfile;
    builtAreaHa?: number;
    capital: boolean;
    port: boolean;
    walls: boolean;
    citadel: boolean;
    group?: string;
    siteDescriptor?: unknown;
  }>;
  roads: Array<{
    routeId: number;
    name?: string;
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
