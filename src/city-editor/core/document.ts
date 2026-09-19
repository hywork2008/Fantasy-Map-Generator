import { validFabricPlan } from "./gen/fabricDistricts";
import { buildGrid } from "./gen/grid";
import { buildHexGrid, DEFAULT_HEX_SIZE_METERS } from "./gen/hexGrid";
import { buildPatchCells, DEFAULT_PATCH_PARAMS, type PatchParams } from "./gen/patches";
import { makeRng } from "./gen/prng";
import type { Cell, CityGeography, CityParams } from "./gen/types";
import { meshFromCells, validate } from "./mesh";
import type { CityDocument } from "./types";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };
export const BLOCK_SIZE_METERS = 50;
/** `buildGrid`'s blue-noise spacing is slightly tighter than the resulting
 * mean cell width. This calibration keeps a 50 m macro block near its target. */
const BLOCK_SITE_SPACING_METERS = 44.8;

/** `minExternalRoads` is the standalone random-city floor (see
 * `minExternalRoadsForExtent`). Tiny / fort maps use 1; cities use 2. */
export const CITY_SIZE_PRESETS = {
  tiny: { label: "Tiny", extentMeters: 600, cellsAcross: 12, buildingTarget: 75, minExternalRoads: 1 },
  small: { label: "Small", extentMeters: 1200, cellsAcross: 24, buildingTarget: 300, minExternalRoads: 2 },
  medium: { label: "Medium", extentMeters: 2400, cellsAcross: 48, buildingTarget: 1600, minExternalRoads: 2 },
  large: { label: "Large", extentMeters: 4800, cellsAcross: 96, buildingTarget: 14000, minExternalRoads: 2 }
} as const;

export type CitySizePreset = keyof typeof CITY_SIZE_PRESETS;

/** How the starting block mesh is generated when the user begins a new city. */
export type GridKind = "hex" | "voronoi" | "evolution";

export interface CreateGridOptions {
  size: CitySizePreset;
  seed?: string;
  grid?: GridKind;
  /** Side length of each regular hexagon, metres. Used when `grid` is `"hex"`. */
  hexSizeMeters?: number;
  /** Spiral-scatter parameters. Used when `grid` is `"evolution"`. */
  patchParams?: Omit<PatchParams, "extentMeters">;
  /** Override the preset window so an FMG descriptor's frame is used as-is. */
  extentMeters?: number;
  cityRadiusMeters?: number;
}

export function isCitySizePreset(value: unknown): value is CitySizePreset {
  return typeof value === "string" && Object.hasOwn(CITY_SIZE_PRESETS, value);
}

/** Closest Tiny / Small / Medium / Large preset to a descriptor (or share) window. */
export function sizePresetForExtent(extentMeters: number): CitySizePreset {
  let best: CitySizePreset = "small";
  let bestDelta = Infinity;
  for (const id of Object.keys(CITY_SIZE_PRESETS) as CitySizePreset[]) {
    const delta = Math.abs(CITY_SIZE_PRESETS[id].extentMeters - extentMeters);
    if (delta < bestDelta) {
      best = id;
      bestDelta = delta;
    }
  }
  return best;
}

/** A Voronoi cell is one macro block. The presets all retain a 50 m block target. */
export function createDocument(
  seed = randomSeed(),
  extentMeters = 1200,
  cellSizeMeters = BLOCK_SIZE_METERS
): CityDocument {
  const params: CityParams = {
    seed,
    extentMeters,
    cityRadiusMeters: extentMeters * 0.33,
    cellSizeMeters,
    lloydPasses: 1
  };
  const cells = buildGrid(params, EMPTY_GEO, makeRng(seed)).at(-1)?.cells ?? [];
  return documentFromCells(cells, extentMeters, cellSizeMeters, params.cityRadiusMeters);
}

export function createSizedDocument(size: CitySizePreset, seed = randomSeed()): CityDocument {
  return createGridDocument({ size, seed, grid: "voronoi" });
}

/** New-city mesh: hexagonal tiling (default in the Document panel), Poisson
 * Voronoi (`🆕` historically), or the Grid-evolution final stage (`この格子を採用`). */
export function createGridDocument(options: CreateGridOptions): CityDocument {
  const seed = options.seed ?? randomSeed();
  const grid = options.grid ?? "hex";
  const preset = CITY_SIZE_PRESETS[options.size];
  const extentMeters = options.extentMeters ?? preset.extentMeters;
  const cityRadiusMeters = options.cityRadiusMeters ?? extentMeters * 0.33;
  const hexSizeMeters = options.hexSizeMeters ?? DEFAULT_HEX_SIZE_METERS;
  const patchParams = options.patchParams ?? DEFAULT_PATCH_PARAMS;

  let cells: Cell[];
  let blockSizeMeters = BLOCK_SIZE_METERS;
  if (grid === "hex") {
    cells = buildHexGrid(extentMeters, hexSizeMeters);
    blockSizeMeters = hexSizeMeters;
  } else if (grid === "evolution") {
    cells = buildPatchCells({ extentMeters, ...patchParams }, makeRng(seed));
  } else {
    const params: CityParams = {
      seed,
      extentMeters,
      cityRadiusMeters,
      cellSizeMeters: BLOCK_SITE_SPACING_METERS,
      lloydPasses: 1
    };
    cells = buildGrid(params, EMPTY_GEO, makeRng(seed)).at(-1)?.cells ?? [];
  }
  const document = documentFromCells(cells, extentMeters, blockSizeMeters, cityRadiusMeters);
  document.gridKind = grid;
  return document;
}

function documentFromCells(
  cells: Cell[],
  extentMeters: number,
  blockSizeMeters: number,
  cityRadiusMeters: number
): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters, cityRadiusMeters, blockSizeMeters },
    mesh: meshFromCells(cells),
    featureGroups: [],
    gates: [],
    elements: []
  };
}

export function parseDocument(text: string): CityDocument | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isDocument(value)) return null;
    if (value.fabric !== undefined && !validFabricPlan(value.fabric)) return null;
    const recipe = value.fabric?.generation;
    if (recipe && (!isDocument(recipe.input) || "fabric" in recipe.input || validate(recipe.input).length)) return null;
    // Version-1 files saved before the scale-bar addition lack this descriptive
    // field; their geometry was already based on the same 50 m default.
    if (!Number.isFinite(value.frame.blockSizeMeters)) value.frame.blockSizeMeters = BLOCK_SIZE_METERS;
    // Gate anchors were introduced after the first editable-map format. Old
    // documents simply have no gates until the user adds one on a wall vertex.
    if (!Array.isArray(value.gates)) value.gates = [];
    return validate(value).length === 0 ? value : null;
  } catch {
    return null;
  }
}

function isDocument(value: unknown): value is CityDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<CityDocument>;
  return (
    doc.format === "fmg-city-editor" &&
    doc.version === 1 &&
    (doc.gridKind === undefined || ["hex", "voronoi", "evolution"].includes(doc.gridKind)) &&
    !!doc.frame &&
    typeof doc.frame.extentMeters === "number" &&
    !!doc.mesh &&
    !!doc.mesh.vertices &&
    !!doc.mesh.edges &&
    !!doc.mesh.faces &&
    Array.isArray(doc.featureGroups) &&
    Array.isArray(doc.elements)
  );
}

function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}
