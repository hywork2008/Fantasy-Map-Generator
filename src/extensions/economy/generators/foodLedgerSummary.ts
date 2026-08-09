import type { FoodLedger } from "./marketTypes";

/** Read-only Food Ledger values used by burg and market observability UI. */
export interface FoodLedgerSummary {
  /** Current quarter's rural Grain wholesale intake after household provisions. */
  readonly localProduction: number;
  /** Current quarter's normal Market food requirement (burgs and lodgers). */
  readonly quarterlyNeed: number;
  /** Food physically delivered from other markets in the current quarter. */
  readonly importedFood: number;
  /** Share of the current quarter's need covered by delivered inter-market imports. */
  readonly importShare: number;
  /** Requested reserve replenishment that was not delivered this quarter. */
  readonly reserveGap: number;
  /** Food physically held in the market's three age buckets. */
  readonly stock: number;
  /** Stock expressed as months of the market's current demand. */
  readonly stockMonths: number;
}

export function getFoodLedgerSummary(ledger: FoodLedger | undefined): FoodLedgerSummary | null {
  if (!ledger) return null;

  const localProduction = Math.max(0, ledger.foodProduced ?? 0);
  // Rural household provisions are outside the Market's stock boundary. Their
  // needs remain in the ledger for famine observability, but must not make a
  // Market warehouse appear to hold fewer months of stock than it really does.
  const quarterlyNeed = Math.max(0, ledger.urbanNeed ?? 0);
  const importedFood = Math.max(0, ledger.satisfiedImport ?? 0);
  const reserveGap = Math.max(0, (ledger.importNeed ?? 0) - importedFood);
  const stock = Math.max(0, (ledger.foodStockAge0 ?? 0) + (ledger.foodStockAge1 ?? 0) + (ledger.foodStockAge2 ?? 0));
  const importShare = quarterlyNeed > 0 ? importedFood / quarterlyNeed : 0;
  const stockMonths = quarterlyNeed > 0 ? (stock / quarterlyNeed) * 3 : 0;

  return { localProduction, quarterlyNeed, importedFood, importShare, reserveGap, stock, stockMonths };
}
