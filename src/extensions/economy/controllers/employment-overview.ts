import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import {
  getAdministrationEmployment,
  getBasicEmploymentSummary,
  getCraftEmploymentRecords,
  getMineOperations,
  getSmelterOperations,
  getWorldContext
} from "../economyContext";
import { getStrategicIndustryWorkersByBurg, getTradeWorkersByBurg } from "../generators/basicEmployment";
import { type EmploymentOverviewRow, setEmploymentOverviewState } from "../store/employmentOverviewState";

/**
 * Debug/transparency view over `employmentDemand`'s inputs (docs/plan/urban-employment-demand.md
 * Phase 5), in the same spirit as the host's Frontier Status panel: every Burg with any
 * recorded basic or service employment, broken down by source. Reads already-persisted state
 * from the last annual reconciliation (`reconcileAnnualBasicEmploymentWorkers`) — it does not
 * recompute anything live.
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
  const summaryByBurg = new Map(getBasicEmploymentSummary().map(record => [record.burgId, record]));

  const burgIds = new Set<number>([
    ...administrationByBurg.keys(),
    ...miningByBurg.keys(),
    ...smeltingByBurg.keys(),
    ...tradeByBurg.keys(),
    ...strategicIndustryByBurg.keys(),
    ...craftByBurg.keys(),
    ...summaryByBurg.keys()
  ]);

  const rows: EmploymentOverviewRow[] = [];
  for (const burgId of burgIds) {
    const burg = burgs[burgId];
    if (!burg?.i || burg.removed) continue;

    const summary = summaryByBurg.get(burgId);
    const basicEmploymentDemand = summary?.basicEmploymentDemand ?? 0;
    const serviceEmploymentDemand = summary?.serviceEmploymentDemand ?? 0;

    rows.push({
      id: burgId,
      burgName: burg.name || `Burg ${burgId}`,
      stateName: (burg.state ? states[burg.state]?.name : undefined) ?? "—",
      isCapital: Boolean(burg.capital),
      administration: rn(administrationByBurg.get(burgId) ?? 0, 1),
      mining: rn(miningByBurg.get(burgId) ?? 0, 1),
      smelting: rn(smeltingByBurg.get(burgId) ?? 0, 1),
      trade: rn(tradeByBurg.get(burgId) ?? 0, 1),
      strategicIndustry: rn(strategicIndustryByBurg.get(burgId) ?? 0, 1),
      craft: rn(craftByBurg.get(burgId) ?? 0, 1),
      basicEmploymentDemand: rn(basicEmploymentDemand, 1),
      serviceEmploymentDemand: rn(serviceEmploymentDemand, 1),
      employmentDemand: rn(basicEmploymentDemand + serviceEmploymentDemand, 1)
    });
  }

  rows.sort((a, b) => b.employmentDemand - a.employmentDemand);
  setEmploymentOverviewState({ rows });
}

/** Sums `.workers` per Burg for active mine/smelter operations, matching `basicEmployment.ts`'s own filter. */
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
