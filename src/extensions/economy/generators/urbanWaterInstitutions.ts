/**
 * Phase 3 pure helpers for urban water: institutions, organic-waste pathways,
 * climate-aware composting, and river pollution externalities.
 *
 * Design: docs/plan/urban-water-and-sanitation-system.md §4, §7–8, §11 Phase 3.
 */

import { rn } from "../../hostUtils";
import type { CulturalHygieneProfile, UrbanWaterSystem, WaterSanitationTier } from "./urbanWaterTypes";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Legacy-ladder-only cleaning tax rate cap — unchanged from before the modern-ladder surcharge
 *  below existed, so a burg with no drinkingTreatmentTier/wastewaterTreatmentTier progress sees a
 *  byte-identical cleaningTaxRate to before that addition. */
const LEGACY_CLEANING_TAX_RATE_CAP = 0.04;
/** Per completed drinkingTreatmentTier/wastewaterTreatmentTier step (docs/plan/modern-urban-water-
 *  treatment-and-governance.md §15/§16 — coagulation/rapid filtration, chlorination, biological
 *  treatment, activated sludge), the recurring municipal overhead those plants carry justifies its
 *  own small surcharge on top of the legacy-ladder rate above, capped separately below. */
const MODERN_CLEANING_TAX_SURCHARGE_PER_TIER = 0.005;
/** Combined cap once the modern-ladder surcharge is added — above the legacy-only
 *  LEGACY_CLEANING_TAX_RATE_CAP so a fully-modernized city (Tier 3/3) can actually realize the
 *  surcharge instead of being silently absorbed by a cap sized for the legacy ladder alone. */
const CLEANING_TAX_RATE_CAP = 0.07;

/** Target institutional settings implied by tier and pressures (before annual EWMA). */
export function institutionalTargets(args: {
  tier: WaterSanitationTier;
  contamination: number;
  sanitationBurden: number;
  demandUrgency: number;
  /** Academy administration bonus multiplier, typically ~1.0–1.2. */
  administrationBonus: number;
  /** Modern Phase 2/4/5 ladder (docs/plan/modern-urban-water-treatment-and-governance.md §8, §15,
   *  §16), read alongside the legacy `tier` above, not instead of it — see
   *  MODERN_CLEANING_TAX_SURCHARGE_PER_TIER. Optional/defaulted to 0 so existing callers that only
   *  track the legacy ladder keep compiling and keep their existing cleaningTaxRate unchanged. */
  drinkingTreatmentTier?: WaterSanitationTier;
  wastewaterTreatmentTier?: WaterSanitationTier;
}): {
  connectionPermitCoverage: number;
  cleaningTaxRate: number;
  dischargeRegulation: number;
} {
  const { tier, contamination, sanitationBurden, demandUrgency, administrationBonus } = args;
  const drinkingTreatmentTier = args.drinkingTreatmentTier ?? 0;
  const wastewaterTreatmentTier = args.wastewaterTreatmentTier ?? 0;
  const pressure = clamp01(contamination * 0.45 + sanitationBurden * 0.35 + demandUrgency * 0.35);
  const admin = Math.max(0.85, Math.min(1.35, administrationBonus));

  // Cleaning tax appears with any organised drains; grows with pressure. Modern-ladder surcharge is
  // strictly additive on top (see the two constants above), so a burg still at
  // drinkingTreatmentTier/wastewaterTreatmentTier 0 gets +0 and an identical result to before.
  const legacyCleaningTaxRate =
    tier <= 0 ? 0 : Math.min(LEGACY_CLEANING_TAX_RATE_CAP, clamp01((0.008 + tier * 0.004 + pressure * 0.012) * admin));
  const modernCleaningTaxSurcharge =
    tier <= 0 ? 0 : (drinkingTreatmentTier + wastewaterTreatmentTier) * MODERN_CLEANING_TAX_SURCHARGE_PER_TIER * admin;
  const cleaningTaxRate = Math.min(CLEANING_TAX_RATE_CAP, legacyCleaningTaxRate + modernCleaningTaxSurcharge);

  // Connection permits are a management tier (design Tier 4 idea), soft-started at tier 3.
  const connectionPermitCoverage =
    tier < 3 ? (tier >= 2 ? pressure * 0.15 * admin : 0) : clamp01((0.25 + pressure * 0.55) * admin);

  // Discharge regulation protects intake; weak without covered drains / institutions.
  const dischargeRegulation =
    tier < 2
      ? pressure * 0.08
      : tier < 3
        ? clamp01(0.12 + pressure * 0.25) * admin
        : clamp01(0.28 + pressure * 0.45) * admin;

  return {
    connectionPermitCoverage: rn(connectionPermitCoverage, 4),
    cleaningTaxRate: rn(cleaningTaxRate, 4),
    dischargeRegulation: rn(dischargeRegulation, 4)
  };
}

/** Soft-adopt institutions toward targets each year (not instant law). */
export function evolveInstitutions(args: {
  previous: Pick<UrbanWaterSystem, "connectionPermitCoverage" | "cleaningTaxRate" | "dischargeRegulation"> | null;
  tier: WaterSanitationTier;
  contamination: number;
  sanitationBurden: number;
  demandUrgency: number;
  administrationBonus: number;
  /** See institutionalTargets()'s own doc on these two — forwarded straight through. */
  drinkingTreatmentTier?: WaterSanitationTier;
  wastewaterTreatmentTier?: WaterSanitationTier;
}): {
  connectionPermitCoverage: number;
  cleaningTaxRate: number;
  dischargeRegulation: number;
} {
  const rate = 0.22;
  const target = institutionalTargets(args);
  const prev = args.previous;
  return {
    connectionPermitCoverage: rn(
      (prev?.connectionPermitCoverage ?? 0) * (1 - rate) + target.connectionPermitCoverage * rate,
      4
    ),
    cleaningTaxRate: rn((prev?.cleaningTaxRate ?? 0) * (1 - rate) + target.cleaningTaxRate * rate, 4),
    dischargeRegulation: rn((prev?.dischargeRegulation ?? 0) * (1 - rate) + target.dischargeRegulation * rate, 4)
  };
}

/**
 * Cleaning tax revenue for one year. Separate from state poll tax; lands in burg.treasury.
 * Rate is dimensionless; scaled by product and a small per-capita term.
 */
export function cleaningTaxRevenue(args: { cleaningTaxRate: number; people: number; product: number }): number {
  const { cleaningTaxRate, people, product } = args;
  if (cleaningTaxRate <= 0) return 0;
  return rn(product * cleaningTaxRate + people * cleaningTaxRate * 0.002, 2);
}

/**
 * Managed composting efficiency: ambient temperature is a modifier, not a hard gate.
 * Large pile mass, cover, and management share compensate for cold (§8.3).
 */
export function compostingEfficiency(args: {
  ambientTemperature: number;
  /** Proxy for pile mass — urban population. */
  people: number;
  managedCompostingShare: number;
  /** Roof / insulation / seasonal storage (tier or capital). */
  hasStorageCover: boolean;
}): number {
  const { ambientTemperature, people, managedCompostingShare, hasStorageCover } = args;
  if (managedCompostingShare <= 0.01) return 0;

  // Microbial core prefers ~15–35°C; cold slows but does not hard-stop large covered piles.
  const tempFactor =
    ambientTemperature <= -10
      ? 0.12
      : ambientTemperature < 0
        ? 0.2 + ((ambientTemperature + 10) / 10) * 0.2
        : ambientTemperature < 8
          ? 0.4 + ((ambientTemperature - 0) / 8) * 0.35
          : ambientTemperature <= 28
            ? 1
            : ambientTemperature <= 38
              ? 1 - ((ambientTemperature - 28) / 10) * 0.25
              : 0.55;

  const massFactor = clamp01(0.25 + Math.log1p(people / 500) / 4);
  const coverBonus = hasStorageCover ? 0.12 : 0;
  // Cold compensation never exceeds the warm-temperature path: it only partially offsets tempFactor.
  const coldCompensation =
    ambientTemperature < 5 ? Math.min(0.35, massFactor * 0.25 + (hasStorageCover ? 0.12 : 0)) : 0;

  return clamp01(
    managedCompostingShare * Math.min(1.05, tempFactor + coldCompensation + coverBonus) * (0.55 + massFactor * 0.45)
  );
}

export type OrganicPathwayOutcome = {
  /** Residual street organic nuisance after pathways (0..1). */
  organicStreetLoad: number;
  compostingEfficiency: number;
  /** Fertilizer / night-soil return supporting near-burg agriculture (0..1). */
  fertilizerReturn: number;
  /** Scavenging relief on street waste (free-range pigs + profile). */
  scavengingRelief: number;
  /** Zoonotic / street mess risk from scavenging (not pig-toilet production). */
  scavengingRisk: number;
  /** Facility pig-toilet practice — kept near 0 for free-range urban pigs. */
  pigToiletPractice: number;
  /** Share of organic mass pushed into watercourses. */
  waterDischargeShare: number;
  /** Open dumping share after permits reduce illegal discharge. */
  openDisposalShare: number;
};

/**
 * Resolve organic-waste pathways for a burg.
 * Free-range pigs reduce street organics but raise health risk; they never equal pig toilets.
 */
export function resolveOrganicPathways(args: {
  profile: CulturalHygieneProfile;
  people: number;
  ambientTemperature: number;
  tier: WaterSanitationTier;
  isCapital: boolean;
  isPort: boolean;
  /** Market pig heads relative intensity 0..1. */
  pigScavenging: number;
  connectionPermitCoverage: number;
  irrigationCapacity: number;
}): OrganicPathwayOutcome {
  const {
    profile,
    people,
    ambientTemperature,
    tier,
    isCapital,
    isPort,
    pigScavenging,
    connectionPermitCoverage,
    irrigationCapacity
  } = args;

  const base = profile.organicWaste;
  // Permits and higher tiers suppress open street dumping.
  const openSuppression = connectionPermitCoverage * 0.55 + Math.min(tier, 3) * 0.06;
  const openDisposalShare = clamp01(base.openDisposal * (1 - openSuppression));
  const cesspitShare = clamp01(base.cesspit * (1 + (people > 3000 ? 0.15 : 0)));
  const nightSoilShare = clamp01(base.nightSoilCollection * (0.7 + irrigationCapacity * 0.6));
  const compostShare = base.managedComposting;
  const scavengingShare = clamp01(base.animalScavenging + pigScavenging * 0.35);
  let waterDischargeShare = clamp01(base.waterDischarge * (isPort ? 1.25 : 1));

  // Density pushes residual open dumping into water when no land pathway capacity.
  if (people > 8000) waterDischargeShare = clamp01(waterDischargeShare + 0.08);

  const compostEff = compostingEfficiency({
    ambientTemperature,
    people,
    managedCompostingShare: compostShare,
    hasStorageCover: tier >= 1 || isCapital
  });

  // Pig toilets are an intentional facility culture — free-range market pigs do not create them.
  const pigToiletPractice = 0;

  const scavengingRelief = clamp01(scavengingShare * 0.4 + pigScavenging * 0.3);
  const scavengingRisk = clamp01(scavengingShare * 0.25 + pigScavenging * 0.35 + pigToiletPractice * 0.5);

  const fertilizerReturn = clamp01(nightSoilShare * 0.55 + compostEff * 0.65);

  const handled =
    openDisposalShare * 0.05 +
    cesspitShare * 0.55 +
    nightSoilShare * 0.7 +
    compostEff * 0.75 +
    scavengingRelief * 0.5 +
    waterDischargeShare * 0.85;

  const organicStreetLoad = clamp01(0.15 + openDisposalShare * 0.7 + (1 - handled) * 0.35 - scavengingRelief * 0.2);

  return {
    organicStreetLoad: rn(organicStreetLoad, 4),
    compostingEfficiency: rn(compostEff, 4),
    fertilizerReturn: rn(fertilizerReturn, 4),
    scavengingRelief: rn(scavengingRelief, 4),
    scavengingRisk: rn(scavengingRisk, 4),
    pigToiletPractice,
    waterDischargeShare: rn(waterDischargeShare, 4),
    openDisposalShare: rn(openDisposalShare, 4)
  };
}

/** Local intake vs outfall mixing on a single burg site. */
export function localMixedIntakeOutfall(args: {
  hasRiver: boolean;
  hasSeparateWastewaterRoute: boolean;
  dischargeRegulation: number;
}): boolean {
  const { hasRiver, hasSeparateWastewaterRoute, dischargeRegulation } = args;
  if (!hasRiver) return false;
  if (hasSeparateWastewaterRoute) return false;
  // Strong regulation can segregate timing/zones enough to count as protected practice.
  if (dischargeRegulation >= 0.55) return false;
  return true;
}

/**
 * Drinking-water health bonus from infrastructure tier.
 * Verification: tier 3 alone does not grant a bonus while intake shares the outfall stream.
 */
export function tierDrinkingHealthBonus(args: {
  tier: WaterSanitationTier;
  localMixed: boolean;
  dischargeRegulation: number;
  hasUpstreamIntake: boolean;
}): number {
  const { tier, localMixed, dischargeRegulation, hasUpstreamIntake } = args;
  if (tier <= 0) return 0;
  if (localMixed && dischargeRegulation < 0.4) return 0;
  if (!hasUpstreamIntake && localMixed) return tier * 0.01;
  return tier * 0.04;
}

/** Pollution a burg exports to the watercourse this year (0..1). */
export function pollutionExport(args: {
  wasteDeficit: number;
  waterDischargeShare: number;
  openDisposalShare: number;
  dischargeRegulation: number;
  hasDownstreamOutfall: boolean;
  people: number;
}): number {
  const { wasteDeficit, waterDischargeShare, openDisposalShare, dischargeRegulation, hasDownstreamOutfall, people } =
    args;
  if (!hasDownstreamOutfall) return clamp01(openDisposalShare * 0.2);
  const raw =
    wasteDeficit * 0.45 + waterDischargeShare * 0.4 + openDisposalShare * 0.15 + clamp01(people / 20000) * 0.1;
  return clamp01(raw * (1 - dischargeRegulation * 0.65));
}

export type RiverBurgNode = {
  burgId: number;
  riverId: number;
  /** Higher = further upstream (pack height, or reverse index along river cells). */
  upstreamRank: number;
  exportLoad: number;
};

/**
 * Propagate pollution down each river: each burg receives a diluted sum of upstream exports.
 */
export function propagateRiverPollution(
  nodes: readonly RiverBurgNode[]
): Map<number, { upstreamPollutionImport: number; downstreamPollutionExport: number }> {
  const byRiver = new Map<number, RiverBurgNode[]>();
  for (const node of nodes) {
    const list = byRiver.get(node.riverId) ?? [];
    list.push(node);
    byRiver.set(node.riverId, list);
  }

  const result = new Map<number, { upstreamPollutionImport: number; downstreamPollutionExport: number }>();

  for (const list of byRiver.values()) {
    list.sort((a, b) => b.upstreamRank - a.upstreamRank); // upstream first
    let carried = 0;
    for (const node of list) {
      const imported = clamp01(carried);
      result.set(node.burgId, {
        upstreamPollutionImport: rn(imported, 4),
        downstreamPollutionExport: rn(node.exportLoad, 4)
      });
      // Slow dilution along the reach; each outfall adds to the plume.
      carried = clamp01(carried * 0.78 + node.exportLoad * 0.9);
    }
  }

  return result;
}

/** Health / disease pressure from local and imported sanitation liabilities. */
export function healthPressureFromSanitation(args: {
  waterContamination: number;
  sanitationBurden: number;
  organicStreetLoad: number;
  scavengingRisk: number;
  upstreamPollutionImport: number;
  drinkingWaterSecurity: number;
  coalSmokeExposure?: number;
}): number {
  const {
    waterContamination,
    sanitationBurden,
    organicStreetLoad,
    scavengingRisk,
    upstreamPollutionImport,
    drinkingWaterSecurity,
    coalSmokeExposure = 0
  } = args;
  return clamp01(
    waterContamination * 0.35 +
      sanitationBurden * 0.25 +
      organicStreetLoad * 0.15 +
      scavengingRisk * 0.12 +
      upstreamPollutionImport * 0.2 -
      drinkingWaterSecurity * 0.15 +
      clamp01(coalSmokeExposure) * 0.22
  );
}

/** Soft yield drag on irrigation from polluted water (downstream externality). */
export function irrigationPollutionPenalty(upstreamPollutionImport: number, irrigationCapacity: number): number {
  return clamp01(irrigationCapacity * (1 - upstreamPollutionImport * 0.35));
}
