import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import { ensureDepartmentBalances } from "./treasuryAllocation";

/**
 * Multi-ledger PR-6 — thin form-differentiated revenue mix.
 * docs/plan/multi-ledger-fiscal-architecture.md / polity-fiscal-regimes-historical.md P2.
 *
 * Applied after this cycle's domestic income is credited to L2 and before allocateTreasury.
 * Does not invent new tax kinds; only routes already-collected cash differently by form.
 */

/** Theocracy: share of this cycle's domestic income taken as tithe straight into L3a.ecclesiastica. */
export const THEOCRACY_TITHE_SHARE = 0.2;

/** Anarchy: share of this cycle's domestic income skimmed L2 → living ruler L0 (war-chest proximity). */
export const ANARCHY_PLUNDER_SHARE = 0.35;

/**
 * Monarchy wartime subsidy: poll/voyage domestic income is scaled up when the state has an Enemy
 * (extraordinary aids / subsidies). Sales-tax deals stay unboosted (already on L2 before this).
 */
export const MONARCHY_WARTIME_INCOME_MULTIPLIER = 1.15;

export interface RevenueMixResult {
  /** Domestic income after wartime Monarchy boost (input to allocateTreasury %). */
  adjustedDomesticIncome: number;
  /** Cash moved L2 → L3a.ecclesiastica (Theocracy tithe). */
  titheToEcclesiastica: number;
  /** Cash moved L2 → ruler L0 (Anarchy plunder share). */
  plunderToRuler: number;
  /** Extra income credited to L2 from wartime Monarchy boost. */
  wartimeSubsidy: number;
}

/**
 * Form-gated wartime income boost for Monarchy only. Other forms use raw domestic income.
 * PR-11: extraordinary tax line must be assembly-approved when councilApprovals is present.
 */
export function getWartimeIncomeMultiplier(state: Pick<State, "form" | "diplomacy" | "councilApprovals">): number {
  if (state.form === "Monarchy" && stateHasEnemy(state as State)) {
    // If approvals snapshot exists and blocks extraordinary tax, no wartime subsidy.
    if (state.councilApprovals && !state.councilApprovals.extraordinaryTax) {
      return 1;
    }
    return MONARCHY_WARTIME_INCOME_MULTIPLIER;
  }
  return 1;
}

/**
 * Route this cycle's domestic income by form:
 * 1. Optional wartime Monarchy subsidy (extra L2 credit)
 * 2. Theocracy tithe → L3a.ecclesiastica off the top of L2
 * 3. Anarchy plunder share → ruler L0 off the top of L2
 *
 * Caller must have already added the *raw* domestic income to `state.treasury`.
 * Returns adjusted income for allocateTreasury nominal % (includes wartime boost).
 */
export function applyFormRevenueMix(state: State, rawDomesticIncome: number): RevenueMixResult {
  const raw = Math.max(0, rawDomesticIncome);
  let adjustedDomesticIncome = raw;
  let wartimeSubsidy = 0;
  let titheToEcclesiastica = 0;
  let plunderToRuler = 0;

  const wartimeMult = getWartimeIncomeMultiplier(state);
  if (wartimeMult > 1 && raw > 0) {
    wartimeSubsidy = rn(raw * (wartimeMult - 1), 2);
    if (wartimeSubsidy > 0) {
      state.treasury = rn((state.treasury || 0) + wartimeSubsidy, 2);
      adjustedDomesticIncome = rn(raw + wartimeSubsidy, 2);
    }
  }

  if (state.form === "Theocracy" && adjustedDomesticIncome > 0) {
    const desired = rn(adjustedDomesticIncome * THEOCRACY_TITHE_SHARE, 2);
    const available = state.treasury || 0;
    titheToEcclesiastica = rn(Math.min(desired, available), 2);
    if (titheToEcclesiastica > 0) {
      state.treasury = rn(available - titheToEcclesiastica, 2);
      const balances = ensureDepartmentBalances(state);
      balances.ecclesiastica = rn((balances.ecclesiastica || 0) + titheToEcclesiastica, 2);
    }
  }

  if (state.form === "Anarchy" && adjustedDomesticIncome > 0 && hasCharactersContext()) {
    const rulerId = getRulerId(state);
    if (rulerId !== undefined) {
      const ruler = getCharacters().find(c => c.i === rulerId && !c.dead);
      if (ruler) {
        const desired = rn(adjustedDomesticIncome * ANARCHY_PLUNDER_SHARE, 2);
        const available = state.treasury || 0;
        plunderToRuler = rn(Math.min(desired, available), 2);
        if (plunderToRuler > 0) {
          state.treasury = rn(available - plunderToRuler, 2);
          ruler.wealth = rn((ruler.wealth || 0) + plunderToRuler, 2);
        }
      }
    }
  }

  return { adjustedDomesticIncome, titheToEcclesiastica, plunderToRuler, wartimeSubsidy };
}
