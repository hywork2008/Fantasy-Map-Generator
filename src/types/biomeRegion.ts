/** Biome regional profile adjusts assignment rates and regional masks (Phase 3+). */
export const BIOME_REGION_PROFILES = [
  "global",
  "medievalEurope",
  "mediterranean",
  "tropicalRiverBasin",
  "mountainRealm"
] as const;

export type BiomeRegionProfile = (typeof BIOME_REGION_PROFILES)[number];

export const DEFAULT_BIOME_REGION_PROFILE: BiomeRegionProfile = "global";

export function normalizeBiomeRegionProfile(value: unknown): BiomeRegionProfile {
  if (typeof value === "string" && (BIOME_REGION_PROFILES as readonly string[]).includes(value)) {
    return value as BiomeRegionProfile;
  }
  return DEFAULT_BIOME_REGION_PROFILE;
}

export const BIOME_REGION_PROFILE_LABELS: Record<BiomeRegionProfile, string> = {
  global: "Global (default mix)",
  medievalEurope: "Medieval Europe (great forests & wetlands)",
  mediterranean: "Mediterranean woodland",
  tropicalRiverBasin: "Tropical river basin",
  mountainRealm: "Mountain realm"
};
