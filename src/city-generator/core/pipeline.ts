// Pipeline orchestrator. M1: S0 (region & grid) only.
// M2 appends S1 sea / S2 river / S3 urban and a `steps` snapshot list.

import { buildGrid } from "./grid";
import { makeRng } from "./prng";
import type { CityParams, GenerationResult } from "./types";

/**
 * Pure. Same `params` (seed included) => structurally identical result.
 */
export function generateCity(params: CityParams): GenerationResult {
  const rng = makeRng(params.seed);
  const gridStages = buildGrid(params, rng);
  return {
    params,
    gridStages,
    cells: gridStages[gridStages.length - 1].cells
  };
}
