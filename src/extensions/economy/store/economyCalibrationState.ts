import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Economy calibration flag (docs/plan/craft-demand-calibration.md §4.2).
 * Default true as of PR 4 (unit-consistent craft/guild/academy labor is now the standard path;
 * flip off to restore pre-PR-3 behavior for comparison/debugging). PR 1 diagnostics ignore this flag.
 */
interface EconomyCalibrationState {
  applyCalibration: boolean;
  setApplyCalibration: (value: boolean) => void;
}

export const useEconomyCalibrationState = create<EconomyCalibrationState>()(
  persist(
    set => ({
      applyCalibration: true,
      setApplyCalibration: (value: boolean) => set({ applyCalibration: value })
    }),
    { name: "fmg-economy-calibration" }
  )
);

export const getEconomyCalibrationState = useEconomyCalibrationState.getState;
export const setEconomyCalibrationState = useEconomyCalibrationState.setState;
