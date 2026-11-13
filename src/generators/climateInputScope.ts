/**
 * Scope in which the climate inputs (grid points, heights, precipitation, features, winds, axial
 * tilt, map coordinates, distance scale, height exponent) cannot change: one simulation step.
 * Only generation, load and the editors write them, and none of those run inside a step.
 *
 * Caches that hash those inputs to validate themselves (cellWindClimate) validate once per scope
 * instead of on every read; outside a scope they validate every time, as before.
 */
let depth = 0;
let epoch = 0;

export function withFrozenClimateInputs<T>(run: () => T): T {
  if (depth++ === 0) epoch++;
  try {
    return run();
  } finally {
    depth--;
  }
}

/** Id of the active frozen scope, or null outside one (callers must validate fully). */
export function frozenClimateEpoch(): number | null {
  return depth > 0 ? epoch : null;
}
