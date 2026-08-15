import type { FrontierStartMode, WorldOptions } from "../types/WorldState";

export const DEFAULT_FRONTIER_START_MODE: FrontierStartMode = "landOrigin";

/** Soft floor so a capital is not boxed onto an isle that finishes in a year. */
export const MIN_FRONTIER_START_LAND_CELLS = 80;
/** Extra landmass cells per starting-realm cell so expansion stays on land. */
export const FRONTIER_START_LAND_PER_REALM_CELL = 6;
/** Never start on a land feature this small, even after relaxation. */
export const MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE = 2;
/**
 * Relaxation ladder after the requested floor. Maps with no continent still
 * prefer large islands over one-cell rocks.
 */
export const FRONTIER_START_LAND_RELAXATION = [40, 16, 4, 2] as const;

/** Converts saved or UI input to a supported frontier opening story. */
export function normalizeFrontierStartMode(value: unknown): FrontierStartMode {
  return value === "seaborne" ? "seaborne" : DEFAULT_FRONTIER_START_MODE;
}

export function minFrontierStartLandCells(realmSize: number): number {
  const size = Number.isFinite(realmSize) ? Math.max(1, Math.round(realmSize)) : 1;
  return Math.max(MIN_FRONTIER_START_LAND_CELLS, size * FRONTIER_START_LAND_PER_REALM_CELL);
}

/** Land-size floors from the requested minimum down to the absolute floor. */
export function frontierStartLandFloors(realmSize: number): number[] {
  const requested = minFrontierStartLandCells(realmSize);
  const floors = [requested];
  for (const step of FRONTIER_START_LAND_RELAXATION) {
    if (step < requested && step >= MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE) floors.push(step);
  }
  return floors;
}

/**
 * Frontier land-origin worlds have no ocean-going hulls at generation, so they
 * must not receive charted sea lanes (or river-visual searoutes). Every other
 * pattern, and seaborne frontier, keeps generation-time sea lanes.
 */
export function allowsGeneratedSeaLanes(
  options: Pick<WorldOptions, "initialSettlementPattern" | "frontierStartMode">
): boolean {
  if (options.initialSettlementPattern !== "frontier") return true;
  return normalizeFrontierStartMode(options.frontierStartMode) === "seaborne";
}

/** Same gate as sea lanes: no ships on land origin, ordinary seed otherwise. */
export function shouldSeedInitialFleets(
  options: Pick<WorldOptions, "initialSettlementPattern" | "frontierStartMode"> | undefined
): boolean {
  if (!options) return true;
  return allowsGeneratedSeaLanes(options);
}
