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
