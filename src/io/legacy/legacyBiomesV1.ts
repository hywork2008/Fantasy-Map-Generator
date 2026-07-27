/**
 * LegacyBiomeCodec — pure migration of pre-catalog `.fmg` biome slots.
 *
 * Old format:
 *   data[3]  : color | habitability | name  (parallel arrays)
 *   data[16] : per-cell legacy numeric codes
 *
 * This module must not import generators, D3, or world contexts. It only maps
 * the historical 0..12 codes and any custom tail onto a BiomeCatalogSnapshot +
 * biomeCode column for the normal archive path.
 */

import { STANDARD_BIOME_DEFINITIONS } from "../../data/biomeCatalog";
import type { BiomeCatalogSnapshot, BiomeCode, BiomeDefinition, BiomeKey, BiomeTag } from "../../types/biome";
import { BIOME_CATALOG_VERSION } from "../../types/biome";

/** Fixed mapping used only inside this codec. Not part of the runtime contract. */
export const LEGACY_BIOME_KEY_BY_CODE: readonly BiomeKey[] = [
  "marine",
  "hotDesert",
  "coldDesert",
  "savanna",
  "grassland",
  "tropicalSeasonalForest",
  "temperateDeciduousForest",
  "tropicalRainforest",
  "temperateRainforest",
  "taiga",
  "tundra",
  "glacier",
  "wetland"
] as const;

const STANDARD_BY_KEY: ReadonlyMap<BiomeKey, BiomeDefinition> = new Map(
  STANDARD_BIOME_DEFINITIONS.map(d => [d.key, d])
);

export interface LegacyBiomesV1Input {
  /** Pipe-separated color,habitability,name triples (data[3] content after split by outer format). */
  readonly colorCsv: string;
  readonly habitabilityCsv: string;
  readonly nameCsv: string;
  /** Comma-separated cell codes (data[16]). */
  readonly cellCodesCsv: string;
}

export interface LegacyBiomesV1Result {
  readonly snapshot: BiomeCatalogSnapshot;
  readonly biomeCode: Uint8Array;
  /** Parallel arrays restored for BiomesData compatibility after load. */
  readonly colors: string[];
  readonly habitability: number[];
  readonly names: string[];
}

function parseCsvNumbers(csv: string): number[] {
  if (!csv) return [];
  return csv.split(",").map(s => Number(s));
}

function parseCsvStrings(csv: string): string[] {
  if (!csv) return [];
  return csv.split(",");
}

function safeDefault(
  def: BiomeDefinition | undefined,
  key: BiomeKey,
  label: string,
  color: string,
  habit: number
): BiomeDefinition {
  if (def) {
    return {
      ...def,
      label: label || def.label,
      color: color || def.color,
      habitability: Number.isFinite(habit) ? habit : def.habitability
    };
  }
  // Custom / unknown: explicit safe defaults (no invented icons/tags)
  return {
    key,
    label: label || `Biome ${key}`,
    color: color || "#999999",
    habitability: Number.isFinite(habit) ? habit : 50,
    movementCost: 50,
    relief: { density: 0, icons: {} },
    tags: [] as BiomeTag[]
  };
}

/**
 * Convert legacy parallel arrays + cell codes into a catalog snapshot and
 * remapped biomeCode column. Custom biomes beyond code 12 become `legacyCustom:N`.
 */
export function decodeLegacyBiomesV1(input: LegacyBiomesV1Input): LegacyBiomesV1Result {
  const colors = parseCsvStrings(input.colorCsv);
  const habits = parseCsvNumbers(input.habitabilityCsv);
  const names = parseCsvStrings(input.nameCsv);
  const legacyCodes = parseCsvNumbers(input.cellCodesCsv);

  const count = Math.max(colors.length, habits.length, names.length, LEGACY_BIOME_KEY_BY_CODE.length);
  const definitions: BiomeDefinition[] = [];
  const keys: BiomeKey[] = [];
  const legacyToNew = new Map<number, BiomeCode>();

  for (let legacyCode = 0; legacyCode < count; legacyCode++) {
    const name = names[legacyCode] ?? "";
    const color = colors[legacyCode] ?? "#999999";
    const habit = habits[legacyCode] ?? 50;

    if (legacyCode < LEGACY_BIOME_KEY_BY_CODE.length) {
      const key = LEGACY_BIOME_KEY_BY_CODE[legacyCode]!;
      const base = STANDARD_BY_KEY.get(key);
      // Prefer standard label for glacier rename when the file still says "Glacier"
      const label =
        key === "glacier" && (name === "Glacier" || !name)
          ? (base?.label ?? "Glacier & perennial snowfield")
          : name || base?.label || key;
      const def = safeDefault(base, key, label, color, habit);
      keys.push(key);
      definitions.push(def);
      legacyToNew.set(legacyCode, definitions.length - 1);
    } else {
      const key: BiomeKey = `legacyCustom:${legacyCode}`;
      const def = safeDefault(undefined, key, name || `Custom ${legacyCode}`, color, habit);
      keys.push(key);
      definitions.push(def);
      legacyToNew.set(legacyCode, definitions.length - 1);
    }
  }

  // Also include any standard biomes beyond the file's table so the runtime
  // catalog can offer the full Phase-1 set after migration (manual paint only
  // until Phase 3 assignment). Skip keys already present.
  const present = new Set(keys);
  for (const def of STANDARD_BIOME_DEFINITIONS) {
    if (present.has(def.key)) continue;
    keys.push(def.key);
    definitions.push(def);
    present.add(def.key);
  }

  const biomeCode = new Uint8Array(legacyCodes.length);
  for (let i = 0; i < legacyCodes.length; i++) {
    const legacy = legacyCodes[i] ?? 0;
    biomeCode[i] = legacyToNew.get(legacy) ?? 0;
  }

  const snapshot: BiomeCatalogSnapshot = {
    version: BIOME_CATALOG_VERSION,
    keys,
    definitions
  };

  return {
    snapshot,
    biomeCode,
    colors: definitions.map(d => d.color),
    habitability: definitions.map(d => d.habitability),
    names: definitions.map(d => d.label)
  };
}

/**
 * Parse the legacy data[3] biomes field (`color|habitability|name`).
 */
export function parseLegacyBiomesField(
  biomesField: string
): Pick<LegacyBiomesV1Input, "colorCsv" | "habitabilityCsv" | "nameCsv"> {
  const parts = biomesField.split("|");
  return {
    colorCsv: parts[0] ?? "",
    habitabilityCsv: parts[1] ?? "",
    nameCsv: parts[2] ?? ""
  };
}
