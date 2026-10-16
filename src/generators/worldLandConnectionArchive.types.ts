import type { LandArchiveBudgets } from "./registeredLandConnectionArchive.types";

export interface WorldLandArchiveBudgets {
  maxJsonCharacters: number;
  rivers: { maxJsonCharacters: number; maxRivers: number };
  connections: LandArchiveBudgets;
}
