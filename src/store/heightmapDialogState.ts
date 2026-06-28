import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type HeightmapEditModeState = {
  isOpen: boolean;
  onErase: () => void;
  onKeep: () => void;
  onRisk: () => void;
  onCancel: () => void;
  open: (opts: { onErase: () => void; onKeep: () => void; onRisk: () => void; onCancel: () => void }) => void;
  close: () => void;
};

export const heightmapEditModeStore = createStore<HeightmapEditModeState>(set => ({
  isOpen: false,
  onErase: () => {},
  onKeep: () => {},
  onRisk: () => {},
  onCancel: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useHeightmapEditModeState = <T>(selector: (s: HeightmapEditModeState) => T) =>
  useStore(heightmapEditModeStore, selector);

type ImageConverterCloseState = {
  isOpen: boolean;
  onComplete: () => void;
  onClose: () => void;
  open: (opts: { onComplete: () => void; onClose: () => void }) => void;
  close: () => void;
};

export const imageConverterCloseStore = createStore<ImageConverterCloseState>(set => ({
  isOpen: false,
  onComplete: () => {},
  onClose: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useImageConverterCloseState = <T>(selector: (s: ImageConverterCloseState) => T) =>
  useStore(imageConverterCloseStore, selector);
