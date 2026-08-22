/**
 * Phase 2 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12.4): annual investment
 * toward `drinkingTreatmentTier`/`wastewaterTreatmentTier` reaching 1 for ordinary (non-Giant)
 * burgs — upstream source protection, slow sand filtration, and primary wastewater settling
 * (screening, grit removal, primary settling, sludge removal). Giants keep their generation-time
 * seeded Tier 1 (urbanWaterSystem.ts's `computeUrbanWaterSystem`) regardless of this module; this
 * module only ever raises OTHER burgs toward that same floor through play.
 *
 * Deliberately kept separate from the legacy `WaterWorksProjectKind`/`settleBurgWaterInvestment`
 * machinery (urbanWaterSystem.ts, urbanWaterTech.ts): the legacy system is one unified `tier`
 * ladder (open ditches → sanitary separation), while `drinkingTreatmentTier` and
 * `wastewaterTreatmentTier` are a second, independent axis that only starts once the legacy tier
 * groundwork already exists (§4 of the doc treats "protected gravity waterworks" — the legacy
 * system's own top end — as the prerequisite baseline modern treatment builds on). Folding the two
 * into one enum would surface these era-gated modern projects in every UI/lookup table built for
 * the medieval ladder.
 *
 * Construction (one-time, from Burg treasury) and operations (recurring, a separate funding pool)
 * are deliberately tracked apart — §5.1's "四つの財布" — so a built-but-unfunded plant can lose its
 * effective benefit without losing the tier itself (§5.1: "施設はあるが安全性は低い").
 *
 * Scope cuts documented so they are not silently forgotten (§12.4 of the doc):
 * - Construction cost here is cash-only. The legacy system's material purchase machinery
 *   (`purchaseProjectMaterials`, Stone/Tools/Brick) is not threaded through for these two new
 *   projects — a reasonable follow-up once Phase 2 gameplay is validated.
 * - Chemical treatment (coagulation, rapid filtration, chlorination — Phase 4) and biological
 *   wastewater treatment (Phase 5) are out of scope; both require Tier 1 as a prerequisite in the
 *   doc's §4.1 technology graph, which this module does not touch.
 */

import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getComfortableTreasuryLevel } from "./guildTreasury";
import type { WaterSanitationTier } from "./urbanWaterTypes";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * §4's Stage B ("低速砂濾過…era 5 の前半") — the earliest era any modern treatment can appear,
 * matching cultures-generator.ts's "Industrial" culture-type era gate (steamEra+).
 */
const MODERN_WATER_ERA = new Set(["steamEra", "industrialChemistryEra", "petroleumEra", "rocketryEra"]);

export function isModernWaterEraAvailable(period: string | undefined): boolean {
  return Boolean(period && MODERN_WATER_ERA.has(period));
}

/** Below this, a burg is too small for a dedicated filtration/settling plant to be plausible.
 *  Exported for reuse by regionalWaterAuthority.ts's own eligibility gate (docs/plan/modern-urban-
 *  water-treatment-and-governance.md §9) — a Burg too small to build its own plant is also too
 *  small to be worth connecting to a shared one. */
export const MODERN_WATER_MIN_POPULATION = 400;

/** §4.1's tech-graph dependency: slow sand filtration presupposes a protected, recorded intake. */
const SOURCE_PROTECTION_MIN_FOR_FILTRATION = 0.6;

// Smaller than the legacy WATER_CONSTRUCTION_BUDGET_SHARE (0.12, urbanWaterSystem.ts) — this is a
// secondary initiative layered on top of whatever the legacy ladder is already spending on, not a
// replacement for it. Both draw from the same Burg treasury each settles in the same annual pass.
const MODERN_CONSTRUCTION_BUDGET_SHARE = 0.06;
const MODERN_OPERATIONS_BUDGET_SHARE = 0.03;

function projectScale(people: number): number {
  return 0.5 + clamp01(people / 15000);
}

function sourceProtectionTreasuryCost(people: number): number {
  return rn(70 * projectScale(people), 2);
}
function drinkingFiltrationTreasuryCost(people: number): number {
  return rn(240 * projectScale(people), 2);
}
function primaryWastewaterTreasuryCost(people: number): number {
  return rn(260 * projectScale(people), 2);
}

/** Annual upkeep once a tier has actually been reached — sand renewal, records, sludge removal. */
function modernDrinkingOperationsNeed(people: number): number {
  return rn(Math.max(1.5, people * 0.0006), 2);
}
function modernWastewaterOperationsNeed(people: number): number {
  return rn(Math.max(1.5, people * 0.0007), 2);
}

export type ModernWaterTreatmentInvestmentResult = {
  drinkingTreatmentTier: WaterSanitationTier;
  wastewaterTreatmentTier: WaterSanitationTier;
  sourceProtection: number;
  drinkingTreatmentUpgradeProgress: number;
  wastewaterTreatmentUpgradeProgress: number;
  treatmentOperationsFunding: number;
  wastewaterOperationsFunding: number;
  lastModernConstructionSpend: number;
};

/**
 * Advances one burg's modern-treatment investment by one year, mutating `burg.treasury` for both
 * construction and operations spend (mirrors `settleBurgWaterInvestment`'s treasury mutation
 * pattern). Returns the updated fields; callers merge them into the next `computeUrbanWaterSystem`
 * pass the same way `settleBurgWaterInvestment`'s result is merged today.
 *
 * No-ops (returns `previous` unchanged, spending nothing) once both tiers are already ≥ 1 — Phase 2
 * only reaches Tier 1; Phase 4/5 own what comes after.
 */
export function settleModernWaterTreatmentInvestment(args: {
  burg: Burg;
  people: number;
  period: string | undefined;
  hasUpstreamIntake: boolean;
  hasDownstreamOutfall: boolean;
  /** Culture.modernizationAffinity (0..1, docs/plan/modern-urban-water-treatment-and-governance.md
   * §11) — modulates investment SPEED only, never eligibility (§11.4: "技術的に不可能なことを可能に
   * はしない"). Era and geography gates below are the same for every culture. */
  modernizationAffinity: number;
  waterContamination: number;
  previous: {
    drinkingTreatmentTier: WaterSanitationTier;
    wastewaterTreatmentTier: WaterSanitationTier;
    sourceProtection: number;
    drinkingTreatmentUpgradeProgress: number;
    wastewaterTreatmentUpgradeProgress: number;
  };
}): ModernWaterTreatmentInvestmentResult {
  const { burg, people, period, hasUpstreamIntake, hasDownstreamOutfall, waterContamination, previous } = args;

  let drinkingTier = previous.drinkingTreatmentTier;
  let wastewaterTier = previous.wastewaterTreatmentTier;

  if (
    !isModernWaterEraAvailable(period) ||
    people < MODERN_WATER_MIN_POPULATION ||
    (drinkingTier >= 1 && wastewaterTier >= 1)
  ) {
    return {
      drinkingTreatmentTier: drinkingTier,
      wastewaterTreatmentTier: wastewaterTier,
      sourceProtection: previous.sourceProtection,
      drinkingTreatmentUpgradeProgress: previous.drinkingTreatmentUpgradeProgress,
      wastewaterTreatmentUpgradeProgress: previous.wastewaterTreatmentUpgradeProgress,
      treatmentOperationsFunding: 0,
      wastewaterOperationsFunding: 0,
      lastModernConstructionSpend: 0
    };
  }

  const affinity = clamp01(args.modernizationAffinity);
  // Baseline willingness plus contamination pressure (an already-dirty water supply is a stronger
  // reason to invest); affinity is a pure speed multiplier on top, 0.35x .. 1.65x.
  const urgency = clamp01(0.3 + waterContamination * 0.7);
  const speedMultiplier = 0.35 + affinity * 1.3;
  const stepRate = urgency * speedMultiplier * 0.5;

  const liquid = Math.max(0, burg.treasury ?? 0);
  const cushion = getComfortableTreasuryLevel(burg) * 0.15;
  let spendable = Math.max(0, Math.min(liquid - cushion, liquid * MODERN_CONSTRUCTION_BUDGET_SHARE));
  let totalConstructionSpend = 0;

  let sourceProtection = previous.sourceProtection;
  let drinkingProgress = previous.drinkingTreatmentUpgradeProgress;
  let wastewaterProgress = previous.wastewaterTreatmentUpgradeProgress;

  // Step 1: source protection — a prerequisite for filtration, and a small drinkingWaterSecurity
  // bonus in its own right even before filtration exists (§2's priority-1 item).
  if (hasUpstreamIntake && sourceProtection < 1 && spendable > 0) {
    const cost = sourceProtectionTreasuryCost(people);
    const step = Math.min(spendable, cost * stepRate);
    sourceProtection = clamp01(sourceProtection + (cost > 0 ? step / cost : 0));
    spendable -= step;
    totalConstructionSpend += step;
  }

  // Step 2: slow sand filtration → drinkingTreatmentTier 0→1, gated on source protection being
  // meaningfully underway (§4.1: slowSandFiltration depends on protectedIntakeAndWaterRecords).
  if (
    hasUpstreamIntake &&
    drinkingTier < 1 &&
    sourceProtection >= SOURCE_PROTECTION_MIN_FOR_FILTRATION &&
    spendable > 0
  ) {
    const cost = drinkingFiltrationTreasuryCost(people);
    const step = Math.min(spendable, cost * stepRate);
    drinkingProgress = clamp01(drinkingProgress + (cost > 0 ? step / cost : 0));
    spendable -= step;
    totalConstructionSpend += step;
    if (drinkingProgress >= 0.999) {
      drinkingTier = 1;
      drinkingProgress = 0;
    }
  }

  // Step 3: primary wastewater settling → wastewaterTreatmentTier 0→1. Independent track — needs a
  // legitimate outfall (docs/plan/modern-urban-water-treatment-and-governance.md §2.2's basinKind
  // gate, urbanWaterSystem.ts's hasDownstreamOutfall), not source protection.
  if (hasDownstreamOutfall && wastewaterTier < 1 && spendable > 0) {
    const cost = primaryWastewaterTreasuryCost(people);
    const step = Math.min(spendable, cost * stepRate);
    wastewaterProgress = clamp01(wastewaterProgress + (cost > 0 ? step / cost : 0));
    spendable -= step;
    totalConstructionSpend += step;
    if (wastewaterProgress >= 0.999) {
      wastewaterTier = 1;
      wastewaterProgress = 0;
    }
  }

  if (totalConstructionSpend > 0) burg.treasury = rn((burg.treasury ?? 0) - totalConstructionSpend, 2);

  // Operations: recurring, a separate pool from construction above — only relevant once a tier has
  // actually been reached this year or earlier.
  const opsLiquid = Math.max(0, burg.treasury ?? 0);
  const opsCushion = getComfortableTreasuryLevel(burg) * 0.1;
  const opsAvailable = Math.max(0, Math.min(opsLiquid - opsCushion, opsLiquid * MODERN_OPERATIONS_BUDGET_SHARE));

  const drinkingOpsNeed = drinkingTier >= 1 ? modernDrinkingOperationsNeed(people) : 0;
  const wastewaterOpsNeed = wastewaterTier >= 1 ? modernWastewaterOperationsNeed(people) : 0;
  const totalOpsNeed = drinkingOpsNeed + wastewaterOpsNeed;
  const opsSpend = Math.min(opsAvailable, totalOpsNeed);
  if (opsSpend > 0) burg.treasury = rn((burg.treasury ?? 0) - opsSpend, 2);

  const treatmentOperationsFunding =
    drinkingOpsNeed > 0 ? clamp01((opsSpend * (drinkingOpsNeed / totalOpsNeed)) / drinkingOpsNeed) : 0;
  const wastewaterOperationsFunding =
    wastewaterOpsNeed > 0 ? clamp01((opsSpend * (wastewaterOpsNeed / totalOpsNeed)) / wastewaterOpsNeed) : 0;

  return {
    drinkingTreatmentTier: drinkingTier,
    wastewaterTreatmentTier: wastewaterTier,
    sourceProtection: rn(sourceProtection, 4),
    drinkingTreatmentUpgradeProgress: rn(drinkingProgress, 4),
    wastewaterTreatmentUpgradeProgress: rn(wastewaterProgress, 4),
    treatmentOperationsFunding: rn(treatmentOperationsFunding, 4),
    wastewaterOperationsFunding: rn(wastewaterOperationsFunding, 4),
    lastModernConstructionSpend: rn(totalConstructionSpend, 2)
  };
}
