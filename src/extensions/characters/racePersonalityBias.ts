/**
 * Species-level personality medians for named characters.
 *
 * Baseline draw is N(50 + delta, σ). Long-lived races use a slightly wider σ
 * so patient sages and rare hotheads both appear — matching skill outlier design.
 *
 * Elf design: lower boldness / greed / vengefulness (slow politics, long memory of
 * costly wars, little short-term extraction); higher rationality & mild compassion.
 *
 * Giant (god-line): low sociability / compassion (non-involvement); guile for
 * managed distance (not dark-elf power plots); calculated, unhurried, confident
 * divine pride — not orc-hot raid greed.
 */

import { gauss } from "../hostUtils";
import type { CharacterPersonality } from "./characterTypes";
import { raceCatalog } from "./data/raceCatalog";
import { RACE_PERSONALITY_AXES } from "./data/raceTypes";
import { skillStddevForRace } from "./raceSkillBias";

export type PersonalityBiasTable = Partial<Record<keyof CharacterPersonality, number>>;

/** Additive deltas vs median 50 (before role/religion overrides). */
export const RACE_PERSONALITY_BIAS: Readonly<Record<string, PersonalityBiasTable>> = Object.fromEntries(
  raceCatalog.map(def => [def.key, def.personalityBias])
);

const PERSONALITY_KEYS = RACE_PERSONALITY_AXES;

export function racePersonalityBiasForKey(raceKey: string | undefined | null): PersonalityBiasTable {
  if (!raceKey) return {};
  return RACE_PERSONALITY_BIAS[raceKey] ?? {};
}

function clampTrait(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

/** Single trait: N(50+delta, σ). */
export function rollPersonalityTrait(delta: number, stddev: number): number {
  return clampTrait(gauss(50 + delta, stddev, 1, 100, 0));
}

export interface RollPersonalityOptions {
  raceKey?: string;
  lifespan?: number;
  /**
   * Traits already chosen by role logic (religious zeal/piety, guile seed, skill-based confidence).
   * Race bias is applied as an additive nudge, then clamped.
   */
  presets?: Partial<CharacterPersonality>;
}

/**
 * Full personality block with race medians.
 * Preset keys (zeal/piety/guile/confidence from createPerson) keep their special
 * generation, then receive the race delta so elves are still calmer zealots, etc.
 */
export function rollCharacterPersonality(options: RollPersonalityOptions = {}): CharacterPersonality {
  const bias = racePersonalityBiasForKey(options.raceKey);
  const stddev = skillStddevForRace(options.lifespan);
  const out = {} as CharacterPersonality;

  for (const key of PERSONALITY_KEYS) {
    const delta = bias[key] ?? 0;
    const preset = options.presets?.[key];
    if (preset !== undefined) {
      out[key] = clampTrait(preset + delta);
    } else {
      out[key] = rollPersonalityTrait(delta, stddev);
    }
  }

  return out;
}
