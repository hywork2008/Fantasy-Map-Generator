import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRulerId } from "../../nobility/nobilityContext";
import { findLivingOfficeHolder } from "./treasuryAllocation";

/**
 * Multi-ledger PR-8 — thin council / assembly support model.
 *
 * Not a full faction simulation: computes a 0–100 support score from form baseline +
 * living central officers' honor/rationality, used to scale wartime revenue veto chance
 * and to gate voluntary public-debt issuance.
 */

/** Base assembly support by form (Republic assemblies are harder to please). */
export const COUNCIL_BASE_SUPPORT_BY_FORM: Record<string, number> = {
  Monarchy: 62,
  Republic: 48,
  Theocracy: 58,
  Union: 52,
  Anarchy: 35
};

/** Support required for voluntary peacetime/war debt issuance from the ruler HUD. */
export const COUNCIL_DEBT_ISSUE_SUPPORT_FLOOR = 45;

export interface CouncilSupportBreakdown {
  support: number;
  formBase: number;
  officerBonus: number;
  officerCount: number;
  notes: string[];
}

/**
 * Compute current assembly support (0–100). Vacant offices leave the form base unchanged.
 * Living officers with high honor/rationality raise support; low values drag it down.
 */
export function getCouncilSupport(state: Pick<State, "i" | "form">): CouncilSupportBreakdown {
  const form = state.form || "Monarchy";
  const formBase = COUNCIL_BASE_SUPPORT_BY_FORM[form] ?? COUNCIL_BASE_SUPPORT_BY_FORM.Monarchy;
  const notes: string[] = [`Form base support ${formBase}.`];

  let officerBonus = 0;
  let officerCount = 0;

  if (state.i && hasCharactersContext()) {
    const characters = getCharacters();
    let honorSum = 0;
    let rationalitySum = 0;
    let weightSum = 0;
    for (const office of CENTRAL_OFFICES) {
      const holder = findLivingOfficeHolder(characters, state.i, office.title);
      if (!holder?.personality) continue;
      officerCount += 1;
      weightSum += 1;
      honorSum += holder.personality.honor ?? 50;
      rationalitySum += holder.personality.rationality ?? 50;
    }
    // Also weigh the ruler lightly (sits "above" the table but shapes the room).
    const rulerId = getRulerId(state as State);
    if (rulerId !== undefined) {
      const ruler = characters.find(c => c.i === rulerId && !c.dead);
      if (ruler?.personality) {
        officerCount += 1;
        const w = 0.5;
        weightSum += w;
        honorSum += (ruler.personality.honor ?? 50) * w;
        rationalitySum += (ruler.personality.rationality ?? 50) * w;
        notes.push("Ruler personality included at half weight.");
      }
    }
    if (weightSum > 0) {
      const avgHonor = honorSum / weightSum;
      const avgRationality = rationalitySum / weightSum;
      // Map average 0–100 around 50 into roughly ±18 support points.
      officerBonus = rn(((avgHonor + avgRationality) / 2 - 50) * 0.36, 2);
      notes.push(`${officerCount} voices; honor/rationality avg shift ${officerBonus >= 0 ? "+" : ""}${officerBonus}.`);
    } else {
      notes.push("No living council voices — form base only.");
    }
  }

  const support = rn(Math.max(0, Math.min(100, formBase + officerBonus)), 1);
  return { support, formBase, officerBonus, officerCount, notes };
}

/**
 * Scale a base failure chance (0–100) by inverse support.
 * support 50 → ~1×; support 80 → ~0.55×; support 20 → ~1.45× (clamped).
 */
export function scaleFailureChanceBySupport(baseChance: number, support: number): number {
  if (!(baseChance > 0)) return 0;
  const factor = 1 + (50 - support) / 70;
  return rn(Math.max(0, Math.min(90, baseChance * factor)), 2);
}

/** Whether the assembly would currently approve voluntary public borrowing. */
export function canCouncilApproveDebtIssue(state: Pick<State, "i" | "form">): boolean {
  return getCouncilSupport(state).support >= COUNCIL_DEBT_ISSUE_SUPPORT_FLOOR;
}

/**
 * Persist support snapshot onto the state for UI (Treasury Overview / PC HUD).
 */
export function updateCouncilSupportSnapshot(state: State): number {
  const { support } = getCouncilSupport(state);
  state.councilSupport = support;
  return support;
}
