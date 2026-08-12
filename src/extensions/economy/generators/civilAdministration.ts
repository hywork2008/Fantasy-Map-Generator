import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";

/**
 * `administrativeUpkeep` used to be one undifferentiated flat percentage of a state's domestic
 * income, deducted entirely from `state.treasury`, described only in a code comment as "courts,
 * scribes, tax farmers, messengers, and routine local administration" — with zero actual
 * breakdown and zero connection to `burg.treasury`, even though most of those functions are
 * historically local (a town's own courts, notaries, tax-farming agents) rather than
 * central-government functions. Meanwhile `burg.treasury` already remits its own comfortable-level
 * surplus to `state.treasury` annually (guildTreasury.ts's settleAnnual()) but had almost no
 * standing local-governance cost of its own besides sanitation maintenance
 * (docs/plan/burg-treasury-equilibrium.md's investigation).
 *
 * This module keeps the *total* administrative-cost magnitude unchanged (same
 * administrativeUpkeepShare × income as before — economyStartMode.ts's profile values are not
 * retuned) but splits it into 5 named components and re-attributes the locally-flavored ones to
 * the state's own burgs, proportional to each burg's population, weighted by how decentralized
 * that state's governance form is (BURG_LOCAL_ADMINISTRATION_SHARE_BY_FORM). Messengers/couriers
 * stay 100% state-funded regardless of form — a courier network is a central logistics function,
 * not a local-governance one.
 */

/** Fraction of the total civil-administration cost each named component represents. Sums to 1. */
export const ADMIN_COMPONENT_SHARE = {
  courts: 0.25,
  scribesNotaries: 0.2,
  taxFarmers: 0.2,
  messengers: 0.15,
  routineLocalAdministration: 0.2
} as const;

/** The 4 components eligible for Burg-level attribution — everything except messengers. */
const LOCAL_COMPONENT_KEYS = ["courts", "scribesNotaries", "taxFarmers", "routineLocalAdministration"] as const;

const LOCAL_COMPONENT_WEIGHT_SUM = LOCAL_COMPONENT_KEYS.reduce((sum, key) => sum + ADMIN_COMPONENT_SHARE[key], 0);

/**
 * Share of the local-component pool (courts + scribes + tax farmers + routine local
 * administration — NOT messengers) a state's own burgs bear, by governance form. Grounded in the
 * same historical research as treasuryAllocation.ts's BASELINE_ALLOCATION_BY_FORM
 * (state-treasury-department-budget.md §1): Republic/Union have strong communal self-governance
 * traditions; Theocracy's local administration is bound up with the (separately-funded, see
 * Ecclesiastica) canon-law bureaucracy rather than lay civic institutions; Anarchy has no
 * functioning institutions at either level, so the split barely matters.
 */
export const BURG_LOCAL_ADMINISTRATION_SHARE_BY_FORM: Record<string, number> = {
  Monarchy: 0.45,
  Republic: 0.7,
  Union: 0.65,
  Theocracy: 0.4,
  Anarchy: 0.15
};
const DEFAULT_BURG_LOCAL_ADMINISTRATION_SHARE = BURG_LOCAL_ADMINISTRATION_SHARE_BY_FORM.Monarchy;

export function getBurgLocalAdministrationShare(state: Pick<State, "form">): number {
  return BURG_LOCAL_ADMINISTRATION_SHARE_BY_FORM[state.form || ""] ?? DEFAULT_BURG_LOCAL_ADMINISTRATION_SHARE;
}

export interface CivilAdministrationBreakdown {
  /** Amounts actually deducted from state.treasury this cycle, one line per named component. */
  courts: number;
  scribesNotaries: number;
  taxFarmers: number;
  /** Always fully state-funded — see module doc comment. */
  messengers: number;
  routineLocalAdministration: number;
  /** Total actually collected from the state's own burgs this cycle (informational only — not a state.treasury line; already left burg.treasury by the time this is returned). */
  burgLocalAdministrationPaid: number;
  /** Sum of the 5 component lines above — the actual state.treasury deduction this cycle. */
  totalFromTreasury: number;
}

function emptyBreakdown(): CivilAdministrationBreakdown {
  return {
    courts: 0,
    scribesNotaries: 0,
    taxFarmers: 0,
    messengers: 0,
    routineLocalAdministration: 0,
    burgLocalAdministrationPaid: 0,
    totalFromTreasury: 0
  };
}

/**
 * Deducts this cycle's civil-administration cost, split between `state.treasury` and the state's
 * own burgs' treasuries. `totalAdminUpkeep` is the pre-existing `rawDomesticIncome ×
 * administrativeUpkeepShare` figure (taxes-generator.ts) — this function does not change that
 * total, only how it is attributed. `allBurgs` is the full `pack.burgs` array; burgs belonging to
 * other states are filtered out internally.
 *
 * A burg's share is cash-limited (never pushes it negative), and the *state's* share is computed
 * from the *desired* (not actually-collected) burg share, so an underfunded burg does not push the
 * cost back onto the state — that would defeat the point of the reattribution. If the state
 * currently has no burgs with any population (e.g. a burgless remnant), the entire local-component
 * pool falls back to state.treasury rather than vanishing as a phantom discount — a state cannot
 * devolve administration to cities it does not have.
 */
export function applyCivilAdministrationUpkeep(
  state: State,
  totalAdminUpkeep: number,
  allBurgs: readonly Burg[]
): CivilAdministrationBreakdown {
  if (!(totalAdminUpkeep > 0)) return emptyBreakdown();

  const localPool = rn(totalAdminUpkeep * LOCAL_COMPONENT_WEIGHT_SUM, 2);
  const messengers = rn(totalAdminUpkeep * ADMIN_COMPONENT_SHARE.messengers, 2);

  const stateBurgs = allBurgs.filter(b => b?.i && b.state === state.i && !b.removed);
  const totalPopulation = stateBurgs.reduce((sum, b) => sum + Math.max(0, b.population || 0), 0);

  const burgShare = totalPopulation > 0 ? getBurgLocalAdministrationShare(state) : 0;
  const desiredBurgLocalAdminCost = rn(localPool * burgShare, 2);
  const stateLocalAdminCost = rn(localPool - desiredBurgLocalAdminCost, 2);

  let burgLocalAdministrationPaid = 0;
  if (desiredBurgLocalAdminCost > 0 && totalPopulation > 0) {
    for (const burg of stateBurgs) {
      const weight = Math.max(0, burg.population || 0) / totalPopulation;
      if (!(weight > 0)) continue;
      const desired = rn(desiredBurgLocalAdminCost * weight, 2);
      const available = Math.max(0, burg.treasury || 0);
      const paid = rn(Math.min(desired, available), 2);
      if (!(paid > 0)) continue;
      burg.treasury = rn(available - paid, 2);
      burgLocalAdministrationPaid = rn(burgLocalAdministrationPaid + paid, 2);
    }
  }

  const breakdown = emptyBreakdown();
  breakdown.messengers = messengers;
  for (const key of LOCAL_COMPONENT_KEYS) {
    breakdown[key] = rn(stateLocalAdminCost * (ADMIN_COMPONENT_SHARE[key] / LOCAL_COMPONENT_WEIGHT_SUM), 2);
  }
  breakdown.burgLocalAdministrationPaid = burgLocalAdministrationPaid;
  breakdown.totalFromTreasury = rn(
    breakdown.courts +
      breakdown.scribesNotaries +
      breakdown.taxFarmers +
      breakdown.messengers +
      breakdown.routineLocalAdministration,
    2
  );

  if (breakdown.totalFromTreasury > 0) {
    state.treasury = rn(Math.max(0, (state.treasury || 0) - breakdown.totalFromTreasury), 2);
  }

  return breakdown;
}
