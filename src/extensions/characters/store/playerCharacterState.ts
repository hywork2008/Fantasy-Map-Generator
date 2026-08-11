import { create } from "zustand";

/** In-flight travel that completes after N simulation days are consumed. */
export interface PendingPlayerTravel {
  characterId: number;
  destinationBurgId: number;
  remainingDays: number;
}

/**
 * Session-level player-character focus shared by every character-facing feature.
 * It belongs to Characters, not Nobility: an ordinary resident can be the player
 * character even when no political simulation is enabled.
 */
interface PlayerCharacterState {
  playerCharacterId: number | null;
  refreshToken: number;
  isMoveMode: boolean;
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
