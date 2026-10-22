import type { BuildingPaletteId } from "./palette";

export const BUILDING_APPEARANCE_VERSION = 1;
export const BUILDING_APPEARANCE_PROFILES = [
  "legacy",
  "mediterranean",
  "atlantic",
  "northern-wooded",
  "northern-urban",
  "stone-upland"
] as const;
export type BuildingAppearanceProfile = (typeof BUILDING_APPEARANCE_PROFILES)[number];
export const BUILDING_APPEARANCE_CLIMATES = ["temperate", "forest", "wetland", "wet-forest", "arid"] as const;
export type BuildingAppearanceClimate = (typeof BUILDING_APPEARANCE_CLIMATES)[number];

/** Persisted inputs, independent of later changes to the world or generation recipe. */
export interface BuildingAppearanceContext {
  period: string;
  tradition?: string;
  temperatureC?: number;
  forest: boolean;
  arid: boolean;
  wetland: boolean;
}

export interface BuildingAppearance {
  version: typeof BUILDING_APPEARANCE_VERSION;
  profileId: BuildingAppearanceProfile;
  roofPaletteId: BuildingPaletteId;
  wallPaletteId: BuildingPaletteId;
  framePaletteId?: BuildingPaletteId;
  shadeBin: 0 | 1 | 2;
  /** Surface finish; structural wall material remains on BuildingMassing. */
  wallFinish: "plaster-infill" | "limewash" | "stone" | "brick" | "earth" | "timber-boarding" | "legacy";
}
