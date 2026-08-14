/** Metals extracted as ore; a later smelter operation turns them into ingots. */
export const ORE_COMMODITIES = ["iron", "copper", "tin", "lead", "silver", "gold"] as const;

export type OreCommodity = (typeof ORE_COMMODITIES)[number];

/** Mineral goods that bypass smelting and remain directly mine-supplied. */
export const FUEL_MINERAL_COMMODITIES = ["coal", "saltpeter", "sulfur"] as const;

export type FuelMineralCommodity = (typeof FUEL_MINERAL_COMMODITIES)[number];
export type MineralCommodity = OreCommodity | FuelMineralCommodity;

export type GeologicalProvinceKind = "orogen" | "shield" | "granite" | "carbonate" | "basin" | "placer" | "volcanic";
export type MineralDistrictType =
  | "bandedIron"
  | "porphyry"
  | "skarn"
  | "polymetallicVein"
  | "mvt"
  | "sedex"
  | "graniteTin"
  | "lodeGold"
  | "placer"
  | "coalSeam"
  | "evaporite";

export interface MineralYield {
  /** Recoverable ore reserve; MineOperation maps one tonne to one Economy Good unit. */
  commodity: MineralCommodity;
  reserveTons: number;
  annualCapacityTons: number;
}

export interface MineralGeologicalProvince {
  i: number;
  kind: GeologicalProvinceKind;
  /** Pack cell ids classified into this broad, deterministic pseudo-geology. */
  cells: number[];
}

export interface MineralDistrict {
  i: number;
  type: MineralDistrictType;
  provinceId: number;
  cell: number;
  depositIds: number[];
  richness: number;
}

export interface MineralDeposit {
  i: number;
  districtId: number;
  cell: number;
  type: MineralDistrictType;
  primaryCommodity: MineralCommodity;
  commodities: MineralCommodity[];
  yields: MineralYield[];
  richness: number;
  depth: "surface" | "shallow" | "deep";
  /**
   * Persistent 0..1 groundwater ingress pressure derived at generation from annual
   * precipitation and a river on the mine cell. Higher pressure increases the
   * drainage needed to keep a deeper mine productive. Undefined legacy deposits
   * retain the former no-hydrology behaviour until regenerated.
   */
  groundwaterPressure?: number;
  accessibility: number;
  discovered: boolean;
  exhausted: boolean;
}

export interface MineOperation {
  i: number;
  depositId: number;
  burgId: number;
  marketId: number;
  workers: number;
  technology: number;
  drainage: number;
  fuelAccess: number;
  /**
   * 0..1 EWMA of annual Tools investment coverage, independent of the prospect()-derived
   * `technology` baseline (docs/plan/rural-agtech-investment.md §6.2). Undefined (pre-Phase-2
   * saves, or test fixtures that construct MineOperation directly) is treated as 0.
   */
  toolsInvestmentStock?: number;
  annualOutputTons: Partial<Record<MineralCommodity, number>>;
  active: boolean;
}
