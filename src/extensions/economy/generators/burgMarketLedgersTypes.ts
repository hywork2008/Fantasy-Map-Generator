export interface BurgMarketLedger {
  burgId: number;
  marketId: number;
  merchants: BurgMarketMerchantEntry[];
  lastUpdatedTick?: number;
  vacantSinceTick?: number;
  warIntensity?: number;
  warDurationTicks?: number;
  /**
   * The anonymous urban population's own pooled cash at this Burg (docs/plan/economy-coupling-audit.md
   * L2). Phase 1 only credited manufacturing wages here (cumulative, never drained). Phase 2/3 turn
   * it into a real running balance: still credited by wages, now also debited by poll tax collection
   * (taxes-generator.ts, via householdWealth.ts's state-level draw) and by urban food retail
   * purchases (foodLedgerConsumption.ts) — the latter capping how much food a Burg can actually
   * afford, which is what connects an empty purse to L3 food stress. Undefined means "not yet
   * seeded"; see burgMarketLedgers.ts's lazy seed from `EconomyStartProfile.householdWealthPerPopulation`
   * — not literally 0. Renamed from the old write-only `householdIncome` (its cumulative total was
   * never read anywhere), so an old save simply re-seeds fresh rather than inheriting it.
   */
  householdWealth?: number;
}

export interface BurgMarketMerchantEntry {
  characterId: number;
  revenue: number;
  share: number;
  influence?: number;
  organizationId?: number;
}
