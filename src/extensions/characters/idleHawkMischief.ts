import { getSolidarity } from "./backstoryProfile";
import { getPersonalAmbition, getWarPreference, hasPrinciple } from "./characterMotivation";
import type { Character } from "./characterTypes";

export const IDLE_HAWK_LOYALTY_MAX = 40;
export const IDLE_HAWK_AMBITION_MIN = 55;
export const IDLE_HAWK_GUILE_MIN = 60;

export type IdleHawkPlot = "none" | "coup" | "provoke-war";

function relationToHundred(score: number): number {
  return (score + 100) / 2;
}

/** Loyalty to this ruler. Love of the realm must not mask opposition to its ruler. */
export function idleHawkLoyalty(marshal: Character, ruler: Character | undefined, stateId: number): number {
  if (!ruler) return 50;
  const focus = marshal.backstory?.commitment.primary;
  const personalOath = focus?.kind === "liege" && focus.targetId === ruler.i;
  const institutionalOath =
    hasPrinciple(marshal, "keep_oaths") && focus?.kind === "state" && focus.targetId === stateId;
  const relationship = relationToHundred(getSolidarity(marshal, ruler.i));
  return Math.min(100, relationship + (personalOath || institutionalOath ? 25 : 0));
}

export const idleHawkAmbition = getPersonalAmbition;

/**
 * A hawk marshal with idle hands: loyal ones leave, disloyal ambitious ones plot.
 * Schemers manufacture a war; the rest try a coup if they are bold enough.
 */
export function chooseIdleHawkMischief(
  marshal: Character,
  ruler: Character | undefined,
  stateId: number
): IdleHawkPlot {
  if (idleHawkLoyalty(marshal, ruler, stateId) >= IDLE_HAWK_LOYALTY_MAX) return "none";
  if (idleHawkAmbition(marshal) < IDLE_HAWK_AMBITION_MIN) return "none";

  // Skill determines execution, never desire. Low-skill schemers may still attempt and fail.
  if (marshal.personality.guile >= IDLE_HAWK_GUILE_MIN && getWarPreference(marshal) >= 60) return "provoke-war";
  if (marshal.personality.boldness >= 65) return "coup";
  return "none";
}
