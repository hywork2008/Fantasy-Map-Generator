/**
 * Cash a market keeps for its next harvest (docs/plan/harvest-cash-reserve.md). The market buys the
 * farms' harvest for cash in the months it comes in; small farmers sold right after the harvest to
 * pay their rents and debts. A market that paid all its cash above the town reserve out to its
 * merchants each month had none left when the harvest came (docs/analytics/market-cash-20261109.md):
 * it then took the towns' goods on consignment, and their purses ran dry until the autumn.
 *
 * Each month's farmgate cost is remembered by calendar month; the reserve is what the market paid
 * in the coming months a year ago.
 */
import { rn } from "../../hostUtils";
import type { MarketTreasury } from "./marketTypes";

/** Remembers the farmgate cost of the months just settled, spread evenly over them. */
export function recordFarmgateCost(treasury: MarketTreasury, months: readonly number[], cost: number): void {
  if (!months.length) return;
  treasury.farmgateCostByMonth ??= new Array(12).fill(0);
  const history = treasury.farmgateCostByMonth;
  const perMonth = rn(Math.max(0, cost) / months.length, 2);
  for (const month of months) history[(month - 1 + 12) % 12] = perMonth;
}

/**
 * The farmgate cost the market paid a year ago in the `months` calendar months after `currentMonth`
 * (1-12), with this month's own buying when it has not yet come.
 */
export function getHarvestCashReserve(
  treasury: Pick<MarketTreasury, "farmgateCostByMonth">,
  currentMonth: number,
  months: number
): number {
  const history = treasury.farmgateCostByMonth;
  if (!history || !(months > 0)) return 0;
  let total = 0;
  for (let ahead = 1; ahead <= Math.floor(months); ahead++) total += history[(currentMonth - 1 + ahead) % 12] ?? 0;
  return rn(total, 2);
}
