import type { StapleCropKind, StapleCropProfile, StapleSoilType } from "../../../data/stapleCrops";
import type { BiomeTag } from "../../../types/biome";
import type { CultureType } from "../../hostTypes";

export type WarEconomyType = "military" | "essential" | "strategic" | "luxury";
export type TradeScale = 1 | 2 | 3 | 4 | 5;
export type TradeTrend = -2 | -1 | 0 | 1 | 2 | 3;
export type CargoHandlingClass = "loose" | "barreled" | "crated" | "fragile" | "live";

/** Physical hold occupancy, expressed in abstract cargo slots rather than real-world cubic metres. */
export interface GoodCargoProfile {
  cargoSlotsPerUnit: number;
  handlingClass: CargoHandlingClass;
}

export interface GoodTradeProfile {
  /** Low values are easier to transport. */
  weight: TradeScale;
  /** Low values fit more units into a cart, ship hold, or warehouse. */
  bulk: TradeScale;
  /** How constrained the good is by rare origin, skill, or materials. */
  rarity: TradeScale;
  /** Value change from moving the good away from its origin. Negative means local sale is usually better. */
  distancePremium: TradeTrend;
  /** Value change while cargo waits in transit or storage. Negative means rapid spoilage. */
  timeValueTrend: TradeTrend;
  /** Resistance to spoilage, breakage, escape, theft-prone handling loss, and similar cargo damage. */
  durability: TradeScale;
  /** Expected loss rate in normal carriage. High values are worse. */
  lossRisk: TradeScale;
}

export type CropKind = StapleCropKind;
export type SoilType = StapleSoilType;

/**
 * Environmental requirements and field role for a staple crop. Temperature and precipitation
 * use the map's existing annual climate proxy units, not real-world millimetres.
 */
export type CropProfile = StapleCropProfile;

export const DEMAND_PRIORITY = [
  "food",
  "utilities",
  "clothing",
  "construction",
  "military",
  "hunting",
  "luxury"
] as const;
export type DemandCategory = (typeof DEMAND_PRIORITY)[number];

export interface Good {
  warEconomyType?: WarEconomyType;
  /** This cargo can only travel over water-only trade routes. */
  seaOnly?: boolean;
  i: number;

  // generation
  chance?: number;
  distribution?: string;
  /** Explicit production by catalog-local code (legacy / fine-grained). */
  biomeOutput?: Partial<Record<number, number>>;
  /**
   * Production by BiomeTag — applies to all biomes carrying that tag, including
   * Phase-1 additions (great forest, mangrove, cloud forest, …).
   */
  biomeOutputByTag?: Partial<Record<BiomeTag, number>>;
  recipes?: Record<number, number>[];

  // multipliers; absent or 1 = no effect; 0 = fully suppressed
  multipliers?: {
    cultureType?: Partial<Record<CultureType, number>>;
    culture?: Partial<Record<number, number>>;
    state?: Partial<Record<number, number>>;
    religion?: Partial<Record<number, number>>;
    biome?: Partial<Record<number, number>>;
    zone?: Partial<Record<number, number>>; // keyed by zone.i; rare, resolved via cell membership
  };

  // effects
  demandCoverage?: Partial<Record<DemandCategory, number>>;
  trade?: GoodTradeProfile;
  /** Present for field crops whose local output is allocated from active farmland. */
  crop?: CropProfile;
  /** Missing only on legacy or user-created catalogue entries; callers must use the migration fallback. */
  cargo?: GoodCargoProfile;

  // lore
  name: string;
  tags: string[];
  value: number;
  unit: string;
  /** Smallest amount a Character may buy or sell over a retail counter. Defaults by cargo type. */
  retailLotSize?: number;

  // ui
  icon: string;
  color: string;
}
