import type { HistoricalPeriod } from "../../../types/historicalPeriod";
import { getBurgDemographics } from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  getAdministrationEmployment,
  getConstructionOperations,
  getMineOperations,
  getMineralDeposits,
  getQuarryOperations,
  getSmelterOperations,
  getVolcanicOperations,
  getWorldContext
} from "../economyContext";
import { crewScale } from "./basicEmployment";
import { peopleToPoints } from "./craftScale";
import { getMineEmploymentPeople, getMineRequiredWorkers } from "./mineOperations";
import { getSmelterCrewPeople, getSmelterRequiredWorkers } from "./smelterOperations";

/**
 * Work a child (0-14) gives, as a share of an adult's, by the map's historical period
 * (docs/plan/child-labour-history.md §3): the share of 5-9 and 10-14 year-olds at work × their days
 * × their pay against an unskilled man's. Infants do not work, the young work part of the year at
 * a quarter of a man's output, and 10-14 year-olds about half of it until the 17th century. School
 * and factory laws take it to nothing after 1880.
 */
export const CHILD_LABOUR_EQUIVALENT: Readonly<Record<HistoricalPeriod, number>> = {
  classicalAntiquity: 0.13,
  lateAntiquity: 0.13,
  earlyMedieval: 0.13,
  highMedieval: 0.13,
  lateMedieval: 0.13,
  ageOfExploration: 0.13,
  maritimeEra: 0.11,
  preIndustrialEra: 0.07,
  steamEra: 0.04,
  industrialChemistryEra: 0.02,
  petroleumEra: 0,
  rocketryEra: 0
};

export function getChildLabourEquivalent(): number {
  // Undefined is a legacy map, read as "highMedieval" (WorldState.historicalPeriod).
  return CHILD_LABOUR_EQUIVALENT[getWorldContext().options.historicalPeriod ?? "highMedieval"] ?? 0;
}

/**
 * Population points each Burg already gives to its basic industries (docs/plan/
 * child-labour-history.md §5-2): administration, quarries, Volcanic Ash works and construction
 * draw on the Burg's own adults, mines and smelters on every adult of their market, here shared by
 * each Burg's adults left after its own. Market trade and the shipbuilding supply occupations
 * (LaborMarket) are a wage and skill index over 30% of the market, not a headcount, and are not
 * taken.
 */
export function getBasicWorkersByBurg(burgs: readonly (Burg | undefined)[]): Map<number, number> {
  const local = new Map<number, number>();
  const add = (burgId: number | undefined, workers: number | undefined) => {
    if (!burgId || !(workers && workers > 0)) return;
    local.set(burgId, (local.get(burgId) ?? 0) + workers);
  };
  // Quarry and Volcanic Ash crews count people, mine and smelter crews their required-workers
  // unit; reconcileAnnualBasicEmploymentWorkers() reads them as points the same way.
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  for (const record of getAdministrationEmployment()) add(record.burgId, record.workers);
  for (const quarry of getQuarryOperations()) {
    if (quarry.active) add(quarry.burgId, peopleToPoints(quarry.quarryWorkers, populationRate));
  }
  for (const works of getVolcanicOperations()) {
    if (works.active) add(works.burgId, peopleToPoints(works.volcanicWorkers, populationRate));
  }
  for (const construction of getConstructionOperations()) {
    if (!construction.active) continue;
    add(construction.burgId, (construction.masonWorkers ?? 0) + (construction.carpenterWorkers ?? 0));
  }

  const marketWorkers = new Map<number, number>();
  const addMarket = (marketId: number, points: number) => {
    if (points > 0) marketWorkers.set(marketId, (marketWorkers.get(marketId) ?? 0) + points);
  };
  const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
  for (const smelter of getSmelterOperations()) {
    if (!smelter.active || !smelter.burgId || !smelter.marketId) continue;
    const crewPoints = peopleToPoints(
      getSmelterCrewPeople(smelter, depositsById.get(smelter.depositId)),
      populationRate
    );
    addMarket(smelter.marketId, smelter.workers * crewScale(getSmelterRequiredWorkers(smelter), crewPoints));
  }
  for (const mine of getMineOperations()) {
    const deposit = depositsById.get(mine.depositId);
    if (!mine.active || !mine.burgId || !mine.marketId || !deposit) continue;
    const crewPoints = peopleToPoints(getMineEmploymentPeople(deposit, mine), populationRate);
    addMarket(mine.marketId, mine.workers * crewScale(getMineRequiredWorkers(deposit), crewPoints));
  }
  const spareAdults = new Map<number, number>();
  const spareByMarket = new Map<number, number>();
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !burg.market || !marketWorkers.has(burg.market)) continue;
    const spare = Math.max(0, adultsOf(burg) - (local.get(burg.i) ?? 0));
    spareAdults.set(burg.i, spare);
    spareByMarket.set(burg.market, (spareByMarket.get(burg.market) ?? 0) + spare);
  }

  const basic = new Map(local);
  for (const burg of burgs) {
    const burgId = burg?.i;
    const spare = burgId ? spareAdults.get(burgId) : undefined;
    if (!burgId || !burg.market || !spare) continue;
    const share = spare / (spareByMarket.get(burg.market) ?? spare);
    basic.set(burgId, (basic.get(burgId) ?? 0) + (marketWorkers.get(burg.market) ?? 0) * share);
  }
  return basic;
}

/**
 * Population points a Burg's workshops can employ: its adults and the work its children give,
 * less what its basic industries already employ. The elders are not counted
 * (docs/plan/child-labour-history.md §5-5).
 */
export function getCraftWorkforce(burg: Burg, basicWorkers: number, childLabourEquivalent: number): number {
  const demographics = getBurgDemographics(burg);
  if (!burg.demographics) return Math.max(0, (burg.population ?? 0) - basicWorkers);
  return Math.max(0, adultsOf(burg) + demographics.children * childLabourEquivalent - basicWorkers);
}

function adultsOf(burg: Burg): number {
  const demographics = getBurgDemographics(burg);
  return Math.max(0, demographics.maleAdults + demographics.femaleAdults);
}
