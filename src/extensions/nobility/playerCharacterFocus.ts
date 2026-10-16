import { simEvents } from "../../simulation/events";
import type { Character } from "../characters/characterTypes";
import { playerCharacterStore } from "../characters/state/playerCharacterStore";
import { getWorldContext } from "./nobilityContext";

/**
 * Player focus character selection, shared by the simulation (succession/death ticks keep the
 * focus valid) and the HUD (docs/plan/simulation-core-separation.md S5). Display summaries stay in
 * `controllers/playerCharacter.ts`.
 */

export function isLiving(character: Character): boolean {
  return !character.dead;
}

function announcePlayerCharacterChange(characterId: number | null): void {
  simEvents.dispatchEvent(new CustomEvent("fmg:player-character-changed", { detail: { characterId } }));
}

/** Living characters that hold a political title — the random-pick pool. */
function isLivingPolitician(character: Character): boolean {
  return isLiving(character) && character.titles.length > 0;
}

function listPoliticalCandidates(characters: Character[] | undefined): Character[] {
  if (!characters?.length) return [];
  return characters.filter(isLivingPolitician);
}

/**
 * Pick a living titled character at random. Uses Math.random so it follows the
 * same seeded stream used by nobility generation when called during map gen.
 * When `excludeId` is set and other candidates exist, that id is skipped so the
 * HUD "reroll" button actually changes the focus character.
 */
export function pickRandomPoliticalCharacterId(
  characters: Character[] | undefined,
  excludeId?: number | null
): number | null {
  let candidates = listPoliticalCandidates(characters);
  if (!candidates.length) return null;
  if (excludeId != null && candidates.length > 1) {
    candidates = candidates.filter(c => c.i !== excludeId);
  }
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index]?.i ?? null;
}

/**
 * Assign a fresh random focus character. Call after nobility generation or when
 * the current selection is no longer a living character.
 * Pass `excludeCurrent: true` for the HUD reroll control.
 */
export function selectRandomPlayerCharacter(options?: { excludeCurrent?: boolean }): number | null {
  const { pack } = getWorldContext();
  const store = playerCharacterStore.getState();
  const excludeId = options?.excludeCurrent ? store.playerCharacterId : null;
  const id = pickRandomPoliticalCharacterId(pack.characters, excludeId);
  store.setPlayerCharacterId(id);
  store.bumpRefreshToken();
  announcePlayerCharacterChange(id);
  return id;
}

/**
 * Explicitly set the player focus character (e.g. from Character Details).
 * Rejects missing or deceased characters.
 */
export function setPlayerCharacter(characterId: number): boolean {
  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === characterId);
  if (!character || !isLiving(character)) return false;
  const store = playerCharacterStore.getState();
  store.setPlayerCharacterId(characterId);
  store.bumpRefreshToken();
  announcePlayerCharacterChange(characterId);
  return true;
}

/**
 * Keep the HUD selection valid after succession / death ticks.
 * - Missing or dead selection → re-roll among living politicians.
 * - Still valid → just bump the refresh token so live title/age changes re-render.
 */
export function refreshPlayerCharacterSelection(): void {
  const { pack } = getWorldContext();
  const store = playerCharacterStore.getState();
  const currentId = store.playerCharacterId;
  const current = currentId !== null ? pack.characters?.find(c => c.i === currentId) : undefined;

  if (!current || !isLiving(current)) {
    selectRandomPlayerCharacter();
    return;
  }

  store.bumpRefreshToken();
}

export function clearPlayerCharacterSelection(): void {
  playerCharacterStore.getState().clear();
}

export function playerCharacterIdFromStore(): number | null {
  return playerCharacterStore.getState().playerCharacterId;
}
