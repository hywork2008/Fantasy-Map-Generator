import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { populationWindowMeters, type RequiredSiteBounds, requiredSiteExtent } from "../../utils/requiredSiteBounds";
import {
  type FixedApproachProvider,
  restoreFixedCrossingApproaches,
  validSavedFixedApproaches
} from "./fixedApproachAdoption";
import { upgradeFabricPlan, validFabricPlan } from "./gen/fabricDistricts";
import { polygonArea } from "./gen/geom";
import { buildGrid } from "./gen/grid";
import { buildHexGrid, DEFAULT_HEX_SIZE_METERS } from "./gen/hexGrid";
import { buildPatchCells, DEFAULT_PATCH_PARAMS, type PatchParams } from "./gen/patches";
import { makeRng } from "./gen/prng";
import type { Cell, CityGeography, CityParams } from "./gen/types";
import { validateLandmarks } from "./landmarks";
import { meshFromCells, validate } from "./mesh";
import { validRegionalFrameRoads, validSceneRegions } from "./sceneRegions";
import type { CityDocument } from "./types";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };
export const BLOCK_SIZE_METERS = 50;
/** `buildGrid`'s blue-noise spacing is slightly tighter than the resulting
 * mean cell width. This calibration keeps a 50 m macro block near its target. */
const BLOCK_SITE_SPACING_METERS = 44.8;

/** `minExternalRoads` is the standalone random-city floor (see
 * `minExternalRoadsForExtent`). Micro / Tiny / fort maps use 1; cities use 2.
 * `maxWallGates` caps the outer wall. Micro stays at 3: a fifth gate on that
 * short curtain tends to sit on the river and breaks the trunk road. Larger
 * presets keep the historical ceiling (6, plus one when the site is wet).
 * Each window is half the side of the next larger preset. */
export const CITY_SIZE_PRESETS = {
  micro: {
    label: "Micro",
    extentMeters: 300,
    cellsAcross: 6,
    buildingTarget: 19,
    minExternalRoads: 1,
    maxWallGates: 3
  },
  tiny: { label: "Tiny", extentMeters: 600, cellsAcross: 12, buildingTarget: 75, minExternalRoads: 1, maxWallGates: 7 },
  small: {
    label: "Small",
    extentMeters: 1200,
    cellsAcross: 24,
    buildingTarget: 300,
    minExternalRoads: 2,
    maxWallGates: 7
  },
  medium: {
    label: "Medium",
    extentMeters: 2400,
    cellsAcross: 48,
    buildingTarget: 1600,
    minExternalRoads: 2,
    maxWallGates: 7
  },
  large: {
    label: "Large",
    extentMeters: 4800,
    cellsAcross: 96,
    buildingTarget: 14000,
    minExternalRoads: 2,
    maxWallGates: 7
  }
} as const;

export type CitySizePreset = keyof typeof CITY_SIZE_PRESETS;

/** How the starting block mesh is generated when the user begins a new city. */
export type GridKind = "hex" | "voronoi" | "evolution";

/** Document-panel defaults: a Tiny Grid-evolution map. */
export const DEFAULT_CITY_SIZE: CitySizePreset = "tiny";
export const DEFAULT_GRID_KIND: GridKind = "evolution";

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
  /** Block mesh window when the display frame is larger than the town. */
  meshExtentMeters?: number;
  /** Civic window stored on the frame when it is smaller than the display frame. */
  settlementExtentMeters?: number;
  /** Evolution only. Replace the nominal 50 m block with the median town-cell width. */
  measureBlockSize?: boolean;
  /** Explicit evolution block width. Ignored for a hex grid, which uses its side length. */
  blockSizeMeters?: number;
}

export function isCitySizePreset(value: unknown): value is CitySizePreset {
  return typeof value === "string" && Object.hasOwn(CITY_SIZE_PRESETS, value);
}

/** Closest Micro / Tiny / Small / Medium / Large preset to a descriptor (or share) window. */
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

/** Outer-wall gate ceiling for the preset nearest to this window. */
export function maxWallGatesForExtent(extentMeters: number): number {
  return CITY_SIZE_PRESETS[sizePresetForExtent(extentMeters)].maxWallGates;
}

const TOWN_PRESET_ORDER: CitySizePreset[] = ["micro", "tiny", "small", "medium", "large"];
/** Centre cells of the evolution spiral, as a fraction of extent / sqrt(site count). */
const EVOLUTION_CENTER_WIDTH_FACTOR = 0.63;
/** A house row plus a lane. Narrower centre cells leave the curtain without dwellings. */
const MIN_TOWN_CELL_METERS = 32;
/** Patch-count slider bounds in the Document panel. */
const MIN_PATCHES = 6;
const MAX_PATCHES = 48;

export interface FittedTownFrame {
  size: CitySizePreset;
  extentMeters: number;
  cityRadiusMeters: number;
  nPatches: number;
}

/**
 * FMG floors every town window at 1,500 m, so a hamlet of radius ~80 m is a speck
 * on a Small map and the curtain encloses one cell. When that floor (or any
 * similarly oversized window) is in effect, pick the Map size whose town disk
 * matches a hand-drawn city, then choose an evolution patch count that keeps
 * the centre cells wide enough for dwellings. The radius itself stays in true metres.
 * Returns null when the window already frames the town.
 */
export function fitUndersizedTownFrame(cityRadiusMeters: number, extentMeters: number): FittedTownFrame | null {
  if (!(cityRadiusMeters > 0) || !(extentMeters > 0)) return null;
  const naturalExtent = cityRadiusMeters * 6;
  if (extentMeters <= naturalExtent * 1.25) return null;
  let size = sizePresetForExtent(cityRadiusMeters / 0.33);
  while (size !== "large" && CITY_SIZE_PRESETS[size].extentMeters < cityRadiusMeters * 2.5) {
    size = TOWN_PRESET_ORDER[TOWN_PRESET_ORDER.indexOf(size) + 1];
  }
  const fittedExtent = CITY_SIZE_PRESETS[size].extentMeters;
  return {
    size,
    extentMeters: fittedExtent,
    cityRadiusMeters,
    nPatches: nPatchesForTownCells(fittedExtent)
  };
}

/** Largest patch count whose centre cells stay wide enough for a dwelling row. */
export function nPatchesForTownCells(extentMeters: number): number {
  const raw = ((EVOLUTION_CENTER_WIDTH_FACTOR * extentMeters) / MIN_TOWN_CELL_METERS) ** 2 / 8;
  return Math.max(MIN_PATCHES, Math.min(MAX_PATCHES, Math.round(raw)));
}

function medianTownCellMeters(cells: Cell[], cityRadiusMeters: number): number {
  const areas = cells
    .filter(cell => Math.hypot(cell.centroid[0], cell.centroid[1]) <= Math.max(cityRadiusMeters, 1))
    .map(cell => Math.abs(polygonArea(cell.polygon)))
    .filter(area => area > 0)
    .sort((a, b) => a - b);
  const mid = areas[Math.floor(areas.length / 2)];
  return mid ? Math.max(1, Math.round(Math.sqrt(mid))) : BLOCK_SIZE_METERS;
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

/** New-city mesh: hexagonal tiling, Poisson Voronoi (`🆕` historically), or the
 * Grid-evolution final stage (Document-panel default; same mesh as 「この格子を採用」). */
/**
 * Mesh side when required water kept the display larger than the town.
 * A hamlet uses the fitted Micro/Tiny window. A town whose population window
 * already matches uses that window. Otherwise the display itself is the mesh.
 */
export function townMeshExtentMeters(
  frame: {
    extentMeters: number;
    cityRadiusMeters: number;
    regionalMode?: boolean;
    requiredBounds?: RequiredSiteBounds;
  },
  riverPort = false,
  bankDistanceMeters = 0
): number {
  const population = populationWindowMeters(frame.cityRadiusMeters);
  const town = fitUndersizedTownFrame(frame.cityRadiusMeters, population)?.extentMeters ?? population;
  if (frame.regionalMode)
    return Math.min(frame.extentMeters, riverPort ? Math.max(town, 2 * (bankDistanceMeters + 24)) : town);
  const water = frame.requiredBounds ? requiredSiteExtent(frame.requiredBounds) : 0;
  if (frame.extentMeters > town + 0.5 && water > town + 0.5)
    return riverPort ? Math.min(frame.extentMeters, Math.max(town, 2 * (bankDistanceMeters + 24))) : town;
  return frame.extentMeters;
}

/** Display extent, and a separate town mesh when `townMeshExtentMeters` is smaller. */
export function descriptorFrameGridOptions(
  frame: {
    extentMeters: number;
    cityRadiusMeters: number;
    regionalMode?: boolean;
    requiredBounds?: RequiredSiteBounds;
  },
  riverPort = false,
  bankDistanceMeters = 0
): Pick<CreateGridOptions, "extentMeters" | "meshExtentMeters" | "settlementExtentMeters" | "cityRadiusMeters"> {
  const mesh = townMeshExtentMeters(frame, riverPort, bankDistanceMeters);
  const widened = mesh < frame.extentMeters - 0.5;
  return {
    extentMeters: frame.extentMeters,
    cityRadiusMeters: frame.cityRadiusMeters,
    ...(widened ? { meshExtentMeters: mesh, settlementExtentMeters: townMeshExtentMeters(frame) } : {})
  };
}

export function createGridDocument(options: CreateGridOptions): CityDocument {
  const seed = options.seed ?? randomSeed();
  const grid = options.grid ?? "hex";
  const preset = CITY_SIZE_PRESETS[options.size];
  const extentMeters = options.extentMeters ?? preset.extentMeters;
  const cityRadiusMeters = options.cityRadiusMeters ?? extentMeters * 0.33;
  const meshExtent =
    options.meshExtentMeters && options.meshExtentMeters > 0
      ? Math.min(extentMeters, options.meshExtentMeters)
      : extentMeters;
  const hexSizeMeters = options.hexSizeMeters ?? DEFAULT_HEX_SIZE_METERS;
  const patchParams = options.patchParams ?? DEFAULT_PATCH_PARAMS;
  const settlement =
    options.settlementExtentMeters &&
    options.settlementExtentMeters > 0 &&
    options.settlementExtentMeters < extentMeters - 0.5
      ? options.settlementExtentMeters
      : undefined;

  let cells: Cell[];
  let blockSizeMeters = BLOCK_SIZE_METERS;
  if (grid === "hex") {
    cells = buildHexGrid(meshExtent, hexSizeMeters);
    blockSizeMeters = hexSizeMeters;
  } else if (grid === "evolution") {
    cells = buildPatchCells({ extentMeters: meshExtent, ...patchParams }, makeRng(seed));
    if (options.measureBlockSize) blockSizeMeters = medianTownCellMeters(cells, cityRadiusMeters);
    else if (options.blockSizeMeters && options.blockSizeMeters > 0) blockSizeMeters = options.blockSizeMeters;
  } else {
    const params: CityParams = {
      seed,
      extentMeters: meshExtent,
      cityRadiusMeters,
      cellSizeMeters: BLOCK_SITE_SPACING_METERS,
      lloydPasses: 1
    };
    cells = buildGrid(params, EMPTY_GEO, makeRng(seed)).at(-1)?.cells ?? [];
    if (options.blockSizeMeters && options.blockSizeMeters > 0) blockSizeMeters = options.blockSizeMeters;
  }
  const document = documentFromCells(cells, extentMeters, blockSizeMeters, cityRadiusMeters, settlement);
  document.gridKind = grid;
  return document;
}

function documentFromCells(
  cells: Cell[],
  extentMeters: number,
  blockSizeMeters: number,
  cityRadiusMeters: number,
  settlementExtentMeters?: number
): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: {
      extentMeters,
      cityRadiusMeters,
      blockSizeMeters,
      ...(settlementExtentMeters ? { settlementExtentMeters } : {})
    },
    historicalPeriod: "ageOfExploration",
    mesh: meshFromCells(cells),
    featureGroups: [],
    gates: [],
    elements: []
  };
}

/** Optional current contract enables saved approaches only after exact replay. */
export function parseDocument(text: string, fixedApproachProvider?: FixedApproachProvider): CityDocument | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isDocument(value)) return null;
    if (value.fabric !== undefined && !validFabricPlan(value.fabric)) return null;
    if (value.fabric && value.fabric.version < 4) value.fabric = upgradeFabricPlan(value);
    const recipe = value.fabric?.generation;
    if (recipe && (!isDocument(recipe.input) || "fabric" in recipe.input || validate(recipe.input).length)) return null;
    // Version-1 files saved before the scale-bar addition lack this descriptive
    // field; their geometry was already based on the same 50 m default.
    if (!Number.isFinite(value.frame.blockSizeMeters)) value.frame.blockSizeMeters = BLOCK_SIZE_METERS;
    // Gate anchors were introduced after the first editable-map format. Old
    // documents simply have no gates until the user adds one on a wall vertex.
    if (!Array.isArray(value.gates)) value.gates = [];
    for (const face of Object.values(value.mesh.faces)) {
      if (
        face.properties.ward !== null &&
        ![
          "market",
          "castle",
          "merchant",
          "craftsmen",
          "patriciate",
          "harbor",
          "park",
          "farm",
          "cemetery",
          "empty"
        ].includes(face.properties.ward)
      )
        return null;
      if (face.properties.water !== "land") face.properties.depth ??= 3;
    }
    if (validate(value).length || validateLandmarks(value).length) return null;
    if (fixedApproachProvider && value.fixedCrossingApproaches !== undefined) {
      const checked = restoreFixedCrossingApproaches(value, fixedApproachProvider);
      if ("document" in checked) return checked.document;
    }
    return value;
  } catch {
    return null;
  }
}

function isDocument(value: unknown): value is CityDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<CityDocument>;
  return (
    doc.format === "fmg-city-editor" &&
    (doc.fixedCrossingApproaches === undefined ||
      (!!doc.importedFixedCrossings && validSavedFixedApproaches(doc.fixedCrossingApproaches))) &&
    (doc.version === 1 || doc.version === 2 || doc.version === 3 || doc.version === 4) &&
    (doc.sceneRegions === undefined ||
      (doc.version === 4 && validSceneRegions(doc.sceneRegions) && validRegionalFrameRoads(doc.frameRoads))) &&
    (doc.landmarks === undefined || Array.isArray(doc.landmarks)) &&
    (doc.landmarkAssets === undefined || Array.isArray(doc.landmarkAssets)) &&
    (doc.gridKind === undefined || ["hex", "voronoi", "evolution"].includes(doc.gridKind)) &&
    (doc.buildingPattern === undefined || ["legacy", "medieval"].includes(doc.buildingPattern)) &&
    (doc.coastalOceanFaceIds === undefined ||
      (Array.isArray(doc.coastalOceanFaceIds) && doc.coastalOceanFaceIds.every(id => typeof id === "string"))) &&
    (doc.waterAreas === undefined ||
      (Array.isArray(doc.waterAreas) &&
        doc.waterAreas.every(
          area =>
            area?.kind === "river" &&
            Array.isArray(area.polygon) &&
            area.polygon.length >= 3 &&
            area.polygon.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        ))) &&
    (doc.importedRoadCount === undefined || (Number.isInteger(doc.importedRoadCount) && doc.importedRoadCount >= 0)) &&
    (doc.importedFixedCrossings === undefined ||
      (validFixedBurgCrossings(doc.importedFixedCrossings, FIXED_SITE_CROSSING_BUDGETS) &&
        !!doc.frame &&
        Number.isFinite(doc.frame.extentMeters) &&
        doc.frame.extentMeters > 0 &&
        requiredSiteExtent(doc.importedFixedCrossings.requiredBounds) <= doc.frame.extentMeters &&
        (doc.importedFixedCrossings.schemaVersion !== 3 ||
          (doc.importedFixedCrossings.coverageBounds!.minX <= -doc.frame.extentMeters / 2 &&
            doc.importedFixedCrossings.coverageBounds!.minY <= -doc.frame.extentMeters / 2 &&
            doc.importedFixedCrossings.coverageBounds!.maxX >= doc.frame.extentMeters / 2 &&
            doc.importedFixedCrossings.coverageBounds!.maxY >= doc.frame.extentMeters / 2)))) &&
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
