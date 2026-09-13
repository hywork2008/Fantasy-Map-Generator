import type { Race } from "../../types/models";
import { getWorldContext, hasCharactersContext } from "./charactersContext";
import type { Character, CharacterFlavorHook } from "./characterTypes";
import { isLichRaceId } from "./lichPolicy";

export type LichPersonalityType =
  | "ancient_tomb_desecrated"
  | "young_overlord"
  | "young_avenger"
  | "zealot_savior"
  | "truth_seeker"
  | "nihilistic_mourner"
  | "immortal_magistrate"
  | "aesthetic_taxidermist";

export interface LichTypeDefinition {
  type: LichPersonalityType;
  matches: (character: Character) => boolean;
  variantsCount: number;
}

export const LICH_TYPE_DEFINITIONS: readonly LichTypeDefinition[] = [
  {
    type: "ancient_tomb_desecrated",
    matches: (c: Character) => c.age >= 500,
    variantsCount: 3
  },
  {
    type: "young_overlord",
    matches: (c: Character) => c.personality.confidence >= 50,
    variantsCount: 3
  },
  {
    type: "young_avenger",
    matches: (c: Character) => c.personality.confidence < 50 || c.personality.vengefulness >= 50,
    variantsCount: 3
  },
  {
    type: "zealot_savior",
    matches: (c: Character) => c.personality.piety >= 50 || c.personality.zeal >= 50 || c.personality.compassion >= 40,
    variantsCount: 3
  },
  {
    type: "truth_seeker",
    matches: (c: Character) => c.personality.rationality >= 50 || (c.arcane ?? 0) >= 90,
    variantsCount: 3
  },
  {
    type: "nihilistic_mourner",
    matches: (c: Character) => c.personality.energy <= 50 || c.personality.sociability <= 40,
    variantsCount: 3
  },
  {
    type: "immortal_magistrate",
    matches: (c: Character) => c.personality.honor >= 50 || c.personality.rationality >= 45,
    variantsCount: 3
  },
  {
    type: "aesthetic_taxidermist",
    matches: (c: Character) => c.appearance >= 50,
    variantsCount: 3
  }
];

export function isLichCharacter(character: Character, packRaces?: readonly Race[]): boolean {
  let races = packRaces;
  if (!races && hasCharactersContext()) {
    races = getWorldContext().pack?.races;
  }
  return isLichRaceId(races, character.race);
}

/**
 * Returns all matching LichPersonalityTypes for a character.
 */
export function getMatchingLichTypes(character: Character): LichPersonalityType[] {
  const matches = LICH_TYPE_DEFINITIONS.filter(def => def.matches(character)).map(def => def.type);
  if (matches.length === 0) {
    // Fallback: if no condition matched, consider all types eligible
    return LICH_TYPE_DEFINITIONS.map(def => def.type);
  }
  return matches;
}

/**
 * Deterministic pseudo-RNG based on character attributes.
 * Prevents polluting global Math.random and guarantees stable flavor quotes for the same character.
 */
export function createCharacterPseudoRng(character: Character): () => number {
  let s = (character.i * 2654435761) ^ (character.age * 1013904223);
  const p = character.personality;
  if (p) {
    s ^= (p.confidence * 31 + p.vengefulness * 37 + p.rationality * 41 + p.piety * 43) >>> 0;
  }
  s = (s ^ 0x5bd1e995) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Select a Lich flavor hook based on matching personality types and random selection.
 * Returns null if the character is not a Lich.
 */
export function selectLichFlavorHook(
  character: Character,
  packRaces?: readonly Race[],
  rng?: () => number
): CharacterFlavorHook | null {
  if (!isLichCharacter(character, packRaces)) {
    return null;
  }

  const random = rng ?? createCharacterPseudoRng(character);
  const matchingTypes = getMatchingLichTypes(character);
  const selectedType = matchingTypes[Math.floor(random() * matchingTypes.length)]!;
  const def = LICH_TYPE_DEFINITIONS.find(d => d.type === selectedType) ?? LICH_TYPE_DEFINITIONS[0]!;
  const variant = Math.floor(random() * def.variantsCount) + 1;

  return {
    id: `lich.${selectedType}.${variant}`
  };
}
