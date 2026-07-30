import { getBurgDemographics } from "../../hostCore";
import {
  getAdministrationEmployment,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
  getStrategicLaborMarkets,
  getWorldContext,
  setAdministrationEmployment,
  setBasicEmploymentSummary
} from "../economyContext";
import { type AdministrationEmploymentRecord, getAdministrationRequiredWorkers } from "./administrationEmployment";
import { getMineRequiredWorkers } from "./mineOperations";
import { type BasicEmploymentSummaryRecord, buildBasicEmploymentSummary } from "./serviceEmployment";
import { getSmelterRequiredWorkers } from "./smelterOperations";

/** Share of an operation's `requiredWorkers` it may gain or lose in a single reconciliation year. */
const MAX_ANNUAL_WORKER_CHANGE_SHARE = 0.25;
/** Floor on the annual step so small operations (low richness, low capacity) still move. */
const MIN_ANNUAL_WORKER_CHANGE = 1;

interface BasicEmploymentSlot {
  requiredWorkers: number;
  getWorkers: () => number;
  setWorkers: (value: number) => void;
}

/**
 * Annual, Burg-anchored reconciliation of basic-industry employment: state administration
 * (docs/plan/urban-employment-demand.md §3.4, Phase 3) and mining/smelting (§3.2, Phase 1).
 * Each slot's `workers` is a subset of its Burg's current adult population (§0 design
 * decision) — it never writes `burg.population`/`demographics`. Within a shared Burg,
 * administration is allocated first (a state's capital needs governing regardless of
 * whether it also sits on a mineral deposit), then mines, then smelters (a smelter with no
 * ore supply has nothing to process). No cross-Burg or cross-industry share cap is applied
 * (§5.1 decision 2).
 *
 * Also aggregates each Burg's `basicEmploymentDemand` and derives `serviceEmploymentDemand`
 * (§3.5) from it, into `basicEmploymentSummary` (Phase 4). Market-anchored `"trade"`
 * employment (§3.3, Phase 2) is read here, not reallocated: `LaborMarket.workersByOccupation`
 * is already reconciled monthly against the Market's own workforce pool
 * (`reconcileStrategicLaborMarkets` in `production-generator.ts`), so this only attributes the
 * current trade headcount to its market's `centerBurgId` — it does not compete for, or draw
 * down, that Burg's adult pool a second time here.
 *
 * Call once per simulation year, gated the same way as `UrbanLaborIntake.updateAnnualState()`.
 */
export function reconcileAnnualBasicEmploymentWorkers(): void {
  const slotsByBurg = new Map<number, BasicEmploymentSlot[]>();
  const burgs = getWorldContext().pack.burgs;

  const previousAdministrationByBurg = new Map(getAdministrationEmployment().map(record => [record.burgId, record]));
  const administrationRecords: AdministrationEmploymentRecord[] = [];
  for (const state of getWorldContext().pack.states ?? []) {
    if (!state?.i || state.removed || !state.capital) continue;
    const capitalBurg = burgs[state.capital];
    if (!capitalBurg?.i || capitalBurg.removed) continue;

    const record: AdministrationEmploymentRecord = {
      burgId: capitalBurg.i,
      stateId: state.i,
      workers: previousAdministrationByBurg.get(capitalBurg.i)?.workers ?? 0
    };
    administrationRecords.push(record);
    pushSlot(slotsByBurg, capitalBurg.i, {
      requiredWorkers: getAdministrationRequiredWorkers(state),
      getWorkers: () => record.workers,
      setWorkers: value => {
        record.workers = value;
      }
    });
  }

  const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
  for (const mine of getMineOperations()) {
    if (!mine.active || !mine.burgId) continue;
    const deposit = depositsById.get(mine.depositId);
    if (!deposit) continue;
    pushSlot(slotsByBurg, mine.burgId, {
      requiredWorkers: getMineRequiredWorkers(deposit),
      getWorkers: () => mine.workers,
      setWorkers: value => {
        mine.workers = value;
      }
    });
  }

  for (const smelter of getSmelterOperations()) {
    if (!smelter.active || !smelter.burgId) continue;
    pushSlot(slotsByBurg, smelter.burgId, {
      requiredWorkers: getSmelterRequiredWorkers(smelter),
      getWorkers: () => smelter.workers,
      setWorkers: value => {
        smelter.workers = value;
      }
    });
  }

  const tradeWorkersByBurg = new Map<number, number>();
  const laborMarketByMarketId = new Map(
    getStrategicLaborMarkets().map(laborMarket => [laborMarket.marketId, laborMarket])
  );
  for (const market of getMarkets()) {
    if (!market.centerBurgId) continue;
    const tradeWorkers = laborMarketByMarketId.get(market.i)?.workersByOccupation.trade ?? 0;
    if (tradeWorkers <= 0) continue;
    tradeWorkersByBurg.set(market.centerBurgId, (tradeWorkersByBurg.get(market.centerBurgId) ?? 0) + tradeWorkers);
  }

  const summaryBurgIds = new Set<number>([...slotsByBurg.keys(), ...tradeWorkersByBurg.keys()]);
  const summaryRecords: BasicEmploymentSummaryRecord[] = [];
  for (const burgId of summaryBurgIds) {
    const burg = burgs[burgId];
    if (!burg) continue;

    const slots = slotsByBurg.get(burgId);
    if (slots) {
      const demographics = getBurgDemographics(burg);
      let remainingAdults = Math.max(0, demographics.maleAdults + demographics.femaleAdults);

      for (const slot of slots) {
        const desiredWorkers = Math.min(slot.requiredWorkers, remainingAdults);
        const maxChange = Math.max(MIN_ANNUAL_WORKER_CHANGE, slot.requiredWorkers * MAX_ANNUAL_WORKER_CHANGE_SHARE);
        const change = clamp(desiredWorkers - slot.getWorkers(), -maxChange, maxChange);
        const nextWorkers = Math.max(0, slot.getWorkers() + change);

        slot.setWorkers(nextWorkers);
        remainingAdults = Math.max(0, remainingAdults - nextWorkers);
      }
    }

    const burgAnchoredDemand = slots?.reduce((sum, slot) => sum + slot.getWorkers(), 0) ?? 0;
    const basicEmploymentDemand = burgAnchoredDemand + (tradeWorkersByBurg.get(burgId) ?? 0);
    summaryRecords.push(buildBasicEmploymentSummary(burgId, basicEmploymentDemand));
  }

  setAdministrationEmployment(administrationRecords);
  setBasicEmploymentSummary(summaryRecords);
}

function pushSlot(map: Map<number, BasicEmploymentSlot[]>, burgId: number, slot: BasicEmploymentSlot): void {
  const slots = map.get(burgId);
  if (slots) slots.push(slot);
  else map.set(burgId, [slot]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
