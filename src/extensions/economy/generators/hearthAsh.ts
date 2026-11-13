/**
 * Town hearth ash (docs/plan/wood-ash-potash.md). The Wood a town's households burn for heat and
 * cooking leaves its ash; ash collectors bought it for the soap boilers and potash makers. The
 * market buys it from the town households at its price, but only as far as its own Ash use wants:
 * unsold ash went on the fields, so it never piles up in the market. Rural hearths keep their ash
 * for lye and manure.
 */

import { rn } from "../../hostUtils";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import type { Good } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Market } from "./marketTypes";
import { ASH_LOTS_PER_WOOD_LOT, POTASH_ASH_SACKS_PER_BARREL } from "./woodRecipeContracts";

/** Months of the market's Ash use it keeps in stock from the hearths. */
export const HEARTH_ASH_RESERVE_MONTHS = 3;
/** Ash the market keeps even before any use: one barrel of potash, so the first boiling can start. */
export const HEARTH_ASH_MIN_STOCK_SACKS = POTASH_ASH_SACKS_PER_BARREL;
/** Weight of the latest month in the running monthly Ash use. */
const ASH_USE_SMOOTHING = 0.5;

export interface HearthAshLedger {
  /** Ash drawn from the market (recipes and town demand) since the last heating settlement. */
  useThisMonth: number;
  /** Running monthly Ash use. */
  monthlyUse: number;
  /** Hearth ash bought from the town households at the last settlement. */
  collected: number;
  cumulativeCollected: number;
}

function ledgerOf(market: Market): HearthAshLedger {
  market.hearthAshLedger ??= { useThisMonth: 0, monthlyUse: 0, collected: 0, cumulativeCollected: 0 };
  return market.hearthAshLedger;
}

/** Counts Ash the market's recipes and towns drew; called from the goods-flow ledger. */
export function recordAshUse(market: Market, units: number): void {
  if (!(units > 0)) return;
  const ledger = ledgerOf(market);
  ledger.useThisMonth = rn(ledger.useThisMonth + units, 4);
}

/** Sacks the market buys from hearths that burned `woodLots` this month, given its stock and use. */
export function getHearthAshPurchase(woodLots: number, stock: number, monthlyUse: number): number {
  const available = Math.max(0, woodLots) * ASH_LOTS_PER_WOOD_LOT;
  const target = Math.max(HEARTH_ASH_MIN_STOCK_SACKS, HEARTH_ASH_RESERVE_MONTHS * Math.max(0, monthlyUse));
  return Math.min(available, Math.max(0, target - Math.max(0, stock)));
}

/**
 * Rolls the month's Ash use and buys the towns' hearth ash for the market. `woodByBurg` is the
 * Wood each town burned this month; the money goes to each town in proportion to its Wood.
 */
export function settleHearthAsh(market: Market, ash: Good | undefined, woodByBurg: ReadonlyMap<number, number>): void {
  const ledger = ledgerOf(market);
  ledger.monthlyUse = rn(ledger.monthlyUse * (1 - ASH_USE_SMOOTHING) + ledger.useThisMonth * ASH_USE_SMOOTHING, 4);
  ledger.useThisMonth = 0;
  ledger.collected = 0;
  if (!ash) return;
  let woodLots = 0;
  for (const units of woodByBurg.values()) woodLots += units;
  const row = market.goods[ash.i] ?? { stock: 0, price: ash.value };
  const price = Math.max(0, row.price ?? ash.value);
  let sacks = getHearthAshPurchase(woodLots, row.stock, ledger.monthlyUse);
  const treasury = market.marketTreasury;
  if (price > 0) sacks = Math.min(sacks, Math.max(0, treasury?.balance ?? 0) / price);
  sacks = rn(sacks, 4);
  if (!(sacks > 0) || !(woodLots > 0)) return;

  row.stock = rn(row.stock + sacks, 4);
  market.goods[ash.i] = row;
  recordGoodFlow({ direction: "source", category: "hearthAsh", goodId: ash.i, units: sacks, marketId: market.i });
  const paid = rn(sacks * price, 4);
  if (treasury && paid > 0) {
    treasury.balance = rn(treasury.balance - paid, 4);
    for (const [burgId, units] of woodByBurg) {
      if (units > 0) creditHouseholdWealth(burgId, rn((paid * units) / woodLots, 4));
    }
  }
  ledger.collected = sacks;
  ledger.cumulativeCollected = rn(ledger.cumulativeCollected + sacks, 4);
}
