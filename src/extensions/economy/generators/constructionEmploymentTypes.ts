/**
 * Burg-anchored construction / housing operation (docs/plan/urban-housing-system.md).
 * After any normalize pass, `dwellingStock` is always a finite number and `buildingStock` is
 * write-through saturation of dwellings vs required.
 */
export interface ConstructionOperation {
  i: number;
  burgId: number;
  marketId: number;
  masonWorkers: number;
  carpenterWorkers: number;
  /**
   * Write-through 0..1 saturation: always clamp01(dwellingStock / requiredDwellings).
   * Retained so productivity / effectiveCapacity / UI stay stable.
   * MUST NOT be advanced by an independent `+= growth` path.
   */
  buildingStock: number;
  /** Set at generate() time from QuarryOperations. */
  hasQuarryAccess: boolean;
  active: boolean;
  /**
   * Built permanent dwellings (aggregate units). Source of truth for housing (K13).
   */
  dwellingStock: number;
  /**
   * Optional civic/monument share 0..1. Deferred: v1 does not advance this.
   */
  civicStock?: number;
}

/**
 * Archive / pre-normalize shape: old saves lack `dwellingStock` (K15).
 */
export type LegacyConstructionOperation = Omit<ConstructionOperation, "dwellingStock"> & {
  dwellingStock?: number;
};
