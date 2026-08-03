import type { Character } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import {
  getApi,
  getMarkets,
  getNextPlayerMarketTransactionId,
  getPlayerMarketTransactions,
  getWorldContext,
  setNextPlayerMarketTransactionId,
  setPlayerMarketTransactions
} from "../economyContext";
import { Goods, isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import { getMerchantPortfolio, recordMerchantPlayerSale, syncMarketMerchantPortfolios } from "./merchantPortfolios";
import {
  addWholesaleGoodStock,
  adjustRetailGoodStock,
  getRetailGoodStock,
  reconcileRetailInventory
} from "./retailInventory";
import type { PlayerMarketTransaction } from "./retailInventoryTypes";

export interface PlayerMarketQuote {
  characterId: number;
  burgId: number;
  marketId: number;
  goodId: number;
  merchantId: number;
  merchantName: string;
  direction: "buy" | "sell";
  availableUnits: number;
  playerUnits: number;
  unitPrice: number;
  goodsValue: number;
  salesTax: number;
  totalPaid: number;
}

export interface PlayerMarketCommerceResult {
  ok: boolean;
  message: string;
  receipt?: PlayerMarketTransaction;
  quote?: PlayerMarketQuote;
}

function getTick(): number {
  return Math.max(0, Math.floor(getApi().simulationContext?.tickCount ?? 0));
}

function resolveCharacter(characterId: number): Character | undefined {
  return getWorldContext().pack.characters?.find(character => character.i === characterId && !character.dead);
}

function buildQuote(args: {
  characterId: number;
  goodId: number;
  units: number;
  direction: "buy" | "sell";
}): PlayerMarketCommerceResult {
  const units = rn(args.units, 2);
  if (!(units > 0)) return { ok: false, message: "Enter a positive quantity." };

  const character = resolveCharacter(args.characterId);
  if (!character) return { ok: false, message: "Character not found or dead." };
  if (character.location === undefined) return { ok: false, message: "Character is not located in a burg." };

  const burg = getWorldContext().pack.burgs[character.location];
  if (!burg || burg.removed || !burg.market) return { ok: false, message: "This burg has no active market." };
  const burgId = character.location;
  const market = getMarkets().find(candidate => candidate.i === burg.market);
  if (!market) return { ok: false, message: "This burg's market no longer exists." };
  const good = Goods.get(args.goodId);
  if (!good || !isGoodEnabled(good) || !market.goods[good.i])
    return { ok: false, message: "This good is not traded here." };

  reconcileRetailInventory();
  syncMarketMerchantPortfolios();
  const portfolio = getMerchantPortfolio(market.i, good);
  const merchant = portfolio ? resolveCharacter(portfolio.merchantId) : undefined;
  if (!portfolio || !merchant) return { ok: false, message: "No active merchant holds this product concession." };

  const state = getWorldContext().pack.states[burg.state ?? 0];
  const taxRate = Math.max(0, state?.salesTax ?? 0);
  const unitPrice =
    args.direction === "buy"
      ? Markets.retailBuyPrice(market.goods[good.i].price, burgId, market.i, good.i)
      : Markets.retailSellPrice(market.goods[good.i].price, burgId, market.i, good.i);
  const goodsValue = rn(units * unitPrice, 2);
  const salesTax = rn(goodsValue * taxRate, 2);
  const totalPaid = args.direction === "buy" ? rn(goodsValue + salesTax, 2) : rn(goodsValue - salesTax, 2);
  const shelf = getRetailGoodStock(burgId, market.i, good.i);

  return {
    ok: true,
    message: "Quote ready.",
    quote: {
      characterId: character.i,
      burgId,
      marketId: market.i,
      goodId: good.i,
      merchantId: merchant.i,
      merchantName: merchant.name,
      direction: args.direction,
      availableUnits: args.direction === "buy" ? (shelf?.onHand ?? 0) : (character.inventory?.[good.i] ?? 0),
      playerUnits: character.inventory?.[good.i] ?? 0,
      unitPrice,
      goodsValue,
      salesTax,
      totalPaid
    }
  };
}

export function quotePlayerMarketTrade(args: {
  characterId: number;
  goodId: number;
  units: number;
  direction: "buy" | "sell";
}): PlayerMarketCommerceResult {
  return buildQuote(args);
}

/**
 * Executes a player trade after every failure condition has been checked. No automatic Deal is
 * created: production accounting and player receipts intentionally remain separate ledgers.
 */
export function executePlayerMarketTrade(args: {
  characterId: number;
  goodId: number;
  units: number;
  direction: "buy" | "sell";
}): PlayerMarketCommerceResult {
  const quoted = buildQuote(args);
  if (!quoted.ok || !quoted.quote) return quoted;
  const quote = quoted.quote;
  const character = resolveCharacter(quote.characterId)!;
  const burg = getWorldContext().pack.burgs[quote.burgId]!;
  const market = getMarkets().find(candidate => candidate.i === quote.marketId)!;
  const good = Goods.get(quote.goodId)!;
  const merchant = resolveCharacter(quote.merchantId)!;
  const state = getWorldContext().pack.states[burg.state ?? 0];
  const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
  market.marketTreasury = treasury;

  if (quote.direction === "buy") {
    if (quote.availableUnits + 1e-7 < args.units)
      return { ok: false, message: "Not enough stock on this burg's shelves." };
    if ((character.wealth ?? 0) + 1e-7 < quote.totalPaid)
      return { ok: false, message: "Character cannot afford this purchase." };
  } else {
    if (quote.availableUnits + 1e-7 < args.units)
      return { ok: false, message: "Character does not hold enough of this good." };
    if (Math.max(0, treasury.balance) + 1e-7 < quote.goodsValue) {
      return { ok: false, message: "The market treasury cannot fund this purchase." };
    }
  }

  const units = rn(args.units, 2);
  const merchantProfit =
    quote.direction === "buy"
      ? rn((quote.goodsValue * (getMerchantPortfolio(market.i, good)?.retailMarginBps ?? 0)) / 10000, 2)
      : 0;
  if (quote.direction === "buy") {
    if (!adjustRetailGoodStock(quote.burgId, market.i, good.i, -units))
      return { ok: false, message: "Shelf stock changed; request a new quote." };
    character.inventory ??= {};
    character.inventory[good.i] = (character.inventory[good.i] ?? 0) + units;
    character.wealth = rn((character.wealth ?? 0) - quote.totalPaid, 2);
    merchant.wealth = rn((merchant.wealth ?? 0) + merchantProfit, 2);
    treasury.balance = rn(treasury.balance + quote.goodsValue - merchantProfit, 2);
    market.goods[good.i].stock = rn(Math.max(0, market.goods[good.i].stock - units), 2);
    Markets.applyPlayerTradePressure(market, good, units);
    recordMerchantPlayerSale({
      marketId: market.i,
      merchantId: merchant.i,
      goodId: good.i,
      units,
      grossSales: quote.goodsValue,
      retailProfit: merchantProfit,
      tick: getTick()
    });
  } else {
    character.inventory![good.i] = rn((character.inventory![good.i] ?? 0) - units, 2);
    if (!(character.inventory![good.i] > 0)) delete character.inventory![good.i];
    character.wealth = rn((character.wealth ?? 0) + quote.totalPaid, 2);
    treasury.balance = rn(treasury.balance - quote.goodsValue, 2);
    addWholesaleGoodStock(quote.burgId, market.i, good.i, units);
    market.goods[good.i].stock = rn(market.goods[good.i].stock + units, 2);
    Markets.applyPlayerTradePressure(market, good, -units);
  }
  if (state) state.treasury = rn((state.treasury ?? 0) + quote.salesTax, 2);

  const id = Math.max(1, getNextPlayerMarketTransactionId());
  setNextPlayerMarketTransactionId(id + 1);
  const receipt: PlayerMarketTransaction = {
    id,
    tick: getTick(),
    characterId: character.i,
    burgId: quote.burgId,
    marketId: market.i,
    merchantId: merchant.i,
    direction: quote.direction,
    goodId: good.i,
    units,
    unitPrice: quote.unitPrice,
    goodsValue: quote.goodsValue,
    merchantProfit,
    salesTax: quote.salesTax,
    totalPaid: quote.totalPaid
  };
  getPlayerMarketTransactions().push(receipt);
  setPlayerMarketTransactions(getPlayerMarketTransactions());
  reconcileRetailInventory();
  return { ok: true, message: quote.direction === "buy" ? "Purchase completed." : "Sale completed.", receipt };
}

export function clearPlayerMarketCommerce(): void {
  setPlayerMarketTransactions([]);
  setNextPlayerMarketTransactionId(1);
}
