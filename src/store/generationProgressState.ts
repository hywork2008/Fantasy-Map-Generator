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
export type GenerationProgressAction = "next" | "previous" | "retryLandscape";

type GenerationProgressState = {
  isOpen: boolean;
  isGenerating: boolean;
  currentStage: number;
  autoRun: boolean;
  resolver: ((action: GenerationProgressAction) => void) | null;
  beginStage: (stage: number) => void;
  waitForAction: (stage: number) => Promise<GenerationProgressAction>;
  next: () => void;
  previous: () => void;
  retryLandscape: () => void;
  runAll: () => void;
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
  currentStage: 0,
  autoRun: false,
  resolver: null,
  beginStage: stage => set({ isOpen: true, isGenerating: true, currentStage: stage }),
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
  runAll: () => {
    const state = get();
    resolveAction(state, "next");
    set({ resolver: null, isGenerating: true, autoRun: true });
  },
  finish: () => set({ isOpen: false, isGenerating: false, autoRun: false, resolver: null }),
  fail: () => set({ isOpen: false, isGenerating: false, autoRun: false, resolver: null })
}));

export const useGenerationProgressState = <T>(selector: (state: GenerationProgressState) => T) =>
  useStore(generationProgressStore, selector);
