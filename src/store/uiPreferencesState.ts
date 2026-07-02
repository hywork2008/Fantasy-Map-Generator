import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiPreferencesState = {
  dontAskRegenerateFeature: boolean;
  setDontAskRegenerateFeature: (value: boolean) => void;
};

export const useUiPreferencesState = create<UiPreferencesState>()(
  persist(
    set => ({
      dontAskRegenerateFeature: false,
      setDontAskRegenerateFeature: (value: boolean) => set({ dontAskRegenerateFeature: value })
    }),
    { name: "fmg-ui-preferences" }
  )
);
