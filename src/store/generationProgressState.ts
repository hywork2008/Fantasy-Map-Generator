import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export const GENERATION_STAGES = [
  {
    id: "landscape",
    title: "Landscape outline",
    description:
      "Review the coastline and inland lakes before creating the rest of the world. Generate another landscape if needed."
  },
  {
    id: "climate",
    title: "Climate and waterways",
    description: "Create rivers, temperature, precipitation, and biomes."
  },
  {
    id: "settlements",
    title: "Cultures and settlements",
    description: "Establish cultural regions, population foundations, and settlements."
  },
  {
    id: "realms",
    title: "Realms and routes",
    description: "Create states, religions, provinces, roads, and sea routes."
  },
  {
    id: "finishing",
    title: "Finish the world",
    description: "Complete military forces, markers, names, and extension data."
  }
] as const;

export type GenerationStage = (typeof GENERATION_STAGES)[number];
export type GenerationProgressAction =
  | "next"
  | "previous"
  | "retryLandscape"
  | "retryStage"
  | "loadMap"
  | "restartWithSeed";
export type GenerationReviewLayerId =
  | "terrain"
  | "biomes"
  | "rivers"
  | "cultures"
  | "settlements"
  | "settlementLabels"
  | "states"
  | "borders"
  | "provinces"
  | "routes"
  | "stateLabels";

export type GenerationReviewLayer = {
  id: GenerationReviewLayerId;
  label: string;
};

export type GenerationReviewProfile = {
  layers: readonly GenerationReviewLayer[];
  defaultLayers: readonly GenerationReviewLayerId[];
};

export const GENERATION_REVIEW_PROFILES: readonly GenerationReviewProfile[] = [
  {
    layers: [{ id: "terrain", label: "Terrain" }],
    defaultLayers: ["terrain"]
  },
  {
    layers: [
      { id: "biomes", label: "Biomes" },
      { id: "rivers", label: "Rivers" }
    ],
    defaultLayers: ["biomes"]
  },
  {
    layers: [
      { id: "cultures", label: "Cultures" },
      { id: "settlements", label: "Settlements" },
      { id: "settlementLabels", label: "Settlement labels" }
    ],
    defaultLayers: ["cultures", "settlements", "settlementLabels"]
  },
  {
    layers: [
      { id: "states", label: "States" },
      { id: "borders", label: "Borders" },
      { id: "provinces", label: "Provinces" },
      { id: "routes", label: "Routes" },
      { id: "settlements", label: "Settlements" },
      { id: "settlementLabels", label: "Settlement labels" },
      { id: "stateLabels", label: "State labels" }
    ],
    defaultLayers: ["states", "borders", "routes", "settlements", "settlementLabels", "stateLabels"]
  },
  {
    layers: [
      { id: "states", label: "States" },
      { id: "borders", label: "Borders" },
      { id: "provinces", label: "Provinces" },
      { id: "routes", label: "Routes" },
      { id: "settlements", label: "Settlements" },
      { id: "settlementLabels", label: "Settlement labels" },
      { id: "stateLabels", label: "State labels" }
    ],
    defaultLayers: ["states", "borders", "routes", "settlements", "settlementLabels", "stateLabels"]
  }
];

export function getGenerationReviewProfile(stage: number): GenerationReviewProfile {
  return GENERATION_REVIEW_PROFILES[stage] ?? GENERATION_REVIEW_PROFILES[0];
}

type GenerationProgressState = {
  isOpen: boolean;
  isGenerating: boolean;
  /** True only while the first map created in this app session is being built. */
  isInitialGeneration: boolean;
  currentStage: number;
  autoRun: boolean;
  reviewLayers: GenerationReviewLayerId[];
  resolver: ((action: GenerationProgressAction) => void) | null;
  /** Seed requested via `restartWithSeed`, read once by the paused pipeline loop then consumed. */
  restartSeed: string | null;
  beginStage: (stage: number, isInitialGeneration: boolean) => void;
  waitForAction: (stage: number) => Promise<GenerationProgressAction>;
  next: () => void;
  previous: () => void;
  retryLandscape: () => void;
  retryStage: () => void;
  runAll: () => void;
  /**
   * Redirect a generation that is currently paused for stage review (including the
   * initial map's review flow) to restart from stage 0 with a different seed, without
   * spawning a second concurrent `generate()` call. No-op if nothing is awaiting review.
   */
  restartWithSeed: (seed: string) => void;
  /** Stop a paused generation so a validated saved map can replace its incomplete world. */
  loadMap: () => void;
  toggleReviewLayer: (layer: GenerationReviewLayerId) => void;
  finish: () => void;
  fail: () => void;
};

function resolveAction(state: GenerationProgressState, action: GenerationProgressAction): void {
  const { resolver } = state;
  if (!resolver) return;
  resolver(action);
}

export const generationProgressStore = createStore<GenerationProgressState>((set, get) => ({
  isOpen: false,
  isGenerating: false,
  isInitialGeneration: false,
  currentStage: 0,
  autoRun: false,
  reviewLayers: [...getGenerationReviewProfile(0).defaultLayers],
  resolver: null,
  restartSeed: null,
  beginStage: (stage, isInitialGeneration) =>
    set({
      isOpen: true,
      isGenerating: true,
      isInitialGeneration,
      currentStage: stage,
      reviewLayers: [...getGenerationReviewProfile(stage).defaultLayers]
    }),
  waitForAction: stage => {
    const { autoRun } = get();
    set({ isOpen: true, isGenerating: false, currentStage: stage });
    if (autoRun) return Promise.resolve("next");

    return new Promise(resolve => {
      set({ resolver: resolve });
    });
  },
  next: () => {
    const state = get();
    resolveAction(state, "next");
    set({ resolver: null, isGenerating: true });
  },
  previous: () => {
    const state = get();
    resolveAction(state, "previous");
    set({ resolver: null, isGenerating: true, autoRun: false });
  },
  retryLandscape: () => {
    const state = get();
    resolveAction(state, "retryLandscape");
    set({ resolver: null, isGenerating: true, autoRun: false });
  },
  restartWithSeed: seed => {
    const state = get();
    if (!state.resolver) return;
    resolveAction(state, "restartWithSeed");
    set({ resolver: null, isGenerating: true, autoRun: false, restartSeed: seed });
  },
  retryStage: () => {
    const state = get();
    resolveAction(state, "retryStage");
    set({ resolver: null, isGenerating: true, autoRun: false });
  },
  runAll: () => {
    const state = get();
    resolveAction(state, "next");
    set({ resolver: null, isGenerating: true, autoRun: true });
  },
  loadMap: () => {
    const state = get();
    if (!state.resolver) return;
    resolveAction(state, "loadMap");
    set({ resolver: null, isOpen: false, isGenerating: false, autoRun: false, reviewLayers: [] });
  },
  toggleReviewLayer: layer => {
    const state = get();
    const availableLayers = getGenerationReviewProfile(state.currentStage).layers;
    if (!availableLayers.some(item => item.id === layer)) return;

    const reviewLayers = state.reviewLayers.includes(layer)
      ? state.reviewLayers.filter(item => item !== layer)
      : [...state.reviewLayers, layer];
    set({ reviewLayers });
  },
  finish: () =>
    set({
      isOpen: false,
      isGenerating: false,
      isInitialGeneration: false,
      autoRun: false,
      reviewLayers: [],
      resolver: null,
      restartSeed: null
    }),
  fail: () =>
    set({
      isOpen: false,
      isGenerating: false,
      isInitialGeneration: false,
      autoRun: false,
      reviewLayers: [],
      resolver: null,
      restartSeed: null
    })
}));

export const useGenerationProgressState = <T>(selector: (state: GenerationProgressState) => T) =>
  useStore(generationProgressStore, selector);
