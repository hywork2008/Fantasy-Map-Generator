import { getBurgDemographics, useOptionsState } from "../../hostCore";
import {
  getAdministrationEmployment,
  getConstructionOperations,
  getCraftEmploymentRecords,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  getQuarryOperations,
  getSmelterOperations,
  getStrategicLaborMarkets,
  getVolcanicAshOperations,
  getWorldContext,
  setAdministrationEmployment,
  setBasicEmploymentSummary
} from "../economyContext";
import { type AdministrationEmploymentRecord, getAdministrationRequiredWorkers } from "./administrationEmployment";
import {
  getConstructionRequiredWorkers,
  getRequiredDwellings,
  isBrickGoodAvailable,
  normalizeConstructionOperation,
  resolveBurgCultureType
} from "./constructionEmployment";
import { getMineRequiredWorkers } from "./mineOperations";
import { getQuarryRequiredWorkers } from "./quarryOperations";
import { type BasicEmploymentSummaryRecord, buildBasicEmploymentSummary } from "./serviceEmployment";
import { getSmelterRequiredWorkers } from "./smelterOperations";
import { STRATEGIC_OCCUPATIONS, type StrategicOccupation } from "./strategicLaborMarketsTypes";
import { getVolcanicAshRequiredWorkers } from "./volcanicAshOperations";

/** The non-`"trade"` strategic occupations (§2.3) — raw-material supply for shipbuilding and general Wood, e.g. forestry (§3.8, Phase 7). */
const STRATEGIC_INDUSTRY_OCCUPATIONS: readonly StrategicOccupation[] = STRATEGIC_OCCUPATIONS.filter(
  occupation => occupation !== "trade"
);

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
 * (docs/plan/urban-employment-demand.md §3.4, Phase 3), mining/smelting (§3.2, Phase 1), and
 * quarrying/construction (docs/plan/urban-construction-industry.md §3.2-3.3, Phase 1-2). Each
 * slot's `workers` is a subset of its Burg's current adult population (§0 design decision) — it
 * never writes `burg.population`/`demographics`. Within a shared Burg, administration is
 * allocated first (a state's capital needs governing regardless of whether it also sits on a
 * mineral deposit), then mines, then smelters (a smelter with no ore supply has nothing to
 * process), then quarries, then Volcanic Ash works, then construction (masons, then
 * carpenters). No cross-Burg or cross-industry share cap is applied (§5.1 decision 2).
 *
 * Also aggregates each Burg's `basicEmploymentDemand` and derives `serviceEmploymentDemand`
 * (§3.5) from it, into `basicEmploymentSummary` (Phase 4). Market-anchored `"trade"`
 * employment (§3.3, Phase 2) is read here, not reallocated: `LaborMarket.workersByOccupation`
 * is already reconciled monthly against the Market's own workforce pool
 * (`reconcileStrategicLaborMarkets` in `production-generator.ts`), so this only attributes the
 * current trade headcount to its market's `centerBurgId` — it does not compete for, or draw
 * down, that Burg's adult pool a second time here. Craft/manufacturing employment (§3.7, Phase
 * 6) follows the same read-only pattern: `production-generator.ts`'s worker loop already
 * decides monthly how much of a Burg's population goes into recipe-based Goods, so this only
 * reads the smoothed `craftEmployment` figure. The remaining `LaborMarket` occupations —
 * forestry/sailmaking/ropeMaking/tarBurning (§3.8, Phase 7) — are read the same read-only way as
 * `"trade"`: they already exist as a real `workersByOccupation` cohort (§2.3), just never
 * attributed to a Burg before this.
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

  for (const quarry of getQuarryOperations()) {
    if (!quarry.active || !quarry.burgId) continue;
    pushSlot(slotsByBurg, quarry.burgId, {
      requiredWorkers: getQuarryRequiredWorkers(quarry),
      getWorkers: () => quarry.quarryWorkers,
      setWorkers: value => {
        quarry.quarryWorkers = value;
      }
    });
  }

  for (const ashWorks of getVolcanicAshOperations()) {
    if (!ashWorks.active || !ashWorks.burgId) continue;
    pushSlot(slotsByBurg, ashWorks.burgId, {
      requiredWorkers: getVolcanicAshRequiredWorkers(ashWorks),
      getWorkers: () => ashWorks.ashWorkers,
      setWorkers: value => {
        ashWorks.ashWorkers = value;
      }
    });
  }

  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const brickAvailable = isBrickGoodAvailable();
  const highFantasy = useOptionsState.getState().culturesSet === "highFantasy";
  for (const construction of getConstructionOperations()) {
    if (!construction.active || !construction.burgId) continue;
    const burg = burgs[construction.burgId];
    if (!burg || burg.removed || burg.group === "fort") continue;
    const operation = normalizeConstructionOperation(construction, burg, populationRate);
    const demographics = getBurgDemographics(burg);
    const adults = Math.max(0, demographics.maleAdults + demographics.femaleAdults);
    const requiredDwellings = getRequiredDwellings(burg.population ?? 0, populationRate);
    const required = getConstructionRequiredWorkers({ ...operation, requiredDwellings }, adults, {
      cultureType: resolveBurgCultureType(burg),
      highFantasy,
      brickAvailable
    });
    pushSlot(slotsByBurg, operation.burgId, {
      requiredWorkers: required.mason,
      getWorkers: () => operation.masonWorkers,
      setWorkers: value => {
        operation.masonWorkers = value;
      }
    });
    pushSlot(slotsByBurg, operation.burgId, {
      requiredWorkers: required.carpenter,
      getWorkers: () => operation.carpenterWorkers,
      setWorkers: value => {
        operation.carpenterWorkers = value;
      }
    });
  }

  const tradeWorkersByBurg = getTradeWorkersByBurg();
  const strategicIndustryWorkersByBurg = getStrategicIndustryWorkersByBurg();
  const craftWorkersByBurg = new Map(getCraftEmploymentRecords().map(record => [record.burgId, record.workers]));

  const summaryBurgIds = new Set<number>([
    ...slotsByBurg.keys(),
    ...tradeWorkersByBurg.keys(),
    ...strategicIndustryWorkersByBurg.keys(),
    ...craftWorkersByBurg.keys()
  ]);
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
    const basicEmploymentDemand =
      burgAnchoredDemand +
      (tradeWorkersByBurg.get(burgId) ?? 0) +
      (strategicIndustryWorkersByBurg.get(burgId) ?? 0) +
      (craftWorkersByBurg.get(burgId) ?? 0);
    summaryRecords.push(buildBasicEmploymentSummary(burgId, basicEmploymentDemand));
  }

  setAdministrationEmployment(administrationRecords);
  setBasicEmploymentSummary(summaryRecords);
}

/**
 * Reads (does not reallocate) each market's current LaborMarket headcount for the given
 * occupation(s) and attributes the sum to that market's `centerBurgId`. Shared by
 * `getTradeWorkersByBurg()` (§3.3, Phase 2) and `getStrategicIndustryWorkersByBurg()`
 * (§3.8, Phase 7).
 */
function getStrategicOccupationWorkersByBurg(occupations: readonly StrategicOccupation[]): Map<number, number> {
  const workersByBurg = new Map<number, number>();
  const laborMarketByMarketId = new Map(
    getStrategicLaborMarkets().map(laborMarket => [laborMarket.marketId, laborMarket])
  );
  for (const market of getMarkets()) {
    if (!market.centerBurgId) continue;
    const laborMarket = laborMarketByMarketId.get(market.i);
    if (!laborMarket) continue;
    const workers = occupations.reduce(
      (sum, occupation) => sum + (laborMarket.workersByOccupation[occupation] ?? 0),
      0
    );
    if (workers <= 0) continue;
    workersByBurg.set(market.centerBurgId, (workersByBurg.get(market.centerBurgId) ?? 0) + workers);
  }
  return workersByBurg;
}

/**
 * Reads (does not reallocate) each market's current `"trade"` LaborMarket headcount
 * (§3.3, Phase 2) and attributes it to that market's `centerBurgId`. Exported so the
 * Employment Overview debug dialog (Phase 5) can show the same breakdown the annual
 * reconciliation uses, without duplicating the attribution logic.
 */
export function getTradeWorkersByBurg(): Map<number, number> {
  return getStrategicOccupationWorkersByBurg(["trade"]);
}

/**
 * Reads (does not reallocate) the sum of every non-`"trade"` LaborMarket occupation —
 * forestry/sailmaking/ropeMaking/tarBurning, the raw-material supply chain for shipbuilding
 * and general Wood (§2.3, §3.8, Phase 7) — and attributes it to each market's `centerBurgId`.
 * These cohorts existed since before this plan (shipbuilding-industrial-policy.md §4.5) but
 * were never attributed to a Burg's `basicEmploymentDemand` until now.
 */
export function getStrategicIndustryWorkersByBurg(): Map<number, number> {
  return getStrategicOccupationWorkersByBurg(STRATEGIC_INDUSTRY_OCCUPATIONS);
}

function pushSlot(map: Map<number, BasicEmploymentSlot[]>, burgId: number, slot: BasicEmploymentSlot): void {
  const slots = map.get(burgId);
  if (slots) slots.push(slot);
  else map.set(burgId, [slot]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
