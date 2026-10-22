import { worldSettings } from "../../../simulation/worldSettings";

export const LONG_DISTANCE_TRADE_SETTING = "fmg-long-distance-trade";

/**
 * "on": inter-market cargo is paid for — the house pays the exporting market at booking and the
 * importing market pays the house on arrival, with no soft arrival profit; warehouse lots that
 * never load are cancelled (docs/plan/long-distance-merchant-reach-capital.md §5.1, §5.3).
 */
export function isLongDistanceTradeEnabled(): boolean {
  try {
    return worldSettings.getItem(LONG_DISTANCE_TRADE_SETTING) === "on";
  } catch {
    return false;
  }
}
