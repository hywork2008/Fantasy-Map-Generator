/** FMG cell topology, independent of city-window clipping and downstream drainage. */
export interface BurgWaterAccess {
  river: boolean;
  sea: boolean;
  lake: boolean;
  riverId: number | null;
  seaFeatureIds: number[];
  lakeFeatureIds: number[];
  /** Usable port frontages. Several may be true at an estuary; no port means all false. */
  port: { river: boolean; sea: boolean; lake: boolean };
}
