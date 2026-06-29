import { create } from "zustand";
import type { DistCondition } from "../extensions/economy/controllers/goodsDistributionExpression";

export type DistributionPickerType = "biomes" | "shore" | "featureType";

export interface ActiveDistributionPicker {
  type: DistributionPickerType;
  groupIndex: number;
  conditionIndex: number;
}

interface GoodsDistributionEditorState {
  groups: DistCondition[][];
  expression: string;
  cellCountText: string;
  previewText: string;
  activePicker: ActiveDistributionPicker | null;
  isInitialized: boolean;
  dialogTitle: string;
  name: string;
  color: string;
  icon: string;
  value: number;
  unit: string;
  tagsText: string;
  chance: number;
}

export const useGoodsDistributionEditorState = create<GoodsDistributionEditorState>(() => ({
  groups: [],
  expression: "",
  cellCountText: "",
  previewText: "",
  activePicker: null,
  isInitialized: false,
  dialogTitle: "Distribution Editor",
  name: "",
  color: "#888888",
  icon: "good-wood",
  value: 1,
  unit: "unit",
  tagsText: "",
  chance: 4
}));

export const getGoodsDistributionEditorState = useGoodsDistributionEditorState.getState;
export const setGoodsDistributionEditorState = useGoodsDistributionEditorState.setState;
