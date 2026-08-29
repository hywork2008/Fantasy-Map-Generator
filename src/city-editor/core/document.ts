import { buildGrid } from "../../city-generator/core/grid";
import { makeRng } from "../../city-generator/core/prng";
import type { CityGeography, CityParams } from "../../city-generator/core/types";
import { meshFromCells, validate } from "./mesh";
import type { CityDocument } from "./types";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };
export const BLOCK_SIZE_METERS = 50;
/** `buildGrid`'s blue-noise spacing is slightly tighter than the resulting
 * mean cell width. This calibration keeps a 50 m macro block near its target. */
const BLOCK_SITE_SPACING_METERS = 44.8;

export const CITY_SIZE_PRESETS = {
  small: { label: "Small", extentMeters: 1200, cellsAcross: 24, buildingTarget: 300 },
  medium: { label: "Medium", extentMeters: 2400, cellsAcross: 48, buildingTarget: 1600 },
  large: { label: "Large", extentMeters: 4800, cellsAcross: 96, buildingTarget: 14000 }
} as const;

export type CitySizePreset = keyof typeof CITY_SIZE_PRESETS;

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
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters, cityRadiusMeters: params.cityRadiusMeters, blockSizeMeters: cellSizeMeters },
    mesh: meshFromCells(cells),
    featureGroups: [],
    elements: []
  };
}

export function createSizedDocument(size: CitySizePreset, seed = randomSeed()): CityDocument {
  const preset = CITY_SIZE_PRESETS[size];
  const document = createDocument(seed, preset.extentMeters, BLOCK_SITE_SPACING_METERS);
  document.frame.blockSizeMeters = BLOCK_SIZE_METERS;
  return document;
}

export function parseDocument(text: string): CityDocument | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isDocument(value)) return null;
    // Version-1 files saved before the scale-bar addition lack this descriptive
    // field; their geometry was already based on the same 50 m default.
    if (!Number.isFinite(value.frame.blockSizeMeters)) value.frame.blockSizeMeters = BLOCK_SIZE_METERS;
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
