export interface BurgMarketLedger {
  burgId: number;
  marketId: number;
  merchants: BurgMarketMerchantEntry[];
  lastUpdatedTick?: number;
  vacantSinceTick?: number;
  warIntensity?: number;
  warDurationTicks?: number;
  /**
   * Cumulative manufacturing wages paid to anonymous urban labor at this Burg.
   * Phase 1 of docs/plan/economy-coupling-audit.md L2 writes here; Phase 2 will
   * drain it into `householdPurse`. Missing on old saves — treat as 0.
   */
  householdIncome?: number;
}

export interface BurgMarketMerchantEntry {
  characterId: number;
  revenue: number;
  share: number;
  influence?: number;
  organizationId?: number;
}
