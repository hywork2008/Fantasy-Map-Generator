import { getSolidarity } from "./backstoryProfile";
import { getEffectivePatriotism } from "./characterSimulationHooks";
import type { Character, CommitmentKind } from "./characterTypes";

export const IDLE_HAWK_LOYALTY_MAX = 40;
export const IDLE_HAWK_AMBITION_MIN = 55;
export const IDLE_HAWK_GUILE_MIN = 60;
export const IDLE_HAWK_INTRIGUE_MIN = 60;

const AMBITIOUS_COMMITMENTS = new Set<CommitmentKind>(["self", "house", "domain", "office", "wealth"]);

export type IdleHawkPlot = "none" | "coup" | "provoke-war";

function relationToHundred(score: number): number {
  return (score + 100) / 2;
}

/** 0–100 loyalty to the realm and its ruler. Low = willing to plot. */
export function idleHawkLoyalty(marshal: Character, ruler: Character | undefined, stateId: number): number {
  const patriotism = getEffectivePatriotism(marshal);
  const toRuler = ruler ? relationToHundred(getSolidarity(marshal, ruler.i)) : patriotism;
  const affinity = marshal.affinities?.[stateId];
  const toState = typeof affinity === "number" ? relationToHundred(affinity) : toRuler;
  return Math.max(1, Math.min(100, Math.round((patriotism + toRuler + toState) / 3)));
}

/** 0–100 personal ambition (greed, energy, power-seeking commitments). */
export function idleHawkAmbition(marshal: Character): number {
  const p = marshal.personality;
  let score = p.greed * 0.45 + p.energy * 0.2;
  const primary = marshal.backstory?.commitment.primary.kind;
  const secondary = marshal.backstory?.commitment.secondary?.kind;
  if (primary && AMBITIOUS_COMMITMENTS.has(primary)) score += 28;
  if (secondary && AMBITIOUS_COMMITMENTS.has(secondary)) score += 12;
  return Math.max(1, Math.min(100, Math.round(score)));
}

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

  const guile = marshal.personality.guile;
  const intrigue = marshal.skills.intrigue;
  if (guile >= IDLE_HAWK_GUILE_MIN || intrigue >= IDLE_HAWK_INTRIGUE_MIN) return "provoke-war";
  if (marshal.personality.boldness >= 65) return "coup";
  return "none";
}
