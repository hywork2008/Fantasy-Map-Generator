import type { SteamWaterworks } from "./steamTypes";

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
 * Public-works project kinds.
 * Tier steps: openDitches→1, stoneDrains→2, coveredCulverts→3,
 * managedSewers→4, sanitarySeparation→5.
 * waterLiftingWorks raises waterLifting stock without changing tier.
 */
export type WaterWorksProjectKind =
  | "openDitches"
  | "stoneDrains"
  | "coveredCulverts"
  | "managedSewers"
  | "sanitarySeparation"
  | "waterLiftingWorks";

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

/** Local adoption of late water technologies (0..1). Not the full tech-graph stage enum. */
export type WaterTechStocks = {
  /** Pumps / wheels / elevated cisterns for service and drinking supply. */
  waterLifting: number;
  /**
   * Municipal sanitation doctrine (connection rules, cleaning, workshop discharge).
   * Complements Phase 3 institution fields; rises with tier and administration.
   */
  municipalSanitation: number;
  /** Separate foul/storm systems, treatment planning — late composite tech. */
  sanitaryEngineering: number;
};

/**
 * Per-burg water/sanitation state owned by the economy extension slice.
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
  /**
   * A pre-existing aqueduct and trunk-sewer connection inherited by a Giant city at map
   * generation. It supplies/exports beyond the local cell; while the owning State is Giant, its
   * water-engineering bias applies even where the burg has another local culture. Future
   * RegionalWaterScheme data will describe the actual route and counterparties.
   */
  hasInheritedRomanWaterworks?: boolean;
  hasSeparateWastewaterRoute: boolean;
  stormwaterDemand: number;
  wastewaterDemand: number;

  // ── Phase 2: public works & maintenance ──────────────────────────────────
  clogging: number;
  upgradeProgress: number;
  activeProject: WaterWorksProjectKind | null;
  primaryDemandSignal: WaterDemandSignalId | null;
  demandUrgency: number;
  lastMaintenanceCoverage: number;
  lastMaintenanceSpend: number;
  lastConstructionSpend: number;

  // ── Phase 3: institutions, organic routes, externalities ─────────────────
  connectionPermitCoverage: number;
  cleaningTaxRate: number;
  dischargeRegulation: number;
  lastCleaningTaxRevenue: number;
  organicStreetLoad: number;
  compostingEfficiency: number;
  pigToiletPractice: number;
  upstreamPollutionImport: number;
  downstreamPollutionExport: number;
  /** Household coal-smoke exposure from the market heating ledger (0..1). */
  coalSmokeExposure: number;
  healthPressure: number;
  localMixedIntakeOutfall: boolean;

  // ── Phase 4: late tech & pollution diplomacy ─────────────────────────────
  waterLifting: number;
  municipalSanitation: number;
  /** Optional municipal steam pumping plant (docs/plan/steam-industrial-implementation.md Phase 3B). */
  steamWaterworks?: SteamWaterworks;
  sanitaryEngineering: number;
  /** Compensation this burg/state paid to downstream victims last year. */
  lastPollutionCompensationPaid: number;
  /** Compensation received from upstream polluters last year. */
  lastPollutionCompensationReceived: number;
  /**
   * Unresolved cross-border pollution grievance (0..1).
   * Rises when compensation is unpaid; soft-feeds state.alert when high.
   */
  pollutionDiplomaticStrain: number;
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
  coveredCulverts: "Covered culverts",
  managedSewers: "Managed sewer network",
  sanitarySeparation: "Sanitary separation works",
  waterLiftingWorks: "Water-lifting & elevated supply"
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

/** Absolute ceiling; effective max depends on tech stocks via maxInvestableTier(). */
export const ABSOLUTE_MAX_WATER_TIER: WaterSanitationTier = 5;

/** @deprecated Use maxInvestableTier() — kept for call sites that mean "pre-modern default". */
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

export const WATER_WORKS_PROJECT_KINDS: readonly WaterWorksProjectKind[] = [
  "openDitches",
  "stoneDrains",
  "coveredCulverts",
  "managedSewers",
  "sanitarySeparation",
  "waterLiftingWorks"
];
