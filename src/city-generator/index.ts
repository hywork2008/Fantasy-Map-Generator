// Public entry for the City Generator engine.

export { generateCity } from "./core/pipeline";
export type {
  Cell,
  CellTag,
  CityGeography,
  CityParams,
  GenerationResult,
  GridStage,
  Point,
  RiverPath,
  Snapshot
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
  type CoastShape,
  DEFAULT_SITE_CONFIG,
  type RiverShape,
  randomSiteConfig,
  type SiteConfig
} from "./site/siteConfig";
export { siteToGeography, siteToParams } from "./site/siteInput";
export { synthSite } from "./site/synthSite";
