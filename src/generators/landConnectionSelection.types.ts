import type { WorldConnectionPair } from "./worldConnectionPair";

export interface NearbyConnectionSettings {
  maxCities: number;
  maxNeighbourChecks: number;
  maxNeighboursPerCity: number;
  maxPairs: number;
  radiusMeters: number;
  firstPairId: number;
}

export type NearbyConnectionResult =
  | {
      status: "selected";
      pairs: readonly WorldConnectionPair[];
      checks: number;
      candidates: number;
      truncated: boolean;
    }
  | { status: "unresolved"; reason: "invalid-input" | "city-budget" | "neighbour-budget"; checks: number };

export interface SharedFacilitySelectionSettings {
  maxGroups: number;
  maxPairsPerGroup: number;
  maxFacilitiesPerGroup: number;
  maxChecks: number;
}

export interface SharedFacilityGroup {
  id: number;
  pairIds: readonly number[];
  facilityIds: readonly number[];
  connectionIds: readonly number[];
}

export type SharedFacilitySelectionResult =
  | { status: "selected"; groups: readonly SharedFacilityGroup[]; checks: number; truncated: boolean }
  | { status: "unresolved"; reason: "invalid-input" | "group-budget"; checks: number };
