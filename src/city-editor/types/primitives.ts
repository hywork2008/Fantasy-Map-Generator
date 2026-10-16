import type { HistoricalPeriod as FmgHistoricalPeriod } from "../../types/historicalPeriod";
export type Id = string;

export type Point = [number, number];

export type WaterKind = "land" | "sea" | "lake" | "openWater";

export type WardKind =
  | "market"
  | "castle"
  | "merchant"
  | "craftsmen"
  | "patriciate"
  | "harbor"
  | "park"
  | "farm"
  | "cemetery"
  | "empty";

/** Craftsman street taken from a burg's guild practitioners. Same list as GuildDomain. */
export type CraftDomain =
  | "metallurgy"
  | "woodworking"
  | "masonry"
  | "textiles"
  | "leather"
  | "glassware"
  | "instruments"
  | "printing";

export type BuildingPattern = "legacy" | "medieval";

export type BuildingComposition = "standard" | "commercial" | "warehouses" | "estates";

export type HarborPreset = "small" | "dense" | "warehouse";

/** FMG periods plus CE-only classical antiquity. */
export type HistoricalPeriod = "classicalAntiquity" | FmgHistoricalPeriod;
