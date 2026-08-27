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
export { PRESETS, type Preset, type PresetId } from "./site/presets";
export { siteToGeography, siteToParams } from "./site/siteInput";
export { synthSite } from "./site/synthSite";
