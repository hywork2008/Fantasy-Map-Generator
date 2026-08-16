export type DeckPosition = [number, number];

export interface DeckLandCellGeometry {
  cellId: number;
  polygon: DeckPosition[];
  /**
   * True for a coastal anti-gap sliver appended alongside a cell's main polygon (see
   * `getCoastalFringePolygons` in deckDataAdapters.ts). Every colour overlay built from the shared
   * land topology (state/province/biome/culture/religion/zone/population/danger/temperature/height)
   * re-emits every topology entry with its own per-cell fill colour; re-emitting the fringe too means
   * two overlapping translucent shapes get drawn for that one cell, and their alpha compounds instead
   * of blending once. Only the opaque base "land" fill needs the fringe to close the coastline seam —
   * every other overlay should skip it (see the `isFringe` filter in `appendLandPolygons`).
   */
  isFringe?: boolean;
}
