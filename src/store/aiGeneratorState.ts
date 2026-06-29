import { create } from "zustand";

export interface AiGeneratorState {
  prompt: string;
  result: string;
  model: string;
  temperature: number;
  apiKey: string;
  onApply: ((result: string) => void) | null;
  setPrompt: (prompt: string) => void;
  setResult: (result: string | ((prev: string) => string)) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setApiKey: (key: string) => void;
  open: (defaultPrompt: string, onApply: (result: string) => void) => void;
}

export const useAiGeneratorState = create<AiGeneratorState>(set => ({
  prompt: "",
  result: "",
  model: localStorage.getItem("fmg-ai-model") || "gpt-4o-mini",
  temperature: Number(localStorage.getItem("fmg-ai-temperature") || "1"),
  apiKey: "",
  onApply: null,
  setPrompt: prompt => set({ prompt }),
  setResult: result =>
    set(state => ({
      result: typeof result === "function" ? result(state.result) : result
    })),
  setModel: model => {
    localStorage.setItem("fmg-ai-model", model);
    set({ model });
  },
  setTemperature: temperature => {
    localStorage.setItem("fmg-ai-temperature", String(temperature));
    set({ temperature });
  },
  setApiKey: apiKey => set({ apiKey }),
  open: (defaultPrompt, onApply) => set({ prompt: defaultPrompt, onApply, result: "" })
}));
