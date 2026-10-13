import type { FeatureGroup, Id } from "../document";

/** A lightweight, local description of one route span pushed across a face. */
export interface FaceRoutePreview {
  group: FeatureGroup;
  /** The replacement boundary only; use this for a focused visual preview. */
  replacementVertices: Id[];
}
