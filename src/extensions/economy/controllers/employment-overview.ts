import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import {
  getAdministrationEmployment,
  getBasicEmploymentSummary,
  getConstructionOperations,
  getCraftEmploymentRecords,
  getMineOperations,
  getQuarryOperations,
  getSmelterOperations,
  getVolcanicOperations,
  getWorldContext
} from "../economyContext";
import { getStrategicIndustryWorkersByBurg, getTradeWorkersByBurg } from "../generators/basicEmployment";
import { getBurgEmploymentComposition } from "../generators/burgEmploymentComposition";
import { getHousingLedgerSnapshot } from "../generators/constructionEmployment";
import { getConstructionJobPosting } from "../generators/constructionJobPostings";
import { type EmploymentOverviewRow, setEmploymentOverviewState } from "../store/employmentOverviewState";

/**
 * Debug/transparency view over employment demand and the adult labor ledger
 * (docs/plan/urban-employment-demand.md Phase 5 + burg employment composition).
 * Reads already-persisted employment seats plus live demographics/housing; does not reallocate.
 */
export function open(): void {
  openDialog("employmentOverview");
  refreshEmploymentOverview();
}

export function refreshEmploymentOverview(): void {
  const world = getWorldContext();
  const burgs = world.pack.burgs;
  const states = world.pack.states ?? [];

  const administrationByBurg = new Map(getAdministrationEmployment().map(record => [record.burgId, record.workers]));
  const miningByBurg = sumActiveByBurg(getMineOperations());
  const smeltingByBurg = sumActiveByBurg(getSmelterOperations());
  const tradeByBurg = getTradeWorkersByBurg();
  const strategicIndustryByBurg = getStrategicIndustryWorkersByBurg();
  const craftByBurg = new Map(getCraftEmploymentRecords().map(record => [record.burgId, record.workers]));
  const constructionByBurg = getConstructionEmploymentByBurg();
  const summaryByBurg = new Map(getBasicEmploymentSummary().map(record => [record.burgId, record]));
  const constructionOpByBurg = new Map(
    getConstructionOperations()
      .filter(op => op.active)
      .map(op => [op.burgId, op])
  );
  const populationRate = Math.max(0, world.populationRate ?? 0) || 1;

  const burgIds = new Set<number>([
    ...administrationByBurg.keys(),
    ...miningByBurg.keys(),
    ...smeltingByBurg.keys(),
    ...tradeByBurg.keys(),
    ...strategicIndustryByBurg.keys(),
    ...craftByBurg.keys(),
    ...constructionByBurg.keys(),
    ...summaryByBurg.keys()
  ]);
  // Include market burgs that have demographics (labor ledger) even before the first employment reconcile.
  for (const burg of burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.demographics) continue;
    if (burg.group === "fort") continue;
    burgIds.add(burg.i);
  }

  const rows: EmploymentOverviewRow[] = [];
  for (const burgId of burgIds) {
    const burg = burgs[burgId];
    if (!burg?.i || burg.removed) continue;

    const summary = summaryByBurg.get(burgId);
    const basicEmploymentDemand = summary?.basicEmploymentDemand ?? 0;
    const serviceEmploymentDemand = summary?.serviceEmploymentDemand ?? 0;
    const housing = getHousingLedgerSnapshot(constructionOpByBurg.get(burgId), burg, populationRate);
    const labor = getBurgEmploymentComposition(burgId);
    const jobPosting = getConstructionJobPosting(burgId);

    rows.push({
      id: burgId,
      burgId,
      burgName: burg.name || `Burg ${burgId}`,
      stateId: burg.state ?? 0,
      stateName: (burg.state ? states[burg.state]?.name : undefined) ?? "—",
      isCapital: Boolean(burg.capital),
      administration: rn(administrationByBurg.get(burgId) ?? 0, 1),
      mining: rn(miningByBurg.get(burgId) ?? 0, 1),
      smelting: rn(smeltingByBurg.get(burgId) ?? 0, 1),
      trade: rn(tradeByBurg.get(burgId) ?? 0, 1),
      strategicIndustry: rn(strategicIndustryByBurg.get(burgId) ?? 0, 1),
      craft: rn(craftByBurg.get(burgId) ?? 0, 1),
      construction: rn(constructionByBurg.get(burgId) ?? 0, 1),
      dwellings: housing?.dwellingStock ?? 0,
      requiredDwellings: housing?.requiredDwellings ?? 0,
      housingGapPct: housing ? rn(housing.housingBacklog * 100, 1) : 0,
      underConstruction: housing?.underConstruction ?? 0,
      laborResidual: labor?.residual ?? 0,
      marketUnemploymentPct: labor ? rn(labor.marketUnemployment * 100, 1) : 0,
      employmentFocus: labor?.recommendedFocus ?? "—",
      constructionJobsOpen: jobPosting?.openSeats ?? 0,
      householdCare: labor?.householdCare ?? 0,
      marketLaborForce: labor?.marketLaborForce ?? 0,
      basicEmploymentDemand: rn(basicEmploymentDemand, 1),
      serviceEmploymentDemand: rn(serviceEmploymentDemand, 1),
      employmentDemand: rn(basicEmploymentDemand + serviceEmploymentDemand, 1)
    });
  }

  // Highest residual first when demand is equal — surfaces towns that need jobs.
  rows.sort((a, b) => b.laborResidual - a.laborResidual || b.employmentDemand - a.employmentDemand);
  setEmploymentOverviewState({ rows });
}

/**
 * Sums masonry/carpentry, quarrying, and volcanic works extraction (Ash/Sulfur/Obsidian) per Burg.
 */
function getConstructionEmploymentByBurg(): Map<number, number> {
  const sums = new Map<number, number>();
  for (const operation of getConstructionOperations()) {
    if (!operation.active || !operation.burgId) continue;
    const workers = operation.masonWorkers + operation.carpenterWorkers;
    sums.set(operation.burgId, (sums.get(operation.burgId) ?? 0) + workers);
  }
  for (const quarry of getQuarryOperations()) {
    if (!quarry.active || !quarry.burgId) continue;
    sums.set(quarry.burgId, (sums.get(quarry.burgId) ?? 0) + quarry.quarryWorkers);
  }
  for (const volcanicWorks of getVolcanicOperations()) {
    if (!volcanicWorks.active || !volcanicWorks.burgId) continue;
    sums.set(volcanicWorks.burgId, (sums.get(volcanicWorks.burgId) ?? 0) + volcanicWorks.volcanicWorkers);
  }
  return sums;
}

function sumActiveByBurg(
  operations: readonly { active: boolean; burgId: number; workers: number }[]
): Map<number, number> {
  const sums = new Map<number, number>();
  for (const operation of operations) {
    if (!operation.active || !operation.burgId) continue;
    sums.set(operation.burgId, (sums.get(operation.burgId) ?? 0) + operation.workers);
  }
  return sums;
}
