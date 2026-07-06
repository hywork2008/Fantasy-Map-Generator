import { worldContext } from "../context/worldContext";
import { Burgs } from "./burgs-generator";

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

  const baseGrowthRate = 0.05; // 5% base growth rate per female adult per year (example)

  // 1. Process Rural Cells
  for (let i = 0; i < pack.cells.i.length; i++) {
    if (pack.cells.pop[i] <= 0) continue;

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

    children = Math.max(0, children - childrenToAdults);
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
        children *= 1 - starvationRate;
        maleAdults *= 1 - starvationRate;
        femaleAdults *= 1 - starvationRate;
        elders *= 1 - starvationRate;
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

    const { capacity } = burg.demographics;
    let { children, maleAdults, femaleAdults, elders } = burg.demographics;

    const childrenToAdults = children * (deltaYears / 15);
    const adultsToEldersMale = maleAdults * (deltaYears / 35);
    const adultsToEldersFemale = femaleAdults * (deltaYears / 35);
    const elderDeaths = elders * (deltaYears / 10);

    children = Math.max(0, children - childrenToAdults);
    maleAdults = Math.max(0, maleAdults + childrenToAdults / 2 - adultsToEldersMale);
    femaleAdults = Math.max(0, femaleAdults + childrenToAdults / 2 - adultsToEldersFemale);
    elders = Math.max(0, elders + adultsToEldersMale + adultsToEldersFemale - elderDeaths);

    const currentTotal = children + maleAdults + femaleAdults + elders;
    const roomForGrowth = capacity > 0 ? Math.max(-0.5, 1 - currentTotal / capacity) : 0;

    if (roomForGrowth > 0) {
      const births = femaleAdults * baseGrowthRate * deltaYears * roomForGrowth;
      children += births;
    } else if (roomForGrowth < 0) {
      const starvationRate = Math.min(0.99, Math.abs(roomForGrowth) * deltaYears * 0.02);
      children *= 1 - starvationRate;
      maleAdults *= 1 - starvationRate;
      femaleAdults *= 1 - starvationRate;
      elders *= 1 - starvationRate;
    }

    const newPop = children + maleAdults + femaleAdults + elders;

    burg.demographics.children = children;
    burg.demographics.maleAdults = maleAdults;
    burg.demographics.femaleAdults = femaleAdults;
    burg.demographics.elders = elders;
    burg.population = newPop;
  }

  return { bordersChanged, newBurgsAdded };
}

/**
 * Distributes military casualties (troops) across a state's population demographics.
 * Casualties are converted back to population points, and drawn primarily from
 * the `maleAdults` bucket. Urban areas (burgs) suffer 10x higher casualty rates
 * than rural areas to protect agricultural output.
 */
export function applyDemographicCasualties(stateId: number, deadTroops: number): void {
  const { pack, populationRate } = worldContext;
  if (!pack?.cells || !pack.burgs || deadTroops <= 0) return;

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
