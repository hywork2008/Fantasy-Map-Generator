/**
 * Named-character Arcane assist on annual army hunts.
 * Host-owned so wildernessEcology does not import the Characters extension.
 * Spec: docs/plan/characters/arcane.md
 */
import {
  ARCANE_METEOR_MIN,
  type ArcaneCasterRecord,
  arcaneHuntPowerReduced,
  calendarTime,
  isArcaneWorkingReady,
  spendArcaneWorking,
  stateSpentHighArcaneThisYear,
  workingAllowedOnPath
} from "../data/arcaneWorking";
import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { supernaturalForRaceKey } from "../data/raceSupernatural";
import { getRaceById } from "../data/races";
import { useOptionsState } from "../store/optionsState";
import type { Monster, Race } from "../types/models";

export interface ArcaneHuntAssistInput {
  stateId: number;
  monster: Monster;
  armyYearChunk: number;
  year: number;
  characters?: readonly ArcaneCasterRecord[];
  races?: readonly Race[];
  rand: () => number;
}

/** Extra monster.power removed by a ready 90+ caster of the hunting state. 0 if none. */
export function applyArcaneHuntAssist(input: ArcaneHuntAssistInput): number {
  if (!isFantasyCulturesSet(useOptionsState.getState().culturesSet)) return 0;
  if (input.monster.power <= 0) return 0;
  const casters = input.characters ?? [];
  if (!casters.length) return 0;
  const now = calendarTime(input.year, 1, 1);
  const highBlocked = stateSpentHighArcaneThisYear(casters, input.stateId, now);
  let best: ArcaneCasterRecord | undefined;
  let bestScore = -1;

  for (const character of casters) {
    if (character.dead || character.state !== input.stateId) continue;
    const score = character.arcane ?? 0;
    if (!workingAllowedOnPath(score, "hunt")) continue;
    if (score >= ARCANE_METEOR_MIN && highBlocked) continue;
    const race = getRaceById(input.races, character.race);
    if (!isArcaneWorkingReady(character, now, race?.lifespan)) continue;
    const inclination = supernaturalForRaceKey(race?.key).arcaneInclination;
    if (input.rand() > inclination) continue;
    if (score > bestScore) {
      best = character;
      bestScore = score;
    }
  }

  if (!best) return 0;
  const score = best.arcane ?? 0;
  const extra = arcaneHuntPowerReduced(score, input.armyYearChunk, input.monster.power);
  if (extra <= 0) return 0;
  spendArcaneWorking(best, score, now);
  input.monster.power = Math.max(0, input.monster.power - extra);
  return extra;
}
