/** Shared settings and memoised generation for the generate*.test.ts files. */
import { defaultGenerationSettings, type GenerationSettings, type SiteConfig } from "./generate";
import type { CityDocument } from "./types";

export function settings(overrides: Partial<SiteConfig>): GenerationSettings {
  const base = defaultGenerationSettings();
  return { config: { ...base.config, ...overrides } };
}

export const SCENARIOS: Record<string, GenerationSettings> = {
  "landlocked, one river, walls + citadel": settings({
    coast: "none",
    rivers: ["meander"],
    features: { walls: true, citadel: true, plaza: true, temple: true, port: false, shanty: false }
  }),
  "coast + harbour + walls": settings({
    coast: "straight",
    rivers: ["toCoast"],
    features: { walls: true, citadel: false, plaza: true, temple: true, port: true, shanty: true }
  }),
  "bay, no walls": settings({
    coast: "bay",
    rivers: [],
    features: { walls: false, citadel: false, plaza: false, temple: false, port: true, shanty: false }
  })
};

export const SEEDS = ["ce-gen-a", "ce-gen-b", "ce-gen-c"];

// The same memo for the per-loop scrub steps (each call reruns the whole pipeline).
const documentIds = new WeakMap<CityDocument, number>();
let documentCount = 0;
const stepCache = new Map<string, unknown>();
export function cachedStep<T>(
  step: (document: CityDocument, settings: GenerationSettings, seed: string, index: number) => T,
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  index: number
): T {
  if (!documentIds.has(document)) documentIds.set(document, documentCount++);
  const key = JSON.stringify([step.name, documentIds.get(document), settings, seed, index]);
  if (!stepCache.has(key)) stepCache.set(key, step(document, settings, seed, index));
  return structuredClone(stepCache.get(key) as T);
}
