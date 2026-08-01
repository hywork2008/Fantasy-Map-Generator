import { create } from "zustand";

/** In-flight travel that completes after N simulation days are consumed. */
export interface PendingPlayerTravel {
  characterId: number;
  destinationBurgId: number;
  remainingDays: number;
}

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
  /** SVG map is waiting for a destination burg click for the focus character. */
  isMoveMode: boolean;
  /** Active journey; location updates when remainingDays reaches 0. */
  pendingTravel: PendingPlayerTravel | null;
  setPlayerCharacterId: (id: number | null) => void;
  bumpRefreshToken: () => void;
  setMoveMode: (active: boolean) => void;
  setPendingTravel: (travel: PendingPlayerTravel | null) => void;
  clear: () => void;
}

export const usePlayerCharacterState = create<PlayerCharacterState>(set => ({
  playerCharacterId: null,
  refreshToken: 0,
  isMoveMode: false,
  pendingTravel: null,
  setPlayerCharacterId: id => set({ playerCharacterId: id }),
  bumpRefreshToken: () => set(state => ({ refreshToken: state.refreshToken + 1 })),
  setMoveMode: active => set({ isMoveMode: active }),
  setPendingTravel: travel => set({ pendingTravel: travel }),
  clear: () => set({ playerCharacterId: null, isMoveMode: false, pendingTravel: null })
}));
