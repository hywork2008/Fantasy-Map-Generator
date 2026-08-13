import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiPreferencesState = {
  dontAskRegenerateFeature: boolean;
  setDontAskRegenerateFeature: (value: boolean) => void;
  /**
   * When true, the "Preparing economy" Map Ready task skips global trade matching and caravan
   * spawning (Markets.runGlobalTrade / Caravans.spawnFromDeals — the data the Trade layer/
   * animation draws from) for a freshly generated map. Read once per generation from
   * src/extensions/economy/index.tsx; re-run it on demand via Tools > Economy > Regenerate
   * (Production). Everything else in Preparing economy still generates normally.
   */
  economySkipTradeOnGenerate: boolean;
  setEconomySkipTradeOnGenerate: (value: boolean) => void;
};

export const useUiPreferencesState = create<UiPreferencesState>()(
  persist(
    set => ({
      dontAskRegenerateFeature: false,
      setDontAskRegenerateFeature: (value: boolean) => set({ dontAskRegenerateFeature: value }),
      economySkipTradeOnGenerate: false,
      setEconomySkipTradeOnGenerate: (value: boolean) => set({ economySkipTradeOnGenerate: value })
    }),
    { name: "fmg-ui-preferences" }
  )
);
