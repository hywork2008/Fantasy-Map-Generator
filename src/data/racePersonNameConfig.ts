/**
 * Race → person-name sphere configuration.
 *
 * Place names keep using culture.base (including fantasy Markov bases).
 * Person names for long-lived races use a real-world name_base_id sphere
 * (CC0 mythic/ancient pool). Users can override the default mapping in
 * Options → Generation → Race person names (dialog).
 */
import type { RaceKey } from "../types/models";
import { RACE_DEFINITIONS } from "./races";

/**
 * Person-name sphere choice for one race.
 * `null` = no mythic lock (Markov from culture place namesbase).
 * `alternate` is used for the 2nd, 4th, … culture of the same race when set.
 */
export interface RacePersonNameSphereConfig {
  primary: number | null;
  alternate?: number | null;
}

/** Full mapping: race key → sphere config. Missing keys fall back to defaults. */
export type RacePersonNameMapping = Partial<Record<RaceKey, RacePersonNameSphereConfig>>;

/**
 * Built-in defaults (High/Dark Fantasy culture templates).
 * Same race may have two spheres so sibling cultures stay distinct.
 */
export const DEFAULT_RACE_PERSON_NAME_SPHERES: Readonly<Record<string, RacePersonNameSphereConfig>> = {
  elf: { primary: 7, alternate: 22 }, // Greek, Celtic
  dark_elf: { primary: 23, alternate: 42 }, // Mesopotamian, Levantine
  dwarf: { primary: 6, alternate: 0 }, // Nordic, German heroic
  giant: { primary: 6 }, // Nordic
  draconic: { primary: 11 }, // Chinese
  // Same linguistic sphere as host dragons (no free culture of their own).
  wyrmkin: { primary: 11 }, // Chinese
  amazones: { primary: 7 }, // Greek (antique / high fantasy Amazones)
  // Short-lived / Markov-default races intentionally omitted (null = place Markov)
  goblin: { primary: null },
  orc: { primary: null },
  arachnid: { primary: null },
  human: { primary: null },
  unknown: { primary: null }
};

/** Spheres that have CC0 mythic/ancient person-name pools (for the picker UI). */
export const PERSON_NAME_SPHERE_OPTIONS: readonly { id: number | null; label: string }[] = [
  { id: null, label: "Markov (place namesbase)" },
  { id: 0, label: "German (heroic)" },
  { id: 1, label: "English (Arthurian)" },
  { id: 4, label: "Castillian" },
  { id: 6, label: "Nordic" },
  { id: 7, label: "Greek" },
  { id: 8, label: "Roman" },
  { id: 11, label: "Chinese" },
  { id: 12, label: "Japanese" },
  { id: 18, label: "Arabic" },
  { id: 22, label: "Celtic" },
  { id: 23, label: "Mesopotamian" },
  { id: 24, label: "Iranian" },
  { id: 42, label: "Levantine" }
];

/** Races shown in the configuration dialog (exclude Unknown catalog entry). */
export function configurablePersonNameRaces(): readonly { key: RaceKey; name: string }[] {
  return RACE_DEFINITIONS.filter(d => d.key !== "unknown").map(d => ({ key: d.key, name: d.name }));
}

/** Merge user overrides onto built-in defaults (clone, never mutate defaults). */
export function resolveRacePersonNameMapping(
  user?: RacePersonNameMapping | null
): Record<string, RacePersonNameSphereConfig> {
  const out: Record<string, RacePersonNameSphereConfig> = {};
  for (const [key, cfg] of Object.entries(DEFAULT_RACE_PERSON_NAME_SPHERES)) {
    out[key] = { primary: cfg.primary, alternate: cfg.alternate };
  }
  if (!user) return out;
  for (const [key, cfg] of Object.entries(user)) {
    if (!cfg) continue;
    out[key] = {
      primary: cfg.primary,
      ...(cfg.alternate !== undefined ? { alternate: cfg.alternate } : {})
    };
  }
  return out;
}

/**
 * Stamp `personNameBase` on culture templates from race → sphere mapping.
 * Cultures without raceKey are left unchanged.
 * Order among same race: primary, alternate, primary, alternate, …
 */
export function applyRacePersonNameSpheres<T extends { raceKey?: RaceKey; personNameBase?: number }>(
  cultures: T[],
  mapping?: RacePersonNameMapping | null
): T[] {
  const resolved = resolveRacePersonNameMapping(mapping);
  const counters: Record<string, number> = {};

  return cultures.map(c => {
    const key = c.raceKey;
    if (!key) return c;
    const cfg = resolved[key];
    if (!cfg) return c;

    const n = counters[key] ?? 0;
    counters[key] = n + 1;

    const useAlternate = n % 2 === 1 && cfg.alternate !== undefined;
    const sphere = useAlternate ? cfg.alternate! : cfg.primary;

    if (sphere === null) {
      if (c.personNameBase === undefined) return c;
      const { personNameBase: _drop, ...rest } = c;
      return rest as T;
    }
    return { ...c, personNameBase: sphere };
  });
}

/** Safe parse of localStorage / options JSON. */
export function parseRacePersonNameMapping(raw: unknown): RacePersonNameMapping {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RacePersonNameMapping = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as { primary?: unknown; alternate?: unknown };
    const primary = normalizeSphereId(v.primary);
    if (primary === undefined) continue;
    const cfg: RacePersonNameSphereConfig = { primary };
    if (v.alternate !== undefined) {
      const alt = normalizeSphereId(v.alternate);
      if (alt !== undefined) cfg.alternate = alt;
    }
    out[key] = cfg;
  }
  return out;
}

function normalizeSphereId(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (value === "null" || value === "") return null;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Math.floor(Number(value));
  }
  return undefined;
}

export function sphereLabel(id: number | null | undefined): string {
  if (id === null || id === undefined) return "Markov (place namesbase)";
  const hit = PERSON_NAME_SPHERE_OPTIONS.find(o => o.id === id);
  return hit?.label ?? `Base #${id}`;
}
