/** Rendering/generation profiles, not claims about land tenure in the economy. */
export type RuralFieldSystem = "open-field" | "bocage" | "planned" | "mechanized";
export interface RuralFieldSettings {
  system?: RuralFieldSystem;
  rotationYear?: number;
  gardenRadiusMeters?: number;
}
export interface RuralLandQuality {
  /** Measured or explicitly supplied fractions; absent means unknown. */
  soilQuality?: number;
  wetness?: number;
}
export type RuralShortfallReason = "terrain" | "access" | "space" | "minimum-plot";
