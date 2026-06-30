import { create } from "zustand";

export interface SelectOption {
  value: string;
  label: string;
}

/** スタイル値として使用できる型 (opacity, color, stroke-width, テキストなど) */
export type StyleValue = string | number;

interface StyleState {
  activeElement: string;
  activeGroup: string;

  visibility: Record<string, boolean>;
  values: Record<string, StyleValue>;
  options: Record<string, SelectOption[]>;

  activePreset: string;
  systemPresets: string[];
  customPresets: string[];

  activeMapFilter: string | null;

  setActiveElement: (element: string) => void;
  setActiveGroup: (group: string) => void;

  setVisibility: (visibility: Record<string, boolean>) => void;
  setValues: (values: Record<string, StyleValue>) => void;
  updateValue: (key: string, value: StyleValue) => void;
  setOptions: (key: string, options: SelectOption[]) => void;

  setActivePreset: (preset: string) => void;
  setPresets: (systemPresets: string[], customPresets: string[]) => void;

  setActiveMapFilter: (filter: string | null) => void;
}

export const useStyleState = create<StyleState>(set => ({
  activeElement: "biomes",
  activeGroup: "",

  visibility: {},
  values: {},
  options: {},

  activePreset: "default",
  systemPresets: [],
  customPresets: [],

  activeMapFilter: null,

  setActiveElement: activeElement => set({ activeElement }),
  setActiveGroup: activeGroup => set({ activeGroup }),

  setVisibility: visibility => set({ visibility }),
  setValues: values => set({ values }),
  updateValue: (key, value) => set(state => ({ values: { ...state.values, [key]: value } })),
  setOptions: (key, optionsList) => set(state => ({ options: { ...state.options, [key]: optionsList } })),

  setActivePreset: activePreset => set({ activePreset }),
  setPresets: (systemPresets, customPresets) => set({ systemPresets, customPresets }),

  setActiveMapFilter: activeMapFilter => set({ activeMapFilter })
}));
