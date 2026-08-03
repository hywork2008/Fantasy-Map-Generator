import type { GoodsTradeAffinity } from "./marketFlowBudget";

/** Stock immediately available over the counter in one burg. */
export interface RetailGoodStock {
  onHand: number;
  target: number;
  lastRestockedTick: number;
}

export interface BurgRetailInventory {
  burgId: number;
  marketId: number;
  goods: Record<number, RetailGoodStock>;
}

/** Market-owned stock at a burg's collection point or wholesale depot. */
export interface BurgWholesaleInventory {
  burgId: number;
  marketId: number;
  goods: Record<number, number>;
}

/** Aggregated internal-market cargo; it is not a Character or a cross-market caravan. */
export interface MarketShipment {
  id: number;
  marketId: number;
  goodId: number;
  units: number;
  originBurgId: number;
  destinationBurgId: number;
  dispatchedTick: number;
  arrivalTick: number;
}

/** A product-family concession held by a real Market Manager or Rival Merchant Character. */
export interface MarketMerchantPortfolio {
  marketId: number;
  merchantId: number;
  affinities: GoodsTradeAffinity[];
  /** 1,200 means a 12% retail margin. */
  retailMarginBps: number;
}

/** Sparse ledger: rows exist only after a player has traded this market/merchant/good combination. */
export interface MerchantGoodSalesLedger {
  marketId: number;
  merchantId: number;
  goodId: number;
  playerUnitsSold: number;
  playerGrossSales: number;
  playerRetailProfit: number;
  lastTransactionTick: number;
}

export interface PlayerMarketTransaction {
  id: number;
  tick: number;
  characterId: number;
  burgId: number;
  marketId: number;
  merchantId: number;
  direction: "buy" | "sell";
  goodId: number;
  units: number;
  unitPrice: number;
  goodsValue: number;
  merchantProfit: number;
  salesTax: number;
  totalPaid: number;
}

export interface RetailInventoryInvariantIssue {
  marketId: number;
  goodId: number;
  expected: number;
  actual: number;
}
