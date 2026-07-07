import type { BurgEconomySummary } from "../hostTypes";
import { formatPrice, rn } from "../hostUtils";
import { getWorldContext } from "./economyContext";
import { Goods } from "./generators/goods-generator";
import { Production } from "./generators/production-generator";

export function getBurgEconomySummary(burgId: number): BurgEconomySummary | null {
  const burg = getWorldContext().pack.burgs[burgId];
  if (!burg || burg.removed) return null;

  const produced = Production.getBurgProduction(burg);
  const entries = Object.entries(produced).filter(([, amount]) => amount > 0);
  const production = entries.length
    ? entries.map(([goodId, amount]) => `${Goods.get(+goodId)?.name ?? goodId} ${rn(amount, 2)}`).join(", ")
    : "none";

  return {
    production,
    wealth: formatPrice(burg.product || 0),
    treasury: formatPrice(burg.treasury || 0)
  };
}
