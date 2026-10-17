import { getWorldMoneyScale } from "../../../utils/moneyScale";
import { getWorldContext } from "../economyContext";

/** Live map's money scale (docs/plan/money-scale-calibration.md); 1 without a world context. */
export function getMoneyScale(): number {
  try {
    return getWorldMoneyScale(getWorldContext());
  } catch {
    return 1;
  }
}

/** Fixed per-population-point money amount expressed on the live map's money scale. */
export function nominal(amount: number): number {
  return amount * getMoneyScale();
}
