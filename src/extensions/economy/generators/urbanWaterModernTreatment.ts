/**
 * Phase 2/4 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12.4, §15): annual
 * investment toward `drinkingTreatmentTier`/`wastewaterTreatmentTier` for ordinary (non-Giant)
 * burgs. Phase 2 covers Tier 0→1 (upstream source protection, slow sand filtration, primary
 * wastewater settling). Phase 4 extends the SAME drinking-water ladder two steps further —
 * Tier 1→2 (coagulation/rapid filtration) and Tier 2→3 (controlled chlorination) — reusing the
 * same shared upgrade-progress meter rather than adding a new one per step (§15.1). Giants keep
 * their generation-time seeded Tier 1 (urbanWaterSystem.ts's `computeUrbanWaterSystem`) regardless
 * of this module; this module only ever raises OTHER burgs toward and past that same floor through
 * play. Wastewater stays at Tier 0→1 only — Phase 5 (biological treatment) is out of scope here.
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
 * Phase 4 (§15) adds two real per-State technology gates (`analyticalChemistry` for Tier 1→2,
 * `catalyticChemistry` for Tier 2→3 — both already exist in technologyDefinitions.ts, matching the
 * doc's §4.1 technology graph's own prerequisites for `rapidFiltrationAndCoagulation` and
 * `controlledWaterChlorination`) and one real Good draw: Tier 3 chlorination actually buys
 * `Chlorine` from the burg's local market (`Markets.consumeForMarketInvestment`, the same paid-draw
 * primitive `purchaseProjectMaterials` already uses for Stone/Tools/Brick), so a Burg with no local
 * Chlorine supply or trade route gets little of Tier 3's benefit regardless of budget — Chlorine
 * plants (chlorinePlants.ts/chlorAlkaliPlants.ts) currently produce ~0.15-0.6 barrels/plant/year,
 * so this is a genuinely scarce input, not a rubber-stamp gate.
 *
 * Scope cuts documented so they are not silently forgotten (§12.4/§15 of the doc):
 * - Construction cost here is cash-only. The legacy system's material purchase machinery
 *   (`purchaseProjectMaterials`, Stone/Tools/Brick) is not threaded through for these projects —
 *   Chlorine is the one exception, since Good-based scarcity is the actual point of Tier 3.
 * - Biological wastewater treatment (Phase 5) is out of scope; wastewaterTreatmentTier stays
 *   capped at 1 here.
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods } from "../economyContext";
import { getComfortableTreasuryLevel } from "./guildTreasury";
import { Markets } from "./markets-generator";
import type { WaterSanitationTier } from "./urbanWaterTypes";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * §4's Stage B ("低速砂濾過…era 5 の前半") — the earliest era any modern treatment can appear,
 * matching cultures-generator.ts's "Industrial" culture-type era gate (steamEra+). This is the
 * OUTER gate for the whole ladder; Tier 1→2/2→3 (Phase 4) add per-State technology-stage gates on
 * top (§15), since a blanket era string can't express "this particular State's chemistry".
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
/** Separate, smaller slice for the Tier 3 Chlorine purchase (§15) — a real Good draw, not general
 *  cash upkeep, so it is not folded into MODERN_OPERATIONS_BUDGET_SHARE above. */
const MODERN_CHLORINE_BUDGET_SHARE = 0.025;

function projectScale(people: number): number {
  return 0.5 + clamp01(people / 15000);
}

function sourceProtectionTreasuryCost(people: number): number {
  return rn(70 * projectScale(people), 2);
}

/**
 * Cost of the NEXT drinking-treatment step, keyed by the tier a burg is upgrading FROM. Tier 0→1
 * (slow sand filtration) and tiers 1→2/2→3 (Phase 4's rapid filtration/coagulation and controlled
 * chlorination) share one progress meter (`drinkingTreatmentUpgradeProgress`) — see this file's
 * header — so the meter's cost basis must switch with the current tier rather than being one fixed
 * constant. Costs rise with each step: later stages need pumps, dosing gear, and a contact tank on
 * top of the previous stage's works, not instead of them.
 */
function drinkingTreatmentStepCost(fromTier: WaterSanitationTier, people: number): number {
  const scale = projectScale(people);
  switch (fromTier) {
    case 0:
      return rn(240 * scale, 2); // slowSandFiltration
    case 1:
      return rn(420 * scale, 2); // rapidFiltrationAndCoagulation
    case 2:
      return rn(560 * scale, 2); // controlledWaterChlorination (dosing gear, contact tank, test bench)
    default:
      return 0;
  }
}

function primaryWastewaterTreasuryCost(people: number): number {
  return rn(260 * projectScale(people), 2);
}

/** Annual upkeep once a tier has actually been reached — sand renewal, records, sludge removal.
 *  Scales up with tier: Tier 2/3 keep running pumps, dosing controllers, and a contact tank on top
 *  of Tier 1's works, not instead of them. */
function modernDrinkingOperationsNeed(people: number, tier: WaterSanitationTier): number {
  const base = Math.max(1.5, people * 0.0006);
  const tierMultiplier = tier >= 3 ? 2.2 : tier >= 2 ? 1.6 : 1;
  return rn(base * tierMultiplier, 2);
}
function modernWastewaterOperationsNeed(people: number): number {
  return rn(Math.max(1.5, people * 0.0007), 2);
}
/** Glass/reagent/record-keeping upkeep for water-quality testing (§1, §3's "測定・記録具" row) —
 *  active once rapid filtration (Tier ≥ 2) makes dosing control worth verifying. */
function chemicalTestOperationsNeed(people: number): number {
  return rn(Math.max(1, people * 0.00025), 2);
}

/**
 * Barrels of Chlorine a Tier 3 plant needs per year. Deliberately small: a "service" Chlorine
 * plant (chlorinePlants.ts) produces only ~0.6 barrels/year, so even a large city's chlorination
 * demand should sit within reach of ONE regional plant's output, not dwarf it.
 */
function chlorineAnnualNeed(people: number): number {
  return rn(Math.max(0.01, people * 0.000012), 4);
}

/** §4.1: rapidFiltrationAndCoagulation's prerequisite. Per-State, not a blanket era string. */
function analyticalChemistryDemonstrated(stateId: number): boolean {
  return isTechnologyStageAtLeast(getTechnologyStage("analyticalChemistry", stateId), "demonstrated");
}
/** §4.1: controlledWaterChlorination's prerequisite (same node chlorinePlants.ts's Chlorine supply
 *  already requires — Tier 3 is meaningless without a chemistry base that can also supply it). */
function catalyticChemistryDemonstrated(stateId: number): boolean {
  return isTechnologyStageAtLeast(getTechnologyStage("catalyticChemistry", stateId), "demonstrated");
}

export type ModernWaterTreatmentInvestmentResult = {
  drinkingTreatmentTier: WaterSanitationTier;
  wastewaterTreatmentTier: WaterSanitationTier;
  sourceProtection: number;
  drinkingTreatmentUpgradeProgress: number;
  wastewaterTreatmentUpgradeProgress: number;
  treatmentOperationsFunding: number;
  wastewaterOperationsFunding: number;
  /** 0..1: this year's water-quality testing upkeep coverage (Tier ≥ 2 only). */
  chemicalTestCoverage: number;
  /** 0..1: this year's Chlorine purchase coverage against chlorineAnnualNeed() (Tier ≥ 3 only). */
  chlorineStockCoverage: number;
  lastModernConstructionSpend: number;
};

/**
 * Advances one burg's modern-treatment investment by one year, mutating `burg.treasury` for both
 * construction and operations spend (mirrors `settleBurgWaterInvestment`'s treasury mutation
 * pattern). Returns the updated fields; callers merge them into the next `computeUrbanWaterSystem`
 * pass the same way `settleBurgWaterInvestment`'s result is merged today.
 *
 * No-ops (returns `previous` unchanged, spending nothing) only when the era/population gate fails —
 * NOT once a tier target is reached: operations funding (and, at Tier 3, the Chlorine purchase)
 * must keep being paid for every year afterward, or an already-built plant would silently lose its
 * benefit forever after the one year the outer gate used to stop early (§15.2 fixes this — the
 * previous guard doubled as "stop constructing" AND "stop funding operations", which was only safe
 * by accident because no fixture had ever driven both tiers to ≥ 1 in the same year before Phase 4
 * made that a normal, permanent steady state).
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

  if (!isModernWaterEraAvailable(period) || people < MODERN_WATER_MIN_POPULATION) {
    return {
      drinkingTreatmentTier: drinkingTier,
      wastewaterTreatmentTier: wastewaterTier,
      sourceProtection: previous.sourceProtection,
      drinkingTreatmentUpgradeProgress: previous.drinkingTreatmentUpgradeProgress,
      wastewaterTreatmentUpgradeProgress: previous.wastewaterTreatmentUpgradeProgress,
      treatmentOperationsFunding: 0,
      wastewaterOperationsFunding: 0,
      chemicalTestCoverage: 0,
      chlorineStockCoverage: 0,
      lastModernConstructionSpend: 0
    };
  }

  const stateId = burg.state ?? 0;
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

  // Step 2: the drinking-treatment ladder, Tier 0→1→2→3, one shared progress meter that resets to
  // 0 each time a tier completes (§15.1). Each step has its own tech-graph prerequisite (§4.1):
  // Tier 0→1 (slow sand filtration) needs source protection underway; Tier 1→2 (rapid filtration/
  // coagulation) needs analyticalChemistry demonstrated; Tier 2→3 (controlled chlorination) needs
  // catalyticChemistry demonstrated — the same node Chlorine's own supply chain requires
  // (chlorinePlants.ts), so Tier 3 cannot get ahead of the chemistry that would eventually supply it.
  if (hasUpstreamIntake && drinkingTier < 3 && spendable > 0) {
    const stepReady =
      (drinkingTier === 0 && sourceProtection >= SOURCE_PROTECTION_MIN_FOR_FILTRATION) ||
      (drinkingTier === 1 && analyticalChemistryDemonstrated(stateId)) ||
      (drinkingTier === 2 && catalyticChemistryDemonstrated(stateId));
    if (stepReady) {
      const cost = drinkingTreatmentStepCost(drinkingTier, people);
      const step = Math.min(spendable, cost * stepRate);
      drinkingProgress = clamp01(drinkingProgress + (cost > 0 ? step / cost : 0));
      spendable -= step;
      totalConstructionSpend += step;
      if (drinkingProgress >= 0.999) {
        drinkingTier = (drinkingTier + 1) as WaterSanitationTier;
        drinkingProgress = 0;
      }
    }
  }

  // Step 3: primary wastewater settling → wastewaterTreatmentTier 0→1. Independent track — needs a
  // legitimate outfall (docs/plan/modern-urban-water-treatment-and-governance.md §2.2's basinKind
  // gate, urbanWaterSystem.ts's hasDownstreamOutfall), not source protection. Stays at Tier 0→1
  // only — biological treatment (Phase 5) is out of this module's scope.
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
  // actually been reached this year or earlier. Runs every year regardless of construction status
  // (see this function's own doc comment on why the old "stop once done" guard was wrong).
  const opsLiquid = Math.max(0, burg.treasury ?? 0);
  const opsCushion = getComfortableTreasuryLevel(burg) * 0.1;
  const opsAvailable = Math.max(0, Math.min(opsLiquid - opsCushion, opsLiquid * MODERN_OPERATIONS_BUDGET_SHARE));

  const drinkingOpsNeed = drinkingTier >= 1 ? modernDrinkingOperationsNeed(people, drinkingTier) : 0;
  const wastewaterOpsNeed = wastewaterTier >= 1 ? modernWastewaterOperationsNeed(people) : 0;
  const testOpsNeed = drinkingTier >= 2 ? chemicalTestOperationsNeed(people) : 0;
  const totalOpsNeed = drinkingOpsNeed + wastewaterOpsNeed + testOpsNeed;
  const opsSpend = Math.min(opsAvailable, totalOpsNeed);
  if (opsSpend > 0) burg.treasury = rn((burg.treasury ?? 0) - opsSpend, 2);

  const treatmentOperationsFunding =
    drinkingOpsNeed > 0 ? clamp01((opsSpend * (drinkingOpsNeed / totalOpsNeed)) / drinkingOpsNeed) : 0;
  const wastewaterOperationsFunding =
    wastewaterOpsNeed > 0 ? clamp01((opsSpend * (wastewaterOpsNeed / totalOpsNeed)) / wastewaterOpsNeed) : 0;
  const chemicalTestCoverage = testOpsNeed > 0 ? clamp01((opsSpend * (testOpsNeed / totalOpsNeed)) / testOpsNeed) : 0;

  // Chlorine purchase (§15): a real Good draw from the local market, not cash-only upkeep — the
  // mechanic Phase 4 introduces. Drawn from its own small budget slice, separate from the cash ops
  // pool above, and capped by both that budget and actual market stock (Markets.
  // consumeForMarketInvestment, the same paid-draw primitive purchaseProjectMaterials uses).
  let chlorineStockCoverage = 0;
  if (drinkingTier >= 3) {
    const marketId = burg.market ?? 0;
    const chlorineGood = getGoods().find(good => good.name === "Chlorine");
    const needed = chlorineAnnualNeed(people);
    if (marketId && chlorineGood && needed > 0) {
      const chlorineLiquid = Math.max(0, burg.treasury ?? 0);
      const chlorineBudget = chlorineLiquid * MODERN_CHLORINE_BUDGET_SHARE;
      const { units, cost } = Markets.consumeForMarketInvestment(marketId, chlorineGood.i, needed, chlorineBudget);
      if (cost > 0) burg.treasury = rn((burg.treasury ?? 0) - cost, 2);
      chlorineStockCoverage = clamp01(units / needed);
    }
  }

  return {
    drinkingTreatmentTier: drinkingTier,
    wastewaterTreatmentTier: wastewaterTier,
    sourceProtection: rn(sourceProtection, 4),
    drinkingTreatmentUpgradeProgress: rn(drinkingProgress, 4),
    wastewaterTreatmentUpgradeProgress: rn(wastewaterProgress, 4),
    treatmentOperationsFunding: rn(treatmentOperationsFunding, 4),
    wastewaterOperationsFunding: rn(wastewaterOperationsFunding, 4),
    chemicalTestCoverage: rn(chemicalTestCoverage, 4),
    chlorineStockCoverage: rn(chlorineStockCoverage, 4),
    lastModernConstructionSpend: rn(totalConstructionSpend, 2)
  };
}
