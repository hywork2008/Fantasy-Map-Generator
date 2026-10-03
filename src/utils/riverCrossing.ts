import { type BridgeTransport, resolveBridgeCrossingLimit } from "./bridgeCrossingPolicy";

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
export const RIVER_CARGO_VESSEL: NavigationVessel = { draftMeters: 0.8, beamMeters: 4, airDraftMeters: 4 };
export const SEA_SAILING_VESSEL: NavigationVessel = { draftMeters: 3.5, beamMeters: 10, airDraftMeters: 25 };
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
export function riverBridgeTechnology(
  period?: string,
  overrides?: Partial<RiverBridgeTechnology>
): RiverBridgeTechnology {
  const modern = ["industrialChemistryEra", "petroleumEra", "rocketryEra"].includes(period ?? "");
  const steam = period === "steamEra";
  const earlyModern = ["ageOfExploration", "maritimeEra", "preIndustrialEra"].includes(period ?? "");
  const medieval = ["highMedieval", "lateMedieval"].includes(period ?? "");
  const defaults: RiverBridgeTechnology = {
    maxSupportedSpanMeters: modern ? 500 : steam ? 150 : earlyModern ? 60 : medieval ? 30 : 20,
    maxPierDepthMeters: modern ? 30 : steam ? 15 : earlyModern ? 8 : 5,
    fixedClearanceMeters: modern ? 30 : steam ? 15 : earlyModern ? 6 : 4,
    movableOpeningMeters: modern ? 80 : steam ? 40 : earlyModern ? 12 : medieval ? 6 : 0
  };
  for (const key of Object.keys(defaults) as (keyof RiverBridgeTechnology)[]) {
    const value = overrides?.[key];
    if (value !== undefined && Number.isFinite(value) && value >= 0) defaults[key] = value;
  }
  return defaults;
}
export function vesselFitsRiver(depth: number | null | undefined, vessel: NavigationVessel): boolean {
  // Legacy rivers without a depth survey retain their old reachability.
  return depth === null || depth === undefined || !Number.isFinite(depth) || depth >= vessel.draftMeters + 0.3;
}
export function planRiverCrossing(input: {
  widthMeters: number;
  depthMeters?: number | null;
  period?: string;
  transport?: BridgeTransport;
  technology?: Partial<RiverBridgeTechnology>;
  vessel?: NavigationVessel;
}): RiverCrossingPlan {
  const tech = riverBridgeTechnology(input.period, input.technology ?? input.transport?.riverBridgeTechnology);
  const depth =
    input.depthMeters != null && Number.isFinite(input.depthMeters) && input.depthMeters >= 0
      ? input.depthMeters
      : null;
  const width = Math.max(0, input.widthMeters);
  const navigation = Boolean(input.vessel && vesselFitsRiver(depth, input.vessel));
  const base = {
    widthMeters: width,
    depthMeters: depth,
    navigationRequired: navigation,
    clearanceMeters: tech.fixedClearanceMeters,
    openingMeters: tech.maxSupportedSpanMeters
  };
  const fallback = (reason: RiverCrossingPlan["reason"]): RiverCrossingPlan => ({
    ...base,
    kind: depth !== null && depth < 1.1 ? "none" : "ferry",
    reason
  });
  if (width > resolveBridgeCrossingLimit(input.period, input.transport)) return fallback("tooWide");
  if (navigation && width > tech.maxSupportedSpanMeters && depth === null) return fallback("unknownDepth");
  if (width > tech.maxSupportedSpanMeters && depth !== null && depth > tech.maxPierDepthMeters)
    return fallback("deepFoundations");
  if (
    !navigation ||
    (tech.fixedClearanceMeters >= input.vessel!.airDraftMeters + 1 &&
      tech.maxSupportedSpanMeters >= input.vessel!.beamMeters + 2)
  ) {
    return {
      ...base,
      kind: "fixedBridge",
      openingMeters: Math.min(width, tech.maxSupportedSpanMeters),
      reason: "fixedClearance"
    };
  }
  if (tech.movableOpeningMeters >= input.vessel!.beamMeters + 2 && width >= input.vessel!.beamMeters + 2) {
    return {
      ...base,
      kind: "movableBridge",
      clearanceMeters: input.vessel!.airDraftMeters + 1,
      openingMeters: Math.min(width, tech.movableOpeningMeters),
      reason: "movableClearance"
    };
  }
  return fallback("navigationClearance");
}

export interface RiverRouteCrossing {
  riverId: number;
  cellId: number;
  point: [number, number];
  plan: RiverCrossingPlan;
}
