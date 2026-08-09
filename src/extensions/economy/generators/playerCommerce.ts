import type { Character } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import {
  getApi,
  getCharacterInventoryCostBases,
  getGoods,
  getMarkets,
  getNextPlayerMarketTransactionId,
  getPlayerMarketTransactions,
  getWorldContext,
  setCharacterInventoryCostBases,
  setNextPlayerMarketTransactionId,
  setPlayerMarketTransactions
} from "../economyContext";
import { syncStapleFoodMarketStock } from "./foodCoLoad";
import { getStapleFoodGood } from "./foodProduction";
import { Goods, isGoodEnabled } from "./goods-generator";
import { floorToRetailLot, formatRetailQuantity, getRetailLotSize, isRetailLotQuantity } from "./goodsTradeLots";
import { Markets } from "./markets-generator";
import { getMerchantPortfolio, recordMerchantPlayerSale, syncMarketMerchantPortfolios } from "./merchantPortfolios";
import {
  addWholesaleGoodStock,
  getBurgTradeableGoodStock,
  reconcileRetailInventory,
  removeBurgTradeableGoodStock
} from "./retailInventory";
import type { CharacterInventoryCostBasis, PlayerMarketTransaction } from "./retailInventoryTypes";
import { drawTradeableStapleCrop, getTradeableStapleCropUnits, returnTradeableStapleCrop } from "./stapleCropInventory";

export interface PlayerMarketQuote {
  characterId: number;
  burgId: number;
  marketId: number;
  goodId: number;
  merchantId: number;
  merchantName: string;
  direction: "buy" | "sell";
  /** Quantity requested after validation against the Good's smallest retail lot. */
  units: number;
  retailLotSize: number;
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

function getLedgerBackedStapleCropUnits(market: ReturnType<typeof getMarkets>[number], goodId: number): number | null {
  return market.foodLedger ? getTradeableStapleCropUnits(market.foodLedger, goodId) : null;
}

function isLedgerBackedStapleCrop(market: ReturnType<typeof getMarkets>[number], goodId: number): boolean {
  return getLedgerBackedStapleCropUnits(market, goodId) !== null;
}

function getMarketPrice(market: ReturnType<typeof getMarkets>[number], goodId: number, fallback: number): number {
  return market.goods[goodId]?.price ?? fallback;
}

function syncStapleFoodSummary(market: ReturnType<typeof getMarkets>[number]): void {
  const stapleFood = getStapleFoodGood();
  if (!stapleFood) return;
  syncStapleFoodMarketStock(market, stapleFood.i, stapleFood.value);
}

function updateInventoryCostBasis(
  characterId: number,
  goodId: number,
  units: number,
  direction: "buy" | "sell",
  unitCost: number,
  remainingInventory: number
): void {
  const bases = getCharacterInventoryCostBases();
  const index = bases.findIndex(basis => basis.characterId === characterId && basis.goodId === goodId);
  const existing = index === -1 ? undefined : bases[index];

  if (direction === "buy") {
    const knownUnits = existing?.units ?? 0;
    const averageUnitCost =
      knownUnits > 0 && existing
        ? rn((knownUnits * existing.averageUnitCost + units * unitCost) / (knownUnits + units), 2)
        : rn(unitCost, 2);
    const next: CharacterInventoryCostBasis = {
      characterId,
      goodId,
      units: rn(knownUnits + units, 2),
      averageUnitCost
    };
    if (existing) bases[index] = next;
    else bases.push(next);
  } else if (existing) {
    existing.units = rn(Math.max(0, Math.min(remainingInventory, existing.units - units)), 2);
    if (!(existing.units > 0)) bases.splice(index, 1);
  }
  setCharacterInventoryCostBases(bases);
}

function buildQuote(args: {
  characterId: number;
  goodId: number;
  units: number;
  direction: "buy" | "sell";
}): PlayerMarketCommerceResult {
  if (!(args.units > 0)) return { ok: false, message: "Enter a positive quantity." };

  const character = resolveCharacter(args.characterId);
  if (!character) return { ok: false, message: "Character not found or dead." };
  if (character.location === undefined) return { ok: false, message: "Character is not located in a burg." };

  const burg = getWorldContext().pack.burgs[character.location];
  if (!burg || burg.removed || !burg.market) return { ok: false, message: "This burg has no active market." };
  const burgId = character.location;
  const market = getMarkets().find(candidate => candidate.i === burg.market);
  if (!market) return { ok: false, message: "This burg's market no longer exists." };
  const good = Goods.get(args.goodId);
  if (!good || !isGoodEnabled(good)) return { ok: false, message: "This good is not traded here." };
  if (good.tags.includes("stapleFood")) {
    return { ok: false, message: "Grain is a food-ledger summary; buy a named staple crop instead." };
  }
  const ledgerBackedStapleCrop = good.tags.includes("stapleCrop") && isLedgerBackedStapleCrop(market, good.i);
  if (!market.goods[good.i] && !ledgerBackedStapleCrop) return { ok: false, message: "This good is not traded here." };
  const retailLotSize = getRetailLotSize(good);
  if (!isRetailLotQuantity(args.units, retailLotSize)) {
    return {
      ok: false,
      message: `This good is traded in increments of ${formatRetailQuantity(retailLotSize, retailLotSize)} ${good.unit}.`
    };
  }
  const units = floorToRetailLot(args.units, retailLotSize);

  reconcileRetailInventory();
  syncMarketMerchantPortfolios();
  const portfolio = getMerchantPortfolio(market.i, good);
  const merchant = portfolio ? resolveCharacter(portfolio.merchantId) : undefined;
  if (!portfolio || !merchant) return { ok: false, message: "No active merchant holds this product concession." };

  const state = getWorldContext().pack.states[burg.state ?? 0];
  const taxRate = Math.max(0, state?.salesTax ?? 0);
  const midPrice = getMarketPrice(market, good.i, good.value);
  const unitPrice =
    args.direction === "buy"
      ? Markets.retailBuyPrice(midPrice, burgId, market.i, good.i)
      : Markets.retailSellPrice(midPrice, burgId, market.i, good.i);
  const goodsValue = rn(units * unitPrice, 2);
  const salesTax = rn(goodsValue * taxRate, 2);
  const totalPaid = args.direction === "buy" ? rn(goodsValue + salesTax, 2) : rn(goodsValue - salesTax, 2);
  const localStock = ledgerBackedStapleCrop
    ? (getLedgerBackedStapleCropUnits(market, good.i) ?? 0)
    : getBurgTradeableGoodStock(burgId, market.i, good.i);

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
      units,
      retailLotSize,
      availableUnits: floorToRetailLot(
        args.direction === "buy" ? localStock : (character.inventory?.[good.i] ?? 0),
        retailLotSize
      ),
      playerUnits: floorToRetailLot(character.inventory?.[good.i] ?? 0, retailLotSize),
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
 * Old saves may contain player-purchased aggregate Grain. Its source crop was
 * not recorded, so use the same Wheat fallback as the Food Ledger migration
 * and retain its purchase-cost basis.
 */
export function migrateLegacyPlayerGrainInventory(): boolean {
  const grain = getStapleFoodGood();
  const wheat = getGoods().find(good => good.name === "Wheat" && good.tags.includes("stapleCrop"));
  const characters = getWorldContext().pack.characters;
  if (!grain || !wheat || !characters?.length) return false;

  const bases = getCharacterInventoryCostBases();
  let changed = false;
  for (const character of characters) {
    const units = character.inventory?.[grain.i] ?? 0;
    if (!(units > 0)) continue;

    character.inventory![wheat.i] = rn((character.inventory![wheat.i] ?? 0) + units, 2);
    delete character.inventory![grain.i];

    const grainBasisIndex = bases.findIndex(basis => basis.characterId === character.i && basis.goodId === grain.i);
    if (grainBasisIndex !== -1) {
      const grainBasis = bases[grainBasisIndex]!;
      const wheatBasisIndex = bases.findIndex(basis => basis.characterId === character.i && basis.goodId === wheat.i);
      const wheatBasis = wheatBasisIndex === -1 ? undefined : bases[wheatBasisIndex];
      const knownWheatUnits = wheatBasis?.units ?? 0;
      const combinedUnits = knownWheatUnits + grainBasis.units;
      const nextBasis: CharacterInventoryCostBasis = {
        characterId: character.i,
        goodId: wheat.i,
        units: rn(combinedUnits, 2),
        averageUnitCost:
          combinedUnits > 0
            ? rn(
                (knownWheatUnits * (wheatBasis?.averageUnitCost ?? 0) + grainBasis.units * grainBasis.averageUnitCost) /
                  combinedUnits,
                2
              )
            : 0
      };
      if (wheatBasisIndex === -1) bases.push(nextBasis);
      else bases[wheatBasisIndex] = nextBasis;
      bases.splice(grainBasisIndex, 1);
    }
    document.dispatchEvent(
      new CustomEvent("fmg:character-inventory-changed", { detail: { characterId: character.i } })
    );
    changed = true;
  }
  if (changed) setCharacterInventoryCostBases(bases);
  return changed;
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
  const ledgerBackedStapleCrop = good.tags.includes("stapleCrop") && isLedgerBackedStapleCrop(market, good.i);
  const state = getWorldContext().pack.states[burg.state ?? 0];
  const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
  market.marketTreasury = treasury;

  if (quote.direction === "buy") {
    if (quote.availableUnits + 1e-7 < quote.units)
      return { ok: false, message: "Not enough stock is available in this burg." };
    if ((character.wealth ?? 0) + 1e-7 < quote.totalPaid)
      return { ok: false, message: "Character cannot afford this purchase." };
  } else {
    if (quote.availableUnits + 1e-7 < quote.units)
      return { ok: false, message: "Character does not hold enough of this good." };
    if (Math.max(0, treasury.balance) + 1e-7 < quote.goodsValue) {
      return { ok: false, message: "The market treasury cannot fund this purchase." };
    }
  }

  const units = quote.units;
  const merchantProfit =
    quote.direction === "buy"
      ? rn((quote.goodsValue * (getMerchantPortfolio(market.i, good)?.retailMarginBps ?? 0)) / 10000, 2)
      : 0;
  if (quote.direction === "buy") {
    if (ledgerBackedStapleCrop) {
      const drawn = drawTradeableStapleCrop(market.foodLedger!, good.i, units);
      if (drawn + 1e-7 < units) return { ok: false, message: "Local stock changed; request a new quote." };
      syncStapleFoodSummary(market);
    } else if (!removeBurgTradeableGoodStock(quote.burgId, market.i, good.i, units)) {
      return { ok: false, message: "Local stock changed; request a new quote." };
    }
    character.inventory ??= {};
    character.inventory[good.i] = (character.inventory[good.i] ?? 0) + units;
    updateInventoryCostBasis(character.i, good.i, units, "buy", quote.totalPaid / units, character.inventory[good.i]);
    character.wealth = rn((character.wealth ?? 0) - quote.totalPaid, 2);
    merchant.wealth = rn((merchant.wealth ?? 0) + merchantProfit, 2);
    treasury.balance = rn(treasury.balance + quote.goodsValue - merchantProfit, 2);
    if (!ledgerBackedStapleCrop) market.goods[good.i].stock = rn(Math.max(0, market.goods[good.i].stock - units), 2);
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
    updateInventoryCostBasis(character.i, good.i, units, "sell", quote.unitPrice, character.inventory![good.i] ?? 0);
    character.wealth = rn((character.wealth ?? 0) + quote.totalPaid, 2);
    treasury.balance = rn(treasury.balance - quote.goodsValue, 2);
    if (ledgerBackedStapleCrop) {
      returnTradeableStapleCrop(market.foodLedger!, good.i, units, quote.unitPrice);
      syncStapleFoodSummary(market);
    } else {
      addWholesaleGoodStock(quote.burgId, market.i, good.i, units);
      market.goods[good.i].stock = rn(market.goods[good.i].stock + units, 2);
    }
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
  document.dispatchEvent(new CustomEvent("fmg:character-inventory-changed", { detail: { characterId: character.i } }));
  reconcileRetailInventory();
  return { ok: true, message: quote.direction === "buy" ? "Purchase completed." : "Sale completed.", receipt };
}

export function clearPlayerMarketCommerce(): void {
  setPlayerMarketTransactions([]);
  setCharacterInventoryCostBases([]);
  setNextPlayerMarketTransactionId(1);
}
