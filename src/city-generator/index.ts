// Public entry for the City Generator engine.

export { generateCity } from "./core/pipeline";
export {
  type Cell,
  type CellTag,
  type CityGeography,
  type CityParams,
  type CityProgram,
  DEFAULT_PROGRAM,
  type GenerationResult,
  type GridStage,
  type Point,
  type RiverPath,
  type Snapshot
} from "./core/types";
export type { BurgSiteArchetype, BurgSiteDescriptor } from "./site/burgSiteDescriptor";
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
  defaultFeatures,
  FEATURE_KEYS,
  type RiverShape,
  randomSiteConfig,
  type SiteConfig
} from "./site/siteConfig";
export { siteToGeography, siteToParams, siteToProgram } from "./site/siteInput";
export { synthSite } from "./site/synthSite";
