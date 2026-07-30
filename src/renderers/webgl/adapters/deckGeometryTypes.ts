export type DeckPosition = [number, number];

export interface DeckLandCellGeometry {
  cellId: number;
  polygon: DeckPosition[];
}
