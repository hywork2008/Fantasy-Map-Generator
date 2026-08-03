import type { Character } from "../../characters/characterTypes";
import {
  getMarketMerchantPortfolios,
  getMarkets,
  getMerchantGoodSalesLedgers,
  getWorldContext,
  setMarketMerchantPortfolios,
  setMerchantGoodSalesLedgers
} from "../economyContext";
import type { Good } from "./goodsGeneratorTypes";
import { type GoodsTradeAffinity, inferGoodsTradeAffinity } from "./marketFlowBudget";
import type { Market } from "./marketTypes";
import type { MarketMerchantPortfolio, MerchantGoodSalesLedger } from "./retailInventoryTypes";

const AFFINITIES: readonly GoodsTradeAffinity[] = ["localBulk", "tradeStaple", "luxury", "military"];
export const DEFAULT_RETAIL_MARGIN_BPS = 1200;

function getLivingCharacter(id: number | undefined): Character | undefined {
  if (id === undefined) return undefined;
  return getWorldContext().pack.characters?.find(character => character.i === id && !character.dead);
}

function getEligibleMerchantIds(market: Market): number[] {
  const ids = [market.managerCharacterId, ...(market.rivalCharacterIds ?? [])];
  return ids.filter((id, index): id is number => ids.indexOf(id) === index && Boolean(getLivingCharacter(id)));
}

/**
 * Keep one stable concession per product family. It intentionally does not model same-good
 * price competition: the player receipt can therefore name exactly one profit recipient.
 */
export function syncMarketMerchantPortfolios(markets: readonly Market[] = getMarkets()): void {
  const current = getMarketMerchantPortfolios();
  // Index once — monthly sync used to linear-scan `current` per market × affinity.
  const byMarketMerchant = new Map<string, MarketMerchantPortfolio>();
  const byMarketAffinity = new Map<string, MarketMerchantPortfolio>();
  for (const portfolio of current) {
    byMarketMerchant.set(`${portfolio.marketId}:${portfolio.merchantId}`, portfolio);
    for (const affinity of portfolio.affinities) {
      byMarketAffinity.set(`${portfolio.marketId}:${affinity}`, portfolio);
    }
  }

  const next: MarketMerchantPortfolio[] = [];
  const validMerchantKeys = new Set<string>();

  for (const market of markets) {
    if (!market) continue;
    const merchantIds = getEligibleMerchantIds(market);
    if (!merchantIds.length) continue;
    const assigned = new Map<number, GoodsTradeAffinity[]>();
    for (const merchantId of merchantIds) assigned.set(merchantId, []);

    for (let affinityIndex = 0; affinityIndex < AFFINITIES.length; affinityIndex++) {
      const affinity = AFFINITIES[affinityIndex];
      const existing = byMarketAffinity.get(`${market.i}:${affinity}`);
      const merchantId =
        existing && assigned.has(existing.merchantId)
          ? existing.merchantId
          : merchantIds[affinityIndex % merchantIds.length];
      assigned.get(merchantId)?.push(affinity);
    }

    for (const merchantId of merchantIds) {
      const affinities = assigned.get(merchantId) ?? [];
      if (!affinities.length) continue;
      const existing = byMarketMerchant.get(`${market.i}:${merchantId}`);
      next.push({
        marketId: market.i,
        merchantId,
        affinities,
        retailMarginBps: existing?.retailMarginBps ?? DEFAULT_RETAIL_MARGIN_BPS
      });
      validMerchantKeys.add(`${market.i}:${merchantId}`);
    }
  }

  setMarketMerchantPortfolios(next);
  setMerchantGoodSalesLedgers(
    getMerchantGoodSalesLedgers().filter(ledger => validMerchantKeys.has(`${ledger.marketId}:${ledger.merchantId}`))
  );
}

export function getMerchantPortfolio(marketId: number, good: Good): MarketMerchantPortfolio | undefined {
  const affinity = inferGoodsTradeAffinity(good);
  return getMarketMerchantPortfolios().find(
    portfolio =>
      portfolio.marketId === marketId &&
      portfolio.affinities.includes(affinity) &&
      Boolean(getLivingCharacter(portfolio.merchantId))
  );
}

export function recordMerchantPlayerSale(args: {
  marketId: number;
  merchantId: number;
  goodId: number;
  units: number;
  grossSales: number;
  retailProfit: number;
  tick: number;
}): MerchantGoodSalesLedger {
  const ledgers = getMerchantGoodSalesLedgers();
  let ledger = ledgers.find(
    row => row.marketId === args.marketId && row.merchantId === args.merchantId && row.goodId === args.goodId
  );
  if (!ledger) {
    ledger = {
      marketId: args.marketId,
      merchantId: args.merchantId,
      goodId: args.goodId,
      playerUnitsSold: 0,
      playerGrossSales: 0,
      playerRetailProfit: 0,
      lastTransactionTick: args.tick
    };
    ledgers.push(ledger);
  }
  ledger.playerUnitsSold += args.units;
  ledger.playerGrossSales += args.grossSales;
  ledger.playerRetailProfit += args.retailProfit;
  ledger.lastTransactionTick = args.tick;
  return ledger;
}

export function clearMarketMerchantPortfolios(): void {
  setMarketMerchantPortfolios([]);
  setMerchantGoodSalesLedgers([]);
}
