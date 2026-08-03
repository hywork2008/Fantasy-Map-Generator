import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { resolveCapitalMarket } from "./creditPool";

/**
 * Multi-ledger PR-10 — named moneylender syndicate (v1).
 *
 * Capital-market Manager + Rival Merchants act as the visible face of the anonymous
 * credit pool: interest / repayments can skim into their personal wealth, and effective
 * interest rates rise with greed and fall with assembly support.
 *
 * The pool stock remains institutional; named lenders do not each hold separate ledgers yet.
 */

/** Keep in sync with fiscalEvents.PUBLIC_DEBT_INTEREST_RATE (avoid circular import). */
export const BASE_PUBLIC_DEBT_INTEREST_RATE = 0.02;

/** Share of creditor payments that leave the pool into named lender wealth. */
export const MONEYLENDER_PERSONAL_SHARE = 0.4;

/** Max relative interest premium from high-greed syndicate (e.g. +50% at greed 100). */
export const INTEREST_GREED_PREMIUM_MAX = 0.5;

/** Max relative interest discount from high assembly support. */
export const INTEREST_SUPPORT_DISCOUNT_MAX = 0.2;

/** Form multipliers on base public-debt interest. */
export const INTEREST_FORM_MULTIPLIER: Record<string, number> = {
  Republic: 0.9, // urban credit markets
  Monarchy: 1.0,
  Union: 1.05,
  Theocracy: 1.1,
  Anarchy: 1.35
};

export interface MoneylenderMember {
  characterId: number;
  name: string;
  weight: number;
  greed: number;
}

export interface MoneylenderSyndicate {
  members: MoneylenderMember[];
  /** Weighted-average greed 0–100 (50 if empty). */
  averageGreed: number;
  primary?: MoneylenderMember;
}

/**
 * Resolve living capital-market manager + rivals as this state's moneylender syndicate.
 * Weights favor greed and existing personal wealth (richer lenders underwrite more).
 */
export function resolveMoneylenderSyndicate(state: Pick<State, "capital" | "i">): MoneylenderSyndicate {
  if (!hasCharactersContext()) return { members: [], averageGreed: 50 };

  const market = resolveCapitalMarket(state);
  if (!market) return { members: [], averageGreed: 50 };

  const characters = getCharacters();
  const ids = [market.managerCharacterId, ...(market.rivalCharacterIds ?? [])].filter(
    (id): id is number => typeof id === "number"
  );

  const members: MoneylenderMember[] = [];
  for (const id of ids) {
    const character = characters.find(c => c.i === id && !c.dead);
    if (!character) continue;
    const greed = character.personality?.greed ?? 50;
    const wealth = Math.max(0, character.wealth || 0);
    // Greed dominates; wealth soft-caps so paupers still appear with low weight.
    const weight = rn(Math.max(0.1, (0.5 + greed / 100) * (1 + Math.min(wealth, 50) / 50)), 3);
    members.push({
      characterId: character.i,
      name: character.name || `Merchant ${character.i}`,
      weight,
      greed
    });
  }

  members.sort((a, b) => b.weight - a.weight || b.greed - a.greed);

  let weightSum = 0;
  let greedSum = 0;
  for (const m of members) {
    weightSum += m.weight;
    greedSum += m.greed * m.weight;
  }
  const averageGreed = weightSum > 0 ? rn(greedSum / weightSum, 1) : 50;

  return {
    members,
    averageGreed,
    primary: members[0]
  };
}

/**
 * Effective monthly interest rate on publicDebt for this state (PR-10).
 * Base rate × form × greed premium × support discount.
 */
export function getStateDebtInterestRate(state: Pick<State, "form" | "capital" | "i" | "councilSupport">): number {
  const formMult = INTEREST_FORM_MULTIPLIER[state.form || ""] ?? INTEREST_FORM_MULTIPLIER.Monarchy;
  const syndicate = resolveMoneylenderSyndicate(state);
  const greedFactor = 1 + ((syndicate.averageGreed - 50) / 50) * INTEREST_GREED_PREMIUM_MAX;
  const support = state.councilSupport ?? 50;
  const supportFactor = 1 - ((support - 50) / 50) * INTEREST_SUPPORT_DISCOUNT_MAX;
  const rate = BASE_PUBLIC_DEBT_INTEREST_RATE * formMult * Math.max(0.5, greedFactor) * Math.max(0.7, supportFactor);
  return rn(rate, 4);
}

export interface CreditorPayoutResult {
  toPool: number;
  toLenders: number;
  perLender: { characterId: number; amount: number }[];
  primaryName: string | null;
}

/**
 * Split a creditor payment: institutional pool keep vs named lender personal wealth.
 * Caller has already moved cash out of L2 (or tax-farm already deducted).
 * `toPool` is the amount that should remain / be added to creditPoolBalance.
 */
export function splitCreditorPayout(
  state: Pick<State, "capital" | "i">,
  amount: number,
  personalShare = MONEYLENDER_PERSONAL_SHARE
): CreditorPayoutResult {
  const pay = Math.max(0, amount);
  const syndicate = resolveMoneylenderSyndicate(state);
  const primaryName = syndicate.primary?.name ?? null;

  if (!(pay > 0) || syndicate.members.length === 0 || !(personalShare > 0)) {
    return { toPool: pay, toLenders: 0, perLender: [], primaryName };
  }

  const toLenders = rn(pay * personalShare, 2);
  const _toPool = rn(pay - toLenders, 2);
  const perLender: { characterId: number; amount: number }[] = [];

  if (!(toLenders > 0)) {
    return { toPool: pay, toLenders: 0, perLender: [], primaryName };
  }

  const weightSum = syndicate.members.reduce((s, m) => s + m.weight, 0);
  if (!(weightSum > 0) || !hasCharactersContext()) {
    return { toPool: pay, toLenders: 0, perLender: [], primaryName };
  }

  const characters = getCharacters();
  let distributed = 0;
  for (let i = 0; i < syndicate.members.length; i++) {
    const member = syndicate.members[i]!;
    const isLast = i === syndicate.members.length - 1;
    const share = isLast ? rn(toLenders - distributed, 2) : rn(toLenders * (member.weight / weightSum), 2);
    if (!(share > 0)) continue;
    const character = characters.find(c => c.i === member.characterId && !c.dead);
    if (!character) continue;
    character.wealth = rn((character.wealth || 0) + share, 2);
    perLender.push({ characterId: member.characterId, amount: share });
    distributed = rn(distributed + share, 2);
  }

  // Undistributed remainder stays in the pool.
  const actualToLenders = distributed;
  const actualToPool = rn(pay - actualToLenders, 2);
  return { toPool: actualToPool, toLenders: actualToLenders, perLender, primaryName };
}

/**
 * Snapshot primary creditor onto the state for UI (no cash movement).
 */
export function updateMoneylenderSnapshot(state: State): void {
  const syndicate = resolveMoneylenderSyndicate(state);
  state.primaryMoneylenderId = syndicate.primary?.characterId;
  state.primaryMoneylenderName = syndicate.primary?.name;
  state.debtInterestRate = getStateDebtInterestRate(state);
}

export function getPrimaryMoneylenderLabel(state: Pick<State, "primaryMoneylenderName" | "capital" | "i">): string {
  if (state.primaryMoneylenderName) return state.primaryMoneylenderName;
  const primary = resolveMoneylenderSyndicate(state).primary;
  return primary?.name ?? "Anonymous creditors";
}
