import type { InitialSettlementPattern } from "../types/WorldState";

export interface InitialSettlementPatternPreset {
  readonly id: InitialSettlementPattern;
  readonly label: string;
  /** Recommended global population percentage for a newly selected preset. */
  readonly initialPopulationSaturation: number;
  /** Minimum share of suitable cells selected before capacity requirements are met. */
  readonly settledFootprint: number;
  /** Strength of attraction to settlement hubs, from dispersed (0) to clustered (1). */
  readonly settlementClustering: number;
  /** Number of separate viable settlement regions selected before population is placed. */
  readonly settlementRegionCount: readonly [number, number];
}

/**
 * Generation-facing settlement presets. `standard` deliberately maps to the
 * historical all-suitable-cell distribution so old seeds retain their shape.
 */
export const INITIAL_SETTLEMENT_PATTERN_PRESETS: readonly InitialSettlementPatternPreset[] = [
  {
    id: "frontier",
    label: "開拓前線",
    initialPopulationSaturation: 30,
    settledFootprint: 0.3,
    settlementClustering: 0.85,
    settlementRegionCount: [1, 3]
  },
  {
    id: "scattered",
    label: "散在する諸国",
    initialPopulationSaturation: 50,
    settledFootprint: 0.55,
    settlementClustering: 0.55,
    settlementRegionCount: [3, 7]
  },
  {
    id: "standard",
    label: "標準",
    initialPopulationSaturation: 60,
    settledFootprint: 1,
    settlementClustering: 0.2,
    settlementRegionCount: [0, 0]
  },
  {
    id: "dense",
    label: "密集文明圏",
    initialPopulationSaturation: 85,
    settledFootprint: 0.95,
    settlementClustering: 0.4,
    settlementRegionCount: [6, 12]
  }
];

export function getInitialSettlementPatternPreset(pattern: InitialSettlementPattern): InitialSettlementPatternPreset {
  return (
    INITIAL_SETTLEMENT_PATTERN_PRESETS.find(preset => preset.id === pattern) ?? INITIAL_SETTLEMENT_PATTERN_PRESETS[2]
  );
}
