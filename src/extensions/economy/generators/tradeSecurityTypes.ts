export interface TradeSecurityLedger {
  stateId: number;
  /** Configured 0..1 investment level for state-wide caravan security. */
  investmentLevel: number;
  /** State treasury actually paid for the current production month. */
  monthlyUpkeepPaid: number;
  /** Caravans lost while travelling toward this state during the current production month. */
  lastCaravansLost: number;
}
