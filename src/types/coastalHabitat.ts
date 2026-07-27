/**
 * Coastal / nearshore habitat attributes overlaid on climate biomes.
 * These do not replace Marine or land biomes — they are independent cell columns.
 */

export const COASTAL_HABITAT_KEYS = ["none", "sandyBeach", "rockyIntertidal", "tidalFlat", "coastalDune"] as const;

export type CoastalHabitatKey = (typeof COASTAL_HABITAT_KEYS)[number];

export const NEARSHORE_HABITAT_KEYS = ["none", "rockyReef", "coralReef", "seagrassMeadow"] as const;

export type NearshoreHabitatKey = (typeof NEARSHORE_HABITAT_KEYS)[number];

export type CoastalHabitatCode = number;
export type NearshoreHabitatCode = number;

export interface CoastalHabitatDefinition {
  readonly key: CoastalHabitatKey;
  readonly label: string;
  readonly color: string;
  /** Short tip for tooltips and content systems (turtles, shellfish, etc.). */
  readonly contentHint: string;
}

export interface NearshoreHabitatDefinition {
  readonly key: NearshoreHabitatKey;
  readonly label: string;
  readonly color: string;
  readonly contentHint: string;
}
