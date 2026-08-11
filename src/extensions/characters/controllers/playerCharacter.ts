import { getCharacters } from "../charactersContext";
import { usePlayerCharacterState } from "../store/playerCharacterState";

function announcePlayerCharacterChange(characterId: number | null): void {
  document.dispatchEvent(new CustomEvent("fmg:player-character-changed", { detail: { characterId } }));
}

/** Set any living Character as the current player character. */
export function setPlayerCharacter(characterId: number): boolean {
  const character = getCharacters().find(candidate => candidate.i === characterId);
  if (!character || character.dead) return false;

  const store = usePlayerCharacterState.getState();
  store.setPlayerCharacterId(characterId);
  store.bumpRefreshToken();
  announcePlayerCharacterChange(characterId);
  return true;
}

/** Select the first custom character without replacing an existing player focus. */
export function setInitialPlayerCharacter(characterId: number): boolean {
  if (usePlayerCharacterState.getState().playerCharacterId !== null) return false;
  return setPlayerCharacter(characterId);
}

/** Select another living character at random for the Characters-owned player panel. */
export function selectRandomPlayerCharacter(options?: { excludeCurrent?: boolean }): number | null {
  const currentId = usePlayerCharacterState.getState().playerCharacterId;
  let candidates = getCharacters().filter(character => !character.dead);
  if (options?.excludeCurrent && currentId !== null && candidates.length > 1) {
    candidates = candidates.filter(character => character.i !== currentId);
  }
  const character = candidates[Math.floor(Math.random() * candidates.length)];
  if (!character) return null;
  return setPlayerCharacter(character.i) ? character.i : null;
}

/** Clear the current player-character focus and any in-progress travel state. */
export function clearPlayerCharacterSelection(): void {
  usePlayerCharacterState.getState().clear();
  announcePlayerCharacterChange(null);
}

/** Keep a manually-created player character selected while it remains alive. */
export function refreshPlayerCharacterSelection(): void {
  const store = usePlayerCharacterState.getState();
  const id = store.playerCharacterId;
  const character = id === null ? undefined : getCharacters().find(candidate => candidate.i === id);
  if (!character || character.dead) {
    clearPlayerCharacterSelection();
    return;
  }
  store.bumpRefreshToken();
}
