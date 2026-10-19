export interface MintLedger {
  stateId: number;
  mintMarketId: number | null;
  currencyDemand: number;
  /**
   * Value of coin estimated to be circulating inside the state. Read by
   * `currencySufficiency.ts` to scale market prices and merchant liquidity
   * (docs/plan/economy-coupling-audit.md L7). Under the money-supply model it is the State's real
   * money (`stateMoneySupply.ts`), refreshed every cycle, not a separate count.
   */
  circulation: number;
  /** Minted in the most recent Economy production cycle. */
  lastMintedValue: number;
  /** Cumulative metal-backed monetary issue for historical/debug use. */
  totalMintedValue: number;
  lastSeigniorage: number;
  /**
   * Price level `P` under the money-supply model (docs/plan/money-supply-mint.md §4.3). Absent on
   * older saves, read as 1.
   */
  priceLevel?: number;
  /**
   * Money-supply model: the State's money at the model's start over its profile-based demand, so
   * the starting stock counts as exactly 12 months (docs/plan/money-supply-mint.md §5).
   */
  demandScale?: number;
  /**
   * Money-supply model: months left in which `demandScale` follows the State's money before it is
   * fixed (docs/plan/money-supply-mint.md §11.4). Absent on older saves: the scale stays fixed.
   */
  calibrationMonthsLeft?: number;
  /** Coin worn away in the most recent cycle (money-supply model only). */
  lastWear?: number;
}
