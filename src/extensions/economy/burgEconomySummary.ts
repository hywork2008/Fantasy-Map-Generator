import type { Burg, BurgEconomySummary } from "../hostTypes";
import { formatPrice, rn } from "../hostUtils";
import { getBasicEmploymentSummary, getConstructionOperations, getWorldContext } from "./economyContext";
import {
  formatEmploymentCompositionSummary,
  getBurgEmploymentComposition
} from "./generators/burgEmploymentComposition";
import { getHousingLedgerSnapshot } from "./generators/constructionEmployment";
import { Goods } from "./generators/goods-generator";
import { Production } from "./generators/production-generator";
import { getBurgSettlementValue } from "./generators/settlementValuation";
import { formatExpectedBirthsLowerBound, formatPregnantHeadcount } from "./generators/urbanPregnancy";

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

  const employmentSummary = getBasicEmploymentSummary().find(record => record.burgId === burgId);
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const constructionOp = getConstructionOperations().find(op => op.burgId === burgId && op.active);
  const housing = getHousingLedgerSnapshot(constructionOp, burg, populationRate);
  const labor = getBurgEmploymentComposition(burgId);

  return {
    production,
    wealth: formatPrice(wealth),
    treasury: formatPrice(burg.treasury || 0),
    foodImportDependency: `${rn(foodImportDependency, 1)}%`,
    basicEmploymentDemand: employmentSummary ? `${rn(employmentSummary.basicEmploymentDemand, 1)}` : "—",
    serviceEmploymentDemand: employmentSummary ? `${rn(employmentSummary.serviceEmploymentDemand, 1)}` : "—",
    dwellings: housing ? `${rn(housing.dwellingStock, 1)} / ${housing.requiredDwellings}` : "—",
    housingGap: housing ? `${rn(housing.housingBacklog * 100, 1)}%` : "—",
    underConstruction: housing ? (housing.underConstruction > 0 ? `${rn(housing.underConstruction, 1)}` : "0") : "—",
    constructionWorkers: housing ? `${rn(housing.constructionWorkers, 1)}` : "—",
    pregnant: formatPregnantHeadcount(burgId),
    expectedBirths: formatExpectedBirthsLowerBound(burgId),
    settlementValue: (() => {
      const value = getBurgSettlementValue(burgId);
      return value ? formatPrice(value.total) : "—";
    })(),
    employmentComposition: labor ? formatEmploymentCompositionSummary(labor) : "—",
    laborResidual: labor ? `${rn(labor.residual, 1)}` : "—",
    marketUnemployment: labor ? `${rn(labor.marketUnemployment * 100, 1)}%` : "—",
    employmentFocus: labor?.recommendedFocus ?? "—"
  };
}
