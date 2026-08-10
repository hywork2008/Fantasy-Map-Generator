import type { Character, CharacterTaste } from "./characterTypes";

export type TasteRelationshipSituation = "firstContact" | "sharedWork" | "mentorship" | "socialVisit" | "gift";

export type TasteRelationshipObserverRole = "mentor" | "apprentice" | "peer";

/** The caller supplies only the subjects and traits that are observable in this interaction. */
export interface TasteRelationshipContext {
  situation: TasteRelationshipSituation;
  exposedTasteIds: readonly string[];
  exposure: number;
  counterpartTraits?: readonly string[];
  observerRole?: TasteRelationshipObserverRole;
}

export interface TasteRelationshipEvidence {
  tasteId: string;
  kind: "sharedLike" | "sharedDislike" | "opposedTaste" | "counterpartTrait";
  contribution: number;
  modifier?: "mentorTolerance";
}

export interface TasteRelationshipAssessment {
  /** Directional taste-derived compatibility in the inclusive range -100..100. */
  compatibility: number;
  exposure: number;
  evidence: readonly TasteRelationshipEvidence[];
}

export interface TasteRelationshipDeltaOptions {
  maxPositive: number;
  maxNegative: number;
  currentScore: number;
}

type TasteRelationshipCharacter = Pick<Character, "personality" | "family" | "backstory">;

const MAX_POSITIVE_COMPATIBILITY = 36;
const MAX_NEGATIVE_COMPATIBILITY = 40;
const SHARED_LIKE_WEIGHT = 0.22;
const SHARED_DISLIKE_WEIGHT = 0.1;
const OPPOSED_TASTE_WEIGHT = 0.28;
const COUNTERPART_TRAIT_DISLIKE_WEIGHT = 0.24;
const MENTOR_TOLERANCE_TASTE_IDS = new Set(["debate", "company"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizedExposure(exposure: number): number {
  return clamp(Number.isFinite(exposure) ? exposure : 0, 0, 1);
}

function tasteById(tastes: readonly CharacterTaste[] | undefined): Map<string, CharacterTaste> {
  const result = new Map<string, CharacterTaste>();
  for (const taste of tastes ?? []) {
    const current = result.get(taste.id);
    if (!current || taste.intensity > current.intensity) result.set(taste.id, taste);
  }
  return result;
}

function combinedIntensity(observer: CharacterTaste, counterpart: CharacterTaste): number {
  return clamp(observer.intensity * 0.7 + counterpart.intensity * 0.3, 0, 100) / 100;
}

function observerIntensity(taste: CharacterTaste): number {
  return clamp(taste.intensity, 0, 100) / 100;
}

function mentorToleranceMultiplier(
  observer: TasteRelationshipCharacter,
  context: TasteRelationshipContext,
  tasteId: string
): number | undefined {
  if (
    context.situation !== "mentorship" ||
    context.observerRole !== "mentor" ||
    !MENTOR_TOLERANCE_TASTE_IDS.has(tasteId) ||
    observer.family.children <= 0 ||
    observer.personality.compassion < 70
  ) {
    return undefined;
  }

  // High compassion and an actual parenting history make an irritating pupil easier to bear.
  return clamp(0.45 - (observer.personality.compassion - 70) * 0.01, 0.15, 0.45);
}

function evidenceForSharedTaste(
  observer: TasteRelationshipCharacter,
  observerTaste: CharacterTaste,
  counterpartTaste: CharacterTaste,
  context: TasteRelationshipContext,
  exposure: number
): TasteRelationshipEvidence {
  const intensity = combinedIntensity(observerTaste, counterpartTaste);
  if (observerTaste.polarity === "like" && counterpartTaste.polarity === "like") {
    return {
      tasteId: observerTaste.id,
      kind: "sharedLike",
      contribution: SHARED_LIKE_WEIGHT * intensity * exposure
    };
  }

  if (observerTaste.polarity === "dislike" && counterpartTaste.polarity === "dislike") {
    return {
      tasteId: observerTaste.id,
      kind: "sharedDislike",
      contribution: SHARED_DISLIKE_WEIGHT * intensity * exposure
    };
  }

  const tolerance = mentorToleranceMultiplier(observer, context, observerTaste.id);
  return {
    tasteId: observerTaste.id,
    kind: "opposedTaste",
    contribution: -OPPOSED_TASTE_WEIGHT * intensity * exposure * (tolerance ?? 1),
    ...(tolerance === undefined ? {} : { modifier: "mentorTolerance" as const })
  };
}

/**
 * Evaluate the taste-derived part of one person's opinion of another.
 * This is intentionally pure and directional: callers evaluate B→A separately.
 */
export function assessTasteRelationship(
  observer: TasteRelationshipCharacter,
  counterpart: TasteRelationshipCharacter,
  context: TasteRelationshipContext
): TasteRelationshipAssessment {
  const exposure = normalizedExposure(context.exposure);
  const observerTastes = tasteById(observer.backstory?.tastes);
  const counterpartTastes = tasteById(counterpart.backstory?.tastes);
  const evidence: TasteRelationshipEvidence[] = [];

  for (const tasteId of new Set(context.exposedTasteIds)) {
    const observerTaste = observerTastes.get(tasteId);
    const counterpartTaste = counterpartTastes.get(tasteId);
    if (!observerTaste || !counterpartTaste) continue;
    evidence.push(evidenceForSharedTaste(observer, observerTaste, counterpartTaste, context, exposure));
  }

  for (const traitId of new Set(context.counterpartTraits ?? [])) {
    const observerTaste = observerTastes.get(traitId);
    if (observerTaste?.polarity !== "dislike") continue;
    evidence.push({
      tasteId: traitId,
      kind: "counterpartTrait",
      contribution: -COUNTERPART_TRAIT_DISLIKE_WEIGHT * observerIntensity(observerTaste) * exposure
    });
  }

  const total = evidence.reduce((sum, entry) => sum + entry.contribution, 0) * 100;
  return {
    compatibility: Math.round(clamp(total, -MAX_NEGATIVE_COMPATIBILITY, MAX_POSITIVE_COMPATIBILITY)),
    exposure,
    evidence
  };
}

/**
 * Convert an assessment into one bounded relationship event. The closer a score already is to
 * the assessment's direction, the smaller another event becomes, leaving room for other events.
 */
export function projectTasteRelationshipDelta(
  assessment: TasteRelationshipAssessment,
  options: TasteRelationshipDeltaOptions
): number {
  const compatibility = clamp(assessment.compatibility, -100, 100);
  if (compatibility === 0 || assessment.exposure <= 0) return 0;

  const maxPositive = Math.max(0, options.maxPositive);
  const maxNegative = Math.max(0, options.maxNegative);
  const currentScore = clamp(options.currentScore, -100, 100);
  const positive = compatibility > 0;
  const limit = positive ? maxPositive : maxNegative;
  if (limit === 0) return 0;

  const sameDirection = (positive && currentScore > 0) || (!positive && currentScore < 0);
  const saturation = sameDirection ? 1 - Math.abs(currentScore) / 100 : 1;
  const magnitude = Math.min(limit, (Math.abs(compatibility) / 100) * limit * saturation);
  return Math.round(positive ? magnitude : -magnitude);
}
