import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import {
  BOND_MARKET_RATE_MULT,
  FOREIGN_DEBT_BASE_INTEREST,
  type ForeignLoan,
  refreshForeignDebtTotalIfPresent,
  sumForeignDebtPrincipal
} from "./foreignDebt";

/**
 * Multi-ledger PR-15 — credit rating + thin bond secondary market.
 *
 * Credit rating (AAA…D) is derived from domestic/foreign default, debt load,
 * legitimacy, and assembly support. Bond-market loans reprice to the rating.
 * Secondary market: bond-market loans can be reassigned to a richer Neutral
 * underwriter (liquidity transfer) for a small fee.
 */

export type CreditRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC" | "D";

export const CREDIT_RATING_RATE_MULT: Record<CreditRating, number> = {
  AAA: 0.85,
  AA: 0.92,
  A: 1.0,
  BBB: 1.12,
  BB: 1.28,
  B: 1.45,
  CCC: 1.7,
  D: 2.1
};

export interface CreditRatingBreakdown {
  rating: CreditRating;
  score: number;
  notes: string[];
}

/**
 * Score 0–100 → rating band. Higher is better credit.
 */
export function computeCreditRating(state: State): CreditRatingBreakdown {
  const notes: string[] = [];
  let score = 70;

  if (state.debtInDefault) {
    score -= 35;
    notes.push("Domestic public default −35.");
  }
  if (state.foreignDebtInDefault) {
    score -= 20;
    notes.push("Foreign debt default −20.");
  }

  const domesticDebt = state.publicDebt || 0;
  const foreignDebt = sumForeignDebtPrincipal(state);
  const debtLoad = domesticDebt + foreignDebt;
  if (debtLoad > 150) {
    score -= 15;
    notes.push("Heavy debt load −15.");
  } else if (debtLoad > 80) {
    score -= 8;
    notes.push("Elevated debt load −8.");
  } else if (debtLoad < 20) {
    score += 5;
    notes.push("Light debt load +5.");
  }

  const support = state.councilSupport ?? 50;
  score += rn((support - 50) * 0.2, 1);
  notes.push(`Assembly support shift ${(support - 50) * 0.2 >= 0 ? "+" : ""}${rn((support - 50) * 0.2, 1)}.`);

  if (state.civilUnrest) {
    score -= 10;
    notes.push("Civil unrest −10.");
  }
  if (state.legitimacyWarActive) {
    score -= 12;
    notes.push("Legitimacy war −12.");
  }
  if (state.coupLegitimacy !== undefined && state.coupLegitimacy < 50) {
    score -= 8;
    notes.push("Low coup legitimacy −8.");
  }

  const treasury = state.treasury || 0;
  if (treasury > 40) {
    score += 5;
    notes.push("Solid L2 buffer +5.");
  } else if (treasury < 5) {
    score -= 5;
    notes.push("Thin L2 buffer −5.");
  }

  score = rn(Math.max(0, Math.min(100, score)), 1);

  let rating: CreditRating;
  if (state.debtInDefault && state.foreignDebtInDefault) rating = "D";
  else if (score >= 90) rating = "AAA";
  else if (score >= 80) rating = "AA";
  else if (score >= 70) rating = "A";
  else if (score >= 60) rating = "BBB";
  else if (score >= 50) rating = "BB";
  else if (score >= 40) rating = "B";
  else if (score >= 25) rating = "CCC";
  else rating = "D";

  return { rating, score, notes };
}

/**
 * Persist rating snapshot and reprice viaBondMarket loans to rating × base.
 */
export function refreshCreditRatingAndBondPrices(state: State): CreditRatingBreakdown {
  const breakdown = computeCreditRating(state);
  state.creditRating = breakdown.rating;
  state.creditRatingScore = breakdown.score;

  const rateMult = CREDIT_RATING_RATE_MULT[breakdown.rating] * BOND_MARKET_RATE_MULT;
  const targetRate = rn(FOREIGN_DEBT_BASE_INTEREST * rateMult, 4);

  if (state.foreignLoans?.length) {
    for (const loan of state.foreignLoans) {
      if (loan.viaBondMarket) {
        loan.interestRate = targetRate;
      }
    }
  }
  state.bondMarketRate = targetRate;
  return breakdown;
}

export interface BondSecondaryResult {
  transferred: number;
  fromCreditorId?: number;
  toCreditorId?: number;
  fee: number;
}

/**
 * Thin secondary market: move part of a bond-market loan to a richer Neutral holder.
 * Seller (current underwriter) receives principal − fee; buyer pays principal from L2.
 */
export function runBondSecondaryMarket(state: State): BondSecondaryResult {
  const empty: BondSecondaryResult = { transferred: 0, fee: 0 };
  if (!state.foreignLoans?.length || state.foreignDebtInDefault || state.debtInDefault) {
    return empty;
  }

  try {
    const { pack } = getWorldContext();
    const bondLoans = state.foreignLoans.filter(l => l.viaBondMarket && l.principal > 5 && !l.inDefault);
    if (!bondLoans.length) return empty;

    const loan = bondLoans[0]!;
    const seller = pack.states?.[loan.creditorStateId];
    if (!seller?.i) return empty;

    // Find a richer Neutral/Friendly buyer who is not the seller.
    let buyer: State | null = null;
    let bestCash = 0;
    for (const other of pack.states || []) {
      if (!other?.i || other.removed || other.i === seller.i || other.i === state.i) continue;
      const relRaw = state.diplomacy?.[other.i];
      const rel = typeof relRaw === "string" ? relRaw : "Neutral";
      if (rel === "Enemy" || rel === "Rival" || rel === "Suspicion") continue;
      const cash = other.treasury || 0;
      if (cash > bestCash && cash > 30) {
        bestCash = cash;
        buyer = other;
      }
    }
    if (!buyer?.i) return empty;
    if ((buyer.treasury || 0) <= (seller.treasury || 0)) return empty;

    const chunk = rn(Math.min(loan.principal * 0.35, 15, (buyer.treasury || 0) * 0.1), 2);
    if (!(chunk > 0.5)) return empty;

    const fee = rn(chunk * 0.03, 2);
    buyer.treasury = rn((buyer.treasury || 0) - chunk, 2);
    seller.treasury = rn((seller.treasury || 0) + chunk - fee, 2);
    // Fee is market friction (burned).

    // Reduce seller tranche; merge/create buyer tranche.
    loan.principal = rn(loan.principal - chunk, 2);
    const next: ForeignLoan[] = [];
    for (const l of state.foreignLoans) {
      if (l === loan) {
        if (loan.principal > 0.005) next.push(loan);
        continue;
      }
      next.push(l);
    }
    const existingBuyer = next.find(l => l.creditorStateId === buyer!.i && l.viaBondMarket);
    if (existingBuyer) {
      existingBuyer.principal = rn(existingBuyer.principal + chunk, 2);
    } else {
      next.push({
        creditorStateId: buyer.i,
        creditorName: `Bond mkt via ${buyer.name || `State ${buyer.i}`}`,
        principal: chunk,
        interestRate: loan.interestRate,
        viaBondMarket: true
      });
    }
    state.foreignLoans = next;
    refreshForeignDebtTotalIfPresent(state);
    state.lastBondSecondaryTransfer = chunk;

    return {
      transferred: chunk,
      fromCreditorId: seller.i,
      toCreditorId: buyer.i,
      fee
    };
  } catch {
    return empty;
  }
}
