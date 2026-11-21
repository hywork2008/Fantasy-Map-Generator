import type { PlotFabric } from "../types/contracts/burgage";

/**
 * Edge-length multiplier of compact street blocks: the lane-bounded blocks of house-sized lots grow by this factor
 * while the houses keep their size, so the larger blocks leave courts behind their rows. `compact` is the original
 * layout (1); `compact-medium` lays blocks about halfway between compact lots (about 25 x 50 m) and dense burgage
 * street blocks (about 50 x 75 m).
 */
export const COMPACT_BLOCK_SCALE: Record<"compact" | "compact-medium", number> = {
  compact: 1,
  "compact-medium": 1.5
};

/** The compact block edge multiplier of a plot fabric: 1 for compact lots and for burgage plots, which size their
 * own street blocks. */
export function compactBlockScale(fabric: PlotFabric | undefined): number {
  return fabric === "compact-medium" ? COMPACT_BLOCK_SCALE["compact-medium"] : 1;
}
