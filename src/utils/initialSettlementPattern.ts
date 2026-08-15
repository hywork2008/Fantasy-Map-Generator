import type { InitialSettlementPattern } from "../types/WorldState";

export const DEFAULT_INITIAL_SETTLEMENT_PATTERN: InitialSettlementPattern = "standard";

/** Patterns that leave unclaimed land and run the annual frontier expansion loop. */
const FRONTIER_EXPANSION_PATTERNS: ReadonlySet<InitialSettlementPattern> = new Set([
  "frontier",
  "marches",
  "scattered"
]);

/** Converts saved or UI input to a supported initial settlement distribution. */
export function normalizeInitialSettlementPattern(value: unknown): InitialSettlementPattern {
  if (
    value === "frontier" ||
    value === "marches" ||
    value === "scattered" ||
    value === "standard" ||
    value === "dense"
  ) {
    return value;
  }
  return DEFAULT_INITIAL_SETTLEMENT_PATTERN;
}

/** True for settlement presets that keep wilderness and expand through Advance Time. */
export function isFrontierExpansionPattern(
  pattern: InitialSettlementPattern | undefined
): pattern is "frontier" | "marches" | "scattered" {
  return pattern !== undefined && FRONTIER_EXPANSION_PATTERNS.has(pattern);
}
