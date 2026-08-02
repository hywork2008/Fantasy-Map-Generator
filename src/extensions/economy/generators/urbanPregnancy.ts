import { useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import { getUrbanPregnancy, getWorldContext, setUrbanPregnancy } from "../economyContext";
import type { UrbanPregnancyRecord } from "./urbanPregnancyTypes";

export type { UrbanPregnancyRecord } from "./urbanPregnancyTypes";

/** Mean gestation as a fraction of a year (~9 months). */
export const GESTATION_YEARS = 9 / 12;
/** Cap pregnant cohort as a fraction of female adults (steady-state observability bound). */
export const MAX_PREGNANT_FRACTION = 0.15;

/**
 * When true (PR-P2), demography's birth-floor provider owns all pregnancy mutation and
 * `economy.tick` must not age/conceive/due. PR-P1 leaves this false.
 */
let birthFloorProviderActive = false;

export function setBirthFloorProviderActive(active: boolean): void {
  birthFloorProviderActive = active;
}

export function isBirthFloorProviderActive(): boolean {
  return birthFloorProviderActive;
}

/**
 * roomForGrowth parity with demography-simulator.ts burg branch
 * (effectiveCapacity, fort skip is caller's responsibility).
 */
export function getBurgRoomForGrowth(burg: {
  demographics?: {
    capacity?: number;
    effectiveCapacity?: number;
    children?: number;
    maleAdults?: number;
    femaleAdults?: number;
    elders?: number;
  };
}): number {
  const demographics = burg.demographics;
  if (!demographics) return 0;
  const capacity = demographics.capacity ?? 0;
  const effectiveCapacity = demographics.effectiveCapacity ?? capacity;
  const currentTotal =
    (demographics.children ?? 0) +
    (demographics.maleAdults ?? 0) +
    (demographics.femaleAdults ?? 0) +
    (demographics.elders ?? 0);
  if (!(effectiveCapacity > 0)) return 0;
  return Math.max(-0.5, 1 - currentTotal / effectiveCapacity);
}

/**
 * Expected births lower bound in population points per year from current pregnant stock.
 * UI people ≈ value × populationRate.
 */
export function getExpectedBirthsLowerBoundAnnual(pregnant: number): number {
  if (!(GESTATION_YEARS > 0)) return 0;
  return Math.max(0, pregnant) / GESTATION_YEARS;
}

/**
 * Advance one burg's pregnancy pipeline for `deltaYears`.
 * Pure wrt storage: returns the updated record (does not write the slice).
 */
export function advanceBurgPregnancy(
  previous: Pick<UrbanPregnancyRecord, "burgId" | "pregnant"> | undefined,
  args: {
    burgId: number;
    femaleAdults: number;
    roomForGrowth: number;
    deltaYears: number;
    birthRate: number;
  }
): UrbanPregnancyRecord {
  const deltaYears = Math.max(0, args.deltaYears);
  let pregnant = Math.max(0, previous?.pregnant ?? 0);
  const femaleAdults = Math.max(0, args.femaleAdults);
  const room = args.roomForGrowth;

  let lastDue = 0;
  if (deltaYears > 0 && pregnant > 0) {
    lastDue = pregnant * Math.min(1, deltaYears / GESTATION_YEARS);
    pregnant = Math.max(0, pregnant - lastDue);
  }

  if (deltaYears > 0 && room > 0 && femaleAdults > 0) {
    let conceptions = femaleAdults * Math.max(0, args.birthRate) * deltaYears * room;
    const cap = MAX_PREGNANT_FRACTION * femaleAdults;
    conceptions = Math.min(conceptions, Math.max(0, cap - pregnant));
    pregnant += conceptions;
  }

  // Hard cap after tick (e.g. femaleAdults fell).
  if (femaleAdults > 0) {
    pregnant = Math.min(pregnant, MAX_PREGNANT_FRACTION * femaleAdults);
  } else {
    pregnant = 0;
    lastDue = 0;
  }

  return {
    burgId: args.burgId,
    pregnant: rn(pregnant, 6),
    lastDue: rn(lastDue, 6)
  };
}

/**
 * Observability path (PR-P1): age/conceive all eligible urban burgs on economy.tick.
 * No-op when PR-P2 birth-floor provider is active (provider owns mutation).
 */
export function tickUrbanPregnancy(effectiveDeltaYears: number): void {
  if (isBirthFloorProviderActive()) return;
  if (!(effectiveDeltaYears > 0)) return;

  const { pack } = getWorldContext();
  const burgs = pack.burgs ?? [];
  const birthRate = useOptionsState.getState().demographicBirthRate;
  const previousByBurg = new Map(getUrbanPregnancy().map(record => [record.burgId, record]));
  const next: UrbanPregnancyRecord[] = [];

  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    if (burg.group === "fort") continue;
    if (!burg.demographics) continue;

    const roomForGrowth = getBurgRoomForGrowth(burg);
    const femaleAdults = Math.max(0, burg.demographics.femaleAdults ?? 0);
    // Still run advance when room ≤ 0 so due/aging drains existing stock without new conceptions.
    const record = advanceBurgPregnancy(previousByBurg.get(burg.i), {
      burgId: burg.i,
      femaleAdults,
      roomForGrowth,
      deltaYears: effectiveDeltaYears,
      birthRate
    });
    if (record.pregnant > 0 || record.lastDue > 0 || previousByBurg.has(burg.i)) {
      next.push(record);
    }
  }

  setUrbanPregnancy(next);
}

export function clearUrbanPregnancy(): void {
  setUrbanPregnancy([]);
}

export function getUrbanPregnancyRecord(burgId: number): UrbanPregnancyRecord | undefined {
  return getUrbanPregnancy().find(record => record.burgId === burgId);
}

/** Human-readable lower-bound births/year for Burg UI (people, not points). */
export function formatExpectedBirthsLowerBound(burgId: number): string {
  const record = getUrbanPregnancyRecord(burgId);
  if (!record || record.pregnant <= 0) return "—";
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const peoplePerYear = getExpectedBirthsLowerBoundAnnual(record.pregnant) * populationRate;
  return `~${rn(peoplePerYear, 0)}/yr`;
}

export function formatPregnantHeadcount(burgId: number): string {
  const record = getUrbanPregnancyRecord(burgId);
  if (!record || record.pregnant <= 0) return "—";
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  return `${rn(record.pregnant * populationRate, 0)}`;
}
