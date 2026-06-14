import { create } from "zustand";

export interface OptionsState {
  // Map settings
  mapWidth: number;
  mapHeight: number;
  seed: string;
  points: number;
  mapName: string;
  year: number;
  era: string;
  template: string;
  cultures: number;
  culturesSet: string;
  statesNumber: number;
  provincesRatio: number;
  sizeVariety: number;
  growthRate: number;
  manors: number;
  religionsNumber: number;
  stateLabelsMode: "auto" | "short" | "full";

  // Tool settings
  uiSize: number;
  tooltipSize: number;
  themeColor: string;
  transparency: number;
  autosaveInterval: number;
  onloadBehavior: string;
  azgaarAssistant: "show" | "hide";
  speakerVoice: string;
  emblemShape: string;

  // Actions
  setOption: <K extends keyof Omit<OptionsState, "setOption">>(key: K, value: OptionsState[K]) => void;
  setOptions: (updates: Partial<Omit<OptionsState, "setOption" | "setOptions">>) => void;
}

export const useOptionsState = create<OptionsState>(set => ({
  mapWidth: 960,
  mapHeight: 540,
  seed: "",
  points: 4, // 10K cells
  mapName: "",
  year: 100,
  era: "Era",
  template: "highIsland",
  cultures: 12,
  culturesSet: "world",
  statesNumber: 15,
  provincesRatio: 20,
  sizeVariety: 4,
  growthRate: 1,
  manors: 1000,
  religionsNumber: 6,
  stateLabelsMode: "auto",

  uiSize: 1,
  tooltipSize: 14,
  themeColor: "#997787",
  transparency: 5,
  autosaveInterval: 15,
  onloadBehavior: "random",
  azgaarAssistant: "show",
  speakerVoice: "",
  emblemShape: "culture",

  setOption: (key, value) => set({ [key]: value }),
  setOptions: updates => set(updates)
}));
