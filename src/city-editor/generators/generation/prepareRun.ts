import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import type { CityParams, CityProgram } from "../../types/geometry";
import { DEFAULT_WALL_PLAN } from "../../types/geometry";
import { townExtentMeters } from "../settlementExtent";
import { resolveWallPlan, siteToGeography, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { NOMINAL_PRESET } from "./constants";
import { cellsFromMesh } from "./meshGeometry";

// --- main ---------------------------------------------------------------------

/** Everything `runPlan` needs, derived once from the document + the deliberate
 * inputs. Shared by `generateStageOnDocument` and `generateUrbanPatchStep` so
 * both read the exact same geography for a given `(document, settings, seed)`. */
export function prepareRun(document: CityDocument, settings: GenerationSettings, seed: string, readMesh = true) {
  const frame = document.frame;
  const half = settings.descriptor?.regionalContext
    ? Math.max(...Object.values(document.mesh.vertices).map(v => Math.max(Math.abs(v.point[0]), Math.abs(v.point[1]))))
    : frame.extentMeters / 2;
  const cellSize = Math.max(1, frame.blockSizeMeters);
  const descriptor =
    settings.descriptor ??
    synthSite(NOMINAL_PRESET, settings.config, seed, {
      extentMeters: frame.extentMeters,
      cityRadiusMeters: frame.cityRadiusMeters
    });
  const geo = siteToGeography(descriptor, !!settings.descriptor);
  const baseProgram = siteToProgram(descriptor);
  const program: CityProgram = {
    ...baseProgram,
    wallPlan: resolveWallPlan(baseProgram.wallPlan ?? DEFAULT_WALL_PLAN, settings.config.wall)
  };
  const params: CityParams = {
    seed,
    extentMeters: townExtentMeters(frame),
    cityRadiusMeters: settings.descriptor?.frame.cityRadiusMeters ?? frame.cityRadiusMeters,
    dwellings: document.populationPlan?.requiredDwellings ?? descriptor.burg.dwellings,
    cellSizeMeters: cellSize,
    lloydPasses: 1,
    urbanNPatches: settings.urbanNPatches
  };
  const { cells, faceIdOf } = readMesh
    ? cellsFromMesh(document.mesh, settings.descriptor?.regionalContext ? townExtentMeters(frame) / 2 : half)
    : { cells: [], faceIdOf: [] };
  return { cells, faceIdOf, geo, program, params, half, cellSize };
}
