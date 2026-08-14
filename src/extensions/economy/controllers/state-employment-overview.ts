import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import {
  getFarmLaborRequired,
  getFishingWorkers,
  getHuntingWorkers,
  getHusbandryWorkers,
  getMigratableAdults,
  getViticultureWorkers,
  getWorldContext
} from "../economyContext";
import { getBurgEmploymentComposition } from "../generators/burgEmploymentComposition";
import {
  type StateEmploymentOverviewRow,
  setStateEmploymentOverviewState
} from "../store/stateEmploymentOverviewState";

/**
 * Debug/transparency view of the adult labor ledger rolled up per State — combines the
 * per-Burg urban ledger (burgEmploymentComposition.ts, the same source Employment Overview
 * shows per-Burg) with the per-cell rural agricultural ledger (agriculturalLandUse.ts /
 * ruralOccupationAllocation.ts, not otherwise surfaced in any UI) to answer "how many adults in
 * this State are unemployed/surplus, in the cities and in the countryside." Reads
 * already-persisted ledgers only; does not reallocate labor.
 */
export function open(): void {
  openDialog("stateEmploymentOverview");
  refreshStateEmploymentOverview();
}

interface StateAccumulator {
  ruralPopulation: number;
  ruralEmployed: number;
  huntingWorkers: number;
  fishingWorkers: number;
  viticultureWorkers: number;
  husbandryWorkers: number;
  ruralSurplus: number;
  urbanPopulation: number;
  householdCare: number;
  administration: number;
  mining: number;
  smelting: number;
  trade: number;
  strategicIndustry: number;
  craft: number;
  construction: number;
  urbanSurplus: number;
}

function emptyAccumulator(): StateAccumulator {
  return {
    ruralPopulation: 0,
    ruralEmployed: 0,
    huntingWorkers: 0,
    fishingWorkers: 0,
    viticultureWorkers: 0,
    husbandryWorkers: 0,
    ruralSurplus: 0,
    urbanPopulation: 0,
    householdCare: 0,
    administration: 0,
    mining: 0,
    smelting: 0,
    trade: 0,
    strategicIndustry: 0,
    craft: 0,
    construction: 0,
    urbanSurplus: 0
  };
}

export function refreshStateEmploymentOverview(): void {
  const world = getWorldContext();
  const states = world.pack.states ?? [];
  const cells = world.pack.cells;
  const burgs = world.pack.burgs ?? [];
  const populationRate = Math.max(1, world.populationRate || 1);

  const byState = new Map<number, StateAccumulator>();
  const getAccumulator = (stateId: number): StateAccumulator => {
    let accumulator = byState.get(stateId);
    if (!accumulator) {
      accumulator = emptyAccumulator();
      byState.set(stateId, accumulator);
    }
    return accumulator;
  };

  // Rural ledger: one entry per land cell (agriculturalLandUse.ts / ruralOccupationAllocation.ts).
  // Fishing's headcount is keyed to the cell holding the Fish bonus-good slot, which can be a
  // water cell (see ruralOccupationAllocation.ts's FishingOffer doc-comment); water cells normally
  // carry no State, so fishing labor tied to an unclaimed coastal cell goes uncredited here — a
  // known approximation, same spirit as this module's other "does not reallocate" transparency views.
  if (cells?.i && cells.state) {
    const farmLaborRequired = getFarmLaborRequired();
    const migratableAdults = getMigratableAdults();
    const huntingWorkers = getHuntingWorkers();
    const fishingWorkers = getFishingWorkers();
    const viticultureWorkers = getViticultureWorkers();
    const husbandryWorkers = getHusbandryWorkers();

    for (const cellId of cells.i) {
      const stateId = cells.state[cellId];
      if (!stateId) continue;
      const accumulator = getAccumulator(stateId);
      const maleAdults = Math.max(0, cells.maleAdults?.[cellId] ?? 0);
      const femaleAdults = Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
      accumulator.ruralPopulation += (maleAdults + femaleAdults) * populationRate;
      accumulator.ruralEmployed += (farmLaborRequired[cellId] ?? 0) * populationRate;
      accumulator.ruralSurplus += (migratableAdults[cellId] ?? 0) * populationRate;
      accumulator.huntingWorkers += huntingWorkers[cellId] ?? 0;
      accumulator.fishingWorkers += fishingWorkers[cellId] ?? 0;
      accumulator.viticultureWorkers += viticultureWorkers[cellId] ?? 0;
      accumulator.husbandryWorkers += husbandryWorkers[cellId] ?? 0;
    }
  }

  // Urban ledger: burgEmploymentComposition.ts, the same source Employment Overview reads per-Burg.
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !burg.state || !burg.demographics) continue;
    const composition = getBurgEmploymentComposition(burg.i);
    if (!composition) continue;
    const accumulator = getAccumulator(burg.state);
    accumulator.urbanPopulation += composition.marketLaborForce;
    accumulator.householdCare += composition.householdCare;
    accumulator.administration += composition.administration;
    accumulator.mining += composition.mining;
    accumulator.smelting += composition.smelting;
    accumulator.trade += composition.trade;
    accumulator.strategicIndustry += composition.strategicIndustry;
    accumulator.craft += composition.craft;
    accumulator.construction += composition.construction;
    // Clamp per-Burg, matching Employment Overview's "sum of positive labor residual" total —
    // a negative residual means over-assigned/possible double-counting, not negative unemployment.
    accumulator.urbanSurplus += Math.max(0, composition.residual);
  }

  const rows: StateEmploymentOverviewRow[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const accumulator = byState.get(state.i);
    if (!accumulator) continue; // No rural cells or Burgs recorded for this State yet.

    const totalLaborForce = accumulator.ruralPopulation + accumulator.urbanPopulation;
    const totalSurplus = accumulator.ruralSurplus + accumulator.urbanSurplus;
    const unemploymentPct = totalLaborForce > 0 ? (totalSurplus / totalLaborForce) * 100 : 0;

    rows.push({
      stateId: state.i,
      stateName: state.name || `State ${state.i}`,
      totalLaborForce: rn(totalLaborForce, 1),
      ruralPopulation: rn(accumulator.ruralPopulation, 1),
      ruralEmployed: rn(accumulator.ruralEmployed, 1),
      huntingWorkers: rn(accumulator.huntingWorkers, 1),
      fishingWorkers: rn(accumulator.fishingWorkers, 1),
      viticultureWorkers: rn(accumulator.viticultureWorkers, 1),
      husbandryWorkers: rn(accumulator.husbandryWorkers, 1),
      ruralSurplus: rn(accumulator.ruralSurplus, 1),
      urbanPopulation: rn(accumulator.urbanPopulation, 1),
      householdCare: rn(accumulator.householdCare, 1),
      administration: rn(accumulator.administration, 1),
      mining: rn(accumulator.mining, 1),
      smelting: rn(accumulator.smelting, 1),
      trade: rn(accumulator.trade, 1),
      strategicIndustry: rn(accumulator.strategicIndustry, 1),
      craft: rn(accumulator.craft, 1),
      construction: rn(accumulator.construction, 1),
      urbanSurplus: rn(accumulator.urbanSurplus, 1),
      totalSurplus: rn(totalSurplus, 1),
      unemploymentPct: rn(unemploymentPct, 1)
    });
  }

  rows.sort((a, b) => b.unemploymentPct - a.unemploymentPct || b.totalSurplus - a.totalSurplus);
  setStateEmploymentOverviewState({ rows });
}
