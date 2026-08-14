import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Kept as a standalone literal union (rather than importing the extension's
 * CharacterGenerationBias type) so this host-level store never depends on `src/extensions/*` —
 * see AGENTS.md's unidirectional State → Generator/Renderer/Editor layering. The extension re-uses
 * the identical string values; see CharacterGenerationBias in src/extensions/characters/characterTypes.ts.
 */
type NobilityCharacterGenerationBias = "none" | "youngMaleHeavy" | "youngFemaleHeavy";

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
  /**
   * Standing directorial skew for every character the Nobility extension creates (rulers,
   * central officers, field/fleet officers, province lords, and successions). "none" keeps the
   * existing fully-random rolls. Read via getCharacterGenerationBias() in
   * src/extensions/nobility/nobilityContext.ts, which personFactory.ts's createPerson() consumes
   * to skew age, Appearance, and gender. See docs on CharacterGenerationBias for the exact effect
   * of each mode.
   */
  nobilityCharacterGenerationBias: NobilityCharacterGenerationBias;
  setNobilityCharacterGenerationBias: (value: NobilityCharacterGenerationBias) => void;
};

export const useUiPreferencesState = create<UiPreferencesState>()(
  persist(
    set => ({
      dontAskRegenerateFeature: false,
      setDontAskRegenerateFeature: (value: boolean) => set({ dontAskRegenerateFeature: value }),
      economySkipTradeOnGenerate: false,
      setEconomySkipTradeOnGenerate: (value: boolean) => set({ economySkipTradeOnGenerate: value }),
      nobilityCharacterGenerationBias: "none",
      setNobilityCharacterGenerationBias: (value: NobilityCharacterGenerationBias) =>
        set({ nobilityCharacterGenerationBias: value })
    }),
    { name: "fmg-ui-preferences" }
  )
);
