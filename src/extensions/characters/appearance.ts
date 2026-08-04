/**
 * Phenotype rolls and observer-relative attractiveness.
 *
 * World rule:
 * - Same race: judge looks against that race's beauty ideal → Appearance score.
 * - Other race: mostly "incomprehensible / odd"; stature+build similarity allows
 *   a limited grasp of physical impressiveness, never full aesthetic judgment.
 * - Cross-race romantic pairing is socially deviant (see world help).
 *
 * Spec: docs/plan/characters/appearance-and-reproduction.md
 * Lore: docs/world/help/races-beauty-and-pairing.md
 */
import { getRaceBeautyIdeal, getRaceById, getRaceLooksBaseline, HUMAN_RACE_ID } from "../../data/races";
import type { AppearanceAxes, AppearanceAxisId, Race } from "../../types/models";
import { APPEARANCE_AXIS_IDS } from "../../types/models";
import { gauss } from "../hostUtils";
import { getWorldContext, hasCharactersContext } from "./charactersContext";
import type { Character } from "./characterTypes";

/** Per-axis noise around race looks baseline (before age decline). */
export const APPEARANCE_AXIS_STDDEV = 12;

/**
 * How strongly deviations from race-typical looks stretch the final Appearance score.
 * Weighted multi-axis averages alone collapse to σ≈6 (almost never ≥70).
 * Target after stretch (human peak / adult roster): ~several % ≥70, ~0.1% ≥90, ~0.01% =100.
 */
export const APPEARANCE_SCORE_SPREAD = 2.35;

/** Center of the displayed Appearance scale (race-typical phenotype → this). */
export const APPEARANCE_SCORE_CENTER = 50;

/**
 * Looks age decline rates (axis points per year past decline threshold).
 * Softer than early multi-axis drafts so mid-life adults are not crushed to the 30s.
 * Kept in sync with `advanceCharacterAging` looks path.
 */
export const LOOKS_VITALITY_DECLINE_PER_YEAR = 0.55;
export const LOOKS_SOFT_DECLINE_PER_YEAR = 0.18;

/** Peak looks noise around race baseline (before age decline). */
export function rollPeakLooks(baseline: AppearanceAxes): AppearanceAxes {
  const out = {} as AppearanceAxes;
  for (const axis of APPEARANCE_AXIS_IDS) {
    const mean = baseline[axis] ?? 50;
    out[axis] = Math.max(1, Math.min(100, gauss(mean, APPEARANCE_AXIS_STDDEV, 1, 100, 0)));
  }
  return out;
}

/** Soft age decline: vitality first, mild symmetry/refinement softening past threshold. */
export function applyLooksAgeDecline(looks: AppearanceAxes, age: number, declineAgeThreshold: number): AppearanceAxes {
  if (age <= declineAgeThreshold) return { ...looks };
  const years = age - declineAgeThreshold;
  const vitalityLoss = Math.floor(years * LOOKS_VITALITY_DECLINE_PER_YEAR);
  const softLoss = Math.floor(years * LOOKS_SOFT_DECLINE_PER_YEAR);
  return {
    stature: looks.stature,
    build: looks.build,
    symmetry: Math.max(1, looks.symmetry - softLoss),
    refinement: Math.max(1, looks.refinement - softLoss),
    vitality: Math.max(1, looks.vitality - vitalityLoss),
    ornament: looks.ornament
  };
}

/**
 * Weighted ideal match on a 1–100 raw scale (pre-spread).
 * Positive weight prefers high axis; negative prefers low.
 */
export function rawLooksScoreAgainstIdeal(looks: AppearanceAxes, ideal: Race["beautyIdeal"]): number {
  const weights = ideal?.weights ?? {};
  let weighted = 0;
  let totalW = 0;
  for (const axis of APPEARANCE_AXIS_IDS) {
    const w = weights[axis as AppearanceAxisId];
    if (w === undefined || w === 0) continue;
    const abs = Math.abs(w);
    const value = looks[axis] ?? 50;
    const component = w > 0 ? value : 100 - value;
    weighted += abs * component;
    totalW += abs;
  }
  if (totalW <= 0) {
    return Math.round(((looks.symmetry ?? 50) + (looks.vitality ?? 50)) / 2);
  }
  return weighted / totalW;
}

function clampAppearanceScore(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

/**
 * Stretch raw ideal match into the playable Appearance scale.
 * When `typicalLooks` is set (race baseline), race-typical phenotype maps to
 * {@link APPEARANCE_SCORE_CENTER} so “among our people” stays centered per race.
 */
export function expandAppearanceScore(raw: number, typicalRaw: number = APPEARANCE_SCORE_CENTER): number {
  return clampAppearanceScore(APPEARANCE_SCORE_CENTER + (raw - typicalRaw) * APPEARANCE_SCORE_SPREAD);
}

/**
 * Same-race aesthetic score of `looks` under `ideal` (1–100).
 * Pass `typicalLooks` (race baseline) so average members score near 50 and only
 * exceptional phenotypes reach 70 / 90 / 100.
 */
export function scoreLooksAgainstIdeal(
  looks: AppearanceAxes,
  ideal: Race["beautyIdeal"],
  typicalLooks?: AppearanceAxes
): number {
  const raw = rawLooksScoreAgainstIdeal(looks, ideal);
  const typicalRaw =
    typicalLooks !== undefined ? rawLooksScoreAgainstIdeal(typicalLooks, ideal) : APPEARANCE_SCORE_CENTER;
  return expandAppearanceScore(raw, typicalRaw);
}

/** Resolve race id from character (race field, else culture.race, else Human). */
export function resolveCharacterRaceId(character: Pick<Character, "race" | "culture">): number {
  if (character.race !== undefined && character.race !== null) return character.race;
  if (!hasCharactersContext()) return HUMAN_RACE_ID;
  try {
    const culture = getWorldContext().pack.cultures?.[character.culture];
    if (culture?.race !== undefined && culture.race !== null) return culture.race;
  } catch {
    /* ignore */
  }
  return HUMAN_RACE_ID;
}

export function isSameRace(a: Pick<Character, "race" | "culture">, b: Pick<Character, "race" | "culture">): boolean {
  return resolveCharacterRaceId(a) === resolveCharacterRaceId(b);
}

/**
 * 0–1 similarity of stature+build (physique). Used for limited cross-race "I can tell they're imposing".
 */
export function physiqueSimilarity(a: AppearanceAxes, b: AppearanceAxes): number {
  const statureGap = Math.abs((a.stature ?? 50) - (b.stature ?? 50));
  const buildGap = Math.abs((a.build ?? 50) - (b.build ?? 50));
  const meanGap = (statureGap + buildGap) / 2;
  return Math.max(0, Math.min(1, 1 - meanGap / 80));
}

export type AttractivenessKind = "same_race" | "cross_race_partial" | "cross_race_alien";

export interface AttractivenessResult {
  /** 1–100 romantic/aesthetic pull for this observer. */
  score: number;
  kind: AttractivenessKind;
  /**
   * English short reaction for UI/tooltips (not localized yet).
   * Cross-race leans on "odd / hard to read" rather than beautiful/ugly.
   */
  reaction: string;
}

function ensureLooks(character: Pick<Character, "looks" | "appearance" | "race" | "culture">): AppearanceAxes {
  if (character.looks) return character.looks;
  // Legacy: synthesize flat looks from scalar appearance around human baseline
  const app = character.appearance ?? 50;
  const races = hasCharactersContext() ? getWorldContext().pack.races : undefined;
  const baseline = getRaceLooksBaseline(races, resolveCharacterRaceId(character));
  const delta = app - 50;
  const synth = {} as AppearanceAxes;
  for (const axis of APPEARANCE_AXIS_IDS) {
    synth[axis] = Math.max(1, Math.min(100, Math.round((baseline[axis] ?? 50) + delta * 0.4)));
  }
  return synth;
}

/**
 * Observer-relative attractiveness.
 * Same race → full ideal scoring (Appearance judgment).
 * Cross race → alien baseline with optional physique-similarity bump (never full beauty reading).
 */
export function attractiveness(
  observer: Pick<Character, "race" | "culture" | "looks" | "appearance">,
  subject: Pick<Character, "race" | "culture" | "looks" | "appearance">
): AttractivenessResult {
  const races = hasCharactersContext() ? getWorldContext().pack.races : undefined;
  const observerRaceId = resolveCharacterRaceId(observer);
  const subjectRaceId = resolveCharacterRaceId(subject);
  const subjectLooks = ensureLooks(subject);

  if (observerRaceId === subjectRaceId) {
    const ideal = getRaceBeautyIdeal(races, observerRaceId);
    const typicalLooks = getRaceLooksBaseline(races, observerRaceId);
    const score = scoreLooksAgainstIdeal(subjectLooks, ideal, typicalLooks);
    return {
      score,
      kind: "same_race",
      reaction:
        score >= 70 ? "striking among our people" : score <= 30 ? "plain among our people" : "ordinary among our people"
    };
  }

  // Cross-race: cannot apply own beauty ideal. Limited physique reading only.
  const observerLooks = ensureLooks(observer);
  const sim = physiqueSimilarity(observerLooks, subjectLooks);
  // Alien mid-low baseline (~28) + up to ~22 from similar stature/build → cap ~50
  const score = Math.max(1, Math.min(50, Math.round(28 + sim * 22)));
  if (sim >= 0.55) {
    return {
      score,
      kind: "cross_race_partial",
      reaction: "odd folk — but I can tell they are sturdy / slight like someone of my kind"
    };
  }
  return {
    score,
    kind: "cross_race_alien",
    reaction: "hard to read — strange, not beautiful or ugly in our sense"
  };
}

/** Same-race cached appearance: how the subject scores under their own race ideal. */
export function ownRaceAppearanceScore(looks: AppearanceAxes, raceId: number, races?: readonly Race[]): number {
  const list = races ?? (hasCharactersContext() ? getWorldContext().pack.races : undefined);
  return scoreLooksAgainstIdeal(looks, getRaceBeautyIdeal(list, raceId), getRaceLooksBaseline(list, raceId));
}

/** Roll peak looks for a race id and apply age decline; returns looks + appearance cache. */
export function rollLooksForRace(
  raceId: number,
  age: number,
  declineAgeThreshold: number
): { looks: AppearanceAxes; appearance: number } {
  const races = hasCharactersContext() ? getWorldContext().pack.races : undefined;
  const baseline = getRaceLooksBaseline(races, raceId);
  const peak = rollPeakLooks(baseline);
  const looks = applyLooksAgeDecline(peak, age, declineAgeThreshold);
  const appearance = ownRaceAppearanceScore(looks, raceId, races);
  return { looks, appearance };
}

export function getRaceDisplayName(raceId: number): string {
  if (!hasCharactersContext()) return `Race ${raceId}`;
  try {
    const race = getRaceById(getWorldContext().pack.races, raceId);
    return race?.name ?? `Race ${raceId}`;
  } catch {
    return `Race ${raceId}`;
  }
}
