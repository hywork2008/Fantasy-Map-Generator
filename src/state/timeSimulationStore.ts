import { createStore } from "zustand/vanilla";

interface TimeSimulationState {
  isRunning: boolean;
  progress: number;
  totalDays: number;
  stopRequested: boolean;
  setSimulationProgress: (progress: number, totalDays: number) => void;
  stopSimulation: () => void;
  clearSimulation: () => void;
}

export const timeSimulationStore = createStore<TimeSimulationState>(set => ({
  isRunning: false,
  progress: 0,
  totalDays: 0,
  stopRequested: false,
  setSimulationProgress: (progress, totalDays) => set({ isRunning: true, progress, totalDays, stopRequested: false }),
  stopSimulation: () => set({ stopRequested: true }),
  clearSimulation: () => set({ isRunning: false, progress: 0, totalDays: 0, stopRequested: false })
}));
