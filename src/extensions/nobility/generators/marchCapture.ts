import { buildSeaRouteGraph } from "../../hostCore";
import type { Burg, ChronicleEvent, MilitaryRegiment, State } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import { mayAdvanceConflict } from "../conflictDirector";
import { getWorldContext } from "../nobilityContext";
import {
  burgPopulationPeople,
  calculateEffectiveSiegePower,
  captureBurg,
  commanderPowerMultiplier,
  estimateLocalDefendingForce
} from "./localDefense";

/**
 * Attacker-power/defense ratio needed to seize an unfortified town in passing, without
 * committing to a formal siege. Far below strategic-planner.ts's FIELD_ATTACK_RATIO (1.3): a
 * town's own "defense" here is just its population-derived militia (see
 * estimateLocalDefendingForce), and during marching/campaign season that militia skews toward
 * women, children and the elderly rather than able-bodied men — it isn't a real match for an
 * organized field army even at low odds. Walls/citadel opt a town out of this entirely (see the
 * check below); only genuinely undefended settlements fall this easily.
 */
const PASSING_CAPTURE_RATIO = 0.2;

/**
 * A passing army's power divided by this multiple of the town's population marks "maximum raid
 * severity" (clamped to 1) for the population/wealth effects below. Scales with how lopsided the
 * encounter is: a small patrol passing through a real city barely registers, while a large field
 * army marching through a small town devastates it.
 */
const RAID_SEVERITY_POPULATION_SCALE = 2;

/** At maximum raid severity, a passing army's foraging costs the town this fraction of its population. */
const RAID_POPULATION_LOSS_MAX = 0.05;

/** At maximum raid severity, a passing army strips this fraction of the town's treasury/production as plunder. */
const RAID_WEALTH_LOSS_MAX = 0.7;

function logPassingCapture(winnerState: State, loserState: State, burg: Burg): void {
  const { pack } = getWorldContext();
  const chronicle = pack.states[0].diplomacy ?? [];

  const event: ChronicleEvent = {
    id: `march-capture-${winnerState.i}-${loserState.i}-${burg.i}-${Date.now()}`,
    yearsAgo: 0,
    from: winnerState.i,
    to: loserState.i,
    toBurg: burg.i,
    action: "occupied an undefended town while marching through",
    rawText: `${winnerState.name}'s army lived off the land as it marched through ${burg.name}, foraging food and water, and occupied the undefended town in passing.`
  };

  pack.states[0].diplomacy = [[`${winnerState.name} occupies ${burg.name}`, event], ...chronicle];
}

/**
 * Called (via regimentMovement.ts's `advanceAlongPath`/`advanceAllRegimentMovement`
 * `onCellEntered` hook) every time a land regiment newly enters a cell during its march. If that
 * cell holds a hostile burg, the passing army forages it — a proportional population/wealth hit
 * regardless of outcome — and, if the town has no walls/citadel and can't muster enough of a
 * militia to matter, is occupied outright in passing rather than requiring a full siege.
 *
 * This is also how a state reclaims an enclave the enemy captured and then marched away from:
 * regimentMovement.ts's `ensureGarrisonMarchOrder` now routes ordinary garrison patrols into any
 * enemy-held burg they used to own (`Burg.stateHistory`), and if it's sitting undefended (as a
 * abandoned occupation usually is), this same function retakes it.
 *
 * Returns true if the burg actually changed hands this call, so the tick hook knows to re-render
 * the states/borders layers (cell ownership changed) in addition to the usual military layer.
 */
export function tryCaptureOnPassing(r: MilitaryRegiment, cell: number): boolean {
  if (r.n || r.a <= 0) return false; // land only; fleets don't "pass through" land burgs

  const { pack, options, populationRate, urbanization } = getWorldContext();
  const burg = pack.burgs.find(b => !b.removed && b.cell === cell);
  if (!burg || burg.state === r.state) return false;

  const ownState = pack.states[r.state];
  const targetState = pack.states[burg.state ?? -1];
  if (!ownState || !targetState) return false;
  if (!mayAdvanceConflict(ownState.i, targetState.i)) return false;
  if (ownState.diplomacy?.[targetState.i] !== "Enemy") return false;

  const characters = pack.characters || [];
  const militaryOptions = options.military || [];
  const power = calculateEffectiveSiegePower(r, false, militaryOptions) * commanderPowerMultiplier(characters, r);

  // Living off the land: any hostile settlement a regiment marches through gets its
  // countryside foraged proportional to how large the passing force is next to the town —
  // independent of whether it's actually strong enough to hold the place (checked below).
  const populationPeople = burgPopulationPeople(burg, populationRate, urbanization);
  const raidSeverity = minmax(power / (Math.max(populationPeople, 1) * RAID_SEVERITY_POPULATION_SCALE), 0, 1);
  if (raidSeverity > 0) {
    burg.population = (burg.population ?? 0) * (1 - raidSeverity * RAID_POPULATION_LOSS_MAX);
    burg.treasury = rn(Math.max(0, (burg.treasury || 0) * (1 - raidSeverity * RAID_WEALTH_LOSS_MAX)), 2);
    burg.product = rn(Math.max(0, (burg.product || 0) * (1 - raidSeverity * RAID_WEALTH_LOSS_MAX)), 2);
  }

  // Walls/citadel mean this town won't just fall to an army marching past — taking it still
  // requires a real siege (battle-resolution.ts's tension/arrival pipeline).
  if (burg.citadel || burg.walls) return false;

  const seaRouteGraph = buildSeaRouteGraph(pack);
  const defense = estimateLocalDefendingForce(pack, burg, characters, seaRouteGraph, populationRate, urbanization);
  if (power < defense * PASSING_CAPTURE_RATIO) return false;

  captureBurg(pack, burg, r.state);
  logPassingCapture(ownState, targetState, burg);
  return true;
}
