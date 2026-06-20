import { create } from "zustand";
import { type CoastlineSettings, defaultCoastSettings } from "../renderers/coastline-fractal";

export interface GroupOption {
  value: string;
  label: string;
}

export interface CoastlineEditorState {
  // Feature Editor State
  isGroupSectionVisible: boolean;
  isNewGroupInputVisible: boolean;
  group: string;
  groupOptions: GroupOption[];
  newGroupName: string;
  areaUI: string;

  // Settings Editor State
  enabled: boolean;
  settings: Omit<CoastlineSettings, "enabled">;

  // Actions to update the store
  setFeatureData: (data: Partial<Omit<CoastlineEditorState, "setFeatureData" | "setSettingsData">>) => void;
  setSettingsData: (data: Partial<CoastlineEditorState["settings"]>, enabled?: boolean) => void;
}

export const useCoastlineEditorState = create<CoastlineEditorState>(set => ({
  isGroupSectionVisible: false,
  isNewGroupInputVisible: false,
  group: "",
  groupOptions: [],
  newGroupName: "",
  areaUI: "0",

  enabled: defaultCoastSettings.enabled,
  settings: {
    maxDepth: defaultCoastSettings.maxDepth,
    baseAmplitude: defaultCoastSettings.baseAmplitude,
    amplitudeDecay: defaultCoastSettings.amplitudeDecay,
    minEdge: defaultCoastSettings.minEdge,
    smoothThreshold: defaultCoastSettings.smoothThreshold,
    roughnessContrast: defaultCoastSettings.roughnessContrast,
    profileHarmonics: defaultCoastSettings.profileHarmonics,
    lakeSmoothThreshMult: defaultCoastSettings.lakeSmoothThreshMult
  },

  setFeatureData: data => set(state => ({ ...state, ...data })),
  setSettingsData: (data, enabled) =>
    set(state => ({
      ...state,
      settings: { ...state.settings, ...data },
      enabled: enabled !== undefined ? enabled : state.enabled
    }))
}));

export const getCoastlineEditorState = () => useCoastlineEditorState.getState();
