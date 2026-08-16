/**
 * Geographic water a frontier village can actually use.
 *
 * An on-cell river is best, but medieval settlement does not wait for the
 * river to sit inside the same packed cell. A ditch from the next cell, or a
 * well where rainfall recharges groundwater, is the normal way a farm fills
 * the land between streams.
 */

/** `grid.cells.prec` units (100 mm). Matches rainfed agriculture in population-food-supply §3.5. */
export const RAINFED_WELL_PRECIPITATION = 8;

export type CellWaterAccessKind = "river" | "adjacentRiver" | "harbor" | "rainfedWell" | "confluence" | "none";

export interface CellWaterAccess {
  readonly kind: CellWaterAccessKind;
  /** Additive score used by frontier candidate ranking. */
  readonly score: number;
  /** Village well / ditch is available without a state public-works programme. */
  readonly canDigWell: boolean;
  /** Rainfall-equivalent added to staple-crop suitability. */
  readonly irrigationSupplement: number;
}

export interface WaterAccessCells {
  readonly r?: ArrayLike<number>;
  readonly harbor?: ArrayLike<number>;
  readonly conf?: ArrayLike<number>;
  readonly c?: ReadonlyArray<ReadonlyArray<number> | undefined>;
}

export function hasAdjacentRiver(cells: WaterAccessCells, cellId: number): boolean {
  if (cells.r?.[cellId]) return false;
  for (const neighbor of cells.c?.[cellId] ?? []) {
    if (neighbor !== undefined && cells.r?.[neighbor]) return true;
  }
  return false;
}

export function getCellPrecipitation(
  world: {
    readonly grid?: { readonly cells?: { readonly prec?: ArrayLike<number> } };
    readonly pack?: { readonly cells?: { readonly g?: ArrayLike<number> } };
  },
  cellId: number
): number | undefined {
  const prec = world.grid?.cells?.prec;
  if (!prec) return undefined;
  const gridId = world.pack?.cells?.g?.[cellId] ?? cellId;
  const value = prec[gridId];
  return value === undefined ? undefined : Number(value);
}

export function getCellWaterAccess(cells: WaterAccessCells, cellId: number, precipitation?: number): CellWaterAccess {
  if (cells.r?.[cellId]) {
    return { kind: "river", score: 20, canDigWell: false, irrigationSupplement: 0 };
  }
  if (hasAdjacentRiver(cells, cellId)) {
    return { kind: "adjacentRiver", score: 16, canDigWell: true, irrigationSupplement: 4 };
  }
  if (cells.harbor?.[cellId]) {
    return { kind: "harbor", score: 15, canDigWell: false, irrigationSupplement: 0 };
  }
  if (precipitation !== undefined && precipitation >= RAINFED_WELL_PRECIPITATION) {
    return { kind: "rainfedWell", score: 12, canDigWell: true, irrigationSupplement: 2 };
  }
  if (cells.conf?.[cellId]) {
    return { kind: "confluence", score: 8, canDigWell: false, irrigationSupplement: 0 };
  }
  return { kind: "none", score: 0, canDigWell: false, irrigationSupplement: 0 };
}

/** Extra subsistence / support capacity from a village well or state well works. */
export function getWellCapacityBonus(access: CellWaterAccess, wellInvestments = 0): number {
  return (access.canDigWell ? 0.15 : 0) + Math.max(0, wellInvestments) * 0.05;
}
