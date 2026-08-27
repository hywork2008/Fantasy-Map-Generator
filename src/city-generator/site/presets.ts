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
  { id: "smallTown", label: "Small Town", population: 1_200 },
  { id: "largeTown", label: "Large Town", population: 4_000 },
  { id: "smallCity", label: "Small City", population: 12_000 },
  { id: "largeCity", label: "Large City", population: 30_000 }
];

export function presetPopulation(id: PresetId): number {
  return PRESETS.find(p => p.id === id)?.population ?? 4_000;
}
