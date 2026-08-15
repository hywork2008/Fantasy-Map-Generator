import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character, TitleHolding } from "../../characters/characterTypes";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId, setRulerId } from "../../nobility/nobilityContext";
import { appendCouncilLog } from "./councilSession";

/**
 * Multi-ledger PR-15 — thin post-coup legitimacy war (pretender vs new regime).
 *
 * After a debt coup, the deposed ruler may linger as a pretender. While civil unrest
 * and low legitimacy persist, a legitimacy war can erupt: drains L2, spikes discontent,
 * and may restore the pretender or crush them permanently.
 */

/** Legitimacy at/below this can open a legitimacy war. */
export const LEGIT_WAR_LEGITIMACY_CEILING = 45;

/** militaryDiscontent at/above this with unrest → war may fire. */
export const LEGIT_WAR_DISCONTENT_FLOOR = 60;

/** Consecutive unrest cycles before war can fire. */
export const LEGIT_WAR_MIN_UNREST_CYCLES = 2;

/** L2 cash burned each legitimacy-war tick. */
export const LEGIT_WAR_TREASURY_DRAIN = 8;

/** Discontent added each war tick. */
export const LEGIT_WAR_DISCONTENT_GAIN = 8;

/** After this many war ticks, resolve: restore pretender if legitimacy still low. */
export const LEGIT_WAR_RESOLVE_TICKS = 3;

/** Legitimacy threshold for regime victory (pretender crushed). */
export const LEGIT_WAR_REGIME_WIN_LEGITIMACY = 50;

export interface LegitimacyWarTickResult {
  active: boolean;
  opened: boolean;
  resolved: boolean;
  pretenderRestored: boolean;
  pretenderCrushed: boolean;
  treasuryDrained: number;
  summary?: string;
}

/**
 * Seed pretender from last debt coup (old ruler id) if still living and not on the throne.
 */
export function ensurePretenderFromLastCoup(state: State): number | undefined {
  const last = state.lastDebtCoup;
  if (!last?.oldRulerId) return state.legitimacyPretenderId;
  if (!hasCharactersContext()) return state.legitimacyPretenderId;

  const rulerId = getRulerId(state);
  if (last.oldRulerId === rulerId) {
    state.legitimacyPretenderId = undefined;
    return undefined;
  }

  const pretender = getCharacters().find(c => c.i === last.oldRulerId && !c.dead);
  if (!pretender) {
    state.legitimacyPretenderId = undefined;
    return undefined;
  }
  state.legitimacyPretenderId = pretender.i;
  state.legitimacyPretenderName = pretender.name;
  return pretender.i;
}

function stripLandedStateTitle(character: Character, stateId: number, reason: string): void {
  character.pastTitles ??= [];
  for (let i = character.titles.length - 1; i >= 0; i--) {
    const title = character.titles[i];
    if (!title || title.entityType !== "state" || title.entityId !== stateId || !title.landed) continue;
    const closed: TitleHolding = { ...title, endYear: title.startYear, reason };
    character.pastTitles.push(closed);
    character.titles.splice(i, 1);
  }
}

function transferLandedTitle(from: Character, to: Character, stateId: number, reason: string): string {
  const landed = from.titles.find(t => t.landed && t.entityType === "state" && t.entityId === stateId);
  const titleName = landed?.title || "Ruler";
  stripLandedStateTitle(from, stateId, reason);
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
 * Tick legitimacy war: open, prosecute, or resolve.
 */
export function tickLegitimacyWar(state: State): LegitimacyWarTickResult {
  const result: LegitimacyWarTickResult = {
    active: Boolean(state.legitimacyWarActive),
    opened: false,
    resolved: false,
    pretenderRestored: false,
    pretenderCrushed: false,
    treasuryDrained: 0
  };

  if (!state.i) return result;

  ensurePretenderFromLastCoup(state);
  const pretenderId = state.legitimacyPretenderId;
  const legitimacy = state.coupLegitimacy ?? 100;
  const discontent = state.militaryDiscontent || 0;
  const unrestCycles = state.civilUnrestCycles || 0;

  // ── Open war ────────────────────────────────────────────────────────────
  if (!state.legitimacyWarActive) {
    const canOpen =
      Boolean(state.civilUnrest) &&
      pretenderId !== undefined &&
      legitimacy <= LEGIT_WAR_LEGITIMACY_CEILING &&
      discontent >= LEGIT_WAR_DISCONTENT_FLOOR &&
      unrestCycles >= LEGIT_WAR_MIN_UNREST_CYCLES;

    if (!canOpen) return result;

    state.legitimacyWarActive = true;
    state.legitimacyWarTicks = 0;
    result.active = true;
    result.opened = true;
    result.summary = `Legitimacy war opens — pretender ${state.legitimacyPretenderName || pretenderId} challenges the regime.`;
    appendCouncilLog(state, "note", result.summary, {
      messageKey: "legitWarOpen",
      messageParams: { name: state.legitimacyPretenderName || String(pretenderId) }
    });
    dispatchLegitimacyWarEvent(state, "open");
    return result;
  }

  // ── Prosecute ───────────────────────────────────────────────────────────
  result.active = true;
  const ticks = (state.legitimacyWarTicks || 0) + 1;
  state.legitimacyWarTicks = ticks;

  const cash = state.treasury || 0;
  const drain = rn(Math.min(LEGIT_WAR_TREASURY_DRAIN, cash), 2);
  if (drain > 0) {
    state.treasury = rn(cash - drain, 2);
    result.treasuryDrained = drain;
  }
  state.militaryDiscontent = rn(Math.min(200, discontent + LEGIT_WAR_DISCONTENT_GAIN), 2);
  // War hurts legitimacy slightly unless regime is already recovering.
  if (legitimacy < LEGIT_WAR_REGIME_WIN_LEGITIMACY) {
    state.coupLegitimacy = rn(Math.max(0, legitimacy - 2), 1);
  }

  // ── Resolve ─────────────────────────────────────────────────────────────
  if (ticks < LEGIT_WAR_RESOLVE_TICKS) {
    result.summary = `Legitimacy war continues (tick ${ticks}/${LEGIT_WAR_RESOLVE_TICKS}).`;
    return result;
  }

  const currentLegit = state.coupLegitimacy ?? 0;
  const regimeWins = currentLegit >= LEGIT_WAR_REGIME_WIN_LEGITIMACY || !hasCharactersContext();

  if (regimeWins || pretenderId === undefined) {
    // Crush pretender: clear flags, legitimacy bounce.
    state.legitimacyWarActive = false;
    state.legitimacyWarTicks = 0;
    state.legitimacyPretenderId = undefined;
    state.civilUnrest = false;
    state.coupLegitimacy = rn(Math.min(100, Math.max(currentLegit, 55) + 10), 1);
    state.militaryDiscontent = rn(Math.max(20, (state.militaryDiscontent || 0) - 25), 2);
    result.resolved = true;
    result.pretenderCrushed = true;
    result.active = false;
    result.summary = "Legitimacy war ends — regime holds; pretender crushed.";
    appendCouncilLog(state, "note", result.summary, { messageKey: "legitWarRegime" });
    dispatchLegitimacyWarEvent(state, "regime_win");
    return result;
  }

  // Pretender restoration
  const characters = getCharacters();
  const pretender = characters.find(c => c.i === pretenderId && !c.dead);
  const rulerId = getRulerId(state);
  const ruler = rulerId !== undefined ? characters.find(c => c.i === rulerId && !c.dead) : undefined;

  if (pretender && ruler && pretender.i !== ruler.i) {
    transferLandedTitle(ruler, pretender, state.i, "Restored by legitimacy war");
    setRulerId(state, pretender.i);
    state.lastDebtCoup = {
      oldRulerId: ruler.i,
      newRulerId: pretender.i,
      oldRulerName: ruler.name,
      newRulerName: pretender.name
    };
  }

  state.legitimacyWarActive = false;
  state.legitimacyWarTicks = 0;
  state.legitimacyPretenderId = undefined;
  state.civilUnrest = true;
  state.civilUnrestCycles = 0;
  state.coupLegitimacy = 28;
  state.debtCoupSupportPenalty = Math.max(state.debtCoupSupportPenalty || 0, 15);
  result.resolved = true;
  result.pretenderRestored = true;
  result.active = false;
  result.summary = `Legitimacy war ends — pretender ${pretender?.name || pretenderId} restored.`;
  appendCouncilLog(state, "coup", result.summary, {
    messageKey: "legitWarPretender",
    messageParams: { name: pretender?.name || String(pretenderId) }
  });
  dispatchLegitimacyWarEvent(state, "pretender_win");
  return result;
}

function dispatchLegitimacyWarEvent(state: State, phase: "open" | "regime_win" | "pretender_win"): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("fmg:legitimacy-war", {
      detail: {
        stateId: state.i,
        phase,
        pretenderId: state.legitimacyPretenderId,
        legitimacy: state.coupLegitimacy ?? 0,
        militaryDiscontent: state.militaryDiscontent || 0
      }
    })
  );
}
