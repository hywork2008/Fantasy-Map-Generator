/**
 * A market founded mid-game takes over towns and farms from older markets. The grain and salt the
 * older market held for those people go with them, only as much as they need until the next
 * harvest (docs/plan/start-provisioning.md §4); the older market keeps its surplus. Otherwise the
 * new market's towns opened on an empty granary and went unfed for their first month.
 */
import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext, isEconomyContextReady } from "../economyContext";
import { emptyFoodLedger } from "./foodProduction";
import type { FoodLedger, Market } from "./marketTypes";
import { transferStapleCropShare } from "./stapleCropInventory";

function storedGrain(ledger: FoodLedger | undefined): number {
  if (!ledger) return 0;
  return ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2 + (ledger.foodStockAge3 ?? 0);
}

/** A market whose granary has never held or bought grain. */
function isUnstocked(market: Market): boolean {
  return !market.foodLedger || (!(storedGrain(market.foodLedger) > 0) && !market.foodLedger.offeredIntakeByMonth);
}

/** Moves provisions for the people whose cells changed from `previous` to `next` into new markets. */
export function moveProvisionsToNewMarkets(previous: ArrayLike<number>, next: ArrayLike<number>): void {
  if (!isEconomyContextReady() || previous.length !== next.length) return;
  const { pack, urbanization } = getWorldContext();
  if (!pack.cells?.i || !pack.cells.h || !pack.cells.pop) return;
  const markets = new Map(getMarkets().map(market => [market.i, market]));
  const townPeople = Math.max(1, urbanization ?? 1);
  const peopleIn = (cellId: number) => {
    const burg = pack.burgs?.[pack.cells.burg?.[cellId] ?? 0];
    const town = burg?.i && !burg.removed ? (burg.population ?? 0) * townPeople : 0;
    return Math.max(0, pack.cells.pop[cellId] ?? 0) + town;
  };

  const peopleBefore = new Map<number, number>();
  const moved = new Map<number, Map<number, number>>();
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20) continue;
    const from = previous[cellId];
    const people = peopleIn(cellId);
    if (from) peopleBefore.set(from, (peopleBefore.get(from) ?? 0) + people);
    const to = next[cellId];
    if (!from || !to || from === to || !(people > 0)) continue;
    const byFrom = moved.get(to) ?? new Map<number, number>();
    byFrom.set(from, (byFrom.get(from) ?? 0) + people);
    moved.set(to, byFrom);
  }

  const salt = getGoods().find(good => good.name === "Salt");
  for (const [toId, byFrom] of moved) {
    const to = markets.get(toId);
    if (!to || !isUnstocked(to)) continue;
    for (const [fromId, people] of byFrom) {
      const from = markets.get(fromId);
      const share = people / Math.max(1e-9, peopleBefore.get(fromId) ?? 0);
      if (!from || !(share > 0)) continue;
      const ledger = from.foodLedger;
      const stock = storedGrain(ledger);
      if (ledger && stock > 0) {
        to.foodLedger ??= emptyFoodLedger();
        // The moved people's part of what the old market keeps back until the next harvest.
        const needed = Math.min(stock, ledger.exportReserve ?? stock);
        transferStapleCropShare(ledger, to.foodLedger, (Math.min(1, share) * needed) / stock);
      }
      const fromSalt = salt ? from.goods[salt.i] : undefined;
      if (salt && fromSalt && fromSalt.stock > 0) {
        const units = rn(fromSalt.stock * Math.min(1, share), 4);
        fromSalt.stock = rn(fromSalt.stock - units, 4);
        to.goods[salt.i] ??= { stock: 0, price: fromSalt.price };
        to.goods[salt.i].stock = rn(to.goods[salt.i].stock + units, 4);
      }
    }
  }
}
