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
  resolveDepressionsSteps: number;
  lakeElevationLimit: number;
  threatCalculation: "additive" | "max" | "nonlinear";
  initialPopulationSaturation: number;
  demographicBirthRate: number;
  demographicChildMortalityRate: number;

  // World Configurator settings
  mapSize: number;
  latitude: number;
  longitude: number;
  prec: number;

  // Style
  stylePreset: string;

  // Generation growth/expansion rates
  neutralRate: number;
  statesGrowthRate: number;

  // World scale settings
  populationRate: number;
  distanceScale: number;
  urbanization: number;
  urbanDensity: number;

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
  temperatureScale: string;

  // Units settings
  distanceUnit: string;
  heightUnit: string;
  areaUnit: string;
  weightUnit: string;
  heightExponent: number;

  // Zoom settings
  zoomExtentMin: number;
  zoomExtentMax: number;

  // Rendering settings
  shapeRendering: "crispEdges" | "optimizeSpeed" | "geometricPrecision";
  rescaleLabels: boolean;
  hideLabels: boolean;
  populationRenderingMode: "original" | "contour" | "choropleth";
  dangerRenderingMode: "contour" | "choropleth";

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
  resolveDepressionsSteps: 250,
  lakeElevationLimit: 20,
  threatCalculation: "additive",
  initialPopulationSaturation: 60,
  demographicBirthRate: 0.25,
  demographicChildMortalityRate: 0.2,

  mapSize: 100,
  latitude: 50,
  longitude: 50,
  prec: 100,

  stylePreset: "default",

  neutralRate: 1,
  statesGrowthRate: 1,

  populationRate: 1000,
  distanceScale: 3,
  urbanization: 1,
  urbanDensity: 10,

  uiSize: 1,
  tooltipSize: 14,
  themeColor: "#997787",
  transparency: 5,
  autosaveInterval: 15,
  onloadBehavior: "random",
  azgaarAssistant: "show",
  speakerVoice: "",
  emblemShape: "culture",
  temperatureScale: localStorage.getItem("temperatureScale") ?? "°C",

  distanceUnit: localStorage.getItem("distanceUnit") ?? "km",
  heightUnit: localStorage.getItem("heightUnit") ?? "m",
  areaUnit: localStorage.getItem("areaUnit") ?? "square",
  weightUnit: localStorage.getItem("weightUnit") ?? "kg",
  heightExponent: Number(localStorage.getItem("heightExponent") ?? 1.8),

  zoomExtentMin: 1,
  zoomExtentMax: 20,

  shapeRendering: "optimizeSpeed",
  rescaleLabels: true,
  hideLabels: false,
  populationRenderingMode: "choropleth",
  dangerRenderingMode: "contour",

  setOption: (key, value) => set({ [key]: value }),
  setOptions: updates => set(updates)
}));
