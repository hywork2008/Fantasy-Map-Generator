import type { SimulationContext } from "../context/simulationContext";
import { simulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { applyFoodStressToDemographics } from "./agriculturalStress";
import { Burgs } from "./burgs-generator";
import {
  addDemographicBuckets,
  getCellDemographics,
  setCellDemographics,
  splitDemographicBuckets
} from "./demographicTransfer";
import { applyWoundedReturn, isManpowerSimEnabled, scaleLandMilitary } from "./manpower";
import { recordDeaths } from "./populationLossTracker";

/**
 * Assumed span (years) of the "children" cohort bin before aging into adulthood. Shared with
 * economy's sustainableAdultOutflow (docs/plan/megacity-food-import-economy.md §4.1), which
 * estimates this year's child→adult arrivals from the same cohort-turnover rate.
 */
export const CHILD_COHORT_YEARS = 15;

/** Population points; convert to people with worldContext.populationRate for display only. */
const MIN_RURAL_POINTS_FOR_PROMOTION = 2;
const MIN_SETTLEMENT_POINTS = 0.5;
const RURAL_TO_SETTLEMENT_SHARE = 0.3;
const MAX_STATE_URBAN_SHARE = 0.18;
const SETTLEMENT_SPACING_HOPS = 2;

export interface DemographicsSimulationResult {
  bordersChanged: boolean;
  newBurgsAdded: boolean;
  routesAdded: boolean;
  promotedSettlements: readonly PromotedSettlement[];
}

/** Completed service-centre promotions for host systems and extensions to observe. */
export interface PromotedSettlement {
  readonly burgId: number;
  readonly cellId: number;
  readonly stateId: number;
}

/**
 * Simulates population dynamics (aging, births, starvation/disease) using a logistic growth model.
 * Handles both rural populations (pack.cells) and urban populations (pack.burgs).
 */
export function simulateDemographics(deltaYears: number): DemographicsSimulationResult {
  const { pack } = worldContext;
  const bordersChanged = false;
  let newBurgsAdded = false;
  let routesAdded = false;
  let promotedSettlements: readonly PromotedSettlement[] = [];

  if (!pack?.cells || !pack.burgs) return { bordersChanged, newBurgsAdded, routesAdded, promotedSettlements };
  if (deltaYears <= 0) return { bordersChanged, newBurgsAdded, routesAdded, promotedSettlements };

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
    const childrenToAdults = children * (deltaYears / CHILD_COHORT_YEARS);
    const adultsToEldersMale = maleAdults * (deltaYears / 35);
    const adultsToEldersFemale = femaleAdults * (deltaYears / 35);
    const elderDeaths = elders * (deltaYears / 10); // Elders die off in ~10 years average

    // Apply child mortality linearly across childhood
    const childDeaths = children * (demographicChildMortalityRate / CHILD_COHORT_YEARS) * deltaYears;
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
        // Phase 3 expansion is a project, not an incidental population move.
        // Demographic migration can stay inside the existing polity only; an
        // unclaimed neighbor must go through Frontier Expansion's outpost flow.
        if (pack.cells.state[n] !== stateId) continue;
        score += 100;

        if (score > bestScore) {
          bestScore = score;
          bestNeighbor = n;
        }
      }

      if (bestNeighbor !== -1) {
        // Migrate excessTotal to bestNeighbor, preserving all four age/sex buckets.
        const ratio = excessTotal / currentTotal;
        const { moved, remaining } = splitDemographicBuckets({ children, maleAdults, femaleAdults, elders }, ratio);
        ({ children, maleAdults, femaleAdults, elders } = remaining);

        setCellDemographics(
          pack.cells,
          bestNeighbor,
          addDemographicBuckets(getCellDemographics(pack.cells, bestNeighbor), moved)
        );
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
  }

  // 2. Process Urban Burgs
  for (const burg of pack.burgs) {
    if (!burg?.population || !burg.demographics) continue;

    const stateId = burg.state ?? 0;
    const { capacity } = burg.demographics;
    // Economy's food-import network may temporarily raise a burg's carrying capacity.
    // Older saved maps have no effectiveCapacity, so retain the base-capacity behavior.
    const effectiveCapacity = burg.demographics.effectiveCapacity ?? capacity;
    let { children, maleAdults, femaleAdults, elders } = burg.demographics;

    const childrenToAdults = children * (deltaYears / CHILD_COHORT_YEARS);
    const adultsToEldersMale = maleAdults * (deltaYears / 35);
    const adultsToEldersFemale = femaleAdults * (deltaYears / 35);
    const elderDeaths = elders * (deltaYears / 10);
    const childDeaths = children * (demographicChildMortalityRate / CHILD_COHORT_YEARS) * deltaYears;
    addLoss(naturalPts, stateId, elderDeaths + childDeaths);

    children = Math.max(0, children - childrenToAdults - childDeaths);
    maleAdults = Math.max(0, maleAdults + childrenToAdults / 2 - adultsToEldersMale);
    femaleAdults = Math.max(0, femaleAdults + childrenToAdults / 2 - adultsToEldersFemale);
    elders = Math.max(0, elders + adultsToEldersMale + adultsToEldersFemale - elderDeaths);

    const currentTotal = children + maleAdults + femaleAdults + elders;
    const roomForGrowth = effectiveCapacity > 0 ? Math.max(-0.5, 1 - currentTotal / effectiveCapacity) : 0;

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

  // Burgs are service centres, not a direct rendering of every populated cell.
  // Evaluate promotion once per calendar year after all population changes, so
  // nearby cells cannot all urbanise during the same daily simulation batch.
  if (simulationContext.currentMonth === 1 && simulationContext.currentDay === 1) {
    const promotion = promoteRuralSettlements(worldContext, simulationContext);
    newBurgsAdded = promotion.newBurgsAdded || newBurgsAdded;
    routesAdded = promotion.routesAdded || routesAdded;
    promotedSettlements = promotion.promotedSettlements;
  }

  for (const [stateId, pts] of naturalPts) {
    recordDeaths(stateId, pts * populationRate, "natural");
  }
  for (const [stateId, pts] of faminePts) {
    recordDeaths(stateId, pts * populationRate, "famine");
  }

  return { bordersChanged, newBurgsAdded, routesAdded, promotedSettlements };
}

export interface SettlementPromotionCandidate {
  readonly stateId: number;
  readonly cellId: number;
  /** Rural population points moved into the new settlement. */
  readonly settlementPopulation: number;
  readonly score: number;
}

/**
 * Returns at most one service-centre promotion per State. Population stays in
 * points throughout; multiplying by populationRate here would make a 16k rural
 * cell require one million people before it could form a town.
 */
export function getSettlementPromotionCandidates(
  world: Readonly<WorldContext>,
  simulation: Readonly<SimulationContext>
): readonly SettlementPromotionCandidate[] {
  const { cells, burgs, states } = world.pack;
  if (!cells?.i || !burgs || !states) return [];

  const totalsByState = new Map<number, { rural: number; urban: number }>();
  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    const stateId = cells.state[cellId];
    if (!stateId) continue;
    const totals = totalsByState.get(stateId) ?? { rural: 0, urban: 0 };
    totals.rural += cells.pop[cellId] ?? 0;
    totalsByState.set(stateId, totals);
  }
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !burg.state) continue;
    const totals = totalsByState.get(burg.state) ?? { rural: 0, urban: 0 };
    totals.urban += burg.population ?? 0;
    totalsByState.set(burg.state, totals);
  }

  const selected: SettlementPromotionCandidate[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const totals = totalsByState.get(state.i);
    if (!totals) continue;
    const urbanHeadroom = (totals.rural + totals.urban) * MAX_STATE_URBAN_SHARE - totals.urban;
    if (urbanHeadroom < MIN_SETTLEMENT_POINTS) continue;

    const candidates: SettlementPromotionCandidate[] = [];
    for (let cellId = 0; cellId < cells.i.length; cellId++) {
      if (cells.state[cellId] !== state.i || cells.burg[cellId]) continue;
      const ruralPopulation = cells.pop[cellId] ?? 0;
      if (ruralPopulation < MIN_RURAL_POINTS_FOR_PROMOTION) continue;
      if (!isSettlementSite(cells, cellId) || hasNearbyBurg(cells, cellId, SETTLEMENT_SPACING_HOPS)) continue;

      const settlementPopulation = Math.min(ruralPopulation * RURAL_TO_SETTLEMENT_SHARE, urbanHeadroom);
      if (settlementPopulation < MIN_SETTLEMENT_POINTS) continue;
      candidates.push({
        stateId: state.i,
        cellId,
        settlementPopulation,
        score: getSettlementSiteScore(cells, cellId, ruralPopulation)
      });
    }
    const best = candidates.sort((a, b) => b.score - a.score || b.settlementPopulation - a.settlementPopulation)[0];
    if (best) selected.push(best);
  }
  void simulation; // Promotion eligibility is intentionally based on live world demographics and settlement topology.
  return selected;
}

function promoteRuralSettlements(
  world: WorldContext,
  simulation: SimulationContext
): Pick<DemographicsSimulationResult, "newBurgsAdded" | "routesAdded" | "promotedSettlements"> {
  const { cells, burgs } = world.pack;
  const candidates = getSettlementPromotionCandidates(world, simulation);
  let newBurgsAdded = false;
  let routesAdded = false;
  const promotedSettlements: PromotedSettlement[] = [];

  for (const candidate of candidates) {
    // A prior candidate can only add a burg in another State, but re-checking
    // protects this transaction if a future rule permits multiple promotions.
    if (cells.burg[candidate.cellId]) continue;
    const result = Burgs.add(cells.p[candidate.cellId], {
      routeStateId: candidate.stateId,
      developPort: true
    });
    const burg = burgs[result.burgId];
    if (!burg) continue;

    const ruralPopulation = cells.pop[candidate.cellId] ?? 0;
    if (ruralPopulation <= 0) continue;
    const ratio = candidate.settlementPopulation / ruralPopulation;
    const { moved, remaining } = splitDemographicBuckets(getCellDemographics(cells, candidate.cellId), ratio);
    setCellDemographics(cells, candidate.cellId, remaining);
    burg.population = candidate.settlementPopulation;
    burg.demographics = { capacity: candidate.settlementPopulation * 1.5, ...moved };
    Burgs.changeGroup(burg);
    newBurgsAdded = true;
    routesAdded = Boolean(result.newRoute) || routesAdded;
    promotedSettlements.push({ burgId: result.burgId, cellId: candidate.cellId, stateId: candidate.stateId });
  }
  return { newBurgsAdded, routesAdded, promotedSettlements };
}

function isSettlementSite(cells: WorldContext["pack"]["cells"], cellId: number): boolean {
  const routeLegs = Object.keys(cells.routes?.[cellId] ?? {}).length;
  return Boolean(cells.r[cellId] || cells.harbor[cellId] || cells.conf[cellId] || routeLegs >= 2);
}

function getSettlementSiteScore(cells: WorldContext["pack"]["cells"], cellId: number, ruralPopulation: number): number {
  const routeLegs = Object.keys(cells.routes?.[cellId] ?? {}).length;
  return (
    ruralPopulation +
    (cells.r[cellId] ? 5 : 0) +
    (cells.harbor[cellId] ? 4 : 0) +
    (cells.conf[cellId] ? 3 : 0) +
    routeLegs * 2
  );
}

function hasNearbyBurg(cells: WorldContext["pack"]["cells"], origin: number, maxHops: number): boolean {
  const queue: Array<{ cellId: number; hops: number }> = [{ cellId: origin, hops: 0 }];
  const visited = new Set<number>([origin]);
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (current.hops > 0 && cells.burg[current.cellId]) return true;
    if (current.hops >= maxHops) continue;
    for (const neighbor of cells.c[current.cellId] ?? []) {
      if (visited.has(neighbor) || cells.h[neighbor] < 20) continue;
      visited.add(neighbor);
      queue.push({ cellId: neighbor, hops: current.hops + 1 });
    }
  }
  return false;
}

/**
 * Combat deaths feedback into population + Population Overview combat tally.
 *
 * Always records headcount under cause "combat" for the overview dialog.
 * Optional `cellId` is the battlefield cell for the Combat Deaths map layer.
 * When simManpower is on, men were already removed from civilian stocks at draft time —
 * regiment.a is the under-arms ledger, so we must not subtract civilians again.
 * When simManpower is off, fall back to the legacy "kill civilian males" path.
 */
export function applyDemographicCasualties(stateId: number, deadTroops: number, cellId?: number): void {
  if (!stateId || deadTroops <= 0 || !Number.isFinite(deadTroops)) return;

  // Overview tally first — independent of pack readiness / manpower mode
  recordDeaths(stateId, deadTroops, "combat", cellId !== undefined ? { cellId } : undefined);

  const { pack, populationRate } = worldContext;
  if (!pack?.cells || !pack.burgs) return;

  // Phase 5: a share of combat dead return home as wounded civilians (not combat-effective)
  if (isManpowerSimEnabled()) {
    applyWoundedReturn(pack, stateId, deadTroops, populationRate);
    // Under-arms already shrank with regiment.a; bulk of civilians were deducted at draft.
    return;
  }

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
 * Applies historical war scars to population (and military) generated at map start.
 * Scans state history for major wars in the last 30 years and applies a flat
 * 3% - 5% casualty rate to maleAdults and elders to create a "widow village" effect.
 * When simManpower is on, land regiments are scaled by the same multiplier so army
 * size stays consistent with the scarred male pool (manpower-ecosystem §6.1).
 */
export function applyHistoricalWarScars(): void {
  const { pack, options } = worldContext;
  if (!pack?.cells || !pack.burgs || !pack.states) return;

  const currentYear = options.year || 1000;
  const manpowerOn = isManpowerSimEnabled();

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

      // Under-strength armies after recent wars (same rate as civilian male scars)
      if (manpowerOn) {
        scaleLandMilitary(state, multiplier);
      }
    }
  }
}
