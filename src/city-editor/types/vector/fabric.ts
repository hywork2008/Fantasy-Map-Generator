import type { Point } from "../primitives";
import type { VectorUrbanAlgorithm } from "./urban";

/** Polylines in integer centimetres relative to the owning record's `origin`. Line `i` spans points
 * `offsets[i]` to `offsets[i + 1]` (or the end); `coords` holds x, y pairs. */
export interface VectorFabricLines {
  widths: number[];
  offsets: number[];
  coords: number[];
}

/** One skeleton block laid out as a CE district: its perimeter and street-block streets. */
export interface VectorFabricDistrict {
  id: string;
  /** Content hash; validation results and caches are keyed on it. */
  hash: string;
  seed: string;
  parameters: {
    lotArea: number;
    laneWidthMeters: number;
    coverage: number;
    streetCellMeters: number;
    streetWidthMeters: number;
  };
  origin: Point;
  /** Adopted outline, packed like one line of `VectorFabricLines`. */
  outline: number[];
  boundaries: { feature: boolean; barrier: boolean; setback: number }[];
  /** Streets are stored unsplit, so rebuilding one street block never rewrites its district. */
  streets: VectorFabricLines;
  /** Explicit joins of street ends to road graph nodes. */
  mouths: { street: number; end: 0 | 1; nodeId: string }[];
  cellIds: string[];
  growthStage?: number;
}

/** One street block: its lanes and the houses adopted in it. Site = footprint = reserved for these houses. */
export interface VectorFabricCell {
  id: string;
  hash: string;
  districtId: string;
  origin: Point;
  ring: number[];
  lanes: VectorFabricLines;
  /** Lane ends lying on district streets, as a parameter along the street. */
  attachments: { lane: number; end: 0 | 1; street: number; t: number }[];
  houses: {
    offsets: number[];
    coords: number[];
    storeys: number[];
    dwellings: number[];
    /** Per house: entrance x, y and access target x, y (centimetres from `origin`). */
    entrances: number[];
    /** CE occupancy draws that decided which lots were used. */
    draws: number[];
  };
  /** House indices replaced by manual placements. */
  detached: number[];
  inside?: boolean;
}

export interface VectorFabric {
  algorithm: VectorUrbanAlgorithm;
  districts: Record<string, VectorFabricDistrict>;
  cells: Record<string, VectorFabricCell>;
}
