export interface MintLedger {
  stateId: number;
  mintMarketId: number | null;
  currencyDemand: number;
  /** Value of coin estimated to be circulating inside the state. */
  circulation: number;
  /** Minted in the most recent Economy production cycle. */
  lastMintedValue: number;
  /** Cumulative metal-backed monetary issue for historical/debug use. */
  totalMintedValue: number;
  lastSeigniorage: number;
}
