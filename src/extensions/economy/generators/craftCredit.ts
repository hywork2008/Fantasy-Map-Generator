/**
 * Book credit for a town's workshops (docs/plan/craft-book-credit.md). A town's purse pays the
 * materials and wages of its crafts, and its income comes later: the winter slaughter's tallow and
 * leather sell through the year, and the goods made in summer sell on consignment from autumn
 * (docs/analytics/town-purse-20261109.md). Without credit the purse ran dry from May to September
 * and the workshops stopped for want of materials.
 *
 * The market's dealers sell the materials on book credit: before a town's production, its purse
 * borrows from its market's cash, up to a month of its craft spending in hand and the set months
 * of it owed. The market lends only the cash it does not owe the farms (grain, hay), the salt works
 * or the towns for their consigned goods. After the month's income, the purse repays what it holds
 * above two months of that spending. Money only moves between the market's cash and the purse.
 */
import { getCraftCreditMonths } from "../../../simulation/craftCreditSettings";
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext, isEconomyContextReady } from "../economyContext";
import { getBurgMarketLedger, getHouseholdWealth } from "./burgMarketLedgers";
import type { CraftCreditLedger } from "./burgMarketLedgersTypes";
import type { Market } from "./marketTypes";

/** Weight of the latest month in the running monthly craft spending. */
const CRAFT_SPEND_SMOOTHING = 1 / 6;
/** Months of craft spending the purse holds before it repays. */
export const CRAFT_CREDIT_REPAY_ABOVE_MONTHS = 2;

function ledgerOf(burgId: number | undefined): CraftCreditLedger | undefined {
  if (!burgId) return undefined;
  getHouseholdWealth(burgId); // seeds the ledger
  const ledger = getBurgMarketLedger(burgId);
  if (!ledger) return undefined;
  ledger.craftCredit ??= { owed: 0, monthlySpend: 0, spendThisMonth: 0 };
  return ledger.craftCredit;
}

/** Records what a town's purse paid for its crafts' materials and wages. */
export function recordCraftSpend(burgId: number | undefined, amount: number): void {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const ledger = ledgerOf(burgId);
  if (ledger) ledger.spendThisMonth += amount;
}

/** What the town's purse owes its market for its crafts' materials. */
export function getCraftCreditOwed(burgId: number | undefined): number {
  if (!burgId) return 0;
  return getBurgMarketLedger(burgId)?.craftCredit?.owed ?? 0;
}

/** Cash the market holds beyond what it owes the farms, the salt works and the towns' consignments. */
export function getMarketLendableCash(market: Market | undefined): number {
  const treasury = market?.marketTreasury;
  if (!treasury) return 0;
  let owed = Math.max(0, treasury.ruralGrainPayable ?? 0) + Math.max(0, treasury.ruralHayPayable ?? 0);
  for (const value of Object.values(treasury.saltPayables ?? {})) owed += Math.max(0, value);
  for (const byGood of Object.values(treasury.craftPayables ?? {}))
    for (const [, worth] of Object.values(byGood)) owed += Math.max(0, worth);
  return Math.max(0, treasury.balance - owed);
}

function marketOf(burg: Burg): Market | undefined {
  return burg.market ? getMarkets().find(market => market.i === burg.market) : undefined;
}

/** Borrows for the town's workshops before its production. Returns the amount borrowed. */
export function drawCraftCredit(burg: Burg): number {
  const months = getCraftCreditMonths();
  if (!(months > 0) || !burg.i) return 0;
  const ledger = ledgerOf(burg.i);
  if (!ledger || !(ledger.monthlySpend > 0)) return 0;
  const want = ledger.monthlySpend - Math.max(0, burg.treasury ?? 0);
  const room = months * ledger.monthlySpend - ledger.owed;
  const market = marketOf(burg);
  const lent = rn(Math.min(want, room, getMarketLendableCash(market)), 2);
  if (!(lent > 0.01) || !market?.marketTreasury) return 0;
  market.marketTreasury.balance = rn(market.marketTreasury.balance - lent, 2);
  burg.treasury = rn((burg.treasury ?? 0) + lent, 2);
  ledger.owed = rn(ledger.owed + lent, 2);
  return lent;
}

/** Rolls each town's craft spending and repays its market after the month's income. */
export function settleCraftCredit(): number {
  if (!isEconomyContextReady()) return 0;
  let repaid = 0;
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const ledger = getBurgMarketLedger(burg.i)?.craftCredit;
    if (!ledger) continue;
    ledger.monthlySpend = rn(
      ledger.monthlySpend * (1 - CRAFT_SPEND_SMOOTHING) + ledger.spendThisMonth * CRAFT_SPEND_SMOOTHING,
      2
    );
    ledger.spendThisMonth = 0;
    if (!(ledger.owed > 0)) continue;
    const spare = (burg.treasury ?? 0) - CRAFT_CREDIT_REPAY_ABOVE_MONTHS * ledger.monthlySpend;
    const amount = rn(Math.min(ledger.owed, spare), 2);
    if (!(amount > 0)) continue;
    const treasury = marketOf(burg)?.marketTreasury;
    if (!treasury) continue;
    burg.treasury = rn((burg.treasury ?? 0) - amount, 2);
    treasury.balance = rn(treasury.balance + amount, 2);
    ledger.owed = rn(ledger.owed - amount, 2);
    repaid += amount;
  }
  return rn(repaid, 2);
}
