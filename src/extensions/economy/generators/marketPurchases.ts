import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getDeals, getMarkets } from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { type GoodFlowCategory, recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import type { getCraftDomainForGood } from "./guildKnowledgeTypes";
import { applyMarketPressure, customerBuyPrice } from "./marketPricing";
import type { Deal, Market } from "./marketTypes";

export type MarketPurchaseOptions = {
  burg: Burg;
  good: Good;
  units: number;
  budget?: number;
  /** Preserve fractional process materials, instead of rounding to retail hundredths. */
  exactUnits?: boolean;
  /** Explicit live-property acquisition; recipe purchases remain terminal inputs. */
  liveBuyerId?: string;
  flow?: {
    category: GoodFlowCategory;
    guildDomain?: ReturnType<typeof getCraftDomainForGood>;
    relatedGoodId?: number;
  };
};

export function getMarketGood(market: Market, good: Good): Market["goods"][number] {
  const existing = market.goods[good.i];
  if (existing) return existing;

  const initial: Market["goods"][number] = { stock: 0, price: good.value };
  market.goods[good.i] = initial;
  return initial;
}

export function buyMarketGoods(
  { burg, good, units, budget = Infinity, exactUnits = false, liveBuyerId, flow }: MarketPurchaseOptions,
  market = burg.market ? getMarkets().find(market => market.i === burg.market) : undefined
): Deal | null {
  if (!isGoodEnabled(good)) return null;
  if (liveBuyerId && (!good.tags.includes("liveAnimal") || flow?.category === "recipeInput")) return null;
  // Grain's market row is a mirror of the Food Ledger. Milling debits the tradeable
  // surplus itself. A purchase here would shrink the mirror and leave the reserve.
  if (good.tags?.includes("stapleFood")) return null;
  if (!market) return null;

  const marketGood = getMarketGood(market, good);
  const unitPrice = customerBuyPrice(marketGood.price, burg.i, good.i);

  const available = Math.min(units, marketGood.stock, budget / unitPrice);
  const actualUnits = exactUnits ? available : rn(available, 2);
  if (actualUnits < (exactUnits ? 1e-12 : 0.01)) return null;

  const deals = getDeals();
  const deal: Deal = {
    i: deals.length,
    seller: market.i,
    sellerType: "market",
    buyer: burg.i!,
    buyerType: "burg",
    good: good.i,
    units: actualUnits,
    price: unitPrice,
    tax: 0
  };
  deals.push(deal);

  marketGood.stock = exactUnits
    ? Math.max(0, marketGood.stock - actualUnits)
    : rn(Math.max(0, marketGood.stock - actualUnits), 2);
  // A Burg purchase is the Market's cash receipt. Without this counterpart, a Market
  // could pay producers but never replenish the purchasing power required next cycle.
  const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
  treasury.balance = exactUnits
    ? treasury.balance + actualUnits * unitPrice
    : rn(treasury.balance + actualUnits * unitPrice, 2);
  market.marketTreasury = treasury;
  recordGoodFlow({
    direction: "sink",
    category: flow?.category ?? "burgDemand",
    livestockBuyerId: liveBuyerId,
    goodId: good.i,
    units: actualUnits,
    marketId: market.i,
    burgId: burg.i,
    guildDomain: flow?.guildDomain ?? undefined,
    relatedGoodId: flow?.relatedGoodId
  });
  marketGood.price = rn(applyMarketPressure(good.value, marketGood.price, actualUnits), 2);
  return deal;
}
