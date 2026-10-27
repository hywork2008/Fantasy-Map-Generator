import type { ChronicleEvent } from "../types/models";

/** Event weights; actions not listed are battles, captures and other armed clashes. */
const ACTION_WEIGHTS: Record<string, number> = {
  avoided_war: 0.3,
  severed_defense_pact: 0.5,
  "suspended autonomous conflict plans": 0
};
/** Years after which an event contributes 1/e of its weight. */
const MEMORY_YEARS = 25;
/** Accumulated weight that maps to ~63% heat. */
const HEAT_SCALE = 3;

export interface BorderHeat {
  /** 0 = no hostile history, 1 = saturated */
  heat: number;
  /** Burgs where clashes between the pair took place, with recency-weighted intensity */
  sites: Map<number, number>;
}

export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Scores hostility per state pair from the Relations history (states[0].diplomacy groups). */
export function computeBorderHeat(chronicle: unknown): Map<string, BorderHeat> {
  const raw = new Map<string, { weight: number; sites: Map<number, number> }>();
  if (!Array.isArray(chronicle)) return new Map();

  for (const group of chronicle) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      if (typeof item !== "object" || item === null) continue;
      const event = item as ChronicleEvent;
      if (!event.from || !event.to || event.from === event.to) continue;
      const weight = (ACTION_WEIGHTS[event.action] ?? 1) * Math.exp(-Math.max(0, event.yearsAgo || 0) / MEMORY_YEARS);
      if (weight <= 0) continue;

      const key = pairKey(event.from, event.to);
      let entry = raw.get(key);
      if (!entry) {
        entry = { weight: 0, sites: new Map() };
        raw.set(key, entry);
      }
      entry.weight += weight;
      if (event.toBurg && !(event.action in ACTION_WEIGHTS)) {
        entry.sites.set(event.toBurg, Math.min(1, (entry.sites.get(event.toBurg) || 0) + weight));
      }
    }
  }

  const result = new Map<string, BorderHeat>();
  for (const [key, { weight, sites }] of raw) {
    result.set(key, { heat: 1 - Math.exp(-weight / HEAT_SCALE), sites });
  }
  return result;
}
