import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_FAST_ADVANCE_PRESET,
  FAST_ADVANCE_PRESETS,
  type FastAdvancePresetId,
  type FastAdvanceRates,
  getNamedPresetRates
} from "../generators/fastAdvance/fastAdvancePresets";
import {
  DEFAULT_CUSTOM_HISTORY_PROFILE,
  DEFAULT_HISTORY_MODE_PROFILE,
  getNamedHistoryProfile,
  type HistoryModeProfile,
  type HistoryModeProfileId,
  type HistoryStride,
  type StubFundingConfig
} from "../generators/fastAdvance/historyModeProfiles";

/**
 * Fast-Forward opt-in toggle + preset selection (docs/plan/advance-time-fast-forward.md §4.2, §6.3).
 *
 * Same "persisted opt-in toggle" shape as economyCalibrationState.ts/simManpower — UI setting only,
 * not part of the .fmg archive (§7). Default OFF: every Advance Day/Month/Year path behaves exactly
 * as before unless the user explicitly enables this.
 */
interface FastAdvanceState {
  enabled: boolean;
  preset: FastAdvancePresetId;
  /** Only read when preset === "custom". Seeded from "steady" so a first-time switch to Custom
   *  starts from a sensible baseline instead of zeros. */
  customRates: FastAdvanceRates;
  setEnabled: (enabled: boolean) => void;
  setPreset: (preset: FastAdvancePresetId) => void;
  setCustomRate: <K extends keyof FastAdvanceRates>(key: K, value: FastAdvanceRates[K]) => void;
  /** Restore the custom rate vector to the default ("steady") preset — the ⚙ dialog's Reset button. */
  resetCustomRates: () => void;

  /**
   * History mode (docs/plan/advance-time-history-mode.md). `"off"` — the default — leaves every
   * Advance path exactly as it was; the fields below are inert until another profile is picked.
   */
  historyProfile: HistoryModeProfileId;
  /** Only read when historyProfile === "custom". Seeded from the "chronicle" profile. */
  customHistoryProfile: HistoryModeProfile;
  setHistoryProfile: (profile: HistoryModeProfileId) => void;
  setHistoryStride: (stride: HistoryStride) => void;
  setStubFunding: <K extends keyof StubFundingConfig>(key: K, value: StubFundingConfig[K]) => void;
  setHistorySystemDisabled: (systemId: string, disabled: boolean) => void;
  resetCustomHistoryProfile: () => void;
}

export const useFastAdvanceState = create<FastAdvanceState>()(
  persist(
    set => ({
      enabled: false,
      preset: DEFAULT_FAST_ADVANCE_PRESET,
      customRates: { ...FAST_ADVANCE_PRESETS[DEFAULT_FAST_ADVANCE_PRESET] },
      setEnabled: enabled => set({ enabled }),
      setPreset: preset => set({ preset }),
      setCustomRate: (key, value) => set(state => ({ customRates: { ...state.customRates, [key]: value } })),
      resetCustomRates: () => set({ customRates: { ...FAST_ADVANCE_PRESETS[DEFAULT_FAST_ADVANCE_PRESET] } }),

      historyProfile: DEFAULT_HISTORY_MODE_PROFILE,
      customHistoryProfile: {
        ...DEFAULT_CUSTOM_HISTORY_PROFILE,
        disabledSystemIds: [...DEFAULT_CUSTOM_HISTORY_PROFILE.disabledSystemIds]
      },
      setHistoryProfile: historyProfile => set({ historyProfile }),
      setHistoryStride: stride => set(state => ({ customHistoryProfile: { ...state.customHistoryProfile, stride } })),
      setStubFunding: (key, value) =>
        set(state => ({
          customHistoryProfile: {
            ...state.customHistoryProfile,
            stubFunding: { ...state.customHistoryProfile.stubFunding, [key]: value }
          }
        })),
      setHistorySystemDisabled: (systemId, disabled) =>
        set(state => {
          const current = new Set(state.customHistoryProfile.disabledSystemIds);
          if (disabled) current.add(systemId);
          else current.delete(systemId);
          return {
            customHistoryProfile: { ...state.customHistoryProfile, disabledSystemIds: [...current].sort() }
          };
        }),
      resetCustomHistoryProfile: () =>
        set({
          customHistoryProfile: {
            ...DEFAULT_CUSTOM_HISTORY_PROFILE,
            disabledSystemIds: [...DEFAULT_CUSTOM_HISTORY_PROFILE.disabledSystemIds]
          }
        })
    }),
    { name: "fmg-fast-advance" }
  )
);

export const getFastAdvanceState = useFastAdvanceState.getState;

/** Resolves the active preset's rates, or the user's custom vector when preset === "custom". */
export function resolveFastAdvanceRates(): FastAdvanceRates {
  const { preset, customRates } = getFastAdvanceState();
  return preset === "custom" ? customRates : getNamedPresetRates(preset);
}

/**
 * The single gating condition Fast-Forward uses everywhere it hooks in (§4.2): the user must have
 * explicitly enabled it, AND this must be part of a multi-day batch (Advance Week/Month/Year, or
 * any multi-day advanceTime()/runDaily() call) — never a lone Advance Day. Reuses the existing
 * `isBulkAdvance` flag (docs/plan/advance-time-loop-reduction.md Phase 1b) rather than inventing a
 * new threshold, so enabling Fast-Forward never changes single-day-step behavior.
 */
export function isFastAdvanceActive(isBulkAdvance: boolean): boolean {
  return getFastAdvanceState().enabled && isBulkAdvance;
}

/**
 * The history-mode profile this advance should run under, or `null` for an ordinary advance
 * (docs/plan/advance-time-history-mode.md §3.1).
 *
 * History mode sits on top of Fast-Forward rather than beside it — the systems it leaves running
 * rely on Fast-Forward's population/price injection — so it requires `enabled` as well as a
 * profile other than "off". timeEngine calls this once when an advance starts, and brackets the
 * whole run with the result (see historyModeRun.ts).
 */
export function resolveHistoryModeProfile(): HistoryModeProfile | null {
  const { enabled, historyProfile, customHistoryProfile } = getFastAdvanceState();
  if (!enabled || historyProfile === "off") return null;
  return historyProfile === "custom" ? customHistoryProfile : getNamedHistoryProfile(historyProfile);
}
