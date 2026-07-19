import type { Grid } from "../types/Grid";
import type { TypedArray } from "../types/PackedGraph";

/**
 * Holds the mutable heightmap draft used by the customization UI. The live
 * grid remains unchanged until finalize applies this draft inside its world
 * transaction, so preview strokes never publish an incoherent map revision.
 */
class HeightmapEditSession {
  private draft: Uint8Array | null = null;

  begin(heights: TypedArray): void {
    if (this.draft) throw new Error("A heightmap edit session is already active");
    this.draft = Uint8Array.from(heights);
  }

  getHeights(fallback: Uint8Array): Uint8Array {
    return this.draft ?? fallback;
  }

  replaceHeights(heights: TypedArray): void {
    if (!this.draft) throw new Error("No heightmap edit session is active");
    this.draft = Uint8Array.from(heights);
  }

  applyTo(grid: Grid): void {
    if (!this.draft) throw new Error("No heightmap edit session is active");
    grid.cells.h = this.draft;
    this.draft = null;
  }

  discard(): void {
    this.draft = null;
  }
}

export const heightmapEditSession = new HeightmapEditSession();

export function beginHeightmapEditSession(grid: Grid): void {
  heightmapEditSession.begin(grid.cells.h as Uint8Array);
}

export function getHeightmapEditingHeights(grid: Grid): Uint8Array {
  return heightmapEditSession.getHeights(grid.cells.h as Uint8Array);
}

/** A graph facade for generators that should read the current heightmap draft. */
export function getHeightmapEditingGrid(grid: Grid): Grid {
  return { ...grid, cells: { ...grid.cells, h: getHeightmapEditingHeights(grid) } };
}

export function replaceHeightmapEditingHeights(heights: TypedArray): void {
  heightmapEditSession.replaceHeights(heights);
}

/** Must be called from the heightmap finalize transaction. */
export function applyHeightmapEditSession(grid: Grid): void {
  heightmapEditSession.applyTo(grid);
}

export function discardHeightmapEditSession(): void {
  heightmapEditSession.discard();
}
