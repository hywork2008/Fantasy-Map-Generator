/**
 * Small-world generation scopes (docs/plan/map-scope-small-worlds.md).
 *
 * `points` sets cell DENSITY (cells per full canvas); a scope keeps that density — the same
 * spacing, km per pixel and per-cell hydrology as a full map — and only shrinks the canvas, so
 * the generated world is a province-sized or islet-sized cut of an ordinary FMG world rather
 * than a coarse whole world.
 */

export type MapScopeKind = "world" | "province" | "islet";

export const MAP_SCOPE_KINDS: readonly MapScopeKind[] = ["world", "province", "islet"];

/** Total grid cells (land + sea) a Province-scope map is built from, by default. */
export const PROVINCE_SCOPE_DEFAULT_CELLS = 500;
export const PROVINCE_SCOPE_MIN_CELLS = 100;
export const PROVINCE_SCOPE_MAX_CELLS = 2500;
/** An islet map is a 7×7-ish patch of sea around one small island. */
export const ISLET_SCOPE_CELLS = 49;
export const ISLET_MAX_LAND_CELLS = 6;
export const ISLET_LAND_CELL_CHOICES = Array.from({ length: ISLET_MAX_LAND_CELLS }, (_, i) => i + 1);

/** Persisted on `grid.scope`, so loaded small maps keep their density and canvas. */
export interface GridMapScope {
  kind: Exclude<MapScopeKind, "world">;
  /** Linear canvas factor: scoped graph = canvas × factor. */
  factor: number;
  /** Cells a full canvas would hold at this density (the `points` option's count). */
  densityCells: number;
  /** Canvas the scope was cut from, restored as mapWidth/mapHeight on load. */
  canvasWidth: number;
  canvasHeight: number;
}

/** Caps applied to per-map counts so a province map is not split among 18 states. */
const SCOPE_COUNT_CAPS: Record<Exclude<MapScopeKind, "world">, Record<ScopedCount, number>> = {
  province: { states: 2, cultures: 2, religions: 2 },
  islet: { states: 1, cultures: 1, religions: 1 }
};

export type ScopedCount = "states" | "cultures" | "religions";

export function normalizeMapScope(value: unknown): MapScopeKind {
  return MAP_SCOPE_KINDS.includes(value as MapScopeKind) ? (value as MapScopeKind) : "world";
}

/** Cells a full canvas holds for a `points` slider value (1..13). */
export function densityCellsForPoints(points: number): number {
  return points === 4 ? 10000 : points * 2500;
}

export function scopeTargetCells(kind: MapScopeKind, provinceCells: number): number | null {
  if (kind === "province") {
    const cells = Number.isFinite(provinceCells) ? Math.round(provinceCells) : PROVINCE_SCOPE_DEFAULT_CELLS;
    return Math.min(Math.max(cells, PROVINCE_SCOPE_MIN_CELLS), PROVINCE_SCOPE_MAX_CELLS);
  }
  if (kind === "islet") return ISLET_SCOPE_CELLS;
  return null;
}

/**
 * Shrinks a full canvas to `targetCells` at the density of `densityCells`. Returns null for the
 * world scope (and for targets that would not shrink the canvas), so callers keep the legacy path.
 */
export function resolveGridMapScope(
  kind: MapScopeKind,
  provinceCells: number,
  densityCells: number,
  canvasWidth: number,
  canvasHeight: number
): { scope: GridMapScope; width: number; height: number; cellsDesired: number } | null {
  if (kind === "world") return null;
  const target = scopeTargetCells(kind, provinceCells);
  if (!target || !(densityCells > target) || !(canvasWidth > 0) || !(canvasHeight > 0)) return null;
  const factor = Math.sqrt(target / densityCells);
  return {
    scope: { kind, factor, densityCells, canvasWidth, canvasHeight },
    width: Math.max(1, Math.round(canvasWidth * factor)),
    height: Math.max(1, Math.round(canvasHeight * factor)),
    cellsDesired: target
  };
}

/**
 * Cell count the density-calibrated heuristics (towns per populated cell, …) should assume.
 * A scoped grid has few points but full-map density; world grids keep their own count.
 */
export function gridDensityCells(grid: { points: unknown[]; scope?: GridMapScope }): number {
  return grid.scope?.densityCells ?? grid.points.length;
}

/**
 * Applies the scope cap. With `available` (livable cells / candidates) a scoped map keeps at least
 * one where any exist and none where none do; without it only the cap applies.
 */
export function capScopedCount(
  scope: GridMapScope | undefined,
  kind: ScopedCount,
  requested: number,
  available?: number
): number {
  if (!scope) return requested;
  const capped = Math.min(requested, SCOPE_COUNT_CAPS[scope.kind][kind]);
  if (available === undefined) return capped;
  return available > 0 ? Math.max(1, capped) : 0;
}

/** Mapsize share scaled with the canvas, so km per pixel equals the full map's. */
export function scopedMapSize(mapSize: number, scope: GridMapScope | undefined): number {
  return scope ? mapSize * scope.factor : mapSize;
}

/** Polity count for a grid: the option value, capped (and floored at one) on scoped maps. */
export function scopedStatesNumber(grid: { scope?: GridMapScope }, statesNumber: number): number {
  return grid.scope ? capScopedCount(grid.scope, "states", statesNumber, 1) : statesNumber;
}
