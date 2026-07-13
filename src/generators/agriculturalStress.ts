/**
 * Coarse agricultural disruption from fighting in planting / harvest seasons.
 * docs/plan/military/manpower-ecosystem.md §18
 */
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { getLatitude } from "../utils/commonUtils";
import { getSeason, getSeasonalityStrength } from "../utils/seasonUtils";
import { currentLandTroops, stateHasEnemy, sumCivilianMalePoints, troopsToPoints } from "./manpower";
import { recordDeaths } from "./populationLossTracker";

const PLANT_REF_DAYS = 60;
const HARVEST_REF_DAYS = 60;
const CARRY_OVER_FRACTION = 0.35;

export function getStateFoodStress(stateId: number): number {
  const state = worldContext.pack?.states?.[stateId];
  return state?.foodStress ?? 0;
}

function capitalLatitude(pack: PackedGraph, state: State): number {
  const { mapCoordinates, graphHeight } = worldContext;
  const cell = state.center;
  const point = pack.cells.p[cell];
  if (!point) return 0;
  return getLatitude(point[1], mapCoordinates, graphHeight);
}

function mobilizationRatio(pack: PackedGraph, state: State): number {
  const rate = worldContext.populationRate || 1;
  const underArms = troopsToPoints(currentLandTroops(state), rate);
  const civilian = sumCivilianMalePoints(pack, state.i);
  const stock = underArms + civilian;
  if (stock <= 0) return 0;
  return Math.min(1, underArms / stock);
}

function finalizeYear(state: State): void {
  const plantFactor = Math.min(1.2, (state.plantingExposure ?? 0) / PLANT_REF_DAYS);
  const harvestFactor = Math.min(1.2, (state.harvestExposure ?? 0) / HARVEST_REF_DAYS);
  const raw = 0.55 * plantFactor + 0.7 * harvestFactor;
  const foodStress = Math.min(1.5, raw + 0.4 * (state.agricultureCarryOver ?? 0));
  state.foodStress = foodStress;
  state.agricultureCarryOver = CARRY_OVER_FRACTION * foodStress;
  state.plantingExposure = 0;
  state.harvestExposure = 0;
}

/**
 * Accumulate spring/autumn war exposure. On calendar year change, bake foodStress.
 * deltaDays should reflect the real elapsed time (day-based advance).
 */
export function tickAgriculturalCalendar(pack: PackedGraph, deltaDays: number, year: number, month: number): void {
  if (deltaDays <= 0) return;

  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;

    if (state.agricultureYear === undefined) state.agricultureYear = year;
    if (year > state.agricultureYear) {
      const yearsJumped = year - state.agricultureYear;
      for (let y = 0; y < yearsJumped; y++) finalizeYear(state);
      state.agricultureYear = year;
    }

    const atWar = stateHasEnemy(state);
    if (!atWar) continue;

    const lat = capitalLatitude(pack, state);
    if (!Number.isFinite(lat)) continue;
    const season = getSeason(lat, month);
    const strength = getSeasonalityStrength(lat);
    if (!Number.isFinite(strength) || strength <= 0.01) continue;

    const mob = mobilizationRatio(pack, state);
    const gain = deltaDays * strength * (1 + 0.5 * mob);
    if (!Number.isFinite(gain) || gain <= 0) continue;

    if (season === "spring") {
      state.plantingExposure = (state.plantingExposure ?? 0) + gain;
    } else if (season === "autumn") {
      state.harvestExposure = (state.harvestExposure ?? 0) + gain;
    }
  }
}

function scaleBucket(value: number, rate: number): number {
  return Math.max(0, value * (1 - rate));
}

/** Apply starvation to one settlement's four buckets; returns new total. */
export function starveDemographics(
  children: number,
  maleAdults: number,
  femaleAdults: number,
  elders: number,
  starveRate: number
): { children: number; maleAdults: number; femaleAdults: number; elders: number; total: number } {
  const c = scaleBucket(children, starveRate * 1.3);
  const m = scaleBucket(maleAdults, starveRate);
  const f = scaleBucket(femaleAdults, starveRate);
  const e = scaleBucket(elders, starveRate * 1.2);
  return { children: c, maleAdults: m, femaleAdults: f, elders: e, total: c + m + f + e };
}

/**
 * Food-stress famine pass over all cells/burgs of stressed states.
 */
export function applyFoodStressToDemographics(pack: PackedGraph, deltaYears: number): void {
  if (deltaYears <= 0) return;
  const populationRate = worldContext.populationRate || 1;
  const faminePts = new Map<number, number>();

  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    const stress = state.foodStress ?? 0;
    if (stress <= 0.001) continue;

    const baseRate = Math.min(0.25, 0.12 * stress) * deltaYears;
    let lostPts = 0;

    for (let i = 0; i < pack.cells.i.length; i++) {
      if (pack.cells.state[i] !== state.i || pack.cells.pop[i] <= 0) continue;
      const rate = baseRate * 0.85;
      const before = pack.cells.pop[i];
      const next = starveDemographics(
        pack.cells.children[i],
        pack.cells.maleAdults[i],
        pack.cells.femaleAdults[i],
        pack.cells.elders[i],
        rate
      );
      pack.cells.children[i] = next.children;
      pack.cells.maleAdults[i] = next.maleAdults;
      pack.cells.femaleAdults[i] = next.femaleAdults;
      pack.cells.elders[i] = next.elders;
      pack.cells.pop[i] = next.total;
      lostPts += before - next.total;
    }

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== state.i || !burg.demographics) continue;
      const d = burg.demographics;
      const rate = baseRate * 1.15;
      const before = d.children + d.maleAdults + d.femaleAdults + d.elders;
      const next = starveDemographics(d.children, d.maleAdults, d.femaleAdults, d.elders, rate);
      d.children = next.children;
      d.maleAdults = next.maleAdults;
      d.femaleAdults = next.femaleAdults;
      d.elders = next.elders;
      burg.population = next.total;
      lostPts += before - next.total;
    }

    if (lostPts > 0) faminePts.set(state.i, lostPts);
  }

  for (const [stateId, pts] of faminePts) {
    recordDeaths(stateId, pts * populationRate, "famine");
  }
}

export function isAgricultureSimEnabled(): boolean {
  return useOptionsState.getState().simAgriculture;
}

/** Economy production multiplier for food goods. */
export function foodStressProductionMultiplier(stateId: number): number {
  const stress = getStateFoodStress(stateId);
  return Math.max(0.15, 1 - 0.65 * stress);
}

/** Extra price factor for food / essential goods. */
export function foodStressPriceMultiplier(stateId: number): number {
  const stress = getStateFoodStress(stateId);
  return 1 + 0.8 * stress;
}
