/**
 * Per-culture funeral / corpse-disposal custom.
 *
 * Lives in `src/utils/` (same rationale as cultureKnowledgeValue.ts): cultures-generator
 * and the funeral simulation both need it, and a core generator must not import from
 * an extension.
 */
import {
  DEFAULT_FUNERAL_RITE,
  FUNERAL_RITE_RACE_WEIGHT_MULTIPLIERS,
  FUNERAL_RITE_WEIGHTS_BY_TYPE,
  FUNERAL_RITES,
  type FuneralRite,
  isFuneralRite
} from "../data/funeralRites";
import type { Culture, CultureType, RaceKey } from "../types/models";

const DEFAULT_WEIGHTS = FUNERAL_RITE_WEIGHTS_BY_TYPE.Generic;

function weightsForType(type: CultureType | undefined): Partial<Record<FuneralRite, number>> {
  return (type && FUNERAL_RITE_WEIGHTS_BY_TYPE[type]) || DEFAULT_WEIGHTS;
}

/** Highest-weight rite for a culture type — used as the legacy-save fallback (not a re-roll). */
export function defaultFuneralRiteForType(type: CultureType | undefined): FuneralRite {
  const weights = weightsForType(type);
  let best: FuneralRite = DEFAULT_FUNERAL_RITE;
  let bestWeight = -1;
  for (const rite of FUNERAL_RITES) {
    const weight = weights[rite] ?? 0;
    if (weight > bestWeight) {
      best = rite;
      bestWeight = weight;
    }
  }
  return best;
}

function sampleWeighted(weights: Partial<Record<FuneralRite, number>>, rng: () => number): FuneralRite {
  let total = 0;
  for (const rite of FUNERAL_RITES) total += Math.max(0, weights[rite] ?? 0);
  if (total <= 0) return DEFAULT_FUNERAL_RITE;
  let pick = rng() * total;
  for (const rite of FUNERAL_RITES) {
    pick -= Math.max(0, weights[rite] ?? 0);
    if (pick <= 0) return rite;
  }
  return DEFAULT_FUNERAL_RITE;
}

/**
 * Rolls a funeral rite once at culture generation. Type prior, then optional race multipliers.
 */
export function rollCultureFuneralRite(
  type: CultureType | undefined,
  rng: () => number = Math.random,
  raceKey?: RaceKey | string
): FuneralRite {
  const weights: Partial<Record<FuneralRite, number>> = { ...weightsForType(type) };
  const raceMult = raceKey ? FUNERAL_RITE_RACE_WEIGHT_MULTIPLIERS[raceKey] : undefined;
  if (raceMult) {
    for (const rite of FUNERAL_RITES) {
      const base = weights[rite] ?? 0;
      if (base <= 0 && !(raceMult[rite] && raceMult[rite]! > 0)) continue;
      weights[rite] = base * (raceMult[rite] ?? 1);
    }
  }
  return sampleWeighted(weights, rng);
}

/**
 * Reads a culture's funeral rite. Wildlands (id 0) have none. Legacy saves without the
 * field fall back to the type's modal rite so behaviour is stable across reloads.
 */
export function getCultureFuneralRite(
  culture: Pick<Culture, "i" | "type" | "funeralRite"> | undefined | null
): FuneralRite | undefined {
  if (!culture || culture.i === 0) return undefined;
  if (isFuneralRite(culture.funeralRite)) return culture.funeralRite;
  return defaultFuneralRiteForType(culture.type);
}
