/**
 * Manpower ledger: civilian adult males ↔ troops under arms.
 * See docs/plan/military/manpower-ecosystem.md.
 *
 * Units:
 * - Demographics buckets / cells.pop / burg.population: population *points*
 * - regiment.a / regiment.t: headcount (people)
 *
 * A population point has no state-wide people conversion: rural points are scaled by
 * populationRate, while burg points are additionally scaled by urbanization. Transfers
 * between civilian pools and regiments therefore use headcount, never a generic
 * "troops / populationRate" conversion.
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
/** Peacetime disease/desertion of under-arms (fraction of headcount per year). */
export const ANNUAL_NATURAL_WASTAGE = 0.02;
/** Draft weight for rural cells. */
export const RURAL_LEVY_WEIGHT = 1.0;
/** Draft weight for ordinary urban burgs. */
export const URBAN_LEVY_WEIGHT = 1.5;
/** Draft weight for fort-group burgs (already militarised bases). */
export const FORT_LEVY_WEIGHT = 0.2;
/** Extra weight multiplier when drawing from a regiment's home province. */
export const HOME_PROVINCE_LEVY_BONUS = 3;
/** Fraction of combat dead who return to civilian life as wounded (Phase 5). */
export const WOUNDED_RETURN_RATE = 0.1;
/** Quality assigned to brand-new recruits (1 = veteran standing army). */
export const GREEN_RECRUIT_QUALITY = 0.55;
/** foodStress (0..1.5) contribution to draft efficiency penalty at max stress. */
export const FOOD_STRESS_DRAFT_PENALTY = 0.45;
/** supplyStrain (0..1) contribution to draft efficiency penalty at max strain. */
export const SUPPLY_STRAIN_DRAFT_PENALTY = 0.4;
/** How much draft efficiency also shrinks physical max levy. */
export const DRAFT_EFFICIENCY_ON_MAX_LEVY = 0.5;
/** When female levy is on, max share of female adults that may be drafted per request. */
export const FEMALE_LEVY_MAX_SHARE = 0.15;

export interface MaleDraftOptions {
  /** Prefer cells/burgs in this province when skimming males (0 = no preference). */
  preferredProvince?: number;
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

/**
 * Total living people in a state, including land troops already drawn from settlements.
 * Recomputing from pack avoids stale state.rural/state.urban values after a demographic tick.
 */
export function statePopulationPeople(
  pack: PackedGraph,
  state: State,
  populationRate = worldContext.populationRate,
  urbanization = worldContext.urbanization
): number {
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);
  let total = currentLandTroops(state);

  for (let i = 0; i < pack.cells.i.length; i++) {
    if (pack.cells.state[i] === state.i) total += (pack.cells.pop[i] ?? 0) * rate;
  }
  for (const burg of pack.burgs ?? []) {
    if (burg?.i && !burg.removed && burg.state === state.i) total += (burg.population ?? 0) * urbanScale;
  }
  return total;
}

/** Civilian adult-male pool expressed in actual people. */
export function sumCivilianMalePeople(
  pack: PackedGraph,
  stateId: number,
  populationRate = worldContext.populationRate,
  urbanization = worldContext.urbanization
): number {
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);
  let total = 0;
  for (let i = 0; i < pack.cells.i.length; i++) {
    if (pack.cells.state[i] === stateId) total += (pack.cells.maleAdults?.[i] ?? 0) * rate;
  }
  for (const burg of pack.burgs ?? []) {
    if (burg?.i && !burg.removed && burg.state === stateId && burg.demographics) {
      total += burg.demographics.maleAdults * urbanScale;
    }
  }
  return total;
}

/**
 * Remove `people` of civilian adult males from the state.
 * Weights: rural 1.0, urban 1.5, fort 0.2; home province ×3 when preferred.
 * Returns people actually removed.
 */
export function removeCivilianMalePeople(
  pack: PackedGraph,
  stateId: number,
  people: number,
  options?: MaleDraftOptions,
  populationRate = worldContext.populationRate,
  urbanization = worldContext.urbanization
): number {
  if (people <= 0) return 0;

  const { cells, burgs } = pack;
  const preferred = options?.preferredProvince ?? 0;
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);

  type Slot = { kind: "cell" | "burg"; id: number; people: number; weight: number };
  const slots: Slot[] = [];
  let weighted = 0;

  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId) continue;
    const malePoints = cells.maleAdults?.[i] ?? 0;
    if (malePoints <= 0) continue;
    const slotPeople = malePoints * rate;
    const province = cells.province?.[i] ?? 0;
    let w = slotPeople * RURAL_LEVY_WEIGHT;
    if (preferred && province === preferred) w *= HOME_PROVINCE_LEVY_BONUS;
    slots.push({ kind: "cell", id: i, people: slotPeople, weight: w });
    weighted += w;
  }
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || burg.state !== stateId || !burg.demographics) continue;
    const malePoints = burg.demographics.maleAdults;
    if (malePoints <= 0) continue;
    const slotPeople = malePoints * urbanScale;
    const isFort = burg.group === "fort";
    const province = cells.province?.[burg.cell] ?? 0;
    let w = slotPeople * (isFort ? FORT_LEVY_WEIGHT : URBAN_LEVY_WEIGHT);
    if (preferred && province === preferred) w *= HOME_PROVINCE_LEVY_BONUS;
    slots.push({ kind: "burg", id: burg.i, people: slotPeople, weight: w });
    weighted += w;
  }

  if (weighted <= 0) return 0;

  const totalMale = slots.reduce((s, x) => s + x.people, 0);
  let remaining = Math.min(people, totalMale);
  let removed = 0;

  // Weight decides share of the cut; second pass drains leftovers so we can empty the pool.
  for (const slot of slots) {
    if (remaining <= 0) break;
    const actual = Math.min(slot.people, (slot.weight / weighted) * Math.min(people, totalMale), remaining);
    if (actual <= 0) continue;
    if (slot.kind === "cell") {
      const actualPoints = actual / rate;
      if (cells.maleAdults) cells.maleAdults[slot.id] -= actualPoints;
      cells.pop[slot.id] = Math.max(0, cells.pop[slot.id] - actualPoints);
    } else {
      const burg = burgs[slot.id];
      if (!burg.demographics) continue;
      const actualPoints = actual / urbanScale;
      burg.demographics.maleAdults -= actualPoints;
      burg.population = Math.max(0, (burg.population ?? 0) - actualPoints);
    }
    removed += actual;
    remaining -= actual;
  }

  if (remaining > 1e-9) {
    for (const slot of slots) {
      if (remaining <= 0) break;
      const maleLeft =
        slot.kind === "cell"
          ? (cells.maleAdults?.[slot.id] ?? 0) * rate
          : (burgs[slot.id].demographics?.maleAdults ?? 0) * urbanScale;
      const actual = Math.min(maleLeft, remaining);
      if (actual <= 0) continue;
      if (slot.kind === "cell") {
        const actualPoints = actual / rate;
        if (cells.maleAdults) cells.maleAdults[slot.id] -= actualPoints;
        cells.pop[slot.id] = Math.max(0, cells.pop[slot.id] - actualPoints);
      } else {
        const burg = burgs[slot.id];
        if (!burg.demographics) continue;
        const actualPoints = actual / urbanScale;
        burg.demographics.maleAdults -= actualPoints;
        burg.population = Math.max(0, (burg.population ?? 0) - actualPoints);
      }
      removed += actual;
      remaining -= actual;
    }
  }
  return removed;
}

/** Return adult male people to civilian population (demobilization survivors). */
export function addCivilianMalePeople(
  pack: PackedGraph,
  stateId: number,
  people: number,
  options?: MaleDraftOptions,
  populationRate = worldContext.populationRate,
  urbanization = worldContext.urbanization
): number {
  if (people <= 0) return 0;

  const { cells, burgs } = pack;
  if (!cells?.i?.length) return 0;
  const preferred = options?.preferredProvince ?? 0;
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);
  type Slot = { kind: "cell" | "burg"; id: number; weight: number };
  const slots: Slot[] = [];
  let weightSum = 0;

  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId || (cells.pop?.[i] ?? 0) <= 0) continue;
    const province = cells.province?.[i] ?? 0;
    let w = cells.pop[i] * rate * RURAL_LEVY_WEIGHT;
    if (preferred && province === preferred) w *= HOME_PROVINCE_LEVY_BONUS;
    slots.push({ kind: "cell", id: i, weight: w });
    weightSum += w;
  }
  const burgList = Array.isArray(burgs) ? burgs : [];
  for (const burg of burgList) {
    if (!burg?.i || burg.removed || burg.state !== stateId) continue;
    const pop = burg.population ?? 0;
    if (pop <= 0) continue;
    const isFort = burg.group === "fort";
    const province = cells.province?.[burg.cell] ?? 0;
    let w = pop * urbanScale * (isFort ? FORT_LEVY_WEIGHT : URBAN_LEVY_WEIGHT);
    if (preferred && province === preferred) w *= HOME_PROVINCE_LEVY_BONUS;
    slots.push({ kind: "burg", id: burg.i, weight: w });
    weightSum += w;
  }

  if (weightSum <= 0 || !slots.length) return 0;

  let added = 0;
  for (const slot of slots) {
    const share = (slot.weight / weightSum) * people;
    if (slot.kind === "cell") {
      const sharePoints = share / rate;
      if (cells.maleAdults) cells.maleAdults[slot.id] = (cells.maleAdults[slot.id] ?? 0) + sharePoints;
      if (cells.pop) cells.pop[slot.id] = (cells.pop[slot.id] ?? 0) + sharePoints;
    } else {
      const burg = burgList[slot.id] ?? burgs?.[slot.id];
      if (!burg.demographics) {
        burg.demographics = {
          capacity: burg.population ?? share / urbanScale,
          children: 0,
          maleAdults: 0,
          femaleAdults: 0,
          elders: 0
        };
      }
      const sharePoints = share / urbanScale;
      burg.demographics.maleAdults += sharePoints;
      burg.population = (burg.population ?? 0) + sharePoints;
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

/**
 * "At war" is defined solely by Enemy diplomacy (see stateHasEnemy) — state.alert is a static,
 * generation-time political-tension scalar (manually editable in Military Overview), not a live
 * war signal, and treating it as one left aggressive-but-peaceful states permanently pinned to
 * wartime mobilization targets with demobilization never kicking in.
 */
export function getTargetMobilizationRatio(state: State): number {
  if (!stateHasEnemy(state)) return PEACE_TARGET_MOBILIZATION;
  const outnumbered = hostilePowerFromIntel(state) > currentLandTroops(state);
  return outnumbered ? WAR_TARGET_MOBILIZATION : (PEACE_TARGET_MOBILIZATION + WAR_TARGET_MOBILIZATION) / 2;
}

export function getMaxLevyRate(state: State): number {
  let base: number;
  if (!stateHasEnemy(state)) {
    base = MAX_LEVY_OF_MALE_ADULTS;
  } else if (hostilePowerFromIntel(state) > currentLandTroops(state)) {
    base = WAR_MAX_LEVY_OF_MALE_ADULTS;
  } else {
    base = (MAX_LEVY_OF_MALE_ADULTS + WAR_MAX_LEVY_OF_MALE_ADULTS) / 2;
  }
  // Supply/food stress trims how hard a state can push its male pool
  const eff = getDraftEfficiency(state);
  return base * (1 - DRAFT_EFFICIENCY_ON_MAX_LEVY * (1 - eff));
}

/**
 * 0..1 how well the state can equip and feed new levies.
 * Combines foodStress (agriculture) and supplyStrain (Economy war logistics when set).
 */
export function getDraftEfficiency(state: State): number {
  const food = Math.min(1, (state.foodStress ?? 0) / 1.5);
  const supply = Math.min(1, Math.max(0, state.supplyStrain ?? 0));
  const penalty = FOOD_STRESS_DRAFT_PENALTY * food + SUPPLY_STRAIN_DRAFT_PENALTY * supply;
  return Math.max(0.15, 1 - penalty);
}

/** Regiment combat multiplier from recruit quality (1 if feature off / unset). */
export function regimentQualityMultiplier(regiment: MilitaryRegiment): number {
  if (!useOptionsState.getState().recruitQualityEnabled) return 1;
  const q = regiment.quality;
  if (q === undefined || q === null || !Number.isFinite(q)) return 1;
  return Math.max(0.2, Math.min(1.2, q));
}

/**
 * Effective troop ceiling: min(population policy target, male physical cap including men already under arms).
 * Policy target is also scaled by draft efficiency (harder to *raise* ceilings under famine/war strain).
 */
export function effectiveTroopTarget(
  pack: PackedGraph,
  state: State,
  populationRate: number,
  urbanization = worldContext.urbanization
): number {
  const people = statePopulationPeople(pack, state, populationRate, urbanization);
  const eff = getDraftEfficiency(state);
  const policyTroops = people * getTargetMobilizationRatio(state) * (0.5 + 0.5 * eff);

  const civilianPeople = sumCivilianMalePeople(pack, state.i, populationRate, urbanization);
  const malePeople = civilianPeople + currentLandTroops(state);
  const physicalCap = malePeople * getMaxLevyRate(state);

  return Math.min(policyTroops, physicalCap);
}

/**
 * After Military.generate (or load), deduct current land headcount from civilian males once
 * so under-arms and the pyramid share one male stock.
 */
export function reconcileStateManpower(
  pack: PackedGraph,
  state: State,
  populationRate: number,
  urbanization = worldContext.urbanization
): void {
  if (!state.i || state.removed || state.manpowerReconciled) return;
  const troops = currentLandTroops(state);
  if (troops > 0) {
    const removed = removeCivilianMalePeople(pack, state.i, troops, undefined, populationRate, urbanization);
    if (removed + 1e-6 < troops) {
      scaleLandMilitary(state, removed / troops);
    }
  }
  state.manpowerReconciled = true;
}

export function reconcileAllStatesManpower(
  pack: PackedGraph,
  populationRate = worldContext.populationRate,
  urbanization = worldContext.urbanization
): void {
  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    // Allow re-reconcile after full Military.generate by clearing the flag in generate; here only unset ones.
    reconcileStateManpower(pack, state, populationRate, urbanization);
  }
}

/**
 * Record combat deaths for Population Overview only (no civilian pop mutation).
 * Prefer `applyDemographicCasualties` from combat resolution sites so legacy
 * (non-manpower) maps still lose civilian males.
 * Optional `cellId` feeds the Combat Deaths map layer.
 */
export function registerTroopLosses(stateId: number, deadTroops: number, cellId?: number): void {
  if (deadTroops > 0) recordDeaths(stateId, deadTroops, "combat", cellId !== undefined ? { cellId } : undefined);
}

/**
 * Raise land regiment capacity (r.t) toward the effective target, then grow r.a by drawing
 * civilian males (preferring home province). In peacetime, demobilize surplus and apply light wastage.
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
    const atWar = stateHasEnemy(state);

    if (capacity < target) {
      const growth = (target - capacity) * ANNUAL_DRAFT_SHARE * deltaYears;
      const per = growth / regiments.length;
      for (const r of regiments) r.t += per;
      capacity = currentLandCapacity(state);
    } else if (!atWar && capacity > target * 1.05) {
      const surplus = (capacity - target) * DEMOBILIZATION_SHARE_PEACE * deltaYears;
      const scale = Math.max(0, 1 - surplus / capacity);
      for (const r of regiments) {
        const newT = Math.max(r.a * 0.5, r.t * scale);
        let releasedTroops = 0;
        if (r.a > newT) {
          releasedTroops = r.a - newT;
          const ratio = newT / r.a;
          for (const u of Object.keys(r.u)) r.u[u] = (r.u[u] ?? 0) * ratio;
          r.a = newT;
        }
        r.t = Math.max(newT, r.a);
        if (releasedTroops > 0) {
          addCivilianMalePeople(pack, state.i, releasedTroops, { preferredProvince: r.homeProvince }, populationRate);
        }
      }
    }

    // Peacetime wastage (disease / desertion) — dead, not returned to civilian pool
    if (!atWar && ANNUAL_NATURAL_WASTAGE > 0) {
      for (const r of regiments) {
        if (r.a <= 0) continue;
        const loss = r.a * ANNUAL_NATURAL_WASTAGE * deltaYears;
        if (loss < 0.5) continue;
        const keep = Math.max(0, r.a - loss) / r.a;
        for (const u of Object.keys(r.u)) r.u[u] = (r.u[u] ?? 0) * keep;
        const dead = r.a * (1 - keep);
        r.a *= keep;
        if (dead > 0) recordDeaths(state.i, dead, "other");
      }
    }

    // Fill a toward t from civilian males (home province first)
    for (const r of regiments) {
      fillRegimentFromManpower(pack, state, r, deltaYears, populationRate);
    }

    if (import.meta.env.DEV) {
      assertManpowerInvariant(pack, state.i, populationRate);
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

  // Ensure home province is set for older regiments
  if (r.homeProvince === undefined && pack.cells.province) {
    r.homeProvince = pack.cells.province[r.cell] ?? 0;
  }

  const eff = getDraftEfficiency(state);
  const want = Math.min(r.t - r.a, r.t * RECOVERY_RATE_PER_YEAR * deltaYears * eff);
  if (want <= 0) return;

  const needPeople = want;
  let gotPeople = removeCivilianMalePeople(
    pack,
    state.i,
    needPeople,
    { preferredProvince: r.homeProvince },
    populationRate
  );

  // Optional female levy when male pool is short (Phase 5)
  if (gotPeople + 1e-9 < needPeople && useOptionsState.getState().femaleLevyEnabled && isManpowerSimEnabled()) {
    const shortfall = needPeople - gotPeople;
    gotPeople += removeCivilianFemalePeople(
      pack,
      state.i,
      shortfall * FEMALE_LEVY_MAX_SHARE,
      { preferredProvince: r.homeProvince },
      populationRate
    );
  }

  const got = gotPeople;
  if (got <= 0) return;

  // Blend quality: veterans keep strength, green recruits pull it down
  if (useOptionsState.getState().recruitQualityEnabled) {
    const oldQ = r.quality ?? 1;
    const oldA = Math.max(0, r.a);
    r.quality = (oldQ * oldA + GREEN_RECRUIT_QUALITY * got) / (oldA + got);
  }

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
 * Limited female draft for optional femaleLevyEnabled. Returns people actually removed.
 */
export function removeCivilianFemalePeople(
  pack: PackedGraph,
  stateId: number,
  people: number,
  options?: MaleDraftOptions,
  populationRate = worldContext.populationRate,
  urbanization = worldContext.urbanization
): number {
  if (people <= 0) return 0;
  const { cells, burgs } = pack;
  const preferred = options?.preferredProvince ?? 0;
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);
  type Slot = { kind: "cell" | "burg"; id: number; people: number; weight: number };
  const slots: Slot[] = [];
  let weighted = 0;

  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId) continue;
    const femalePoints = cells.femaleAdults?.[i] ?? 0;
    if (femalePoints <= 0) continue;
    const slotPeople = femalePoints * rate;
    const province = cells.province?.[i] ?? 0;
    let w = slotPeople * RURAL_LEVY_WEIGHT;
    if (preferred && province === preferred) w *= HOME_PROVINCE_LEVY_BONUS;
    slots.push({ kind: "cell", id: i, people: slotPeople, weight: w });
    weighted += w;
  }
  for (const burg of burgs ?? []) {
    if (!burg?.i || burg.removed || burg.state !== stateId || !burg.demographics) continue;
    const femalePoints = burg.demographics.femaleAdults;
    if (femalePoints <= 0) continue;
    const slotPeople = femalePoints * urbanScale;
    if (burg.group === "fort") continue; // forts stay male-skewed bases
    const province = cells.province?.[burg.cell] ?? 0;
    let w = slotPeople * URBAN_LEVY_WEIGHT;
    if (preferred && province === preferred) w *= HOME_PROVINCE_LEVY_BONUS;
    slots.push({ kind: "burg", id: burg.i, people: slotPeople, weight: w });
    weighted += w;
  }
  if (weighted <= 0) return 0;

  const totalFemale = slots.reduce((s, x) => s + x.people, 0);
  let remaining = Math.min(people, totalFemale);
  let removed = 0;
  for (const slot of slots) {
    if (remaining <= 0) break;
    const share = (slot.weight / weighted) * Math.min(people, totalFemale);
    const actual = Math.min(slot.people, share, remaining);
    if (actual <= 0) continue;
    if (slot.kind === "cell") {
      const actualPoints = actual / rate;
      if (cells.femaleAdults) cells.femaleAdults[slot.id] -= actualPoints;
      cells.pop[slot.id] = Math.max(0, cells.pop[slot.id] - actualPoints);
    } else {
      const burg = burgs[slot.id];
      if (!burg.demographics) continue;
      const actualPoints = actual / urbanScale;
      burg.demographics.femaleAdults -= actualPoints;
      burg.population = Math.max(0, (burg.population ?? 0) - actualPoints);
    }
    removed += actual;
    remaining -= actual;
  }
  return removed;
}

/** Return a fraction of combat dead to civilian males as wounded (not under arms). */
export function applyWoundedReturn(
  pack: PackedGraph,
  stateId: number,
  deadTroops: number,
  populationRate: number
): void {
  if (deadTroops <= 0 || WOUNDED_RETURN_RATE <= 0 || !pack?.cells?.i?.length) return;
  const returned = deadTroops * WOUNDED_RETURN_RATE;
  addCivilianMalePeople(pack, stateId, returned, undefined, populationRate);
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
        addCivilianMalePeople(pack, state.i, troops, undefined, populationRate);
      }
    }
    state.manpowerReconciled = false;
  }
}

export function isManpowerSimEnabled(): boolean {
  return useOptionsState.getState().simManpower;
}

/**
 * Soft invariant check (docs/plan/military/manpower-ecosystem.md §11).
 * under-arms headcount must not exceed war max levy of the male stock by much.
 * Returns true when OK; logs a warning in DEV when violated.
 */
export function assertManpowerInvariant(
  pack: PackedGraph,
  stateId: number,
  populationRate = worldContext.populationRate,
  epsilonPeople = 5
): boolean {
  const state = pack.states[stateId];
  if (!state?.i || state.removed) return true;

  const civilianPeople = sumCivilianMalePeople(pack, stateId, populationRate);
  const underArms = currentLandTroops(state);
  const maxUnder = (civilianPeople + underArms) * WAR_MAX_LEVY_OF_MALE_ADULTS + epsilonPeople;

  if (underArms > maxUnder + 1e-6) {
    if (import.meta.env.DEV) {
      console.warn(
        `[manpower] state ${stateId} under-arms ${underArms.toFixed(0)} exceeds ` +
          `max levy of male stock ${maxUnder.toFixed(0)}`
      );
    }
    return false;
  }
  return true;
}

/** Scale every land regiment's a/t/u by `multiplier` (e.g. historical war scars). */
export function scaleLandMilitary(state: State, multiplier: number): void {
  if (!state.military || multiplier >= 1) return;
  const m = Math.max(0, multiplier);
  for (const r of state.military) {
    if (r.n) continue;
    for (const u of Object.keys(r.u)) {
      r.u[u] = (r.u[u] ?? 0) * m;
    }
    r.a *= m;
    r.t *= m;
  }
}
