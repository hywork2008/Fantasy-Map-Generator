import type { DeckLandCellGeometry, DeckPosition } from "./adapters/deckGeometryTypes";

/**
 * Compact, renderer-owned projection of land polygons. `polygonOffsets` is a CSR-style
 * index into the flat XY coordinate buffer; neither this cache nor its consumers mutate
 * the canonical map mesh.
 */
export interface FlatLandTopology {
  readonly cellIds: Uint32Array;
  readonly polygonOffsets: Uint32Array;
  readonly coordinates: Float32Array;
  /** 1 for a coastal anti-gap fringe entry (see `DeckLandCellGeometry.isFringe`), 0 for a cell's main polygon. */
  readonly isFringe: Uint8Array;
}

export type LandGeometryProjection = ReadonlyArray<DeckLandCellGeometry> | FlatLandTopology;

export function buildFlatLandTopology(geometry: ReadonlyArray<DeckLandCellGeometry>): FlatLandTopology {
  const polygonOffsets = new Uint32Array(geometry.length + 1);
  let coordinateCount = 0;

  for (let index = 0; index < geometry.length; index++) {
    polygonOffsets[index] = coordinateCount;
    coordinateCount += geometry[index].polygon.length * 2;
  }
  polygonOffsets[geometry.length] = coordinateCount;

  const cellIds = new Uint32Array(geometry.length);
  const isFringe = new Uint8Array(geometry.length);
  const coordinates = new Float32Array(coordinateCount);
  let coordinateOffset = 0;
  for (let index = 0; index < geometry.length; index++) {
    const { cellId, polygon } = geometry[index];
    cellIds[index] = cellId;
    isFringe[index] = geometry[index].isFringe ? 1 : 0;
    for (const [x, y] of polygon) {
      coordinates[coordinateOffset++] = x;
      coordinates[coordinateOffset++] = y;
    }
  }

  return { cellIds, polygonOffsets, coordinates, isFringe };
}

export function isFlatLandTopology(projection: LandGeometryProjection): projection is FlatLandTopology {
  return "polygonOffsets" in projection;
}

export function materializeLandPolygon(topology: FlatLandTopology, index: number): DeckPosition[] {
  const polygon: DeckPosition[] = [];
  for (let offset = topology.polygonOffsets[index]; offset < topology.polygonOffsets[index + 1]; offset += 2) {
    polygon.push([topology.coordinates[offset], topology.coordinates[offset + 1]]);
  }
  return polygon;
}
