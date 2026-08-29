// Public entry for the City Generator engine.

export { generateCity } from "./core/pipeline";
export {
  type BorderLoop,
  type Building,
  type Cell,
  type CellTag,
  type CityGeography,
  type CityParams,
  type CityProgram,
  DEFAULT_PROGRAM,
  DEFAULT_WALL_PLAN,
  type Gate,
  type GenerationResult,
  type GridStage,
  type Point,
  type Precinct,
  type PrecinctKind,
  type RiverPath,
  type Snapshot,
  type StreetNetwork,
  type WallPlan,
  type WallSegmentKind,
  type WardAssignment,
  type WardKind
} from "./core/types";
export type { BurgSiteArchetype, BurgSiteDescriptor } from "./site/burgSiteDescriptor";
export {
  buildCityExport,
  CITY_EXPORT_KIND,
  CITY_EXPORT_VERSION,
  type CityDigest,
  type CityExport,
  type CityExportSettings,
  type CityExportSource,
  cityExportFilename
} from "./site/cityExport";
export { parseCityExport } from "./site/cityImport";
export {
  CITY_SITE_KEY,
  decodeDescriptor,
  encodeDescriptor,
  type IncomingOrigin,
  type IncomingSite,
  parseDescriptor,
  readIncomingSite,
  resolveIncomingSite,
  siteLinkFor
} from "./site/incomingSite";
export { PRESETS, type Preset, type PresetId } from "./site/presets";
export {
  type CityFeatureSet,
  type CoastShape,
  DEFAULT_SITE_CONFIG,
  DEFAULT_WALL_CHOICE,
  defaultFeatures,
  FEATURE_KEYS,
  type RiverShape,
  randomSiteConfig,
  type SiteConfig,
  type WallChoice
} from "./site/siteConfig";
export { resolveWallPlan, siteToGeography, siteToParams, siteToProgram, siteToWallPlan } from "./site/siteInput";
export { synthSite } from "./site/synthSite";
