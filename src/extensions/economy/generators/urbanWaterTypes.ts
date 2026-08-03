/**
 * Burg-level water and sanitation infrastructure (Phase 1).
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
 * Per-burg water/sanitation state owned by the economy extension slice.
 * Tier 3–5 exist in the type for later phases but Phase 1 only assigns 0–2.
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
};

export const WATER_SANITATION_TIER_LABELS: Readonly<Record<WaterSanitationTier, string>> = {
  0: "Individual handling",
  1: "Open ditches",
  2: "Stone drains",
  3: "Covered culverts",
  4: "Managed sewers",
  5: "Sanitary engineering"
};

export const CLEANSING_MATERIALS: readonly CleansingMaterial[] = ["water", "plant", "cloth", "paper", "sharedTool"];

export const ORGANIC_WASTE_ROUTES: readonly OrganicWasteRoute[] = [
  "openDisposal",
  "cesspit",
  "nightSoilCollection",
  "managedComposting",
  "animalScavenging",
  "waterDischarge"
];
