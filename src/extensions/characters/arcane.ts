/**
 * Fantasy Arcane (named characters) and mundane-weapon durability (race trait).
 *
 * Not a tenth CharacterSkills axis. High/Dark Fantasy only.
 * Spec: docs/plan/characters/arcane.md
 */
import {
  ARCANE_BATTLE_CASUALTY_CAP,
  ARCANE_CALAMITY_MIN,
  ARCANE_METEOR_MIN,
  ARCANE_WAR_WORKING_MIN,
  type ArcaneWorkingKind,
  arcaneHuntYearMultiplier,
  calendarTime,
  isArcaneWorkingReady,
  remainingCalamityWorkings,
  spendArcaneWorking,
  stateSpentHighArcaneThisYear,
  warWorkingCasualties,
  workingAllowedOnPath
} from "../../data/arcaneWorking";
import { isFantasyCulturesSet } from "../../data/raceCivicStance";
import { HUMAN_SUPERNATURAL, supernaturalForRaceKey } from "../../data/raceSupernatural";
import { getRaceById } from "../../data/races";
import type { Culture, Race, RaceSupernatural, State } from "../../types/models";
import { useOptionsState } from "../hostCore";
import { gauss, P } from "../hostUtils";
import type { Character, InfernalAtavismFlavor } from "./characterTypes";
import { skillStddevForRace } from "./raceSkillBias";

/** Named-character chance a Human is rolled on the infernal-atavism Arcane table. */
export const HUMAN_INFERNAL_ATAVISM_CHANCE = 0.006;

/** Cap 90, median well above the Human 10 ceiling. Looks and durability stay Human. */
export const HUMAN_INFERNAL_ATAVISM: RaceSupernatural = {
  arcaneCap: 90,
  arcaneMedian: 42,
  arcaneInclination: 0.35,
  durability: 1
};

export function maybeHumanInfernalAtavism(
  raceKey: string | undefined,
  enabled: boolean,
  chanceRoll: (p: number) => boolean = P
): InfernalAtavismFlavor | undefined {
  if (!enabled || raceKey !== "human") return undefined;
  if (!chanceRoll(HUMAN_INFERNAL_ATAVISM_CHANCE)) return undefined;
  return chanceRoll(0.5) ? "blueBlood" : "pactHouse";
}

export type { ArcaneBandId, ArcaneWorkingKind } from "../../data/arcaneWorking";
export {
  ARCANE_BATTLE_CASUALTY_CAP,
  ARCANE_CALAMITY_MIN,
  ARCANE_DAILY_MAX,
  ARCANE_HIGH_WAR_MIN,
  ARCANE_METEOR_MIN,
  ARCANE_WAR_WORKING_MIN,
  arcaneBand,
  arcaneHuntPowerReduced,
  arcaneRangeMeters,
  calendarTime,
  lifetimeCalamityBudget,
  lifetimeWarWorkingBudget,
  remainingCalamityWorkings,
  warWorkingCasualties,
  warWorkingRecoveryYears
} from "../../data/arcaneWorking";

export function isFantasySupernaturalEnabled(): boolean {
  try {
    return isFantasyCulturesSet(useOptionsState.getState().culturesSet);
  } catch {
    return false;
  }
}

export function resolveRaceSupernatural(race: Pick<Race, "key" | "supernatural"> | undefined | null): RaceSupernatural {
  if (race?.supernatural) return race.supernatural;
  return supernaturalForRaceKey(race?.key);
}

export function rollCharacterArcane(options: {
  raceKey?: string;
  lifespan?: number;
  supernatural?: RaceSupernatural;
}): number {
  const profile = options.supernatural ?? supernaturalForRaceKey(options.raceKey);
  const cap = Math.max(0, Math.round(profile.arcaneCap));
  if (cap <= 0) return 0;
  const median = Math.max(0, Math.min(cap, profile.arcaneMedian));
  const raceStd = skillStddevForRace(options.lifespan);
  const stddev = Math.min(raceStd, Math.max(1, cap * 0.35));
  return Math.max(0, Math.min(cap, Math.round(gauss(median, stddev, 0, cap, 0))));
}

export function scaleArcaneForMinor(score: number, age: number, maturity: number): number {
  if (!(maturity > 0) || age >= maturity) return score;
  const ageFactor = Math.max(0.05, age / maturity);
  return Math.max(0, Math.floor(score * ageFactor));
}

export function mundaneIncomingCasualtyFactor(durability: number | undefined): number {
  const value = durability && durability > 0 ? durability : 1;
  return 1 / Math.sqrt(value);
}

export function remainingWarWorkings(
  character: Pick<Character, "arcaneWorkingsSpent" | "race" | "arcane">,
  lifespan?: number
): number {
  if ((character.arcane ?? 0) < ARCANE_CALAMITY_MIN) return Number.POSITIVE_INFINITY;
  return remainingCalamityWorkings(character.arcaneWorkingsSpent, lifespan);
}

function characterLifespan(races: readonly Race[] | undefined, character: Pick<Character, "race">): number | undefined {
  return getRaceById(races, character.race)?.lifespan;
}

function isPresentAtCell(
  character: Character,
  battlefieldCell: number,
  commanderIds: ReadonlySet<number>,
  burgs: ReadonlyArray<{ i?: number; cell?: number; removed?: boolean } | null | undefined>
): boolean {
  if (commanderIds.has(character.i)) return true;
  if (character.location === undefined) return false;
  const burg = burgs[character.location];
  return !!burg && !burg.removed && burg.cell === battlefieldCell;
}

export interface ArcaneWorkingPick {
  caster: Character;
  casualties: number;
  calamity: boolean;
  huntYears: number;
}

/**
 * Spend at most one working for `stateId`.
 * - daily: 20–89, casualties capped
 * - campaign: 20–94, meteor uses full 400–1200, one 90+ per state per year
 * - hunt: 90–100, casualties unused (hunt power is separate)
 */
export function trySpendArcaneWarWorking(args: {
  characters: Character[];
  stateId: number;
  battlefieldCell: number;
  currentYear: number;
  currentMonth?: number;
  currentDay?: number;
  races?: readonly Race[];
  burgs?: ReadonlyArray<{ i?: number; cell?: number; removed?: boolean } | null | undefined>;
  commanderIds?: Iterable<number>;
  rand: () => number;
  kind?: ArcaneWorkingKind;
  /** @deprecated Use kind: "campaign" | "hunt". daily skips 95+. */
  allowCalamity?: boolean;
  requirePresence?: boolean;
}): ArcaneWorkingPick | null {
  if (!isFantasySupernaturalEnabled()) return null;
  const kind: ArcaneWorkingKind = args.kind ?? (args.allowCalamity ? "campaign" : "daily");
  const now = calendarTime(args.currentYear, args.currentMonth ?? 1, args.currentDay ?? 1);
  const commanderIds = new Set(args.commanderIds ?? []);
  const burgs = args.burgs ?? [];
  const requirePresence = args.requirePresence ?? kind !== "hunt";
  const highBlocked = stateSpentHighArcaneThisYear(args.characters, args.stateId, now);
  let best: Character | undefined;
  let bestScore = -1;

  for (const character of args.characters) {
    if (character.dead || character.state !== args.stateId) continue;
    const score = character.arcane ?? 0;
    if (!workingAllowedOnPath(score, kind)) continue;
    if (score >= ARCANE_METEOR_MIN && highBlocked) continue;
    const race = getRaceById(args.races, character.race);
    const lifespan = race?.lifespan;
    if (!isArcaneWorkingReady(character, now, lifespan)) continue;
    if (requirePresence && !isPresentAtCell(character, args.battlefieldCell, commanderIds, burgs)) continue;
    const inclination = resolveRaceSupernatural(race).arcaneInclination;
    if (args.rand() > inclination) continue;
    if (score > bestScore) {
      best = character;
      bestScore = score;
    }
  }

  if (!best) return null;
  const score = best.arcane ?? 0;
  spendArcaneWorking(best, score, now);
  const raw = warWorkingCasualties(score);
  const casualties = kind === "daily" ? Math.min(ARCANE_BATTLE_CASUALTY_CAP, raw) : raw;
  return {
    caster: best,
    casualties,
    calamity: score >= ARCANE_CALAMITY_MIN,
    huntYears: arcaneHuntYearMultiplier(score)
  };
}

export function majorityRaceOfState(
  state: Pick<State, "culture"> | undefined,
  pack: { cultures?: readonly Culture[]; races?: readonly Race[] }
): Race | undefined {
  const culture = state ? pack.cultures?.[state.culture] : undefined;
  return getRaceById(pack.races, culture?.race);
}

export function stateDurability(
  state: Pick<State, "culture"> | undefined,
  pack: { cultures?: readonly Culture[]; races?: readonly Race[] }
): number {
  return resolveRaceSupernatural(majorityRaceOfState(state, pack)).durability;
}

/**
 * Extra attack-force the AI must gather before picking a fight with a supernatural neighbour.
 * Elves deter via ready war-casters; dragons/giants via durability.
 */
export function supernaturalAttackForceMultiplier(
  defenderState: Pick<State, "culture" | "i"> | undefined,
  pack: { cultures?: readonly Culture[]; races?: readonly Race[]; characters?: Character[] },
  currentYear: number
): number {
  if (!isFantasySupernaturalEnabled() || !defenderState) return 1;
  const durability = stateDurability(defenderState, pack);
  const now = calendarTime(currentYear);
  let maxReady = 0;
  let maxAny = 0;
  for (const character of pack.characters ?? []) {
    if (character.dead || character.state !== defenderState.i) continue;
    const score = character.arcane ?? 0;
    if (score > maxAny) maxAny = score;
    const lifespan = characterLifespan(pack.races, character);
    if (isArcaneWorkingReady(character, now, lifespan) && score > maxReady) maxReady = score;
  }
  let arcane = 1;
  if (maxReady >= ARCANE_WAR_WORKING_MIN) arcane += Math.min(2.5, maxReady * 0.02);
  if (maxAny >= ARCANE_CALAMITY_MIN) arcane += 2;
  else if (maxAny >= ARCANE_METEOR_MIN) arcane += 1;
  return Math.max(1, durability * arcane);
}

export { HUMAN_SUPERNATURAL };
