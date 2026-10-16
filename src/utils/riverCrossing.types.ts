/** Game capability defaults, not dates of invention or engineering design limits. */
export interface RiverBridgeTechnology {
  maxSupportedSpanMeters: number;
  maxPierDepthMeters: number;
  fixedClearanceMeters: number;
  movableOpeningMeters: number;
}

export interface NavigationVessel {
  draftMeters: number;
  beamMeters: number;
  airDraftMeters: number;
}

export interface RiverCrossingPlan {
  kind: "fixedBridge" | "movableBridge" | "ferry" | "none";
  widthMeters: number;
  depthMeters: number | null;
  navigationRequired: boolean;
  clearanceMeters: number;
  openingMeters: number;
  reason:
    | "fixedClearance"
    | "movableClearance"
    | "tooWide"
    | "deepFoundations"
    | "navigationClearance"
    | "unknownDepth"
    | "shallowWater";
}

export interface RiverRouteCrossing {
  riverId: number;
  cellId: number;
  point: [number, number];
  plan: RiverCrossingPlan;
}
