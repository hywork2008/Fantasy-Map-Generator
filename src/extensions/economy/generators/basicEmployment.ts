import { getBurgDemographics } from "../../hostCore";
import { getMineOperations, getMineralDeposits, getSmelterOperations, getWorldContext } from "../economyContext";
import { getMineRequiredWorkers } from "./mineOperations";
import { getSmelterRequiredWorkers } from "./smelterOperations";

/** Share of an operation's `requiredWorkers` it may gain or lose in a single reconciliation year. */
const MAX_ANNUAL_WORKER_CHANGE_SHARE = 0.25;
/** Floor on the annual step so small operations (low richness, low capacity) still move. */
const MIN_ANNUAL_WORKER_CHANGE = 1;

interface IndustrialSlot {
  requiredWorkers: number;
  getWorkers: () => number;
  setWorkers: (value: number) => void;
}

/**
 * Annual, Burg-anchored reconciliation of mining/smelting employment
 * (docs/plan/urban-employment-demand.md §3.2, Phase 1). Each operation's `workers` is a
 * subset of its Burg's current adult population (§0 design decision) — it never writes
 * `burg.population`/`demographics`. Mines are allocated before smelters at a shared Burg
 * since a smelter with no ore supply has nothing to process; no cross-Burg or cross-industry
 * share cap is applied (§5.1 decision 2).
 *
 * Call once per simulation year, gated the same way as `UrbanLaborIntake.updateAnnualState()`.
 */
export function reconcileAnnualIndustrialWorkers(): void {
  const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
  const slotsByBurg = new Map<number, IndustrialSlot[]>();

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

  const burgs = getWorldContext().pack.burgs;
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
  }
}

function pushSlot(map: Map<number, IndustrialSlot[]>, burgId: number, slot: IndustrialSlot): void {
  const slots = map.get(burgId);
  if (slots) slots.push(slot);
  else map.set(burgId, [slot]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
