import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character, TitleHolding } from "../../characters/characterTypes";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRulerId, setRulerId } from "../../nobility/nobilityContext";
import { applyCoupAftermath } from "./coupAftermath";
import { findLivingOfficeHolder } from "./treasuryAllocation";

/**
 * Multi-ledger PR-13 — debt coup success → thin ruler transfer.
 *
 * While `debtCoupRisk` is sticky and military discontent stays high, consecutive
 * risk cycles may install the Marshal (or another central officer) as ruler.
 * Does not kill the old ruler; strips their landed state title and parks them
 * as a private person with residual wealth haircut.
 */

/** Discontent must stay at/above this while coup risk is on. */
export const DEBT_COUP_SUCCESS_DISCONTENT = 95;

/** Consecutive at-risk cycles before a coup can fire. */
export const DEBT_COUP_SUCCESS_STREAK = 2;

/** militaryDiscontent reduced to this after a successful coup. */
export const DEBT_COUP_POST_DISCONTENT = 35;

/** Share of old ruler personal wealth seized into L2 on coup. */
export const DEBT_COUP_WEALTH_SEIZE_SHARE = 0.35;

export interface DebtCoupResult {
  attempted: boolean;
  succeeded: boolean;
  oldRulerId?: number;
  newRulerId?: number;
  oldRulerName?: string;
  newRulerName?: string;
  seizedWealth?: number;
  summary?: string;
}

const COUP_CANDIDATE_TITLES = ["Marshal", "Minister of War", "Steward", "Chancellor", "Prime Minister"] as const;

function stripLandedStateTitle(character: Character, stateId: number, reason: string): void {
  character.pastTitles ??= [];
  for (let i = character.titles.length - 1; i >= 0; i--) {
    const title = character.titles[i];
    if (!title || title.entityType !== "state" || title.entityId !== stateId || !title.landed) continue;
    const closed: TitleHolding = {
      ...title,
      endYear: title.startYear,
      reason
    };
    character.pastTitles.push(closed);
    character.titles.splice(i, 1);
  }
}

function transferLandedTitle(from: Character, to: Character, stateId: number): string {
  const landed = from.titles.find(t => t.landed && t.entityType === "state" && t.entityId === stateId);
  const titleName = landed?.title || "Ruler";
  stripLandedStateTitle(from, stateId, "Deposed by debt coup");
  // Remove any prior non-landed office of the usurper for this state to avoid dual office clutter.
  for (let i = to.titles.length - 1; i >= 0; i--) {
    const t = to.titles[i];
    if (t && t.entityType === "state" && t.entityId === stateId && !t.landed) {
      to.pastTitles = to.pastTitles || [];
      to.pastTitles.push({ ...t, reason: "Elevated by debt coup", endYear: t.startYear });
      to.titles.splice(i, 1);
    }
  }
  to.titles.push({
    title: titleName,
    landed: true,
    entityType: "state",
    entityId: stateId,
    startYear: landed?.startYear
  });
  return titleName;
}

/**
 * Pick a living coup leader: Marshal first, then other central offices by martial/boldness.
 */
export function pickDebtCoupLeader(state: State): Character | null {
  if (!state.i || !hasCharactersContext()) return null;
  const characters = getCharacters();
  const rulerId = getRulerId(state);

  for (const title of COUP_CANDIDATE_TITLES) {
    const holder = findLivingOfficeHolder(characters, state.i, title);
    if (holder && holder.i !== rulerId) return holder;
  }

  // Fallback: boldest living central officer who is not the ruler.
  let best: Character | null = null;
  let bestScore = -1;
  for (const office of CENTRAL_OFFICES) {
    const holder = findLivingOfficeHolder(characters, state.i, office.title);
    if (!holder || holder.i === rulerId) continue;
    const score = (holder.skills?.martial ?? 40) + (holder.personality?.boldness ?? 50);
    if (score > bestScore) {
      bestScore = score;
      best = holder;
    }
  }
  return best;
}

/**
 * Tick coup streak while at risk; when threshold hit, transfer the crown.
 */
export function tryDebtCoup(state: State): DebtCoupResult {
  const result: DebtCoupResult = { attempted: false, succeeded: false };

  if (!state.debtCoupRisk) {
    state.debtCoupRiskStreak = 0;
    return result;
  }

  const discontent = state.militaryDiscontent || 0;
  if (discontent < DEBT_COUP_SUCCESS_DISCONTENT) {
    // Still at risk flag but not acute enough to advance streak.
    return result;
  }

  const streak = (state.debtCoupRiskStreak || 0) + 1;
  state.debtCoupRiskStreak = streak;
  result.attempted = true;

  if (streak < DEBT_COUP_SUCCESS_STREAK) {
    return result;
  }

  if (!hasCharactersContext()) return result;
  const leader = pickDebtCoupLeader(state);
  if (!leader) return result;

  const rulerId = getRulerId(state);
  const characters = getCharacters();
  const oldRuler = rulerId !== undefined ? characters.find(c => c.i === rulerId && !c.dead) : undefined;
  if (!oldRuler || oldRuler.i === leader.i) return result;

  const titleName = transferLandedTitle(oldRuler, leader, state.i!);
  setRulerId(state, leader.i);

  let seized = 0;
  const wealth = oldRuler.wealth || 0;
  if (wealth > 0) {
    seized = rn(wealth * DEBT_COUP_WEALTH_SEIZE_SHARE, 2);
    oldRuler.wealth = rn(wealth - seized, 2);
    state.treasury = rn((state.treasury || 0) + seized, 2);
  }

  state.militaryDiscontent = rn(DEBT_COUP_POST_DISCONTENT, 2);
  state.debtCoupRisk = false;
  state.debtCoupRiskStreak = 0;
  // Keep a reduced support penalty as "aftermath".
  state.debtCoupSupportPenalty = Math.max(6, Math.floor((state.debtCoupSupportPenalty || 12) / 2));
  state.lastDebtCoup = {
    oldRulerId: oldRuler.i,
    newRulerId: leader.i,
    oldRulerName: oldRuler.name,
    newRulerName: leader.name
  };

  const summary = `Debt coup: ${leader.name} seizes the ${titleName} from ${oldRuler.name}.`;
  result.succeeded = true;
  result.oldRulerId = oldRuler.i;
  result.newRulerId = leader.i;
  result.oldRulerName = oldRuler.name;
  result.newRulerName = leader.name;
  result.seizedWealth = seized;
  result.summary = summary;

  // PR-14: legitimacy crash + civil unrest sticky flags.
  applyCoupAftermath(state, summary, {
    leader: leader.name,
    title: titleName,
    oldRuler: oldRuler.name
  });

  dispatchDebtCoupSuccessEvent(state, result);
  return result;
}

function dispatchDebtCoupSuccessEvent(state: State, result: DebtCoupResult): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("fmg:debt-coup-success", {
      detail: {
        stateId: state.i,
        oldRulerId: result.oldRulerId,
        newRulerId: result.newRulerId,
        oldRulerName: result.oldRulerName,
        newRulerName: result.newRulerName,
        seizedWealth: result.seizedWealth || 0,
        publicDebt: state.publicDebt || 0
      }
    })
  );
}
