import { rn } from "../../hostUtils";
import { getMarkets } from "../economyContext";
import { recordGoodFlow } from "./goodsBalanceLedger";

export function consumeForSmelting(
  marketId: number,
  goodId: number,
  requestedUnits: number,
  stockShare: number,
  category: "smelting" | "construction" = "smelting"
): number {
  const market = getMarkets().find(market => market.i === marketId);
  const marketGood = market?.goods[goodId];
  if (!marketGood || requestedUnits <= 0 || stockShare <= 0) return 0;
  const consumed = rn(Math.min(requestedUnits, marketGood.stock * Math.min(1, stockShare)), 4);
  if (consumed <= 0) return 0;
  marketGood.stock = rn(Math.max(0, marketGood.stock - consumed), 4);
  recordGoodFlow({ direction: "sink", category, goodId, units: consumed, marketId });
  return consumed;
}
