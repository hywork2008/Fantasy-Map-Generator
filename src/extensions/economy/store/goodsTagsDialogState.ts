import { create } from "zustand";

interface GoodsTagsDialogState {
  isOpen: boolean;
  tags: string[];
  activeTags: string[];
  onApply: (activeTags: string[]) => void;
}

export const useGoodsTagsDialogState = create<GoodsTagsDialogState>(() => ({
  isOpen: false,
  tags: [],
  activeTags: [],
  onApply: () => {}
}));

export const getGoodsTagsDialogState = useGoodsTagsDialogState.getState;
export const setGoodsTagsDialogState = useGoodsTagsDialogState.setState;
