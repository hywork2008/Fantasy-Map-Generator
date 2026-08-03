import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { peekCreditPoolBalance } from "./creditPool";
import type { DebtServiceUpdate } from "./debtDefault";
import { resolveMoneylenderSyndicate } from "./moneylenders";

/**
 * Multi-ledger PR-12 — thin consequences while a state is in public-debt default.
 *
 * - Credit-pool flight (merchants pull liquidity)
 * - Named syndicate wealth haircut (write-downs / capital call pain)
 * - Extra military discontent
 * - Coup-risk event when discontent is already high
 */

/** Share of remaining credit pool that flees each cycle in default. */
export const DEBT_DEFAULT_POOL_FLIGHT_RATE = 0.08;

/** Relative personal-wealth haircut applied to syndicate members each default cycle. */
export const DEBT_DEFAULT_MERCHANT_WEALTH_HAIRCUT = 0.05;

/** Extra discontent per cycle beyond the base debtDefault tick. */
export const DEBT_DEFAULT_EXTRA_DISCONTENT = 2;

/** militaryDiscontent at/above this while in default fires a coup-risk event. */
export const DEBT_COUP_DISCONTENT_THRESHOLD = 80;

/** Council support penalty applied once when coup risk fires (sticky until cleared). */
export const DEBT_COUP_SUPPORT_PENALTY = 12;

export interface DebtDefaultConsequenceResult {
  poolFlight: number;
  merchantHaircutTotal: number;
  coupRisk: boolean;
  extraDiscontent: number;
}

/**
 * Apply merchant flight / write-downs / coup-risk while in default.
 * Call after `updateDebtDefaultStatus` each tax cycle (and when already in default).
 */
export function applyDebtDefaultConsequences(
  state: State,
  update: Pick<DebtServiceUpdate, "inDefault" | "enteredDefault">
): DebtDefaultConsequenceResult {
  const result: DebtDefaultConsequenceResult = {
    poolFlight: 0,
    merchantHaircutTotal: 0,
    coupRisk: false,
    extraDiscontent: 0
  };

  if (!update.inDefault) {
    // Clear sticky coup flags when default clears.
    if (state.debtCoupRisk) state.debtCoupRisk = false;
    state.debtCoupRiskStreak = 0;
    return result;
  }

  // ── Credit pool flight ──────────────────────────────────────────────────
  const pool = peekCreditPoolBalance(state);
  if (pool > 0) {
    const flight = rn(pool * DEBT_DEFAULT_POOL_FLIGHT_RATE, 2);
    if (flight > 0) {
      state.creditPoolBalance = rn(Math.max(0, pool - flight), 2);
      result.poolFlight = flight;
    }
  }

  // ── Syndicate personal write-downs ──────────────────────────────────────
  if (hasCharactersContext()) {
    const syndicate = resolveMoneylenderSyndicate(state);
    const characters = getCharacters();
    for (const member of syndicate.members) {
      const character = characters.find(c => c.i === member.characterId && !c.dead);
      if (!character) continue;
      const wealth = character.wealth || 0;
      if (!(wealth > 0)) continue;
      const cut = rn(wealth * DEBT_DEFAULT_MERCHANT_WEALTH_HAIRCUT, 2);
      if (!(cut > 0)) continue;
      character.wealth = rn(wealth - cut, 2);
      result.merchantHaircutTotal = rn(result.merchantHaircutTotal + cut, 2);
    }
  }

  // ── Extra discontent ────────────────────────────────────────────────────
  result.extraDiscontent = DEBT_DEFAULT_EXTRA_DISCONTENT;
  state.militaryDiscontent = rn(Math.min(200, (state.militaryDiscontent || 0) + DEBT_DEFAULT_EXTRA_DISCONTENT), 2);

  // ── Coup risk ───────────────────────────────────────────────────────────
  const discontent = state.militaryDiscontent || 0;
  if (discontent >= DEBT_COUP_DISCONTENT_THRESHOLD) {
    result.coupRisk = true;
    const firstTrip = !state.debtCoupRisk;
    state.debtCoupRisk = true;
    // Soft political cost: lower sticky support snapshot (refreshed next cycle from officers,
    // so also apply a one-shot penalty field that getCouncilSupport can read).
    state.debtCoupSupportPenalty = DEBT_COUP_SUPPORT_PENALTY;
    if (firstTrip || update.enteredDefault) {
      dispatchDebtCoupRiskEvent(state, discontent);
    }
  }

  state.lastDebtPoolFlight = result.poolFlight;
  state.lastDebtMerchantHaircut = result.merchantHaircutTotal;

  return result;
}

function dispatchDebtCoupRiskEvent(state: State, discontent: number): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("fmg:debt-coup-risk", {
      detail: {
        stateId: state.i,
        discontent,
        publicDebt: state.publicDebt || 0,
        creditPoolBalance: state.creditPoolBalance || 0
      }
    })
  );
}
