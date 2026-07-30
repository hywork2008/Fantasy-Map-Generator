export interface BurgMarketLedger {
  burgId: number;
  marketId: number;
  merchants: BurgMarketMerchantEntry[];
  lastUpdatedTick?: number;
  vacantSinceTick?: number;
  warIntensity?: number;
  warDurationTicks?: number;
}

export interface BurgMarketMerchantEntry {
  characterId: number;
  revenue: number;
  share: number;
  influence?: number;
  organizationId?: number;
}
