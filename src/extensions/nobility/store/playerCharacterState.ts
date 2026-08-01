import { create } from "zustand";

/**
 * Session-level focus character for the nobility player HUD.
 * Not persisted: a new map (or a regenerate of government) re-rolls the selection.
 */
interface PlayerCharacterState {
  /** pack.characters id of the character currently shown in the top-right HUD. */
  playerCharacterId: number | null;
  /**
   * Bumped when character data mutates in place (Advance Time succession, death, title
   * swaps) so the HUD re-reads live pack data even though array references are stable.
   */
  refreshToken: number;
  setPlayerCharacterId: (id: number | null) => void;
  bumpRefreshToken: () => void;
  clear: () => void;
}

export const usePlayerCharacterState = create<PlayerCharacterState>(set => ({
  playerCharacterId: null,
  refreshToken: 0,
  setPlayerCharacterId: id => set({ playerCharacterId: id }),
  bumpRefreshToken: () => set(state => ({ refreshToken: state.refreshToken + 1 })),
  clear: () => set({ playerCharacterId: null })
}));
