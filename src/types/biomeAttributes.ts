/**
 * Attribute layers stacked on climate biomes (Phase 4 foundation).
 * These are not climate biomes — they describe forest age, land cover,
 * canopy mix, and fantasy specials without expanding BiomeKey.
 *
 * Dense cell columns use catalog-local codes; meaning is via key tables below.
 */

export const FOREST_CONDITION_KEYS = ["none", "young", "mature", "ancient"] as const;
export type ForestConditionKey = (typeof FOREST_CONDITION_KEYS)[number];

export const CANOPY_KEYS = ["none", "broadleaf", "conifer", "mixed"] as const;
export type CanopyKey = (typeof CANOPY_KEYS)[number];

export const LAND_COVER_KEYS = ["none", "naturalForest", "managedForest", "cropland", "pasture", "settlement"] as const;
export type LandCoverKey = (typeof LAND_COVER_KEYS)[number];

export const SPECIAL_FEATURE_KEYS = ["none", "enchanted", "cursed", "giantTrees"] as const;
export type SpecialFeatureKey = (typeof SPECIAL_FEATURE_KEYS)[number];

export type ForestConditionCode = number;
export type CanopyCode = number;
export type LandCoverCode = number;
export type SpecialFeatureCode = number;

export function forestConditionCode(key: ForestConditionKey): ForestConditionCode {
  return FOREST_CONDITION_KEYS.indexOf(key);
}
export function canopyCode(key: CanopyKey): CanopyCode {
  return CANOPY_KEYS.indexOf(key);
}
export function landCoverCode(key: LandCoverKey): LandCoverCode {
  return LAND_COVER_KEYS.indexOf(key);
}
export function specialFeatureCode(key: SpecialFeatureKey): SpecialFeatureCode {
  return SPECIAL_FEATURE_KEYS.indexOf(key);
}

export function forestConditionKey(code: ForestConditionCode): ForestConditionKey {
  return FOREST_CONDITION_KEYS[code] ?? "none";
}
export function canopyKey(code: CanopyCode): CanopyKey {
  return CANOPY_KEYS[code] ?? "none";
}
export function landCoverKey(code: LandCoverCode): LandCoverKey {
  return LAND_COVER_KEYS[code] ?? "none";
}
export function specialFeatureKey(code: SpecialFeatureCode): SpecialFeatureKey {
  return SPECIAL_FEATURE_KEYS[code] ?? "none";
}
