import type { ProductionCycleDiagnostic } from "./productionDiagnostics";
/** A completed Burg worker-loop observation, not a reservation of labor for another producer. */
export interface UrbanCraftCapacity {
  burgId: number;
  marketId: number;
  year: number;
  month: number;
  calibrated: boolean;
  populationRate: number;
  workforcePoints: number;
  chargedPoints: number;
  unusedPoints: number;
  overusedPoints: number;
  textilePoints: number;
  commissionPoints?: number;
  /** Latest worker-loop observation; runtime-only, omitted from saves. */
  productionDiagnostics?: ProductionCycleDiagnostic;
}
