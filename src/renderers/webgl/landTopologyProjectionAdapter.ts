import type { DeckLandCellGeometry } from "./adapters/deckDataAdapters";
import { buildFlatLandTopology, type FlatLandTopology } from "./flatLandTopology";

/**
 * Renderer-private seam for CPU-only land topology projection.
 *
 * deck.gl layer construction and DOM/GPU resources remain on the main thread;
 * this adapter isolates only the serializable geometry transformation that a
 * Worker can perform after profiling demonstrates it is worthwhile.
 */
export interface LandTopologyProjectionAdapter {
  project(geometry: ReadonlyArray<DeckLandCellGeometry>): FlatLandTopology;
}

/** The compatibility adapter preserves the existing synchronous render path. */
export class InProcessLandTopologyProjectionAdapter implements LandTopologyProjectionAdapter {
  project(geometry: ReadonlyArray<DeckLandCellGeometry>): FlatLandTopology {
    return buildFlatLandTopology(geometry);
  }
}

export const inProcessLandTopologyProjectionAdapter = new InProcessLandTopologyProjectionAdapter();
