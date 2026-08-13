import { getBurgDemographics, useOptionsState } from "../../hostCore";
import type { Burg } from "../../hostTypes";
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
  getVolcanicOperations,
  getWorldContext,
  setAdministrationEmployment,
  setBasicEmploymentSummary
} from "../economyContext";
import { type AdministrationEmploymentRecord, getAdministrationRequiredWorkers } from "./administrationEmployment";
import {
  getRequiredDwellings,
  isBrickGoodAvailable,
  normalizeConstructionOperation,
  resolveBurgCultureType
} from "./constructionEmployment";
import { getConstructionMacroRequiredWorkers } from "./constructionJobPostings";
import { getMineRequiredWorkers } from "./mineOperations";
import { getQuarryRequiredWorkers } from "./quarryOperations";
import { type BasicEmploymentSummaryRecord, buildBasicEmploymentSummary } from "./serviceEmployment";
import { getSmelterRequiredWorkers } from "./smelterOperations";
import { STRATEGIC_OCCUPATIONS, type StrategicOccupation } from "./strategicLaborMarketsTypes";
import { getVolcanicRequiredWorkers } from "./volcanicOperations";

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

interface MarketWorkforceSlot extends BasicEmploymentSlot {
  burgId: number;
}

/**
 * Annual, Burg-anchored reconciliation of basic-industry employment: state administration
 * (docs/plan/urban-employment-demand.md §3.4, Phase 3), mining/smelting (§3.2, Phase 1), and
 * quarrying/construction (docs/plan/urban-construction-industry.md §3.2-3.3, Phase 1-2). Each
 * slot's `workers` is a subset of its available adult workforce (§0 design decision) — it never
 * writes `burg.population`/`demographics`. Within a shared Burg, administration is
 * allocated first (a state's capital needs governing regardless of whether it also sits on a
 * mineral deposit), then quarries, then Volcanic Ash works, then construction (masons, then
 * carpenters). Mines and smelters retain a physical owner Burg but draw from every adult in their
 * market's Burgs: a resource site near a hamlet must not leave a well-populated market unable to
 * staff its industry. Within that shared market pool, smelters are allocated before mines so Ore
 * buffers can become downstream Ingots. No cross-market share cap is applied (§5.1 decision 2).
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
  const marketWorkforceSlots = new Map<number, MarketWorkforceSlot[]>();
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

  // Resource operations retain their physical site, but their labor comes from the whole market.
  // Refining precedes extraction because an Ore buffer is useful while a zero-worker smelter
  // blocks every downstream metal Good.
  for (const smelter of getSmelterOperations()) {
    if (!smelter.active || !smelter.burgId || !smelter.marketId) continue;
    pushMarketWorkforceSlot(marketWorkforceSlots, smelter.marketId, {
      burgId: smelter.burgId,
      requiredWorkers: getSmelterRequiredWorkers(smelter),
      getWorkers: () => smelter.workers,
      setWorkers: value => {
        smelter.workers = value;
      }
    });
  }

  const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
  for (const mine of getMineOperations()) {
    if (!mine.active || !mine.burgId || !mine.marketId) continue;
    const deposit = depositsById.get(mine.depositId);
    if (!deposit) continue;
    pushMarketWorkforceSlot(marketWorkforceSlots, mine.marketId, {
      burgId: mine.burgId,
      requiredWorkers: getMineRequiredWorkers(deposit),
      getWorkers: () => mine.workers,
      setWorkers: value => {
        mine.workers = value;
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

  for (const volcanicWorks of getVolcanicOperations()) {
    if (!volcanicWorks.active || !volcanicWorks.burgId) continue;
    pushSlot(slotsByBurg, volcanicWorks.burgId, {
      requiredWorkers: getVolcanicRequiredWorkers(volcanicWorks),
      getWorkers: () => volcanicWorks.volcanicWorkers,
      setWorkers: value => {
        volcanicWorks.volcanicWorkers = value;
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
    // Macro target only — reserve a share of full demand for hire-board openings
    // so anonymous reconcile does not wipe seats a player could apply for.
    const required = getConstructionMacroRequiredWorkers({ ...operation, requiredDwellings }, adults, {
      cultureType: resolveBurgCultureType(burg),
      highFantasy,
      brickAvailable
    });
    // Named hire-board seats live outside anonymous masonWorkers/carpenterWorkers pools.
    pushSlot(slotsByBurg, operation.burgId, {
      requiredWorkers: required.mason,
      getWorkers: () => operation.masonWorkers,
      setWorkers: value => {
        operation.masonWorkers = Math.max(0, value);
      }
    });
    pushSlot(slotsByBurg, operation.burgId, {
      requiredWorkers: required.carpenter,
      getWorkers: () => operation.carpenterWorkers,
      setWorkers: value => {
        operation.carpenterWorkers = Math.max(0, value);
      }
    });
  }

  const tradeWorkersByBurg = getTradeWorkersByBurg();
  const strategicIndustryWorkersByBurg = getStrategicIndustryWorkersByBurg();
  const craftWorkersByBurg = new Map(getCraftEmploymentRecords().map(record => [record.burgId, record.workers]));

  const localWorkersByBurg = new Map<number, number>();
  for (const [burgId, slots] of slotsByBurg) {
    const burg = burgs[burgId];
    if (!burg) continue;
    localWorkersByBurg.set(burgId, reconcileSlots(slots, getAdults(burg)));
  }

  const marketWorkersByBurg = new Map<number, number>();
  for (const [marketId, slots] of marketWorkforceSlots) {
    const availableAdults = getMarketAdults(marketId, burgs, localWorkersByBurg);
    reconcileSlots(slots, availableAdults);
    for (const slot of slots) {
      marketWorkersByBurg.set(slot.burgId, (marketWorkersByBurg.get(slot.burgId) ?? 0) + slot.getWorkers());
    }
  }

  const summaryBurgIds = new Set<number>([
    ...localWorkersByBurg.keys(),
    ...marketWorkersByBurg.keys(),
    ...tradeWorkersByBurg.keys(),
    ...strategicIndustryWorkersByBurg.keys(),
    ...craftWorkersByBurg.keys()
  ]);
  const summaryRecords: BasicEmploymentSummaryRecord[] = [];
  for (const burgId of summaryBurgIds) {
    if (!burgs[burgId]) continue;
    const basicEmploymentDemand =
      (localWorkersByBurg.get(burgId) ?? 0) +
      (marketWorkersByBurg.get(burgId) ?? 0) +
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

function pushMarketWorkforceSlot(
  map: Map<number, MarketWorkforceSlot[]>,
  marketId: number,
  slot: MarketWorkforceSlot
): void {
  const slots = map.get(marketId);
  if (slots) slots.push(slot);
  else map.set(marketId, [slot]);
}

function getAdults(burg: Pick<Burg, "demographics">): number {
  const demographics = getBurgDemographics(burg);
  return Math.max(0, demographics.maleAdults + demographics.femaleAdults);
}

function getMarketAdults(
  marketId: number,
  burgs: readonly (Burg | undefined)[],
  localWorkersByBurg: ReadonlyMap<number, number>
): number {
  return burgs.reduce((sum, burg) => {
    if (!burg?.i || burg.removed || burg.market !== marketId) return sum;
    return sum + Math.max(0, getAdults(burg) - (localWorkersByBurg.get(burg.i) ?? 0));
  }, 0);
}

function reconcileSlots(slots: readonly BasicEmploymentSlot[], availableAdults: number): number {
  let remainingAdults = availableAdults;
  for (const slot of slots) {
    const desiredWorkers = Math.min(slot.requiredWorkers, remainingAdults);
    const maxChange = Math.max(MIN_ANNUAL_WORKER_CHANGE, slot.requiredWorkers * MAX_ANNUAL_WORKER_CHANGE_SHARE);
    const change = clamp(desiredWorkers - slot.getWorkers(), -maxChange, maxChange);
    const nextWorkers = Math.max(0, slot.getWorkers() + change);

    slot.setWorkers(nextWorkers);
    remainingAdults = Math.max(0, remainingAdults - nextWorkers);
  }
  return slots.reduce((sum, slot) => sum + slot.getWorkers(), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
