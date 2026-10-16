import type { RiverPoint } from "../services/riverGeometry";

export interface RegisteredRouteSceneSettings {
  /** Presentation scope only; the entire registered network is still validated. */
  connectionIds?: readonly number[];
  /** Uniform physical conversion only; never stretch or rotate a bridge. */
  metresPerUnit: number;
  originMeters: RiverPoint;
  maxChordErrorMeters: number;
  maxArcSections: number;
  maxPieces: number;
  maxPaths: number;
  maxPolygons: number;
}
