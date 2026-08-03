/**
 * Race fertility helpers for household generation.
 * Spec: docs/plan/characters/appearance-and-reproduction.md §3
 */
import { DEFAULT_RACE_FERTILITY, getRaceFertility } from "../../data/races";
import type { RaceFertility } from "../../types/models";
import { gauss, rand } from "../hostUtils";
import { getWorldContext, hasCharactersContext } from "./charactersContext";

export function resolveFertilityForRace(raceId: number | undefined): RaceFertility {
  if (raceId === undefined) return { ...DEFAULT_RACE_FERTILITY };
  if (!hasCharactersContext()) return { ...DEFAULT_RACE_FERTILITY };
  try {
    return getRaceFertility(getWorldContext().pack.races, raceId);
  } catch {
    return { ...DEFAULT_RACE_FERTILITY };
  }
}

/** Sample live births for one pregnancy/clutch. */
export function sampleLitter(fertility: RaceFertility): number {
  const raw = gauss(
    fertility.litterMean,
    Math.max(0.25, fertility.litterMean * 0.35),
    0.5,
    fertility.litterMax + 0.49,
    0
  );
  return Math.max(1, Math.min(fertility.litterMax, Math.round(raw)));
}

/**
 * Expected surviving children over fertile years of marriage.
 * Polygyny multiplies birth-event opportunities (simplified).
 */
export function expectedChildrenFromFertility(fertileYears: number, spouses: number, fertility: RaceFertility): number {
  if (fertileYears <= 0 || spouses <= 0) return 0;
  const events = (fertileYears / Math.max(0.5, fertility.interbirthYears)) * spouses;
  // Each event contributes ~litterMean surviving young (genre abstraction).
  return events * fertility.litterMean;
}

/**
 * Social first-marriage age (gendered human-ish defaults), clamped to fertility start.
 */
export function rollFirstMarriageAge(gender: "male" | "female", fertilityStart: number): number {
  const social = gender === "female" ? rand(21, 26) : rand(24, 29);
  return Math.max(fertilityStart, social);
}
