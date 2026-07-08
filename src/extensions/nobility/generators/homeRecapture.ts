import { isOccupiedHomeBurg } from "../../../generators/regimentMovement";
import type { Burg, ChronicleEvent, MilitaryRegiment, State } from "../../../types/models";
import type { PackedGraph } from "../../../types/PackedGraph";
import { getWorldContext } from "../nobilityContext";
import type { Character } from "./characterTypes";
import { calculateEffectiveSiegePower, captureBurg, commanderPowerMultiplier } from "./localDefense";

/**
 * map units — how close an occupier's own regiment must be to a domestically-recaptured burg to
 * count as "actively garrisoning" it, rather than the city just sitting administratively occupied
 * with no soldiers physically present. Same detection scale as regimentMovement.ts's reaction
 * layer (VISUAL_DETECTION_RADIUS) — if the occupier has no one close enough to resist, there's no
 * fight to have.
 */
const HOME_DEFENSE_DETECTION_RADIUS = 400;

/**
 * Force-ratio required to retake a domestic pocket *only when the occupier actually has troops
 * nearby* — same values as the regular siege ratios (battle-resolution.ts/strategic-planner.ts),
 * because a real garrison fighting for the occupier is a real fight regardless of whose city it
 * used to be. Walls/citadel still raise the bar in that case: the fortifications are real, even
 * if the people manning them are the only ones actually loyal to the occupier.
 */
const FORTIFIED_RECAPTURE_RATIO = 3;
const FIELD_RECAPTURE_RATIO = 1.3;

/**
 * Sum of the occupier's own regiments actually near `burg` — deliberately *not*
 * localDefense.ts's `estimateLocalDefendingForce`, whose population-militia term assumes the
 * town's own people defend it. Here the population are the recapturing state's own former
 * countrymen (`Burg.stateHistory`); they won't take up arms for an occupier that has no real
 * garrison physically there. Only actual nearby enemy regiments mean anyone will fight.
 */
function nearbyOccupierForce(pack: PackedGraph, burg: Burg, characters: Character[]): number {
  const occupier = pack.states[burg.state ?? -1];
  let force = 0;
  for (const regiment of occupier?.military ?? []) {
    if (regiment.a <= 0 || regiment.n) continue; // land defenders only, same scope as marchCapture.ts
    const dist = Math.hypot(regiment.x - burg.x, regiment.y - burg.y);
    if (dist <= HOME_DEFENSE_DETECTION_RADIUS) force += regiment.a * commanderPowerMultiplier(characters, regiment);
  }
  return force;
}

function logHomeRecapture(winnerState: State, loserState: State, burg: Burg): void {
  const { pack } = getWorldContext();
  const chronicle = pack.states[0].diplomacy ?? [];

  const event: ChronicleEvent = {
    id: `home-recapture-${winnerState.i}-${loserState.i}-${burg.i}-${Date.now()}`,
    yearsAgo: 0,
    from: winnerState.i,
    to: loserState.i,
    toBurg: burg.i,
    action: "liberated a formerly-own city from occupation",
    rawText: `${winnerState.name}'s soldiers were welcomed back into ${burg.name} by its own people, ending ${loserState.name}'s occupation.`
  };

  pack.states[0].diplomacy = [[`${winnerState.name} retakes ${burg.name}`, event], ...chronicle];
}

/**
 * Called (via regimentMovement.ts's `onCellEntered` hook, checked before marchCapture.ts's
 * `tryCaptureOnPassing`) whenever a land regiment enters a cell. If that cell holds `r`'s own
 * historically-owned, fully-enclosed occupied home burg (`isOccupiedHomeBurg` —
 * regimentMovement.ts's `applyRecaptureMarchOrder` is what sends regiments here in the first
 * place), resolves the recapture here instead of falling through to the raiding/passing-capture
 * rules: no raiding damage (this is a liberation, not a raid on foreign soil), and no force-ratio
 * check *unless the occupier actually has a nearby garrison* — with no enemy troops physically
 * present, the town's own people (still loyal to their former state) simply let the regiment back
 * in regardless of walls/citadel, since nobody is manning them against their own countrymen. Only
 * a real nearby garrison makes this an actual fight, at which point walls/citadel raise the
 * required ratio same as a normal siege (docs/plan/military-defense.md).
 *
 * Returns false (falling through to tryCaptureOnPassing) for any burg that isn't this specific
 * domestic case, so ordinary enemy-territory raiding/reclaim is unaffected.
 */
export function tryRecaptureHomeBurg(r: MilitaryRegiment, cell: number): boolean {
  if (r.n || r.a <= 0) return false;

  const { pack, options } = getWorldContext();
  const burg = pack.burgs.find(b => !b.removed && b.cell === cell);
  if (!burg || !isOccupiedHomeBurg(pack, burg, r.state)) return false;

  const ownState = pack.states[r.state];
  const targetState = pack.states[burg.state ?? -1];
  if (!ownState || !targetState) return false;

  const characters = pack.characters || [];
  const defense = nearbyOccupierForce(pack, burg, characters);

  if (defense > 0) {
    const militaryOptions = options.military || [];
    const isFortified = !!(burg.citadel || burg.walls);
    const power =
      calculateEffectiveSiegePower(r, isFortified, militaryOptions) * commanderPowerMultiplier(characters, r);
    const requiredRatio = isFortified ? FORTIFIED_RECAPTURE_RATIO : FIELD_RECAPTURE_RATIO;
    if (power < defense * requiredRatio) return false;
  }

  captureBurg(pack, burg, r.state);
  logHomeRecapture(ownState, targetState, burg);
  return true;
}
