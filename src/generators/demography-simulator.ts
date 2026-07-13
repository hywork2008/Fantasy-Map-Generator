import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { applyFoodStressToDemographics } from "./agriculturalStress";
import { Burgs } from "./burgs-generator";
import { isManpowerSimEnabled } from "./manpower";
import { recordDeaths } from "./populationLossTracker";

export interface DemographicsSimulationResult {
  bordersChanged: boolean;
  newBurgsAdded: boolean;
}

/**
 * Simulates population dynamics (aging, births, starvation/disease) using a logistic growth model.
 * Handles both rural populations (pack.cells) and urban populations (pack.burgs).
 */
export function simulateDemographics(deltaYears: number): DemographicsSimulationResult {
  const { pack } = worldContext;
  let bordersChanged = false;
  let newBurgsAdded = false;

  if (!pack?.cells || !pack.burgs) return { bordersChanged, newBurgsAdded };
  if (deltaYears <= 0) return { bordersChanged, newBurgsAdded };

  const { demographicBirthRate, demographicChildMortalityRate, simAgriculture } = useOptionsState.getState();
  const baseGrowthRate = demographicBirthRate;
  const populationRate = worldContext.populationRate || 1;
  /** Batch natural/famine point losses per state, convert once to people. */
  const naturalPts = new Map<number, number>();
  const faminePts = new Map<number, number>();
  const addLoss = (map: Map<number, number>, stateId: number, pts: number) => {
    if (!stateId || pts <= 0) return;
    map.set(stateId, (map.get(stateId) ?? 0) + pts);
  };

  // 1. Process Rural Cells
  for (let i = 0; i < pack.cells.i.length; i++) {
    if (pack.cells.pop[i] <= 0) continue;

    const stateId = pack.cells.state[i];
    const capacity = pack.cells.capacity[i];
    let children = pack.cells.children[i];
    let maleAdults = pack.cells.maleAdults[i];
    let femaleAdults = pack.cells.femaleAdults[i];
    let elders = pack.cells.elders[i];

    // Aging (rough approximation assuming 15 year cohort bins for children, 35 for adults)
    const childrenToAdults = children * (deltaYears / 15);
    const adultsToEldersMale = maleAdults * (deltaYears / 35);
    const adultsToEldersFemale = femaleAdults * (deltaYears / 35);
    const elderDeaths = elders * (deltaYears / 10); // Elders die off in ~10 years average

    // Apply child mortality linearly across childhood
    const childDeaths = children * (demographicChildMortalityRate / 15) * deltaYears;
    addLoss(naturalPts, stateId, elderDeaths + childDeaths);

    children = Math.max(0, children - childrenToAdults - childDeaths);
    maleAdults = Math.max(0, maleAdults + childrenToAdults / 2 - adultsToEldersMale);
    femaleAdults = Math.max(0, femaleAdults + childrenToAdults / 2 - adultsToEldersFemale);
    elders = Math.max(0, elders + adultsToEldersMale + adultsToEldersFemale - elderDeaths);

    // Births and Logistic Growth
    const currentTotal = children + maleAdults + femaleAdults + elders;
    const roomForGrowth = capacity > 0 ? Math.max(-0.5, 1 - currentTotal / capacity) : 0;

    // If roomForGrowth is negative, it means starvation/disease. We increase deaths across the board.
    if (roomForGrowth > 0) {
      const births = femaleAdults * baseGrowthRate * deltaYears * roomForGrowth;
      children += births;
    } else if (roomForGrowth < 0) {
      // OVERPOPULATION -> Try to migrate!
      const excessTotal = currentTotal - capacity;

      // Find best neighbor
      const neighbors = pack.cells.c[i];
      let bestNeighbor = -1;
      let bestScore = -9999;

      for (const n of neighbors) {
        if (pack.cells.h[n] < 20 || pack.cells.s[n] <= 0) continue; // must be habitable land

        const nCapacity = pack.cells.capacity[n];
        const nPop = pack.cells.pop[n];
        if (nPop >= nCapacity) continue; // must have room

        let score = pack.cells.s[n];
        if (pack.cells.r[n]) score += 50; // prefer rivers
        if (pack.cells.state[n] === pack.cells.state[i]) score += 100; // prefer own state

        if (score > bestScore) {
          bestScore = score;
          bestNeighbor = n;
        }
      }

      if (bestNeighbor !== -1) {
        // Migrate excessTotal to bestNeighbor
        const ratio = excessTotal / currentTotal;
        const mChildren = children * ratio;
        const mMale = maleAdults * ratio;
        const mFemale = femaleAdults * ratio;
        const mElders = elders * ratio;

        children -= mChildren;
        maleAdults -= mMale;
        femaleAdults -= mFemale;
        elders -= mElders;

        pack.cells.children[bestNeighbor] += mChildren;
        pack.cells.maleAdults[bestNeighbor] += mMale;
        pack.cells.femaleAdults[bestNeighbor] += mFemale;
        pack.cells.elders[bestNeighbor] += mElders;

        const oldNPop = pack.cells.pop[bestNeighbor];
        pack.cells.pop[bestNeighbor] += excessTotal;

        // State Conquest
        if (pack.cells.state[bestNeighbor] !== pack.cells.state[i]) {
          if (excessTotal > oldNPop) {
            pack.cells.state[bestNeighbor] = pack.cells.state[i];
            pack.cells.culture[bestNeighbor] = pack.cells.culture[i];
            bordersChanged = true;
          }
        }
      } else {
        // No migration possible -> Starvation reduction
        const starvationRate = Math.min(0.99, Math.abs(roomForGrowth) * deltaYears * 0.02);
        const before = children + maleAdults + femaleAdults + elders;
        children *= 1 - starvationRate;
        maleAdults *= 1 - starvationRate;
        femaleAdults *= 1 - starvationRate;
        elders *= 1 - starvationRate;
        addLoss(faminePts, stateId, before - (children + maleAdults + femaleAdults + elders));
      }
    }

    const newPop = children + maleAdults + femaleAdults + elders;

    pack.cells.children[i] = children;
    pack.cells.maleAdults[i] = maleAdults;
    pack.cells.femaleAdults[i] = femaleAdults;
    pack.cells.elders[i] = elders;
    pack.cells.pop[i] = newPop;

    // Pioneer Village Spawning
    if (newPop > worldContext.populationRate && !pack.cells.burg[i]) {
      const res = Burgs.add(pack.cells.p[i]);
      if (res?.burgId) {
        const newBurg = pack.burgs[res.burgId];

        // Transfer 30% of rural population to the new burg
        const transferRatio = 0.3;
        newBurg.demographics = {
          capacity: newPop * transferRatio * 1.5,
          children: children * transferRatio,
          maleAdults: maleAdults * transferRatio,
          femaleAdults: femaleAdults * transferRatio,
          elders: elders * transferRatio
        };
        newBurg.population = newPop * transferRatio;

        pack.cells.children[i] -= children * transferRatio;
        pack.cells.maleAdults[i] -= maleAdults * transferRatio;
        pack.cells.femaleAdults[i] -= femaleAdults * transferRatio;
        pack.cells.elders[i] -= elders * transferRatio;
        pack.cells.pop[i] -= newPop * transferRatio;

        newBurgsAdded = true;
      }
    }
  }

  // 2. Process Urban Burgs
  for (const burg of pack.burgs) {
    if (!burg?.population || !burg.demographics) continue;

    const stateId = burg.state ?? 0;
    const { capacity } = burg.demographics;
    let { children, maleAdults, femaleAdults, elders } = burg.demographics;

    const childrenToAdults = children * (deltaYears / 15);
    const adultsToEldersMale = maleAdults * (deltaYears / 35);
    const adultsToEldersFemale = femaleAdults * (deltaYears / 35);
    const elderDeaths = elders * (deltaYears / 10);
    const childDeaths = children * (demographicChildMortalityRate / 15) * deltaYears;
    addLoss(naturalPts, stateId, elderDeaths + childDeaths);

    children = Math.max(0, children - childrenToAdults - childDeaths);
    maleAdults = Math.max(0, maleAdults + childrenToAdults / 2 - adultsToEldersMale);
    femaleAdults = Math.max(0, femaleAdults + childrenToAdults / 2 - adultsToEldersFemale);
    elders = Math.max(0, elders + adultsToEldersMale + adultsToEldersFemale - elderDeaths);

    const currentTotal = children + maleAdults + femaleAdults + elders;
    const roomForGrowth = capacity > 0 ? Math.max(-0.5, 1 - currentTotal / capacity) : 0;

    if (roomForGrowth > 0) {
      // Garrison forts have negligible resident families — suppress natural increase.
      if (burg.group !== "fort") {
        const births = femaleAdults * baseGrowthRate * deltaYears * roomForGrowth;
        children += births;
      }
    } else if (roomForGrowth < 0) {
      const starvationRate = Math.min(0.99, Math.abs(roomForGrowth) * deltaYears * 0.02);
      const before = children + maleAdults + femaleAdults + elders;
      children *= 1 - starvationRate;
      maleAdults *= 1 - starvationRate;
      femaleAdults *= 1 - starvationRate;
      elders *= 1 - starvationRate;
      addLoss(faminePts, stateId, before - (children + maleAdults + femaleAdults + elders));
    }

    const newPop = children + maleAdults + femaleAdults + elders;

    burg.demographics.children = children;
    burg.demographics.maleAdults = maleAdults;
    burg.demographics.femaleAdults = femaleAdults;
    burg.demographics.elders = elders;
    burg.population = newPop;
  }

  // Food disruption from fighting in planting/harvest seasons (records famine deaths itself)
  if (simAgriculture) {
    applyFoodStressToDemographics(pack, deltaYears);
  }

  for (const [stateId, pts] of naturalPts) {
    recordDeaths(stateId, pts * populationRate, "natural");
  }
  for (const [stateId, pts] of faminePts) {
    recordDeaths(stateId, pts * populationRate, "famine");
  }

  return { bordersChanged, newBurgsAdded };
}

/**
 * Combat deaths feedback into population + Population Overview combat tally.
 *
 * Always records headcount under cause "combat" for the overview dialog.
 * When simManpower is on, men were already removed from civilian stocks at draft time —
 * regiment.a is the under-arms ledger, so we must not subtract civilians again.
 * When simManpower is off, fall back to the legacy "kill civilian males" path.
 */
export function applyDemographicCasualties(stateId: number, deadTroops: number): void {
  if (!stateId || deadTroops <= 0 || !Number.isFinite(deadTroops)) return;

  // Overview tally first — independent of pack readiness / manpower mode
  recordDeaths(stateId, deadTroops, "combat");

  const { pack, populationRate } = worldContext;
  if (!pack?.cells || !pack.burgs) return;

  // Manpower ledger: under-arms already shrank with regiment.a; civilians were deducted at draft.
  if (isManpowerSimEnabled()) return;

  const deadPopPoints = deadTroops / populationRate;

  let totalWeightedAdults = 0;

  // 1. Calculate total weighted pool
  for (let i = 0; i < pack.cells.i.length; i++) {
    if (pack.cells.state[i] === stateId) {
      totalWeightedAdults += pack.cells.maleAdults[i] * 1; // Rural weight = 1
    }
  }
  for (const burg of pack.burgs) {
    if (burg && burg.state === stateId && burg.demographics) {
      totalWeightedAdults += burg.demographics.maleAdults * 10; // Urban weight = 10
    }
  }

  if (totalWeightedAdults <= 0) return;

  // 2. Distribute casualties
  const damageRatio = Math.min(1.0, deadPopPoints / totalWeightedAdults);

  for (let i = 0; i < pack.cells.i.length; i++) {
    if (pack.cells.state[i] === stateId) {
      const damage = pack.cells.maleAdults[i] * 1 * damageRatio;
      pack.cells.maleAdults[i] -= damage;
      pack.cells.pop[i] -= damage;
    }
  }

  for (const burg of pack.burgs) {
    if (burg && burg.state === stateId && burg.demographics) {
      const damage = burg.demographics.maleAdults * 10 * damageRatio;
      burg.demographics.maleAdults -= damage;
      burg.population! -= damage;
    }
  }
}

/**
 * Applies historical war scars to population generated at map start.
 * Scans state history for major wars in the last 30 years and applies a flat
 * 3% - 5% casualty rate to maleAdults and elders to create a "widow village" effect.
 */
export function applyHistoricalWarScars(): void {
  const { pack, options } = worldContext;
  if (!pack?.cells || !pack.burgs || !pack.states) return;

  const currentYear = options.year || 1000;

  for (const state of pack.states) {
    if (!state.i || state.removed || !state.campaigns) continue;

    // Check if state had a war in the last 30 years
    const hasRecentWar = state.campaigns.some(c => {
      // campaigns are stored differently depending on the generator, typically { name, start, end }
      const startYear =
        typeof c.start === "number" ? c.start : c.start ? parseInt(c.start as unknown as string, 10) : 0;
      return startYear > 0 && currentYear - startYear <= 30;
    });

    if (hasRecentWar) {
      // Random casualty rate between 3% and 5%
      const casualtyRate = 0.03 + Math.random() * 0.02;
      const multiplier = 1 - casualtyRate;

      // Apply to rural cells
      for (let i = 0; i < pack.cells.i.length; i++) {
        if (pack.cells.state[i] === state.i && pack.cells.pop[i] > 0) {
          const maleAdultsLost = pack.cells.maleAdults[i] * casualtyRate;
          const eldersLost = pack.cells.elders[i] * casualtyRate;

          pack.cells.maleAdults[i] *= multiplier;
          pack.cells.elders[i] *= multiplier;
          pack.cells.pop[i] -= maleAdultsLost + eldersLost;
        }
      }

      // Apply to urban burgs
      for (const burg of pack.burgs) {
        if (burg && burg.state === state.i && burg.demographics && burg.population) {
          const maleAdultsLost = burg.demographics.maleAdults * casualtyRate;
          const eldersLost = burg.demographics.elders * casualtyRate;

          burg.demographics.maleAdults *= multiplier;
          burg.demographics.elders *= multiplier;
          burg.population -= maleAdultsLost + eldersLost;
        }
      }
    }
  }
}
