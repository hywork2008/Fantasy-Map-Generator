/**
 * Post-generation society layer (Phase E): dynasties, bonds, flavor hooks.
 * Call after backstory + solidarity/favor seeding.
 */
import { seedBondsForCharacter, seedCharacterBonds } from "./characterBonds";
import type { Character, Dynasty } from "./characterTypes";
import { assignDynasties } from "./dynastyGenerator";
import { applyCharacterHooks } from "./flavorHooks";

export interface FinalizeSocietyContext {
  stateNames: Record<number, string>;
  currentYear?: number;
}

export interface FinalizeSocietyResult {
  dynasties: Dynasty[];
}

/** Full pass after character generation (all characters at once). */
export function finalizeCharacterSociety(
  characters: Character[],
  context: FinalizeSocietyContext
): FinalizeSocietyResult {
  const dynasties = assignDynasties(characters, { stateNames: context.stateNames });
  seedCharacterBonds(characters, context.currentYear);
  for (const character of characters) {
    if (!character.dead) applyCharacterHooks(character);
  }
  return { dynasties };
}

/**
 * Incremental peer add (officer / merchant / heir): bonds + hooks only.
 * Dynasty assignment runs on full generation; rare mid-session founders keep lineage empty until regen.
 */
export function finalizeCharacterSocietyForPeer(
  character: Character,
  allCharacters: Character[],
  context: FinalizeSocietyContext
): void {
  seedBondsForCharacter(character, allCharacters, context.currentYear);
  applyCharacterHooks(character);
}
