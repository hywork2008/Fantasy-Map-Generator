/**
 * Phenotype rolls and observer-relative attractiveness.
 *
 * World rule:
 * - Same race: judge looks against that race's beauty ideal → Appearance score.
 * - Other race (default): mostly "incomprehensible / odd"; stature+build similarity
 *   allows a limited grasp of physical impressiveness (cap ~50).
 * - Selected asymmetric pairs (e.g. Human→Elf) have aesthetic *readability*:
 *   the observer can partially apply their own beauty ideal on the observer's scale
 *   (typical = observer race baseline). Classic trope: average elves look beautiful
 *   to humans. Does not make cross-race pairing socially acceptable.
 * - Cross-race romantic pairing is socially deviant (see world help).
 *
 * Spec: docs/plan/characters/appearance-and-reproduction.md
 * Lore: docs/world/help/races-beauty-and-pairing.md
 */
import { getRaceBeautyIdeal, getRaceById, getRaceLooksBaseline, HUMAN_RACE_ID } from "../../data/races";
import type { AppearanceAxes, AppearanceAxisId, Race, RaceBeautyIdeal, RaceKey } from "../../types/models";
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

/**
 * Peak looks noise around race baseline (before age decline).
 *
 * `biasBoost` (axis points, 0 = unbiased) shifts each weighted-ideal axis's gaussian mean towards
 * whatever direction that axis's `idealWeights` entry favors (e.g. a race that prizes high
 * `symmetry` gets its symmetry mean raised, one that prizes low `build` gets its build mean
 * lowered). Axes the ideal doesn't weight are left at the plain baseline. Because every weighted
 * axis's ideal-facing component moves by the same amount, the resulting raw ideal-match score
 * (see rawLooksScoreAgainstIdeal) increases by ~biasBoost in expectation — see
 * expandAppearanceScore for how that translates to the displayed Appearance score.
 */
export function rollPeakLooks(
  baseline: AppearanceAxes,
  biasBoost = 0,
  idealWeights?: RaceBeautyIdeal["weights"]
): AppearanceAxes {
  const out = {} as AppearanceAxes;
  for (const axis of APPEARANCE_AXIS_IDS) {
    const weight = idealWeights?.[axis];
    const direction = !weight ? 0 : weight > 0 ? 1 : -1;
    const mean = (baseline[axis] ?? 50) + direction * biasBoost;
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

/**
 * Asymmetric cross-race aesthetic readability (0–1).
 * 0 = cannot apply beauty ideal (alien / physique-only path).
 * Values are intentional lore knobs, not derived from phenotype distance.
 *
 * Human→Elf is the classic “fair folk look beautiful to mortals” mischief:
 * elf baseline scored on the human ideal+baseline scale lands well above 50.
 * Reverse pairs are weaker (not symmetric court flattery).
 */
export const CROSS_RACE_AESTHETIC_READABILITY: Readonly<Partial<Record<RaceKey, Partial<Record<RaceKey, number>>>>> = {
  human: {
    elf: 0.8,
    dark_elf: 0.58,
    amazones: 0.42,
    dwarf: 0.18,
    wyrmkin: 0.12
  },
  elf: {
    human: 0.32,
    dark_elf: 0.55,
    amazones: 0.28
  },
  dark_elf: {
    human: 0.28,
    elf: 0.55,
    amazones: 0.25
  },
  dwarf: {
    human: 0.22,
    elf: 0.1
  },
  amazones: {
    human: 0.4,
    elf: 0.35,
    dark_elf: 0.3,
    orc: 0.4
  }
};

/** Soft cap so cross-race aesthetic never quite equals same-race legendary court ranking. */
export const CROSS_RACE_AESTHETIC_SCORE_CAP_BASE = 82;
export const CROSS_RACE_AESTHETIC_SCORE_CAP_PER_READABILITY = 10;

/**
 * How fully `observerRace` can apply their beauty ideal to `subjectRace` (0–1).
 * Same race → 1. Unknown / unlisted pairs → 0.
 */
export function crossRaceAestheticReadability(
  observerRaceId: number,
  subjectRaceId: number,
  races?: readonly Race[]
): number {
  if (observerRaceId === subjectRaceId) return 1;
  const list = races ?? (hasCharactersContext() ? getWorldContext().pack.races : undefined);
  const observer = getRaceById(list, observerRaceId);
  const subject = getRaceById(list, subjectRaceId);
  const observerKey = observer?.key;
  const subjectKey = subject?.key;
  if (!observerKey || !subjectKey) return 0;
  const row = CROSS_RACE_AESTHETIC_READABILITY[observerKey];
  const value = row?.[subjectKey];
  if (value === undefined || value <= 0) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Physique-only alien score (1–50). Shared by unreadable cross-race path. */
function physiqueOnlyCrossRaceScore(observerLooks: AppearanceAxes, subjectLooks: AppearanceAxes): number {
  const sim = physiqueSimilarity(observerLooks, subjectLooks);
  // Alien mid-low baseline (~28) + up to ~22 from similar stature/build → cap ~50
  return Math.max(1, Math.min(50, Math.round(28 + sim * 22)));
}

function crossRaceAestheticReaction(score: number): string {
  if (score >= 70) return "otherworldly beauty — almost too fine for our kind";
  if (score >= 55) return "strangely fair — comely in a foreign way";
  if (score <= 35) return "readable features, but not to our taste";
  return "foreign features I can judge — neither of us, nor opaque";
}

export type AttractivenessKind = "same_race" | "cross_race_aesthetic" | "cross_race_partial" | "cross_race_alien";

export interface AttractivenessResult {
  /** 1–100 romantic/aesthetic pull for this observer. */
  score: number;
  kind: AttractivenessKind;
  /**
   * English short reaction for UI/tooltips (not localized yet).
   * Same-race uses folk beauty; readable cross-race uses otherworldly phrasing;
   * unreadable cross-race leans on "odd / hard to read".
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
 * Readable cross race → blend of physique floor + observer ideal on observer baseline scale.
 * Unreadable cross race → alien baseline with optional physique-similarity bump (cap ~50).
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

  const observerLooks = ensureLooks(observer);
  const readability = crossRaceAestheticReadability(observerRaceId, subjectRaceId, races);

  // Asymmetric aesthetic reading: apply observer ideal with observer-typical centering.
  if (readability > 0) {
    const ideal = getRaceBeautyIdeal(races, observerRaceId);
    const observerBaseline = getRaceLooksBaseline(races, observerRaceId);
    const full = scoreLooksAgainstIdeal(subjectLooks, ideal, observerBaseline);
    const physiqueScore = physiqueOnlyCrossRaceScore(observerLooks, subjectLooks);
    const blended = Math.round(physiqueScore * (1 - readability) + full * readability);
    const cap = Math.round(
      CROSS_RACE_AESTHETIC_SCORE_CAP_BASE + readability * CROSS_RACE_AESTHETIC_SCORE_CAP_PER_READABILITY
    );
    const score = clampAppearanceScore(Math.min(cap, blended));
    return {
      score,
      kind: "cross_race_aesthetic",
      reaction: crossRaceAestheticReaction(score)
    };
  }

  // Unreadable cross-race: physique only.
  const score = physiqueOnlyCrossRaceScore(observerLooks, subjectLooks);
  const sim = physiqueSimilarity(observerLooks, subjectLooks);
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

/**
 * Roll peak looks for a race id and apply age decline; returns looks + appearance cache.
 * `appearanceBiasBoost` (0 = unbiased default) forwards to rollPeakLooks — see there for how it
 * pushes the resulting Appearance score upward (e.g. Nobility's "young & striking" generation bias).
 */
export function rollLooksForRace(
  raceId: number,
  age: number,
  declineAgeThreshold: number,
  appearanceBiasBoost = 0
): { looks: AppearanceAxes; appearance: number } {
  const races = hasCharactersContext() ? getWorldContext().pack.races : undefined;
  const baseline = getRaceLooksBaseline(races, raceId);
  const ideal = getRaceBeautyIdeal(races, raceId);
  const peak = rollPeakLooks(baseline, appearanceBiasBoost, ideal.weights);
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
