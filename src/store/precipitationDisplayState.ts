import { create } from "zustand";

/** Presentation preference only; monthly climate arrays are never serialized. */
export const usePrecipitationDisplayState = create<{
  mode: "annual" | "month";
  setMode(mode: "annual" | "month"): void;
}>(set => ({ mode: "annual", setMode: mode => set({ mode }) }));
