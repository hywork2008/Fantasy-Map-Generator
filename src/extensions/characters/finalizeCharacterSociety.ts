/**
 * Post-generation society layer (Phase E): dynasties, bonds, flavor hooks.
 * Call after backstory + solidarity/favor seeding.
 */

import { seedBondsForCharacter, seedCharacterBonds } from "./characterBonds";
import { resolveCultureTypeForLoadout, resolveLoadoutGoodsCatalog } from "./charactersContext";
import { type Character, type Dynasty, isCk3Character } from "./characterTypes";
import { assignDynasties } from "./dynastyGenerator";
import { applyCharacterHooks } from "./flavorHooks";
import { normalizeCharacterLoadoutInPlace, seedCharacterLoadout } from "./loadoutSeed";

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
  const ck3Characters = characters.filter(isCk3Character);
  const dynasties = assignDynasties(ck3Characters, { stateNames: context.stateNames });
  seedCharacterBonds(ck3Characters, context.currentYear);
  const catalog = resolveLoadoutGoodsCatalog();
  for (const character of ck3Characters) {
    if (character.dead) continue;
    // Idempotent attire backfill (covers peers / legacy saves without loadout).
    seedCharacterLoadout(character, {
      catalog,
      cultureType: resolveCultureTypeForLoadout(character.culture),
      onlyIfMissing: true
    });
    normalizeCharacterLoadoutInPlace(character);
    applyCharacterHooks(character);
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
  if (!isCk3Character(character)) return;
  allCharacters = allCharacters.filter(isCk3Character);
  seedBondsForCharacter(character, allCharacters, context.currentYear);
  if (!character.dead) {
    seedCharacterLoadout(character, {
      catalog: resolveLoadoutGoodsCatalog(),
      cultureType: resolveCultureTypeForLoadout(character.culture),
      onlyIfMissing: true
    });
    normalizeCharacterLoadoutInPlace(character);
  }
  applyCharacterHooks(character);
}
