import type { Burg, BurgEconomySummary } from "../hostTypes";
import { formatPrice, rn } from "../hostUtils";
import { getWorldContext } from "./economyContext";
import { Goods } from "./generators/goods-generator";
import { Production } from "./generators/production-generator";

/** Gross product normalized to 1,000 actual residents for a readable, comparable value. */
export function getBurgProductPerThousandResidents(burg: Burg): number {
  const { populationRate, urbanization } = getWorldContext();
  const people = (burg.population ?? 0) * populationRate * urbanization;
  return people > 0 ? ((burg.product ?? 0) / people) * 1000 : 0;
}

export function getBurgEconomySummary(burgId: number): BurgEconomySummary | null {
  const burg = getWorldContext().pack.burgs[burgId];
  if (!burg || burg.removed) return null;

  const produced = Production.getBurgProduction(burg);
  const entries = Object.entries(produced).filter(([, amount]) => amount > 0);
  const production = entries.length
    ? entries.map(([goodId, amount]) => `${Goods.get(+goodId)?.name ?? goodId} ${rn(amount, 2)}`).join(", ")
    : "none";

  const wealth = getBurgProductPerThousandResidents(burg);
  const baseCapacity = burg.demographics?.capacity ?? 0;
  const effectiveCapacity = burg.demographics?.effectiveCapacity ?? baseCapacity;
  const importedSupport = Math.max(0, effectiveCapacity - baseCapacity);
  const foodImportDependency = burg.population && burg.population > 0 ? (importedSupport / burg.population) * 100 : 0;

  return {
    production,
    wealth: formatPrice(wealth),
    treasury: formatPrice(burg.treasury || 0),
    foodImportDependency: `${rn(foodImportDependency, 1)}%`
  };
}
