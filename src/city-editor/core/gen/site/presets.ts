import { editorText } from "../../../../i18n/editorMessages";
// Standalone size presets — the four buttons from the reference UI. Each maps to
// a population, which site/synthSite.ts turns into a full BurgSiteDescriptor.

export type PresetId = "smallTown" | "largeTown" | "smallCity" | "largeCity";

export interface Preset {
  id: PresetId;
  label: string;
  /** Inhabitants — midpoint of the reference generator's band for this size. */
  population: number;
}

export const PRESETS: Preset[] = [
  { id: "smallTown", label: editorText("cityEditor.messages.smallTown"), population: 1_200 },
  { id: "largeTown", label: editorText("cityEditor.messages.largeTown"), population: 4_000 },
  { id: "smallCity", label: editorText("cityEditor.messages.smallCity"), population: 12_000 },
  { id: "largeCity", label: editorText("cityEditor.messages.largeCity"), population: 30_000 }
];

export function presetPopulation(id: PresetId): number {
  return PRESETS.find(p => p.id === id)?.population ?? 4_000;
}
