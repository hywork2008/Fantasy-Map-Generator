/**
 * Standard biome catalog: definitions, climate matrix (by key), and helpers.
 *
 * Numeric codes are compiled per catalog instance. Game logic must use
 * `BiomeKey` or tags — never hard-coded code ranges.
 */

import type {
  BiomeCatalog,
  BiomeCatalogSnapshot,
  BiomeCode,
  BiomeDefinition,
  BiomeKey,
  BiomeTag,
  StandardBiomeKey
} from "../types/biome";
import { BIOME_CATALOG_VERSION, STANDARD_BIOME_KEYS } from "../types/biome";
import type { BiomesData } from "../types/WorldState";

// ─── Standard definitions ────────────────────────────────────────────────────

const D = (
  key: StandardBiomeKey,
  label: string,
  color: string,
  habitability: number,
  movementCost: number,
  density: number,
  icons: Record<string, number>,
  tags: readonly BiomeTag[]
): BiomeDefinition => ({
  key,
  label,
  color,
  habitability,
  movementCost,
  relief: { density, icons },
  tags
});

/**
 * Default catalog order. Codes 0–12 match the historical Azgaar 13 biomes so
 * legacy `.fmg` fixtures and goods `biomeOutput` tables stay interpretable until
 * those call sites migrate fully to keys/tags.
 */
export const STANDARD_BIOME_DEFINITIONS: readonly BiomeDefinition[] = [
  D("marine", "Marine", "#466eab", 0, 10, 0, {}, ["marine"]),
  D("hotDesert", "Hot desert", "#fbe79f", 4, 200, 3, { dune: 3, cactus: 6, deadTree: 1 }, ["dry", "desert", "nomadic"]),
  D("coldDesert", "Cold desert", "#b5b887", 10, 150, 2, { dune: 9, deadTree: 1 }, ["dry", "desert", "cold", "nomadic"]),
  D("savanna", "Savanna", "#d2d082", 22, 60, 120, { acacia: 1, grass: 9 }, [
    "dry",
    "grassland",
    "arable",
    "nomadic",
    "tropical"
  ]),
  D("grassland", "Grassland", "#c8d68f", 30, 50, 120, { grass: 1 }, ["grassland", "arable", "nomadic"]),
  D("tropicalSeasonalForest", "Tropical seasonal forest", "#b6d95d", 50, 70, 120, { acacia: 8, palm: 1 }, [
    "forest",
    "arable",
    "tropical"
  ]),
  D("temperateDeciduousForest", "Temperate deciduous forest", "#29bc56", 100, 70, 120, { deciduous: 1 }, [
    "forest",
    "arable"
  ]),
  D(
    "tropicalRainforest",
    "Tropical rainforest",
    "#7dcb35",
    80,
    80,
    150,
    { acacia: 5, palm: 3, deciduous: 1, swamp: 1 },
    ["forest", "tropical"]
  ),
  D("temperateRainforest", "Temperate rainforest", "#409c43", 90, 90, 150, { deciduous: 6, swamp: 1 }, ["forest"]),
  D("taiga", "Taiga", "#4b6b32", 12, 200, 100, { conifer: 1 }, ["forest", "cold"]),
  D("tundra", "Tundra", "#96784b", 4, 1000, 5, { grass: 1 }, ["cold"]),
  D("glacier", "Glacier & perennial snowfield", "#d5e7eb", 0, 5000, 0, {}, ["cold", "snow"]),
  D("wetland", "Wetland", "#0b9131", 12, 150, 250, { swamp: 1 }, ["wetland"]),
  // Planned additions (Phase 1 catalog only — auto-assignment is Phase 3)
  D(
    "centralEuropeanGreatForest",
    "Central European great forest",
    "#1f6b3a",
    40,
    120,
    140,
    { deciduous: 4, conifer: 3, deadTree: 1 },
    // "arable" added 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase H) — this biome's name/
    // intent is medieval mixed-farming forest (wood-pasture, forest clearings), but it was missing
    // the tag every farmland-linked good (Chicken/Fodder, and now Cattle/Horses/Sheep) keys off.
    ["forest", "arable"]
  ),
  D(
    "mediterraneanWoodlandScrub",
    "Mediterranean woodland & scrub",
    "#a3b35c",
    35,
    65,
    90,
    { deciduous: 2, grass: 4, deadTree: 1 },
    ["dry", "scrub", "arable"]
  ),
  D("temperateConiferousForest", "Temperate coniferous forest", "#3d5c2e", 25, 110, 120, { conifer: 5, deciduous: 1 }, [
    "forest"
  ]),
  D("montaneForest", "Montane forest", "#3a5240", 18, 140, 100, { conifer: 4, deciduous: 1 }, ["forest", "mountain"]),
  D("alpineTundra", "Alpine tundra", "#8a7a5c", 2, 2000, 8, { grass: 2 }, ["cold", "mountain"]),
  D("mangrove", "Mangrove", "#1a6b4f", 8, 400, 180, { palm: 2, swamp: 4, deciduous: 1 }, [
    "wetland",
    "coastal",
    "forest",
    "tropical"
  ]),
  D("xericShrubland", "Xeric shrubland", "#c4b07a", 12, 100, 40, { cactus: 3, grass: 4, deadTree: 2 }, [
    "dry",
    "scrub",
    "nomadic"
  ]),
  D("cloudForest", "Cloud forest", "#2d6b4a", 30, 130, 160, { deciduous: 4, palm: 1, swamp: 1 }, [
    "forest",
    "mountain",
    "tropical"
  ]),
  D("heathMoorland", "Heath & moorland", "#7a8f4a", 10, 80, 60, { grass: 6, deadTree: 1 }, ["grassland", "wetland"]),
  D(
    "floodedForest",
    "Flooded forest & riparian woodland",
    "#2f8f5a",
    35,
    160,
    140,
    { deciduous: 3, swamp: 4, palm: 1 },
    ["forest", "wetland"]
  ),
  // Phase 5: steppe, tropical dry forest, boreal peatland
  D("coldSteppe", "Cold steppe & forest-steppe", "#c4c47a", 18, 55, 80, { grass: 8, deadTree: 1 }, [
    "grassland",
    "dry",
    "nomadic"
  ]),
  D(
    "tropicalDryForest",
    "Tropical dry forest & thorn woodland",
    "#a3a34a",
    35,
    85,
    110,
    { acacia: 5, deciduous: 2, deadTree: 2 },
    ["forest", "dry", "tropical"]
  ),
  D("borealPeatland", "Boreal peatland & muskeg", "#5a6b4a", 3, 1200, 40, { swamp: 4, grass: 3, conifer: 1 }, [
    "wetland",
    "cold"
  ]),
  // Volcanic terrain (docs/plan/urban-construction-industry.md §"火山" brainstorm) — tagged during
  // heightmap generation (HeightmapModule.finalizeVolcanoes, VolcanoConstants) rather than guessed
  // post-hoc from absolute height, so only genuinely isolated dominant peaks qualify.
  D("volcanicBarrens", "Volcanic barrens", "#4a4640", 3, 260, 6, { vulcan: 2, deadTree: 1 }, [
    "dry",
    "mountain",
    "volcanic"
  ]),
  D("lavaField", "Lava field", "#5c1f12", 0, 5000, 0, { vulcan: 3 }, ["dry", "mountain", "volcanic"]), // cooled recent lava along a flow, not molten magma
  D("volcanicSoil", "Volcanic soil", "#4a3728", 55, 60, 140, { grass: 5, deciduous: 3, acacia: 1 }, [
    "arable",
    "volcanic"
  ])
];

/** Climate matrix rows are moisture bands (dry→wet); columns are temperature bands (hot→cold). */
export const CLIMATE_MATRIX_BY_KEY: readonly (readonly StandardBiomeKey[])[] = [
  // hot ↔ cold [>19°C; <-4°C]; dry ↕ wet
  [
    "hotDesert",
    "hotDesert",
    "hotDesert",
    "hotDesert",
    "hotDesert",
    "hotDesert",
    "hotDesert",
    "hotDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "coldDesert",
    "tundra"
  ],
  [
    "savanna",
    "savanna",
    "savanna",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "grassland",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "tundra",
    "tundra",
    "tundra"
  ],
  [
    "tropicalSeasonalForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "tundra",
    "tundra",
    "tundra"
  ],
  [
    "tropicalSeasonalForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateDeciduousForest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "tundra",
    "tundra",
    "tundra"
  ],
  [
    "tropicalRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "temperateRainforest",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "taiga",
    "tundra",
    "tundra"
  ]
];

// ─── Builders ────────────────────────────────────────────────────────────────

function expandIcons(weighted: Readonly<Record<string, number>>): string[] {
  const parsed: string[] = [];
  for (const [icon, weight] of Object.entries(weighted)) {
    for (let j = 0; j < weight; j++) parsed.push(icon);
  }
  return parsed;
}

function compileClimateMatrix(codesByKey: Readonly<Record<string, BiomeCode>>): Uint8Array[] {
  return CLIMATE_MATRIX_BY_KEY.map(row => new Uint8Array(row.map(key => codesByKey[key]!)));
}

export function buildCatalogFromDefinitions(
  definitions: readonly BiomeDefinition[],
  version: number = BIOME_CATALOG_VERSION
): BiomeCatalog {
  const keysByCode: BiomeKey[] = [];
  const codesByKey: Record<string, BiomeCode> = {};
  const definitionsByKey: Record<string, BiomeDefinition> = {};

  for (let code = 0; code < definitions.length; code++) {
    const def = definitions[code]!;
    if (definitionsByKey[def.key]) {
      throw new Error(`Duplicate biome key in catalog: ${def.key}`);
    }
    keysByCode.push(def.key);
    codesByKey[def.key] = code;
    definitionsByKey[def.key] = def;
  }

  return { version, definitionsByKey, keysByCode, codesByKey };
}

/** Build the parallel-array BiomesData view used by generators/UI today. */
export function catalogToBiomesData(catalog: BiomeCatalog): BiomesData {
  const { keysByCode, definitionsByKey, codesByKey, version } = catalog;
  const n = keysByCode.length;

  const name: string[] = new Array(n);
  const color: string[] = new Array(n);
  const habitability: number[] = new Array(n);
  const iconsDensity: number[] = new Array(n);
  const icons: string[][] = new Array(n);
  const cost: number[] = new Array(n);
  const keys: BiomeKey[] = new Array(n);
  const tags: BiomeTag[][] = new Array(n);

  for (let code = 0; code < n; code++) {
    const key = keysByCode[code]!;
    const def = definitionsByKey[key]!;
    keys[code] = key;
    tags[code] = [...def.tags];
    name[code] = def.label;
    color[code] = def.color;
    habitability[code] = def.habitability;
    iconsDensity[code] = def.relief.density;
    icons[code] = expandIcons(def.relief.icons);
    cost[code] = def.movementCost;
  }

  return {
    version,
    keys,
    tags,
    i: Array.from({ length: n }, (_, i) => i),
    name,
    color,
    habitability,
    iconsDensity,
    icons,
    cost,
    biomesMatrix: compileClimateMatrix(codesByKey),
    definitionsByKey: { ...definitionsByKey },
    codesByKey: { ...codesByKey }
  };
}

export function createDefaultBiomeCatalog(): BiomeCatalog {
  return buildCatalogFromDefinitions(STANDARD_BIOME_DEFINITIONS);
}

export function createDefaultBiomesData(): BiomesData {
  return catalogToBiomesData(createDefaultBiomeCatalog());
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export function catalogToSnapshot(catalog: BiomeCatalog): BiomeCatalogSnapshot {
  return {
    version: catalog.version,
    keys: [...catalog.keysByCode],
    definitions: catalog.keysByCode.map(key => catalog.definitionsByKey[key]!)
  };
}

export function biomesDataToSnapshot(data: BiomesData): BiomeCatalogSnapshot {
  const definitions: BiomeDefinition[] = data.keys.map((key, code) => {
    const fromMap = data.definitionsByKey?.[key];
    if (fromMap) return fromMap;
    // Reconstruct from parallel arrays (custom / edited biomes)
    return {
      key,
      label: data.name[code] ?? key,
      color: data.color[code] ?? "#999999",
      habitability: data.habitability[code] ?? 50,
      movementCost: data.cost[code] ?? 50,
      relief: { density: data.iconsDensity[code] ?? 0, icons: {} },
      tags: data.tags[code] ?? []
    };
  });
  return {
    version: data.version ?? BIOME_CATALOG_VERSION,
    keys: [...data.keys],
    definitions
  };
}

export function snapshotToBiomesData(snapshot: BiomeCatalogSnapshot): BiomesData {
  validateBiomeCatalogSnapshot(snapshot);
  const catalog = buildCatalogFromDefinitions(snapshot.definitions, snapshot.version);
  const data = catalogToBiomesData(catalog);
  // Preserve climate matrix from standard keys when all matrix keys exist
  try {
    data.biomesMatrix = compileClimateMatrix(catalog.codesByKey);
  } catch {
    // Custom-only catalogs keep an empty matrix; assignment falls back to explicit rules
    data.biomesMatrix = [];
  }
  return data;
}

export function validateBiomeCatalogSnapshot(snapshot: BiomeCatalogSnapshot): void {
  if (!snapshot || typeof snapshot.version !== "number") {
    throw new Error("BiomeCatalogSnapshot: missing version");
  }
  if (!Array.isArray(snapshot.keys) || !Array.isArray(snapshot.definitions)) {
    throw new Error("BiomeCatalogSnapshot: keys and definitions must be arrays");
  }
  if (snapshot.keys.length !== snapshot.definitions.length) {
    throw new Error("BiomeCatalogSnapshot: keys and definitions length mismatch");
  }
  const seen = new Set<string>();
  for (let i = 0; i < snapshot.keys.length; i++) {
    const key = snapshot.keys[i];
    const def = snapshot.definitions[i];
    if (typeof key !== "string" || !key) {
      throw new Error(`BiomeCatalogSnapshot: invalid key at index ${i}`);
    }
    if (seen.has(key)) {
      throw new Error(`BiomeCatalogSnapshot: duplicate key ${key}`);
    }
    seen.add(key);
    if (!def || def.key !== key) {
      throw new Error(`BiomeCatalogSnapshot: definition key mismatch at index ${i}`);
    }
    if (typeof def.label !== "string" || typeof def.color !== "string") {
      throw new Error(`BiomeCatalogSnapshot: invalid definition fields at index ${i}`);
    }
  }
}

// ─── Query helpers (never use bare numeric ranges) ───────────────────────────

export function getBiomeDefinition(data: BiomesData, code: BiomeCode): BiomeDefinition | undefined {
  const key = data.keys[code];
  if (!key) return undefined;
  return data.definitionsByKey?.[key];
}

export function getBiomeKey(data: BiomesData, code: BiomeCode): BiomeKey | undefined {
  return data.keys[code];
}

export function getBiomeCode(data: BiomesData, key: BiomeKey): BiomeCode | undefined {
  return data.codesByKey?.[key];
}

export function biomeHasTag(data: BiomesData, code: BiomeCode, tag: BiomeTag): boolean {
  const tags = data.tags[code];
  return tags ? tags.includes(tag) : false;
}

export function biomeHasAnyTag(data: BiomesData, code: BiomeCode, tags: readonly BiomeTag[]): boolean {
  const cellTags = data.tags[code];
  if (!cellTags) return false;
  return tags.some(t => cellTags.includes(t));
}

export function isForestBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "forest");
}

export function isWetlandBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "wetland");
}

export function isNomadicBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "nomadic");
}

export function isArableBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "arable");
}

export function isColdBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "cold");
}

export function isDesertBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "desert");
}

export function isMountainBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "mountain");
}

export function isSnowBiome(data: BiomesData, code: BiomeCode): boolean {
  return biomeHasTag(data, code, "snow");
}

/** Standard biome count in the default catalog (before custom additions). */
export const STANDARD_BIOME_COUNT = STANDARD_BIOME_KEYS.length;

/**
 * Ensure BiomesData has catalog fields after legacy load or partial mutation.
 * Fills keys/tags from standard definitions when missing; custom slots get
 * synthetic keys.
 */
export function ensureBiomeCatalogFields(data: BiomesData): BiomesData {
  if (data.keys?.length === data.name.length && data.tags?.length === data.name.length && data.definitionsByKey) {
    return data;
  }

  const standard = createDefaultBiomesData();
  const n = data.name.length;
  const keys: BiomeKey[] = [];
  const tags: BiomeTag[][] = [];
  const definitionsByKey: Record<string, BiomeDefinition> = {};
  const codesByKey: Record<string, BiomeCode> = {};

  for (let code = 0; code < n; code++) {
    const label = data.name[code] ?? `Biome ${code}`;
    if (label === "removed") {
      const key: BiomeKey = `custom:removed-${code}`;
      keys[code] = key;
      tags[code] = [];
      const def: BiomeDefinition = {
        key,
        label: "removed",
        color: data.color[code] ?? "#999999",
        habitability: 0,
        movementCost: data.cost[code] ?? 50,
        relief: { density: 0, icons: {} },
        tags: []
      };
      definitionsByKey[key] = def;
      codesByKey[key] = code;
      continue;
    }

    const standardKey = standard.keys[code];
    const standardDef = standardKey ? standard.definitionsByKey?.[standardKey] : undefined;
    if (standardDef && code < STANDARD_BIOME_DEFINITIONS.length && standard.name[code] === label) {
      keys[code] = standardDef.key;
      tags[code] = [...standardDef.tags];
      definitionsByKey[standardDef.key] = standardDef;
      codesByKey[standardDef.key] = code;
      continue;
    }

    // Match by historical label for partial renames (e.g. Glacier → Glacier & perennial snowfield)
    const byLabel = STANDARD_BIOME_DEFINITIONS.find(
      d => d.label === label || (label === "Glacier" && d.key === "glacier")
    );
    if (byLabel && !codesByKey[byLabel.key]) {
      keys[code] = byLabel.key;
      tags[code] = [...byLabel.tags];
      definitionsByKey[byLabel.key] = {
        ...byLabel,
        label: data.name[code] ?? byLabel.label,
        color: data.color[code] ?? byLabel.color,
        habitability: data.habitability[code] ?? byLabel.habitability,
        movementCost: data.cost?.[code] ?? byLabel.movementCost
      };
      codesByKey[byLabel.key] = code;
      continue;
    }

    const key: BiomeKey = `custom:${code}-${label.replace(/\s+/g, "_")}`;
    keys[code] = key;
    tags[code] = [];
    const def: BiomeDefinition = {
      key,
      label,
      color: data.color[code] ?? "#999999",
      habitability: data.habitability[code] ?? 50,
      movementCost: data.cost?.[code] ?? 50,
      relief: {
        density: data.iconsDensity?.[code] ?? 0,
        icons: {}
      },
      tags: []
    };
    definitionsByKey[key] = def;
    codesByKey[key] = code;
  }

  data.keys = keys;
  data.tags = tags;
  data.definitionsByKey = definitionsByKey;
  data.codesByKey = codesByKey;
  data.version = data.version ?? BIOME_CATALOG_VERSION;
  if (!data.cost || data.cost.length < n) {
    data.cost = Array.from({ length: n }, (_, i) => data.cost?.[i] ?? standard.cost[i] ?? 50);
  }
  if (!data.iconsDensity || data.iconsDensity.length < n) {
    data.iconsDensity = Array.from({ length: n }, (_, i) => data.iconsDensity?.[i] ?? 0);
  }
  if (!data.icons || data.icons.length < n) {
    data.icons = Array.from({ length: n }, (_, i) => data.icons?.[i] ?? []);
  }
  return data;
}

/** Append a custom biome definition to a live BiomesData (editor path). */
export function appendCustomBiome(
  data: BiomesData,
  partial: {
    label?: string;
    color?: string;
    habitability?: number;
    movementCost?: number;
  } = {}
): BiomeCode {
  const code = data.i.length;
  if (code > 254) {
    throw new Error("Maximum number of biomes reached (255)");
  }
  const key: BiomeKey = `custom:${code}`;
  const def: BiomeDefinition = {
    key,
    label: partial.label ?? "Custom",
    color: partial.color ?? "#999999",
    habitability: partial.habitability ?? 50,
    movementCost: partial.movementCost ?? 50,
    relief: { density: 0, icons: {} },
    tags: []
  };

  data.i.push(code);
  data.keys.push(key);
  data.tags.push([]);
  data.name.push(def.label);
  data.color.push(def.color);
  data.habitability.push(def.habitability);
  data.iconsDensity.push(0);
  data.icons.push([]);
  data.cost.push(def.movementCost);
  data.definitionsByKey = { ...data.definitionsByKey, [key]: def };
  data.codesByKey = { ...data.codesByKey, [key]: code };
  data.cells?.push(0);
  data.area?.push(0);
  data.rural?.push(0);
  data.urban?.push(0);
  return code;
}
