import { regimentQualityMultiplier } from "../../../generators/manpower";
import { findSeaRouteDistance, type SeaRouteGraph } from "../../../generators/seaRouteGraph";
import type { Burg, MilitaryRegiment, MilitaryUnit } from "../../../types/models";
import type { PackedGraph } from "../../../types/PackedGraph";
import type { Character } from "../../characters/characterTypes";
import { getRegimentCommander } from "./officerAssignment";

/**
 * Minimum surviving occupying force, relative to a captured burg's population, needed to
 * actually hold the city — a handful of survivors can't hold down a city of thousands, they'd
 * be driven out or murdered in the night before ever consolidating control
 * (docs/plan/military-time-advance-review-findings.md §1.1).
 */
export const OCCUPATION_FORCE_RATIO = 0.05;

/** True if `occupyingForce` survivors are enough to actually hold `burg` down after taking it. */
export function canOccupyBurg(burg: Burg, occupyingForce: number): boolean {
  return occupyingForce >= (burg.population || 0) * OCCUPATION_FORCE_RATIO;
}

/**
 * Transfers `burg` and every cell mapped to it over to `winnerStateId`, and records the change
 * in `burg.stateHistory` (oldest first) — the single entry point every capture path (formal
 * siege resolution, background skirmish annihilation, marching-through raids) must go through so
 * the ownership trail stays complete for reconquest-legitimacy checks (see Burg.stateHistory).
 */
export function captureBurg(pack: PackedGraph, burg: Burg, winnerStateId: number): void {
  burg.state = winnerStateId;
  burg.stateHistory = [...(burg.stateHistory ?? []), winnerStateId];
  for (let i = 0; i < pack.cells.burg.length; i++) {
    if (pack.cells.burg[i] === burg.i) {
      pack.cells.state[i] = winnerStateId;
    }
  }
}

/**
 * Distance (map units) within which cavalry/infantry regiments are assumed able to reinforce
 * a besieged burg. `naval` is compared against charted sea-route distance (see
 * regimentDistanceTo), not straight-line — a fleet sailing an established lane covers more
 * ground than marching infantry, hence the larger figure.
 */
export const REINFORCEMENT_RADIUS = { cavalry: 50, infantry: 50, naval: 500 } as const;

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

/** The marching/sailing radius a regiment can reinforce from, based on its composition. */
export function regimentReinforcementRadius(regiment: MilitaryRegiment): number {
  if (regiment.n) return REINFORCEMENT_RADIUS.naval;
  const cavalryCount = (regiment.u?.cavalry || 0) + (regiment.u?.["light cavalry"] || 0);
  const infantryCount = (regiment.u?.infantry || 0) + (regiment.u?.archers || 0);
  return cavalryCount > infantryCount ? REINFORCEMENT_RADIUS.cavalry : REINFORCEMENT_RADIUS.infantry;
}

/**
 * Distance from `regiment` to a target point, respecting the "no charted sea route, no safe
 * crossing" rule for naval regiments (docs/plan/naval-sea-lanes.md) instead of straight-line
 * distance across open water. Land regiments are unaffected — plain Euclidean distance, same
 * as before Phase 3. Returns null only for a naval regiment with no charted route to
 * `targetCell` at all; callers must treat that as "cannot reach," not "very far" (a naive
 * `dist <= radius` comparison against null/NaN can silently evaluate to `false` — check for
 * null explicitly, as the callers in this file and battle-resolution.ts do).
 */
export function regimentDistanceTo(
  regiment: MilitaryRegiment,
  targetCell: number,
  targetX: number,
  targetY: number,
  seaRouteGraph: SeaRouteGraph
): number | null {
  if (regiment.n) return findSeaRouteDistance(seaRouteGraph, regiment.cell, targetCell);
  return Math.hypot(regiment.x - targetX, regiment.y - targetY);
}

/**
 * Estimates how many troops could actually defend `targetBurg` — its own militia plus
 * friendly regiments within marching/sailing distance — instead of the defending state's
 * entire national military. A state's total army is almost always many times larger than
 * what a single border town can actually muster in its own defense, so using the national
 * total here (as strategic-planner.ts used to) makes every target look defended by the whole
 * country and makes weakly-garrisoned or isolated burgs effectively unconquerable.
 * Used both to decide whether attacking a burg is worth planning (strategic-planner.ts)
 * and, filtered further by surprise-attack fog, to actually resolve the siege
 * (battle-resolution.ts).
 */
export function estimateLocalDefendingForce(
  pack: PackedGraph,
  targetBurg: Burg,
  characters: Character[],
  seaRouteGraph: SeaRouteGraph
): number {
  const cityGarrison = (targetBurg.population || 0) * 0.05;
  const targetState = pack.states[targetBurg.state ?? -1];
  const defendingRegiments = targetState?.military || [];

  let local = cityGarrison;
  for (const regiment of defendingRegiments) {
    if (regiment.a <= 0) continue;
    const dist = regimentDistanceTo(regiment, targetBurg.cell, targetBurg.x, targetBurg.y, seaRouteGraph);
    if (dist !== null && dist <= regimentReinforcementRadius(regiment)) {
      local += regiment.a * commanderPowerMultiplier(characters, regiment);
    }
  }
  return local;
}

/**
 * Calculates the effective combat headcount of a regiment during a siege.
 *
 * TODO [Future Demotion System]:
 * If a state wants to siege but lacks infantry, mounted and ranged units should be
 * given the option to "dismount" or "drop bows" to become melee infantry before the siege.
 * Currently, we simply penalize them: cavalry is useless (0%), archers are reduced (50%).
 */
export function calculateEffectiveSiegePower(
  regiment: MilitaryRegiment,
  isFortified: boolean,
  militaryOptions: MilitaryUnit[]
): number {
  const quality = regimentQualityMultiplier(regiment);
  if (!isFortified) return regiment.a * quality; // Field battles use headcount × recruit quality

  let power = 0;
  for (const [name, amount] of Object.entries(regiment.u || {})) {
    const unitDef = militaryOptions.find(u => u.name === name);
    const type = unitDef?.type ?? "melee";

    let multiplier = 1.0;
    switch (type) {
      case "melee":
        multiplier = 1.0;
        break;
      case "mounted":
        multiplier = 0.0; // Cavalry cannot assault walls
        break;
      case "ranged":
        multiplier = 0.5; // Archers provide covering fire but can't breach
        break;
      case "machinery":
        multiplier = 2.0; // Siege engines are highly effective against walls
        break;
      default:
        multiplier = 1.0;
    }
    power += amount * multiplier;
  }
  return power * quality;
}
