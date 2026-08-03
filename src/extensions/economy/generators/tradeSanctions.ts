import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";

/**
 * Multi-ledger PR-15 — thin trade sanctions / tariffs while foreign debt is in default.
 *
 * Creditors with defaulted loans apply a bilateral trade haircut to the debtor's
 * deal-tax and voyage income folds. Also raises a sticky `tradeSanctionMult` (< 1)
 * on the debtor for UI / collectTaxes scaling.
 */

/** Base income retained when sanctioned (rest is lost/blocked). */
export const TRADE_SANCTION_BASE_MULT = 0.88;

/** Extra haircut per distinct defaulted creditor (stacked, floored). */
export const TRADE_SANCTION_PER_CREDITOR = 0.04;

/** Floor on the debtor's overall trade income multiplier. */
export const TRADE_SANCTION_FLOOR = 0.7;

/** Creditor treasury skim of blocked trade (thin "tariff capture"). */
export const TRADE_SANCTION_CREDITOR_SKIM = 0.25;

export interface TradeSanctionSnapshot {
  active: boolean;
  multiplier: number;
  creditorIds: number[];
  blockedThisCycle: number;
}

/**
 * Compute trade-income multiplier for a state under foreign-debt sanctions.
 * 1.0 when no FX default; otherwise 0.88 − 0.04×creditors, floored at 0.7.
 */
export function getTradeSanctionMultiplier(state: Pick<State, "foreignDebtInDefault" | "foreignLoans">): number {
  if (!state.foreignDebtInDefault || !state.foreignLoans?.length) return 1;
  const defaulters = state.foreignLoans.filter(l => l.inDefault);
  if (!defaulters.length) return 1;
  const mult = TRADE_SANCTION_BASE_MULT - defaulters.length * TRADE_SANCTION_PER_CREDITOR;
  return rn(Math.max(TRADE_SANCTION_FLOOR, mult), 3);
}

export function listSanctioningCreditorIds(state: Pick<State, "foreignLoans">): number[] {
  if (!state.foreignLoans?.length) return [];
  return [...new Set(state.foreignLoans.filter(l => l.inDefault && l.creditorStateId).map(l => l.creditorStateId))];
}

/**
 * Refresh sticky sanction fields on the state (call each fiscal cycle after FX service).
 */
export function refreshTradeSanctions(state: State): TradeSanctionSnapshot {
  const mult = getTradeSanctionMultiplier(state);
  const creditorIds = listSanctioningCreditorIds(state);
  state.tradeSanctionMult = mult;
  state.tradeSanctionCreditorIds = creditorIds;
  const active = mult < 1;
  if (!active) {
    state.lastTradeSanctionBlocked = 0;
  }
  return {
    active,
    multiplier: mult,
    creditorIds,
    blockedThisCycle: state.lastTradeSanctionBlocked || 0
  };
}

/**
 * Apply sanction haircut to a positive income credit on L2.
 * Blocked share is partly skimmed to defaulted creditors' treasuries.
 * Returns the amount actually kept by the debtor.
 */
export function applyTradeSanctionToIncome(state: State, grossIncome: number): number {
  const gross = Math.max(0, grossIncome);
  if (!(gross > 0)) return 0;

  const mult = state.tradeSanctionMult ?? getTradeSanctionMultiplier(state);
  if (!(mult < 1)) return gross;

  const kept = rn(gross * mult, 2);
  const blocked = rn(gross - kept, 2);
  state.lastTradeSanctionBlocked = rn((state.lastTradeSanctionBlocked || 0) + blocked, 2);

  if (blocked > 0) {
    try {
      const { pack } = getWorldContext();
      const ids = state.tradeSanctionCreditorIds?.length
        ? state.tradeSanctionCreditorIds
        : listSanctioningCreditorIds(state);
      if (ids.length > 0) {
        const skimTotal = rn(blocked * TRADE_SANCTION_CREDITOR_SKIM, 2);
        const each = rn(skimTotal / ids.length, 2);
        for (const id of ids) {
          const creditor = pack.states?.[id];
          if (creditor?.i && each > 0) {
            creditor.treasury = rn((creditor.treasury || 0) + each, 2);
          }
        }
      }
    } catch {
      // unit tests without pack
    }
  }

  return kept;
}
