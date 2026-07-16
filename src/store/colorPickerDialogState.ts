import { create } from "zustand";

interface ColorPickerDialogState {
  fill: string;
  callback: ((fill: string) => void) | null;
  open: (fill: string, callback: (fill: string) => void) => void;
}

export const useColorPickerDialogState = create<ColorPickerDialogState>(set => ({
  fill: "#ffffff",
  callback: null,
  open: (fill, callback) => set({ fill, callback })
}));
