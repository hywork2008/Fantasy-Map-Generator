import { getTacticalSkill } from "../../../data/militaryFormations";
import type { Character } from "../../characters/characterTypes";
import { EXPERTISE_TASKS, evaluateExpertise } from "../../characters/specializations";
import type { SpecializationTarget } from "../../characters/specializationTypes";
import { applyConquestDisruption } from "../../economy/generators/conquestDisruption";
import { getMartialDisciplineMultiplier } from "../../economy/generators/martialDisciplineKnowledge";
import { getCommanderMartialSkillMultiplier } from "../../economy/generators/martialIndividualMastery";
import { findSeaRouteDistance, regimentQualityMultiplier, type SeaRouteGraph } from "../../hostCore";
import type { Burg, MilitaryRegiment, MilitaryUnit, PackedGraph } from "../../hostTypes";
import { getRegimentCommander } from "./officerAssignment";

/**
 * Minimum surviving occupying force, relative to a captured burg's population, needed to
 * actually hold the city — a handful of survivors can't hold down a city of thousands, they'd
 * be driven out or murdered in the night before ever consolidating control
 * (docs/plan/military-time-advance-review-findings.md §1.1).
 */
export const OCCUPATION_FORCE_RATIO = 0.05;

/** Absolute inhabitants represented by a burg's internal population points. */
export function burgPopulationPeople(burg: Burg, populationRate: number, urbanization: number): number {
  return (burg.population ?? 0) * (populationRate || 1) * (urbanization || 1);
}

/** True if `occupyingForce` survivors are enough to actually hold `burg` down after taking it. */
export function canOccupyBurg(
  burg: Burg,
  occupyingForce: number,
  populationRate: number,
  urbanization: number
): boolean {
  return occupyingForce >= burgPopulationPeople(burg, populationRate, urbanization) * OCCUPATION_FORCE_RATIO;
}

/**
 * Transfers `burg` and every cell mapped to it over to `winnerStateId`, and records the change
 * in `burg.stateHistory` (oldest first) — the single entry point every capture path (formal
 * siege resolution, background skirmish annihilation, marching-through raids) must go through so
 * the ownership trail stays complete for reconquest-legitimacy checks (see Burg.stateHistory).
 *
 * `winnerStateId` already appearing in `stateHistory` means this is a State reclaiming a burg it
 * held before (e.g. tryRecaptureHomeBurg's own historically-owned city) rather than a genuinely
 * new conquest — only a first-time-for-this-owner capture disrupts the burg's Economy-owned
 * technique stocks (docs/plan/knowledge-guild-system.md §9 Phase 7); recapturing your own city
 * doesn't inflict a second disruption on top of whatever it already suffered when it was lost.
 *
 * `occupyingDiscipline` is the sack-mitigation multiplier from `occupyingDisciplineMultiplier`
 * (commander Martial via commanderPowerMultiplier). 1 = no commander. Passed through to
 * Economy's physical loot (docs/plan/economy-coupling-audit.md L9-c).
 */
export function captureBurg(pack: PackedGraph, burg: Burg, winnerStateId: number, occupyingDiscipline = 1): void {
  const isNewConquest = !(burg.stateHistory ?? []).includes(winnerStateId);

  burg.state = winnerStateId;
  burg.stateHistory = [...(burg.stateHistory ?? []), winnerStateId];
  for (let i = 0; i < pack.cells.burg.length; i++) {
    if (pack.cells.burg[i] === burg.i) {
      pack.cells.state[i] = winnerStateId;
    }
  }

  if (isNewConquest && burg.i !== undefined) {
    applyConquestDisruption(burg.i, { disciplineMultiplier: occupyingDiscipline });
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
 * plain troop count. Stacks with the owning State's MartialDisciplineStock (docs/plan/
 * knowledge-guild-system.md §9 Phase 5) — well-drilled standing regiments fight above their raw
 * headcount the same way a good commander does. This only scales the power total used to decide
 * a battle's outcome; actual casualties are still applied against real troop counts.
 */
export function commanderPowerMultiplier(
  characters: Character[],
  regiment: MilitaryRegiment,
  targets: readonly SpecializationTarget[] = []
): number {
  const commander = getRegimentCommander(characters, regiment);
  const troopTargets: SpecializationTarget[] = Object.entries(regiment.u ?? {})
    .filter(([, count]) => count > 0)
    .map(([id]) => ({ kind: "troop", id }));
  const score = commander
    ? evaluateExpertise(
        commander,
        regiment.n
          ? EXPERTISE_TASKS.naval
          : targets.some(target => target.kind === "terrain" && target.id === "urban")
            ? EXPERTISE_TASKS.siege
            : EXPERTISE_TASKS.command,
        [...targets, ...troopTargets, { kind: "commandScale", id: regiment.a >= 1000 ? "army" : "regiment" }]
      ).score
    : 0;
  const commanderMultiplier = commander ? 1 + (score / 100) * 0.5 : 1;
  const individualSkillMultiplier = commander ? getCommanderMartialSkillMultiplier(commander, regiment) : 1;
  return (
    commanderMultiplier * individualSkillMultiplier * getMartialDisciplineMultiplier(regiment.state, regiment.u || {})
  );
}

/** Headcount-weighted mean of commanderPowerMultiplier for the regiments that still hold the town. */
export function occupyingDisciplineMultiplier(characters: Character[], regiments: readonly MilitaryRegiment[]): number {
  let weight = 0;
  let acc = 0;
  for (const regiment of regiments) {
    const strength = Math.max(0, regiment.a || 0);
    if (!(strength > 0)) continue;
    acc += commanderPowerMultiplier(characters, regiment) * strength;
    weight += strength;
  }
  return weight > 0 ? acc / weight : 1;
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
  seaRouteGraph: SeaRouteGraph,
  populationRate: number,
  urbanization: number
): number {
  const cityGarrison = burgPopulationPeople(targetBurg, populationRate, urbanization) * 0.05;
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
 * Identity quality for the classic 3× siege ratio. Missing `fortificationQuality` on old
 * saves is treated as this so existing maps keep the same attack bar.
 */
export const DEFAULT_FORTIFICATION_QUALITY = 50;
/** Classic attacker:defender ratio against typical walls/citadel (quality 50). */
export const FORTIFIED_ATTACK_RATIO = 3;
/** Quality above 50: 50 → 3.0, 100 → 4.2. */
const FORTIFICATION_RATIO_PER_QUALITY_HIGH = 0.024;
/** Quality below 50: 0 → 2.4, 50 → 3.0. Poor works still beat an open field. */
const FORTIFICATION_RATIO_PER_QUALITY_LOW = 0.012;

export function isBurgFortified(burg: { citadel?: unknown; walls?: unknown } | undefined): boolean {
  return !!(burg?.citadel || burg?.walls);
}

export function resolvedFortificationQuality(burg: { fortificationQuality?: number } | undefined): number {
  const quality = burg?.fortificationQuality;
  if (typeof quality === "number" && Number.isFinite(quality)) return Math.max(0, Math.min(100, quality));
  return DEFAULT_FORTIFICATION_QUALITY;
}

/**
 * Attacker:defender ratio required to take `burg`. Unfortified towns use `fieldRatio`.
 * Fortified towns scale with stored design quality; missing quality keeps the classic 3×.
 */
export function fortificationAttackRatio(
  burg: { citadel?: unknown; walls?: unknown; fortificationQuality?: number } | undefined,
  fieldRatio: number
): number {
  if (!isBurgFortified(burg)) return fieldRatio;
  const qualityOffset = resolvedFortificationQuality(burg) - DEFAULT_FORTIFICATION_QUALITY;
  const slope = qualityOffset >= 0 ? FORTIFICATION_RATIO_PER_QUALITY_HIGH : FORTIFICATION_RATIO_PER_QUALITY_LOW;
  return FORTIFIED_ATTACK_RATIO + qualityOffset * slope;
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

export function getClusterCommander(characters: Character[], cluster: MilitaryRegiment[]): Character | undefined {
  let best: Character | undefined;
  let bestMartial = -1;
  for (const reg of cluster) {
    const cmd = getRegimentCommander(characters, reg);
    if (cmd && !cmd.dead) {
      const martial = getTacticalSkill(cmd);
      if (martial > bestMartial) {
        bestMartial = martial;
        best = cmd;
      }
    }
  }
  return best;
}

export function sumClusterTroops(cluster: MilitaryRegiment[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const reg of cluster) {
    for (const [unit, count] of Object.entries(reg.u ?? {})) {
      result[unit] = (result[unit] || 0) + count;
    }
  }
  return result;
}
