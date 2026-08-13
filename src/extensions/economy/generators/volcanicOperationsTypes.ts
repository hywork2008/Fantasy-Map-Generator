/**
 * Burg-anchored volcanic works site (docs/plan/volcanic-biome-goods.md §3.3). Generalizes the
 * original Volcanic-Ash-only operation into a single site that can yield Volcanic Ash, Sulfur,
 * and Obsidian from the same neighbor-cell ring, mirroring how QuarryOperation yields both
 * Stone and Marble from one site.
 */
export interface VolcanicOperation {
  i: number;
  burgId: number;
  marketId: number;
  volcanicWorkers: number;
  /** Neighbor cells tagged "volcanic" (volcanicBarrens/lavaField/volcanicSoil) — gates Ash. */
  ashNeighborCount: number;
  /** Neighbor cells in the barren/rocky core (lavaField or volcanicBarrens) — gates Sulfur. */
  sulfurNeighborCount: number;
  /** Neighbor cells specifically in lavaField (the active/molten core) — gates Obsidian. */
  obsidianNeighborCount: number;
  active: boolean;
}
