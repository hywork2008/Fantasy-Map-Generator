import type { Burg, BurgEconomySummary } from "../hostTypes";
import { formatPrice, rn } from "../hostUtils";
import { getBasicEmploymentSummary, getConstructionOperations, getMarkets, getWorldContext } from "./economyContext";
import {
  formatEmploymentCompositionSummary,
  getBurgEmploymentComposition
} from "./generators/burgEmploymentComposition";
import { getHousingLedgerSnapshot } from "./generators/constructionEmployment";
import { formatConstructionJobPosting, getConstructionJobPosting } from "./generators/constructionJobPostings";
import { getFoodLedgerSummary } from "./generators/foodLedgerSummary";
import { Goods } from "./generators/goods-generator";
import { getInnFacilitiesForBurg, getInnFacilityTotals } from "./generators/innFacilities";
import { Production } from "./generators/production-generator";
import { getCellStapleFoodProduction } from "./generators/production-utils";
import { getBurgSettlementValue } from "./generators/settlementValuation";
import { formatExpectedBirthsLowerBound, formatPregnantHeadcount } from "./generators/urbanPregnancy";
import {
  formatUrbanWaterSummary,
  getUrbanWaterSystemForBurg,
  sanitationScoreFromSystem
} from "./generators/urbanWaterSystem";

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
  const market = burg.market ? getMarkets().find(candidate => candidate.i === burg.market) : undefined;
  const foodLedger = getFoodLedgerSummary(market?.foodLedger);
  const cellGrainProduction = getCellStapleFoodProduction(burg.cell);

  const employmentSummary = getBasicEmploymentSummary().find(record => record.burgId === burgId);
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const constructionOp = getConstructionOperations().find(op => op.burgId === burgId && op.active);
  const housing = getHousingLedgerSnapshot(constructionOp, burg, populationRate);
  const labor = getBurgEmploymentComposition(burgId);
  const constructionJobs = formatConstructionJobPosting(getConstructionJobPosting(burgId));
  const innTotals = getInnFacilityTotals(getInnFacilitiesForBurg(burgId));
  const inns = innTotals.buildingCount
    ? `${innTotals.buildingCount} buildings · ${innTotals.privateRooms} rooms · ${innTotals.beds} beds · ${innTotals.stableSpaces} stable spaces`
    : "None";
  const waterSystem = getUrbanWaterSystemForBurg(burgId);
  const waterSanitation = waterSystem ? formatUrbanWaterSummary(waterSystem) : "—";
  const sanitationScore = waterSystem ? `${sanitationScoreFromSystem(waterSystem)}` : "—";

  return {
    production,
    wealth: formatPrice(wealth),
    treasury: formatPrice(burg.treasury || 0),
    cellGrainProduction: `${rn(cellGrainProduction, 2)} / year`,
    marketGrainProduction: foodLedger ? `${rn(foodLedger.localProduction, 2)} / quarter` : "—",
    marketFoodImports: foodLedger
      ? `${rn(foodLedger.importedFood, 2)} (${rn(foodLedger.importShare * 100, 1)}% of need)`
      : "—",
    marketFoodReserveGap: foodLedger ? `${rn(foodLedger.reserveGap, 2)}` : "—",
    marketFoodStock: foodLedger ? `${rn(foodLedger.stock, 2)} (${rn(foodLedger.stockMonths, 1)} months)` : "—",
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
    employmentFocus: labor?.recommendedFocus ?? "—",
    constructionJobs,
    inns,
    waterSanitation,
    sanitationScore
  };
}
