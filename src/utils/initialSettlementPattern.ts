import type { InitialSettlementPattern } from "../types/WorldState";

export const DEFAULT_INITIAL_SETTLEMENT_PATTERN: InitialSettlementPattern = "standard";

/** Converts saved or UI input to a supported initial settlement distribution. */
export function normalizeInitialSettlementPattern(value: unknown): InitialSettlementPattern {
  if (value === "frontier" || value === "scattered" || value === "standard" || value === "dense") return value;
  return DEFAULT_INITIAL_SETTLEMENT_PATTERN;
}
