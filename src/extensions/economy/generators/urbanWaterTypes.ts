import type { SteamWaterworks } from "./steamTypes";
import type { RiverBasinKind, WaterEffluentDestination } from "./urbanWaterClimate";

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
  /** Treatment works for potable water; older saves without this field imply tier 0. */
  drinkingTreatmentTier?: WaterSanitationTier;
  /** Treatment works for wastewater before discharge; older saves without this field imply tier 0. */
  wastewaterTreatmentTier?: WaterSanitationTier;
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
   * Whether this burg's river (if any) reaches the open sea. `hasDownstreamOutfall`'s river clause
   * already respects this; stored separately so later phases (docs/plan/modern-urban-water-
   * treatment-and-governance.md §2.2, §6) can read the geographic fact on its own, e.g. to route a
   * closed-basin burg into `sealedStorageAndInfiltration` handling instead of river discharge.
   */
  basinKind: RiverBasinKind;
  /**
   * Winter freeze / usable-summer pattern for this burg (docs/plan/modern-urban-water-treatment-
   * and-governance.md §2.2's `seasonalCold`, `isSeasonalColdBurg()` in urbanWaterClimate.ts). Not
   * yet read by anything outside the Giant inherited-sewer route; stored so future seasonal
   * treatment-capacity logic (`winterStorageFill` in the doc's §6) has a stable field to key off.
   */
  thermalRegime: "temperate" | "seasonalCold";
  /** Where wastewater actually goes, derived from `basinKind` and coastal access — see resolveBurgEffluentDestination(). */
  effluentDestination: WaterEffluentDestination;
  /**
   * A pre-existing aqueduct and trunk-sewer connection inherited by a Giant settlement at map
   * generation. It supplies/exports beyond the local cell; while the owning State is Giant, its
   * water-engineering bias applies even where the burg has another local culture. Future
   * RegionalWaterScheme data will describe the actual route and counterparties.
   */
  hasInheritedRomanWaterworks?: boolean;
  /** A Giant settlement's inherited trunk sewer. Older saves infer this from `hasInheritedRomanWaterworks`. */
  hasInheritedRomanSewer?: boolean;
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

  // ── Modern Phase 2 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12): source
  // protection & Tier 1 (slow sand filtration / primary wastewater settling) investment. A second,
  // independent axis from the legacy `tier` ladder above — see urbanWaterModernTreatment.ts's
  // header for why it is not folded into that ladder's WaterWorksProjectKind. ───────────────────
  /** 0..1: upstream intake protection + record-keeping. A prerequisite for drinkingTreatmentTier
   * reaching 1, and a small drinkingWaterSecurity bonus in its own right even before then (§2's
   * priority-1 item, distinct from filtration). */
  sourceProtection: number;
  /** 0..1 progress toward drinkingTreatmentTier reaching 1. */
  drinkingTreatmentUpgradeProgress: number;
  /** 0..1 progress toward wastewaterTreatmentTier reaching 1. */
  wastewaterTreatmentUpgradeProgress: number;
  /** 0..1 coverage of this year's recurring operating cost for drinkingTreatmentTier ≥ 1 (sand
   * renewal, reservoir upkeep, record-keeping) — a separate funding pool from construction above
   * (§5.1's "four wallets"). An unfunded Tier 1 plant keeps its tier but loses most of its effective
   * benefit — see computeUrbanWaterSystem()'s drinkingWaterSecurity/waterContamination terms. */
  treatmentOperationsFunding: number;
  /** Same as `treatmentOperationsFunding`, for wastewaterTreatmentTier. */
  wastewaterOperationsFunding: number;
  lastModernConstructionSpend: number;

  // ── Modern Phase 4 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §15): rapid
  // filtration/coagulation (drinkingTreatmentTier 1→2) and controlled chlorination (2→3). Both new
  // fields are recomputed fresh every year (not carried forward like sourceProtection/progress
  // meters) — same "0..1 coverage ratio" shape as treatmentOperationsFunding above. ─────────────
  /** 0..1 coverage of this year's water-quality testing upkeep (active once drinkingTreatmentTier
   * ≥ 2 — dosing control is only worth verifying once there is dosing to verify). */
  chemicalTestCoverage: number;
  /** 0..1 coverage of this year's Alum purchase against demand (active once drinkingTreatmentTier
   * ≥ 2). Same "capped by real local market stock, not just treasury" shape as chlorineStockCoverage
   * below — see urbanWaterModernTreatment.ts. */
  coagulantStockCoverage: number;
  /** 0..1 coverage of this year's Lime purchase against demand (active once drinkingTreatmentTier
   * ≥ 2) — a smaller, secondary pH-correction/softening draw alongside coagulantStockCoverage
   * above (§17.2). Same "capped by real local market stock, not just treasury" shape. */
  limeStockCoverage: number;
  /** 0..1 coverage of this year's Chlorine purchase against demand (active once
   * drinkingTreatmentTier ≥ 3). Unlike every other funding ratio in this type, this one is capped
   * by real local Chlorine market stock, not just treasury — see urbanWaterModernTreatment.ts. */
  chlorineStockCoverage: number;

  // ── Modern Phase 5 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §16): trickling
  // filter / biological treatment (wastewaterTreatmentTier 1→2) and activated sludge / effluent
  // control (2→3). ─────────────────────────────────────────────────────────────────────────────
  /** 0..1, active once wastewaterTreatmentTier ≥ 2: unaddressed sludge from biological treatment.
   * Unlike chemicalTestCoverage/chlorineStockCoverage above, this is a genuinely evolving stock
   * (carried forward via `previous`, same shape as sourceProtection) rather than a fresh-each-year
   * coverage ratio — an underfunded plant's sludge does not vanish overnight once removal resumes,
   * it drains down gradually. Feeds a capacity penalty on treatmentFactor and a local odor bump —
   * see computeUrbanWaterSystem()'s modernWastewaterTreatmentFactor/odor terms. */
  sludgeBacklog: number;
  /** 0..1 coverage of this year's effluent testing upkeep — active once
   * wastewaterTreatmentTier ≥ 2, same "fresh coverage ratio" shape as chemicalTestCoverage. */
  effluentTestCoverage: number;

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

/**
 * A multi-Burg water-supply or trunk-sewer scheme owned by a State's water authority or a
 * chartered union of participating Burgs, rather than any single Burg
 * (docs/plan/modern-urban-water-treatment-and-governance.md §9.2–9.4).
 *
 * Data-shape only, matching the doc's §9.4 interface exactly — introduced now (Phase 1) so later
 * phases (§8: Phase 3 is its full proposal → survey → negotiate → build → operate lifecycle) have
 * a stable type to build against, the same way Culture.modernizationAffinity was added unwired
 * ahead of the culture work that will read it. Nothing constructs, persists, or reads this type
 * yet — a Giant settlement's inherited Roman waterworks/sewer remain the
 * `hasInheritedRomanWaterworks` / `hasInheritedRomanSewer` fields above, which the doc's §9.4
 * explicitly calls "a provisional legacy record" until a real RegionalWaterScheme replaces it.
 */
export interface RegionalWaterScheme {
  id: number;
  sponsorStateId: number;
  authorityKind: "stateWaterAuthority" | "charteredWaterUnion";
  status:
    | "proposed"
    | "surveying"
    | "negotiating"
    | "funded"
    | "building"
    | "commissioning"
    | "operating"
    | "suspended";
  sourceCellId: number;
  intakeBurgId?: number;
  /** Trunk route only — never individual household connections. */
  routeCellIds: number[];
  /** Burgs receiving water/sewer service from this scheme. */
  memberBurgIds: number[];
  /** Burgs the trunk route crosses without being served themselves. */
  transitBurgIds: number[];
  contractedCapacityByBurg: Record<number, number>;
  approvalByParty: Record<string, "pending" | "approved" | "rejected">;
  capitalContributionByParty: Record<string, number>;
  compensationReserve: number;
  /** 0..1. */
  constructionProgress: number;
  operationsReserve: number;
}

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
