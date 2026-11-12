/**
 * Base values of the household crafts against grain (docs/plan/household-goods-values.md §5):
 * `historical` a pair of shoes about 20 kg of grain, a hide's belts and bags about 100 kg, tallow
 * candles about 11 kg of grain a kilogram; `legacy` the authored values. A value is switched only
 * while it is still the other mode's default, so a value set in the Goods editor is kept.
 */
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getGoods } from "../economyContext";

export const HOUSEHOLD_GOOD_VALUES: Readonly<Record<string, { historical: number; legacy: number }>> = {
  Boots: { historical: 1, legacy: 7 },
  "Leather Goods": { historical: 0.2, legacy: 3.5 },
  Candles: { historical: 2.4, legacy: 14 }
};

/** Puts the household crafts at the values of `householdGoodValues`; returns whether any changed. */
export function applyHouseholdGoodValues(): boolean {
  const mode = getMarketSettings().householdGoodValues;
  const other = mode === "historical" ? "legacy" : "historical";
  let changed = false;
  for (const good of getGoods()) {
    const values = HOUSEHOLD_GOOD_VALUES[good.name];
    if (!values || good.value !== values[other]) continue;
    good.value = values[mode];
    changed = true;
  }
  return changed;
}
