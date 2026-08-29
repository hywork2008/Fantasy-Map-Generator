import { buildGrid } from "../../city-generator/core/grid";
import { makeRng } from "../../city-generator/core/prng";
import type { CityGeography, CityParams } from "../../city-generator/core/types";
import { meshFromCells, validate } from "./mesh";
import type { CityDocument } from "./types";

const EMPTY_GEO: CityGeography = { coast: null, rivers: [], roadBearings: [] };

export function createDocument(seed = randomSeed(), extentMeters = 1200, cellSizeMeters = 120): CityDocument {
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
    frame: { extentMeters, cityRadiusMeters: params.cityRadiusMeters },
    mesh: meshFromCells(cells),
    featureGroups: [],
    elements: []
  };
}

export function parseDocument(text: string): CityDocument | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isDocument(value)) return null;
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
