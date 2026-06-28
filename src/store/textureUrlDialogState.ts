import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type TextureUrlDialogState = {
  isOpen: boolean;
  onApply: (url: string) => void;
  open: (opts: { onApply: (url: string) => void }) => void;
  close: () => void;
};

export const textureUrlDialogStore = createStore<TextureUrlDialogState>(set => ({
  isOpen: false,
  onApply: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useTextureUrlDialogState = <T>(selector: (s: TextureUrlDialogState) => T) =>
  useStore(textureUrlDialogStore, selector);
