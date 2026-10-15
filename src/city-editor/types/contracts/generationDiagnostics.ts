export interface GenerationSample {
  /** Nonfatal old-wall rejection details (the city may fall back to one wall). */
  wallDefenseIssues?: string[];
  /** FMG frame roads that remain unattached after safe repair. */
  roadConnectionIssues?: { sourceIndex: number; routeId: number; branchIndex: number }[];
  routing?: RoadRoutingTrace[];
  fixedApproaches?: import("./automaticFixedApproaches").AutomaticFixedApproachResult["diagnostics"];
  housingFit?: import("./fitImportedHousing").HousingFitStats;
  /** On the `accepted-attempt` sample: how to start a later roll of the same input at this attempt. */
  retry?: import("../generation").GenerationRetry;
  phase: string;
  elapsedMs: number;
  attempt: number;
  counts?: Record<string, number>;
  failure?: GenerationFailure;
}

export interface RoadRoutingTrace {
  routeId?: string;
  outside: boolean;
  plannedPoints: number[][];
  waypoints: string[];
  status: "connected" | "failed";
  reason?: string;
  path: string[];
  edges?: string[];
  searches: Array<{
    start: string;
    end: string;
    classification: "planned" | "current-curtain";
    reachedCount: number;
    partialPath: string[];
    partialEdges: string[];
    blocked: Array<{ edge: string; from: string; to: string; reason: string }>;
  }>;
}

/** Transient diagnostics; never stored in a city document or undo history. */
export interface GenerationFailure {
  /** Machine-readable cause, e.g. `urban-area-too-small`. */
  reason: string;
  /** One-line description of what went wrong. */
  message: string;
  /** Extra "how" lines: ids, thresholds, validate() messages. */
  details?: string[];
  routing?: RoadRoutingTrace[];
}
