export interface ConstructionOperation {
  i: number;
  burgId: number;
  marketId: number;
  masonWorkers: number;
  carpenterWorkers: number;
  /** 0..1 saturating stock of built infrastructure relative to the Burg's current population. */
  buildingStock: number;
  /** Set at generate() time from QuarryOperations; §7.1 decision 5's "地形が建材を排出しない" case. */
  hasQuarryAccess: boolean;
  active: boolean;
}
