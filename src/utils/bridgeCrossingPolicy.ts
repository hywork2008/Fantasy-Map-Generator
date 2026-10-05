/** Routine multi-span crossings, not unsupported single spans or exceptional state projects.
 * Research and rationale: docs/diagnostics/bridge-crossing-history-2026-10-03.md.
 * Missing/unknown eras use the conservative early-medieval allowance. */
export const BRIDGE_CROSSING_LIMIT_METERS = {
  classicalAntiquity: 300,
  earlyMedieval: 300,
  highMedieval: 500,
  lateMedieval: 750,
  ageOfExploration: 1000,
  maritimeEra: 1000,
  preIndustrialEra: 1500,
  steamEra: 2500,
  industrialChemistryEra: 3500,
  petroleumEra: 5000,
  rocketryEra: 5000
} as const;

export interface BridgeTransport {
  /** Explicit local technology; era capabilities supply missing values. */
  riverBridgeTechnology?: Partial<import("./riverCrossing").RiverBridgeTechnology>;
  /** Total routine crossing allowance, including multiple supported spans. */
  maxBridgeCrossingMeters?: number;
  /** Legacy name: previously compared against the entire channel width. */
  maxBridgeSpanMeters?: number;
}

export function bridgeCrossingLimitForPeriod(period?: string): number {
  return period && Object.hasOwn(BRIDGE_CROSSING_LIMIT_METERS, period)
    ? BRIDGE_CROSSING_LIMIT_METERS[period as keyof typeof BRIDGE_CROSSING_LIMIT_METERS]
    : BRIDGE_CROSSING_LIMIT_METERS.earlyMedieval;
}

/** Old generated 50/1000 m limits are obsolete; retain other explicit legacy overrides.
 * A new explicit limit (including 50 or 1000) always wins. */
export function resolveBridgeCrossingLimit(period?: string, transport?: BridgeTransport): number {
  const explicit = transport?.maxBridgeCrossingMeters;
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) return explicit;
  const legacy = transport?.maxBridgeSpanMeters;
  if (legacy !== undefined && Number.isFinite(legacy) && legacy > 0 && legacy !== 50 && legacy !== 1000) return legacy;
  return bridgeCrossingLimitForPeriod(period);
}
