import { create } from "zustand";

export interface ProducerRow {
  id: number;
  name: string;
  x: number;
  y: number;
  units: number;
}

interface GoodsProducersDialogState {
  isOpen: boolean;
  goodName: string;
  producers: ProducerRow[];
  onZoom: (x: number, y: number) => void;
}

export const useGoodsProducersDialogState = create<GoodsProducersDialogState>(() => ({
  isOpen: false,
  goodName: "",
  producers: [],
  onZoom: () => {}
}));

export const getGoodsProducersDialogState = useGoodsProducersDialogState.getState;
export const setGoodsProducersDialogState = useGoodsProducersDialogState.setState;
