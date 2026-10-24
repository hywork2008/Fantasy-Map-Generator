/** Generation lattice. The draw lattice is chosen separately and is not saved. */
export const FIELD_SAMPLE_METERS = 2;

/** Frames larger than small stay on cell elevations until a measurement says otherwise. */
export const FIELD_MODE_MAX_EXTENT_METERS = 1200;

export const RENDER_SPACINGS = [1, 2, 4, 8] as const;
export type RenderSpacing = (typeof RENDER_SPACINGS)[number];

/** Retaining wall and the stair that can still reach the street. Provisional until a town is reviewed. */
export const RETAINING_MAX_METERS = 3;

/** Above this rise/run, ordinary buildings are not placed. About 19 degrees. */
export const UNBUILDABLE_SLOPE = 0.35;

/** Above this, only a small building is placed. */
export const STEEP_BUILDING_SLOPE = 0.15;

/** Footprint area at or under this counts as a small building on a steep slope. */
export const SMALL_LOT_MAX_M2 = 80;

/** Rise/run of 45 degrees. Steeper ground is drawn as rock. */
export const ROCK_SLOPE = 1;

export const CONTOUR_INTERVAL_METERS = 5;

/** Vertices along one side of a draw chunk, including the shared edge. */
export const CHUNK_VERTEX_COUNT = 256;

/**
 * Draw spacing. Mesh build on 2026-10-24 (crag, generation sample 4 m, slope
 * stubbed to 0) stayed under 100 ms at these steps, including 1,200 m at 1 m
 * (81 ms, 1,442,401 vertices) and 600 m at 2 m (8 ms). Seam p95 was about 0.
 * Frame p95 was not measured, so the spacing is not made finer or coarser,
 * and frames above 1,200 m stay on cell elevations.
 * Tiny and small stay at 2 m. Suburb chunks of a small frame step by 2.
 */
export function defaultRenderSpacing(extentMeters: number): RenderSpacing {
  if (extentMeters <= 300) return 1;
  if (extentMeters <= 1200) return 2;
  if (extentMeters <= 2400) return 4;
  return 8;
}

/** Outer chunks use this many draw steps. 1 keeps the whole frame at the fine spacing. */
export function suburbSpacingFactor(extentMeters: number): number {
  return extentMeters > 600 ? 2 : 1;
}

export function fieldModeAllowed(extentMeters: number): boolean {
  return extentMeters <= FIELD_MODE_MAX_EXTENT_METERS + 1e-6;
}

/** Rise/run above which farmland is not ploughed on a height field. */
export const FARM_SLOPE_LIMIT = 0.18;
