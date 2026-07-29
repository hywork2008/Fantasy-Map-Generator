import { create } from "zustand";

type MapReadyTaskState = {
  isRunning: boolean;
  label: string | null;
  completed: number;
  total: number;
  progress: number;
  start(total: number): void;
  begin(label: string, completed: number): void;
  report(progress: number): void;
  finish(): void;
  cancel(): void;
};

/** Non-modal progress for extension work that intentionally runs after the map is visible. */
export const useMapReadyTaskState = create<MapReadyTaskState>(set => ({
  isRunning: false,
  label: null,
  completed: 0,
  total: 0,
  progress: 0,
  start: total =>
    set({ isRunning: total > 0, label: total > 0 ? "Preparing extensions" : null, completed: 0, total, progress: 0 }),
  begin: (label, completed) =>
    set(state => ({
      label,
      completed,
      progress: state.total ? completed / state.total : 0
    })),
  report: progress =>
    set(state => ({
      progress: state.total ? Math.min(1, (state.completed + Math.max(0, Math.min(1, progress))) / state.total) : 0
    })),
  finish: () => set({ isRunning: false, label: null, progress: 1 }),
  cancel: () => set({ isRunning: false, label: null, completed: 0, total: 0, progress: 0 })
}));
