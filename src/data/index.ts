export {
  BiomeConstants,
  FeatureSizeRatio,
  HeightmapConstants,
  HeightThreshold,
  RiverConstants,
  TemperatureRenderer,
  TemperatureThreshold
} from "./constants";
export {
  ARABIA_REGION,
  ATLANTICS_REGION,
  BRITAIN_REGION,
  CARIBBEAN_REGION,
  EAST_ASIA_REGION,
  type EarthClimateAnchor,
  type EarthRegion,
  type EarthStrait,
  EUROPE_CENTRAL_REGION,
  EUROPE_REGION,
  earthRegionMapCoordinates,
  earthRegions,
  getEarthRegion,
  INDIAN_OCEAN_REGION,
  isEarthRegion,
  JAPAN_REGION,
  LEGACY_PRECREATED_CLIMATE,
  MEDITERRANEAN_SEA_REGION
} from "./earthRegions";
export {
  getHeightmapTemplateWeights,
  type HeightmapTemplateRandomization,
  heightmapLandmassThresholds,
  heightmapTemplates
} from "./heightmap-templates";
export {
  getInitialSettlementPatternPreset,
  INITIAL_SETTLEMENT_PATTERN_PRESETS,
  type InitialSettlementPatternPreset
} from "./initialSettlementPatterns";
export { type PrecreatedHeightmap, precreatedHeightmaps } from "./precreated-heightmaps";
