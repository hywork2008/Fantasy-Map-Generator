/**
 * Manpower ledger: civilian adult males ↔ troops under arms.
 * See docs/plan/military/manpower-ecosystem.md.
 *
 * Units:
 * - Demographics buckets / cells.pop / burg.population: population *points*
 * - regiment.a / regiment.t: headcount (people), already scaled by populationRate at generate time
 * - points = headcount / populationRate
 */
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { recordDeaths } from "./populationLossTracker";

/** Peacetime under-arms target as a share of total people. */
export const PEACE_TARGET_MOBILIZATION = 0.01;
/** Wartime / outnumbered target. */
export const WAR_TARGET_MOBILIZATION = 0.03;
/** Max share of adult males that may be under arms in peacetime. */
export const MAX_LEVY_OF_MALE_ADULTS = 0.25;
/** Max share of adult males under arms in existential war. */
export const WAR_MAX_LEVY_OF_MALE_ADULTS = 0.4;
/** Fraction of gap closed per year when raising capacity. */
export const ANNUAL_DRAFT_SHARE = 0.5;
/** Fraction of surplus capacity demobilized per year in peacetime. */
export const DEMOBILIZATION_SHARE_PEACE = 0.3;
/** Headcount recovery toward r.t per year (capped by civilian males when ledger is on). */
export const RECOVERY_RATE_PER_YEAR = 0.2;

export function troopsToPoints(troops: number, populationRate = worldContext.populationRate): number {
  const rate = populationRate || 1;
  return troops / rate;
}

export function pointsToTroops(points: number, populationRate = worldContext.populationRate): number {
  return points * (populationRate || 1);
}

export function landRegiments(state: State): MilitaryRegiment[] {
  return (state.military ?? []).filter(r => !r.n);
}

export function currentLandTroops(state: State): number {
  return landRegiments(state).reduce((sum, r) => sum + r.a, 0);
}

export function currentLandCapacity(state: State): number {
  return landRegiments(state).reduce((sum, r) => sum + r.t, 0);
}

/** Display-ish total people for the state (same convention as Nobility Mobilization). */
export function statePopulationPeople(state: State): number {
  return ((state.rural ?? 0) + (state.urban ?? 0)) * 1000;
}

export function sumCivilianMalePoints(pack: PackedGraph, stateId: number): number {
  const { cells, burgs } = pack;
  let total = 0;
  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] === stateId) total += cells.maleAdults[i] ?? 0;
  }
  for (const burg of burgs) {
    if (burg?.state === stateId && burg.demographics) total += burg.demographics.maleAdults;
  }
  return total;
}

/**
 * Remove `points` of civilian adult males from the state, weighted rural:urban = 1 : 1.5.
 * Returns points actually removed.
 */
export function removeCivilianMalePoints(pack: PackedGraph, stateId: number, points: number): number {
  if (points <= 0) return 0;

  const { cells, burgs } = pack;
  const RURAL_W = 1;
  const URBAN_W = 1.5;

  type Slot = { kind: "cell" | "burg"; id: number; male: number; weight: number };
  const slots: Slot[] = [];
  let weighted = 0;

  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId) continue;
    const male = cells.maleAdults[i] ?? 0;
    if (male <= 0) continue;
    const w = male * RURAL_W;
    slots.push({ kind: "cell", id: i, male, weight: w });
    weighted += w;
  }
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || burg.state !== stateId || !burg.demographics) continue;
    const male = burg.demographics.maleAdults;
    if (male <= 0) continue;
    const w = male * URBAN_W;
    slots.push({ kind: "burg", id: burg.i, male, weight: w });
    weighted += w;
  }

  if (weighted <= 0) return 0;

  const totalMale = slots.reduce((s, x) => s + x.male, 0);
  let remaining = Math.min(points, totalMale);
  let removed = 0;

  // Weight decides share of the cut; second pass drains leftovers so we can empty the pool.
  for (const slot of slots) {
    if (remaining <= 0) break;
    const share = (slot.weight / weighted) * Math.min(points, totalMale);
    const actual = Math.min(slot.male, share, remaining);
    if (actual <= 0) continue;
    if (slot.kind === "cell") {
      cells.maleAdults[slot.id] -= actual;
      cells.pop[slot.id] = Math.max(0, cells.pop[slot.id] - actual);
    } else {
      const burg = burgs[slot.id];
      if (!burg.demographics) continue;
      burg.demographics.maleAdults -= actual;
      burg.population = Math.max(0, (burg.population ?? 0) - actual);
    }
    removed += actual;
    remaining -= actual;
  }

  if (remaining > 1e-9) {
    for (const slot of slots) {
      if (remaining <= 0) break;
      const maleLeft =
        slot.kind === "cell" ? (cells.maleAdults[slot.id] ?? 0) : (burgs[slot.id].demographics?.maleAdults ?? 0);
      const actual = Math.min(maleLeft, remaining);
      if (actual <= 0) continue;
      if (slot.kind === "cell") {
        cells.maleAdults[slot.id] -= actual;
        cells.pop[slot.id] = Math.max(0, cells.pop[slot.id] - actual);
      } else {
        const burg = burgs[slot.id];
        if (!burg.demographics) continue;
        burg.demographics.maleAdults -= actual;
        burg.population = Math.max(0, (burg.population ?? 0) - actual);
      }
      removed += actual;
      remaining -= actual;
    }
  }
  return removed;
}

/** Return adult male points to civilian population (demobilization survivors). */
export function addCivilianMalePoints(pack: PackedGraph, stateId: number, points: number): number {
  if (points <= 0) return 0;

  const { cells, burgs } = pack;
  type Slot = { kind: "cell" | "burg"; id: number; pop: number };
  const slots: Slot[] = [];
  let popSum = 0;

  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId || cells.pop[i] <= 0) continue;
    slots.push({ kind: "cell", id: i, pop: cells.pop[i] });
    popSum += cells.pop[i];
  }
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || burg.state !== stateId) continue;
    const pop = burg.population ?? 0;
    if (pop <= 0) continue;
    slots.push({ kind: "burg", id: burg.i, pop });
    popSum += pop;
  }

  if (popSum <= 0 || !slots.length) return 0;

  let added = 0;
  for (const slot of slots) {
    const share = (slot.pop / popSum) * points;
    if (slot.kind === "cell") {
      cells.maleAdults[slot.id] = (cells.maleAdults[slot.id] ?? 0) + share;
      cells.pop[slot.id] += share;
    } else {
      const burg = burgs[slot.id];
      if (!burg.demographics) {
        burg.demographics = {
          capacity: burg.population ?? share,
          children: 0,
          maleAdults: 0,
          femaleAdults: 0,
          elders: 0
        };
      }
      burg.demographics.maleAdults += share;
      burg.population = (burg.population ?? 0) + share;
    }
    added += share;
  }
  return added;
}

export function stateHasEnemy(state: State): boolean {
  const dip = state.diplomacy;
  if (!dip) return false;
  for (let i = 0; i < dip.length; i++) {
    if (dip[i] === "Enemy") return true;
  }
  return false;
}

/** Hostile estimated power from intelligence (Nobility); 0 if unavailable. */
function hostilePowerFromIntel(state: State): number {
  const intel = simulationContext.intelligence[state.i] ?? {};
  let total = 0;
  for (const otherIdStr in intel) {
    const otherId = Number(otherIdStr);
    if (state.diplomacy?.[otherId] !== "Enemy") continue;
    total += intel[otherId]?.estimatedMilitaryPower ?? 0;
  }
  return total;
}

export function getTargetMobilizationRatio(state: State): number {
  const outnumbered = hostilePowerFromIntel(state) > currentLandTroops(state);
  if (outnumbered || (state.alert ?? 0) >= 2) return WAR_TARGET_MOBILIZATION;
  if (stateHasEnemy(state)) return (PEACE_TARGET_MOBILIZATION + WAR_TARGET_MOBILIZATION) / 2;
  return PEACE_TARGET_MOBILIZATION;
}

export function getMaxLevyRate(state: State): number {
  if (hostilePowerFromIntel(state) > currentLandTroops(state) || (state.alert ?? 0) >= 2) {
    return WAR_MAX_LEVY_OF_MALE_ADULTS;
  }
  if (stateHasEnemy(state)) return (MAX_LEVY_OF_MALE_ADULTS + WAR_MAX_LEVY_OF_MALE_ADULTS) / 2;
  return MAX_LEVY_OF_MALE_ADULTS;
}

/**
 * Effective troop ceiling: min(population policy target, male physical cap including men already under arms).
 */
export function effectiveTroopTarget(pack: PackedGraph, state: State, populationRate: number): number {
  const people = statePopulationPeople(state);
  const policyTroops = people * getTargetMobilizationRatio(state);

  const civilianPts = sumCivilianMalePoints(pack, state.i);
  const underArmsPts = troopsToPoints(currentLandTroops(state), populationRate);
  const malePeople = pointsToTroops(civilianPts + underArmsPts, populationRate);
  const physicalCap = malePeople * getMaxLevyRate(state);

  return Math.min(policyTroops, physicalCap);
}

/**
 * After Military.generate (or load), deduct current land headcount from civilian males once
 * so under-arms and the pyramid share one male stock.
 */
export function reconcileStateManpower(pack: PackedGraph, state: State, populationRate: number): void {
  if (!state.i || state.removed || state.manpowerReconciled) return;
  const troops = currentLandTroops(state);
  if (troops > 0) {
    removeCivilianMalePoints(pack, state.i, troopsToPoints(troops, populationRate));
  }
  state.manpowerReconciled = true;
}

export function reconcileAllStatesManpower(pack: PackedGraph, populationRate = worldContext.populationRate): void {
  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    // Allow re-reconcile after full Military.generate by clearing the flag in generate; here only unset ones.
    reconcileStateManpower(pack, state, populationRate);
  }
}

/**
 * Record combat deaths for Population Overview only (no civilian pop mutation).
 * Prefer `applyDemographicCasualties` from combat resolution sites so legacy
 * (non-manpower) maps still lose civilian males.
 */
export function registerTroopLosses(stateId: number, deadTroops: number): void {
  if (deadTroops > 0) recordDeaths(stateId, deadTroops, "combat");
}

/**
 * Raise land regiment capacity (r.t) toward the effective target, then grow r.a by drawing
 * civilian males. In peacetime, demobilize surplus capacity and return men.
 */
export function tickManpower(
  pack: PackedGraph,
  deltaYears: number,
  populationRate = worldContext.populationRate
): void {
  if (deltaYears <= 0) return;

  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    const regiments = landRegiments(state);
    if (!regiments.length) continue;

    const target = effectiveTroopTarget(pack, state, populationRate);
    let capacity = currentLandCapacity(state);
    const atWar = stateHasEnemy(state) || (state.alert ?? 0) >= 1.5;

    if (capacity < target) {
      const growth = (target - capacity) * ANNUAL_DRAFT_SHARE * deltaYears;
      const per = growth / regiments.length;
      for (const r of regiments) r.t += per;
      capacity = currentLandCapacity(state);
    } else if (!atWar && capacity > target * 1.05) {
      const surplus = (capacity - target) * DEMOBILIZATION_SHARE_PEACE * deltaYears;
      const scale = Math.max(0, 1 - surplus / capacity);
      let releasedTroops = 0;
      for (const r of regiments) {
        const newT = Math.max(r.a * 0.5, r.t * scale); // keep some room above current a
        // Prefer lowering empty slots first: if a > newT, demobilize headcount too
        if (r.a > newT) {
          releasedTroops += r.a - newT;
          const ratio = newT / r.a;
          for (const u of Object.keys(r.u)) r.u[u] = (r.u[u] ?? 0) * ratio;
          r.a = newT;
        }
        r.t = Math.max(newT, r.a);
      }
      if (releasedTroops > 0) {
        addCivilianMalePoints(pack, state.i, troopsToPoints(releasedTroops, populationRate));
      }
    }

    // Fill a toward t from civilian males
    for (const r of regiments) {
      fillRegimentFromManpower(pack, state, r, deltaYears, populationRate);
    }
  }
}

export function fillRegimentFromManpower(
  pack: PackedGraph,
  state: State,
  r: MilitaryRegiment,
  deltaYears: number,
  populationRate = worldContext.populationRate
): void {
  if (r.n || r.a >= r.t || deltaYears <= 0) return;

  const want = Math.min(r.t - r.a, r.t * RECOVERY_RATE_PER_YEAR * deltaYears);
  if (want <= 0) return;

  const needPts = troopsToPoints(want, populationRate);
  const gotPts = removeCivilianMalePoints(pack, state.i, needPts);
  const got = pointsToTroops(gotPts, populationRate);
  if (got <= 0) return;

  // Distribute into unit composition by current ratios (or dump into a single key)
  const unitKeys = Object.keys(r.u);
  if (!unitKeys.length || r.a <= 0) {
    const key = unitKeys[0] ?? "infantry";
    r.u[key] = (r.u[key] ?? 0) + got;
  } else {
    for (const key of unitKeys) {
      const ratio = (r.u[key] ?? 0) / r.a;
      r.u[key] = (r.u[key] ?? 0) + got * ratio;
    }
  }
  r.a += got;
  if (r.a > r.t) {
    const scale = r.t / r.a;
    for (const key of Object.keys(r.u)) r.u[key] = (r.u[key] ?? 0) * scale;
    r.a = r.t;
  }
}

/**
 * Before a full Military.generate rebuild: return current under-arms men to the civilian pool
 * and clear the reconciled flag so the new army can be deducted cleanly (avoids double-draft).
 */
export function markStatesNeedManpowerReconcile(pack: PackedGraph, populationRate = worldContext.populationRate): void {
  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    if (state.manpowerReconciled) {
      const troops = currentLandTroops(state);
      if (troops > 0) {
        addCivilianMalePoints(pack, state.i, troopsToPoints(troops, populationRate));
      }
    }
    state.manpowerReconciled = false;
  }
}

export function isManpowerSimEnabled(): boolean {
  return useOptionsState.getState().simManpower;
}
