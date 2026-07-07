import type { Burg, MilitaryRegiment } from "../../../types/models";
import type { PackedGraph } from "../../../types/PackedGraph";
import type { Character } from "./characterTypes";
import { getRegimentCommander } from "./officerAssignment";

/** Distance (map units) within which cavalry/infantry regiments are assumed able to reinforce a besieged burg. */
export const REINFORCEMENT_RADIUS = { cavalry: 300, infantry: 100 } as const;

/**
 * A regiment led by a dedicated officer (see officerAssignment.ts) fights above its raw
 * headcount — up to +50% at Martial 100. Regiments without a commander fight at their
 * plain troop count. This only scales the power total used to decide a battle's outcome;
 * actual casualties are still applied against real troop counts.
 */
export function commanderPowerMultiplier(characters: Character[], regiment: MilitaryRegiment): number {
  const commander = getRegimentCommander(characters, regiment);
  return commander ? 1 + (commander.skills.martial / 100) * 0.5 : 1;
}

/** The marching radius a regiment can reinforce from, based on whether it's cavalry- or infantry-heavy. */
export function regimentReinforcementRadius(regiment: MilitaryRegiment): number {
  const cavalryCount = (regiment.u?.cavalry || 0) + (regiment.u?.["light cavalry"] || 0);
  const infantryCount = (regiment.u?.infantry || 0) + (regiment.u?.archers || 0);
  return cavalryCount > infantryCount ? REINFORCEMENT_RADIUS.cavalry : REINFORCEMENT_RADIUS.infantry;
}

/**
 * Estimates how many troops could actually defend `targetBurg` — its own militia plus
 * friendly regiments within marching distance — instead of the defending state's entire
 * national military. A state's total army is almost always many times larger than what a
 * single border town can actually muster in its own defense, so using the national total
 * here (as strategic-planner.ts used to) makes every target look defended by the whole
 * country and makes weakly-garrisoned or isolated burgs effectively unconquerable.
 * Used both to decide whether attacking a burg is worth planning (strategic-planner.ts)
 * and, filtered further by surprise-attack fog, to actually resolve the siege
 * (battle-resolution.ts).
 */
export function estimateLocalDefendingForce(pack: PackedGraph, targetBurg: Burg, characters: Character[]): number {
  const cityGarrison = (targetBurg.population || 0) * 0.05;
  const targetState = pack.states[targetBurg.state ?? -1];
  const defendingRegiments = targetState?.military || [];

  let local = cityGarrison;
  for (const regiment of defendingRegiments) {
    if (regiment.a <= 0) continue;
    const dist = Math.hypot(regiment.x - targetBurg.x, regiment.y - targetBurg.y);
    if (dist <= regimentReinforcementRadius(regiment)) {
      local += regiment.a * commanderPowerMultiplier(characters, regiment);
    }
  }
  return local;
}
