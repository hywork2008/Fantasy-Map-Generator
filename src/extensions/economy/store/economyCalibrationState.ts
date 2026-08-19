import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Economy calibration flag (docs/plan/craft-demand-calibration.md §4.2).
 * Default false until PR 4. PR 1 diagnostics ignore this flag.
 */
interface EconomyCalibrationState {
  applyCalibration: boolean;
  setApplyCalibration: (value: boolean) => void;
}

export const useEconomyCalibrationState = create<EconomyCalibrationState>()(
  persist(
    set => ({
      applyCalibration: false,
      setApplyCalibration: (value: boolean) => set({ applyCalibration: value })
    }),
    { name: "fmg-economy-calibration" }
  )
);

export const getEconomyCalibrationState = useEconomyCalibrationState.getState;
export const setEconomyCalibrationState = useEconomyCalibrationState.setState;
