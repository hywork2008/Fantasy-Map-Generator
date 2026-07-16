import { create } from "zustand";

export interface RoutesEditorState {
  isOpen: boolean;
  isCreatorOpen: boolean;

  // Editor State
  routeId: string;
  routeName: string;
  routeGroup: string;
  routeLength: string;
  isWaterRoute: boolean;
  isLocked: boolean;
  isSplitMode: boolean;
  allGroups: string[];

  // Creator State
  creatorGroup: string;
  creatorPoints: { cellId: number; x: number; y: number }[];
}

export const useRoutesEditorState = create<RoutesEditorState>(() => ({
  isOpen: false,
  isCreatorOpen: false,

  routeId: "",
  routeName: "",
  routeGroup: "",
  routeLength: "",
  isWaterRoute: false,
  isLocked: false,
  isSplitMode: false,
  allGroups: [],

  creatorGroup: "",
  creatorPoints: []
}));

export const getRoutesEditorState = useRoutesEditorState.getState;

export const setRoutesEditorState = (
  state: Partial<RoutesEditorState> | ((state: RoutesEditorState) => Partial<RoutesEditorState>)
) => {
  useRoutesEditorState.setState(state);
};
