/**
 * Burg-level water and sanitation infrastructure.
 * See docs/plan/urban-water-and-sanitation-system.md.
 *
 * Capacity and burden values are unitless 0..1 scores unless noted.
 * Higher capacity / security is better; higher burden / contamination / flood is worse.
 */

export type WaterSanitationTier = 0 | 1 | 2 | 3 | 4 | 5;

/** Materials used for post-defecation cleansing — cultural weights, not tech unlocks. */
export type CleansingMaterial = "water" | "plant" | "cloth" | "paper" | "sharedTool";

/** Organic-waste pathways from §8 of the urban water design. */
export type OrganicWasteRoute =
  | "openDisposal"
  | "cesspit"
  | "nightSoilCollection"
  | "managedComposting"
  | "animalScavenging"
  | "waterDischarge";

export type CulturalHygieneProfile = {
  cleansing: Readonly<Record<CleansingMaterial, number>>;
  organicWaste: Readonly<Record<OrganicWasteRoute, number>>;
};

/**
 * Public-works project kinds for Phase 2 investment.
 * Each upgrades the representative burg tier by one step (target = current + 1).
 */
export type WaterWorksProjectKind = "openDitches" | "stoneDrains" | "coveredCulverts";

/** Demand signals that make a waterworks project a candidate (§4.2). */
export type WaterDemandSignalId =
  | "floodMud"
  | "wetlandExpansion"
  | "irrigationDrain"
  | "workshopEffluent"
  | "densityOdor"
  | "waterContamination"
  | "droughtService";

export type WaterDemandSignal = {
  id: WaterDemandSignalId;
  /** 0..1 strength this year. */
  strength: number;
};

/**
 * Per-burg water/sanitation state owned by the economy extension slice.
 * Tier 4–5 exist in the type for later phases; Phase 2 can invest up to tier 3.
 */
export type UrbanWaterSystem = {
  burgId: number;
  tier: WaterSanitationTier;
  drinkingWaterSecurity: number;
  serviceWaterCapacity: number;
  irrigationCapacity: number;
  stormwaterDrainageCapacity: number;
  wastewaterCapacity: number;
  maintenanceCondition: number;
  sanitationBurden: number;
  waterContamination: number;
  floodExposure: number;
  /** Street mud / impassability after rain (display + market disruption input). */
  muddiness: number;
  /** Local odor / organic-waste nuisance (display). */
  odor: number;
  hasUpstreamIntake: boolean;
  hasDownstreamOutfall: boolean;
  hasSeparateWastewaterRoute: boolean;
  stormwaterDemand: number;
  wastewaterDemand: number;

  // ── Phase 2: public works & maintenance ──────────────────────────────────
  /**
   * Siltation / illegal dumping / debris that reduces effective capacity
   * independently of structural maintenanceCondition (0..1).
   */
  clogging: number;
  /** 0..1 progress toward completing `activeProject` (or the next tier upgrade). */
  upgradeProgress: number;
  /** Active construction project, or null when idle. */
  activeProject: WaterWorksProjectKind | null;
  /** Strongest demand signal id driving the current candidate, for UI. */
  primaryDemandSignal: WaterDemandSignalId | null;
  /** 0..1 urgency of the primary demand signal. */
  demandUrgency: number;
  /** Fraction of needed maintenance paid last settlement (0..1). */
  lastMaintenanceCoverage: number;
  /** Treasury spent on maintenance last settlement. */
  lastMaintenanceSpend: number;
  /** Treasury spent on construction last settlement. */
  lastConstructionSpend: number;
};

export const WATER_SANITATION_TIER_LABELS: Readonly<Record<WaterSanitationTier, string>> = {
  0: "Individual handling",
  1: "Open ditches",
  2: "Stone drains",
  3: "Covered culverts",
  4: "Managed sewers",
  5: "Sanitary engineering"
};

export const WATER_WORKS_PROJECT_LABELS: Readonly<Record<WaterWorksProjectKind, string>> = {
  openDitches: "Open ditches & spillways",
  stoneDrains: "Stone-lined drains",
  coveredCulverts: "Covered culverts"
};

export const WATER_DEMAND_SIGNAL_LABELS: Readonly<Record<WaterDemandSignalId, string>> = {
  floodMud: "Flood & mud",
  wetlandExpansion: "Wetland expansion",
  irrigationDrain: "Irrigation drainage",
  workshopEffluent: "Workshop effluent",
  densityOdor: "Density & odor",
  waterContamination: "Water contamination",
  droughtService: "Drought / service water"
};

/** Phase 2 can invest up through covered culverts; tier 4+ needs institutions (Phase 3). */
export const MAX_INVESTABLE_TIER: WaterSanitationTier = 3;

export const CLEANSING_MATERIALS: readonly CleansingMaterial[] = ["water", "plant", "cloth", "paper", "sharedTool"];

export const ORGANIC_WASTE_ROUTES: readonly OrganicWasteRoute[] = [
  "openDisposal",
  "cesspit",
  "nightSoilCollection",
  "managedComposting",
  "animalScavenging",
  "waterDischarge"
];

export const WATER_DEMAND_SIGNAL_IDS: readonly WaterDemandSignalId[] = [
  "floodMud",
  "wetlandExpansion",
  "irrigationDrain",
  "workshopEffluent",
  "densityOdor",
  "waterContamination",
  "droughtService"
];
