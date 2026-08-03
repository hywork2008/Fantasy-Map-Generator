import { create } from "zustand";

interface CharacterMarketState {
  characterId: number | null;
  refreshToken: number;
  setCharacterId: (characterId: number | null) => void;
  refresh: () => void;
}

export const useCharacterMarketState = create<CharacterMarketState>(set => ({
  characterId: null,
  refreshToken: 0,
  setCharacterId: characterId => set({ characterId }),
  refresh: () => set(state => ({ refreshToken: state.refreshToken + 1 }))
}));

export const setCharacterMarketCharacterId = (characterId: number | null): void => {
  useCharacterMarketState.getState().setCharacterId(characterId);
};
