export interface LandArchiveBudgets {
  maxJsonCharacters: number;
  maxFacilities: number;
  maxNodes: number;
  maxEdges: number;
  maxCorridorPieces: number;
  maxGuideNodes: number;
  maxGuideEdges: number;
  /** Caps each saved arc's validation work, independently of untrusted saved settings. */
  maxArcSections: number;
}
