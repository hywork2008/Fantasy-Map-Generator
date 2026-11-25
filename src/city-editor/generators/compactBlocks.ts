import type { PlotFabric } from "../types/contracts/burgage";

/**
 * Edge-length multiplier of compact street blocks: the lane-bounded blocks of house-sized lots grow by this factor
 * while the houses keep their size, so the larger blocks leave courts behind their rows. `compact` is the original
 * layout (1); `compact-medium` lays blocks about halfway between compact lots (about 25 x 50 m) and dense burgage
 * street blocks (about 50 x 75 m). The `compact-medium` value is the default of the generation setting
 * `compactBlockScale`.
 */
export const COMPACT_BLOCK_SCALE: Record<"compact" | "compact-medium" | "compact-v2" | "compact-medium-v2", number> = {
  compact: 1,
  "compact-medium": 1.5,
  "compact-v2": 1,
  "compact-medium-v2": 1.5
};
/** Range of the `compactBlockScale` setting: 1 is plain `compact`; beyond 2.2 the coarse street blocks (about 50 m)
 * stop the lane-bounded blocks from growing. */
export const COMPACT_BLOCK_SCALE_MIN = 1.1;
export const COMPACT_BLOCK_SCALE_MAX = 2.2;

/** True for the experimental compact v2 plot patterns (docs/plan/ce-meshless-compact-block-improvements.md). */
export const isCompactV2Fabric = (fabric: PlotFabric | undefined): fabric is "compact-v2" | "compact-medium-v2" =>
  fabric === "compact-v2" || fabric === "compact-medium-v2";

/** True for a compact pattern that takes a block edge multiplier (`compactBlockScale`). */
export const usesCompactBlockScale = (
  fabric: PlotFabric | undefined
): fabric is "compact-medium" | "compact-medium-v2" => fabric === "compact-medium" || fabric === "compact-medium-v2";

/** True for a `compactBlockScale` setting value within its range. */
export const validCompactBlockScale = (scale: unknown): scale is number =>
  typeof scale === "number" &&
  Number.isFinite(scale) &&
  scale >= COMPACT_BLOCK_SCALE_MIN &&
  scale <= COMPACT_BLOCK_SCALE_MAX;

/** The compact block edge multiplier of generation settings: 1 for compact lots and for burgage plots, which size
 * their own street blocks; on `compact-medium` / `compact-medium-v2` the `compactBlockScale` setting (clamped to its
 * range) or its default. */
export function compactBlockScale(settings: { plotFabric?: PlotFabric; compactBlockScale?: number }): number {
  if (!usesCompactBlockScale(settings.plotFabric)) return 1;
  const scale = settings.compactBlockScale;
  return scale !== undefined && Number.isFinite(scale)
    ? Math.min(COMPACT_BLOCK_SCALE_MAX, Math.max(COMPACT_BLOCK_SCALE_MIN, scale))
    : COMPACT_BLOCK_SCALE[settings.plotFabric];
}
