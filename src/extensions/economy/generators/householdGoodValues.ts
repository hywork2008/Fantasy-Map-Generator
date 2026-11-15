/**
 * Base values of the household crafts against grain (docs/plan/household-goods-values.md §5):
 * `historical` a pair of shoes about 20 kg of grain, a hide's belts and bags about 100 kg; `legacy`
 * the authored values. Tallow Candles have their own good and value now (docs/plan/candle-split.md),
 * and a Candles value of 2.4 left by the earlier `historical` mode goes back to the wax candles' 14. A value is switched only
 * while it is still the other mode's default, so a value set in the Goods editor is kept.
 */
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getGoods } from "../economyContext";

const LEGACY_HISTORICAL_CANDLE_VALUE = 2.4;
const WAX_CANDLE_VALUE = 14;

export const HOUSEHOLD_GOOD_VALUES: Readonly<Record<string, { historical: number; legacy: number }>> = {
  Boots: { historical: 1, legacy: 7 },
  "Leather Goods": { historical: 0.2, legacy: 3.5 }
};

/** Puts the household crafts at the values of `householdGoodValues`; returns whether any changed. */
export function applyHouseholdGoodValues(): boolean {
  const mode = getMarketSettings().householdGoodValues;
  const other = mode === "historical" ? "legacy" : "historical";
  let changed = false;
  for (const good of getGoods()) {
    if (good.name === "Candles" && good.value === LEGACY_HISTORICAL_CANDLE_VALUE) {
      good.value = WAX_CANDLE_VALUE;
      changed = true;
    }
    const values = HOUSEHOLD_GOOD_VALUES[good.name];
    if (!values || good.value !== values[other]) continue;
    good.value = values[mode];
    changed = true;
  }
  return changed;
}
