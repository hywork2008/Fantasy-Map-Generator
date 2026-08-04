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
import { skillStddevForRace } from "./raceSkillBias";

export type PersonalityBiasTable = Partial<Record<keyof CharacterPersonality, number>>;

/** Additive deltas vs median 50 (before role/religion overrides). */
export const RACE_PERSONALITY_BIAS: Readonly<Record<string, PersonalityBiasTable>> = {
  human: {},
  unknown: {},
  // Long-lived diplomatic core: cautious, low extraction, slow to blood-feud.
  elf: {
    boldness: -12,
    greed: -12,
    vengefulness: -10,
    rationality: 8,
    compassion: 5,
    energy: -6,
    honor: 4,
    zeal: -4
  },
  // Clan craft-folk: steadier greed restraint, less flashy boldness.
  dwarf: {
    boldness: -4,
    greed: -4,
    vengefulness: -2,
    honor: 4,
    rationality: 3,
    energy: -2
  },
  // Distant underdark: colder, more guileful, grudges linger.
  dark_elf: {
    boldness: -4,
    compassion: -6,
    greed: -2,
    vengefulness: 4,
    guile: 8,
    sociability: -6,
    honor: -2
  },
  // Enemy colony war-folk.
  orc: {
    boldness: 10,
    greed: 6,
    vengefulness: 8,
    compassion: -8,
    rationality: -4,
    energy: 6
  },
  goblin: {
    boldness: 6,
    greed: 10,
    vengefulness: 4,
    compassion: -6,
    guile: 6,
    honor: -6,
    energy: 8
  },
  // Distant apex / pride.
  draconic: {
    boldness: 4,
    greed: 8,
    vengefulness: 2,
    compassion: -8,
    honor: 2,
    rationality: 4,
    sociability: -10
  },
  // Bound thralls: face the world for dragons — careful, social enough to trade, not proud.
  wyrmkin: {
    boldness: -6,
    confidence: -4,
    sociability: 4,
    guile: 4,
    greed: 2,
    honor: -2,
    compassion: 2,
    energy: 2,
    zeal: -2
  },
  // God-line distant: control contact, do not mingle or raid for loot.
  giant: {
    sociability: -8,
    compassion: -6,
    guile: 6,
    rationality: 4,
    confidence: 6,
    boldness: 2,
    honor: 2,
    vengefulness: 2,
    greed: -2,
    energy: -2,
    zeal: 2
  },
  amazones: {
    boldness: 6,
    greed: -2,
    vengefulness: 2,
    compassion: 2,
    honor: 4,
    energy: 4
  },
  arachnid: {
    boldness: -2,
    greed: 4,
    vengefulness: 6,
    compassion: -12,
    guile: 8,
    sociability: -12,
    energy: 2
  }
};

const PERSONALITY_KEYS: readonly (keyof CharacterPersonality)[] = [
  "boldness",
  "compassion",
  "greed",
  "honor",
  "rationality",
  "sociability",
  "vengefulness",
  "zeal",
  "energy",
  "piety",
  "guile",
  "confidence"
] as const;

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
