import { getBurgDemographics } from "../../hostCore";
import {
  getAdministrationEmployment,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
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
 * Also derives each Burg's `serviceEmploymentDemand` (§3.5) from the resulting
 * `basicEmploymentDemand` subtotal — Market-anchored port/trade employment (§3.3, Phase 2)
 * is not yet attributed to a Burg here, so this subtotal is partial until Phase 4.
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

  const summaryRecords: BasicEmploymentSummaryRecord[] = [];
  for (const [burgId, slots] of slotsByBurg) {
    const burg = burgs[burgId];
    if (!burg) continue;

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

    const basicEmploymentDemand = slots.reduce((sum, slot) => sum + slot.getWorkers(), 0);
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
