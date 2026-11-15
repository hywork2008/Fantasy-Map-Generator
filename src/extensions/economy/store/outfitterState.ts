import { create } from "zustand";

interface OutfitterState {
  characterId: number | null;
  refreshToken: number;
  setCharacterId: (characterId: number | null) => void;
  refresh: () => void;
}

export const useOutfitterState = create<OutfitterState>(set => ({
  characterId: null,
  refreshToken: 0,
  setCharacterId: characterId => set({ characterId }),
  refresh: () => set(state => ({ refreshToken: state.refreshToken + 1 }))
}));

export const setOutfitterCharacterId = (characterId: number | null): void => {
  useOutfitterState.getState().setCharacterId(characterId);
};
