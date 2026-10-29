/**
 * Phases of Economy's sub-annual cadences (days since the last monthly settlement, hire round,
 * board refresh, …), persisted on the Economy slice (docs/plan/simulation-core-separation.md §22).
 *
 * They used to be module or closure variables, so a save/load or a second map in the same session
 * restarted or carried over the schedule: the same .fmg advanced differently depending on what ran
 * before it. A missing key reads as 0 — what a fresh session used for every save made before this.
 */

import { getEconomySlice, registerContextFallbackReset } from "./economyApi";

export const CADENCE_PHASE = {
  /** Next absolute livestock feeding period on the monthly production cadence. */
  livestockFeedNextPeriod: "livestockFeedNextPeriod",
  /** Quarter of the settlement year (0–3). */
  quarterIndex: "quarterIndex",
  prospectingDays: "prospectingDays",
  /** Fast-Forward: days the coarse daily-hiring gate still owes. */
  fastAdvanceHiringDays: "fastAdvanceHiringDays",
  constructionHireRoundDays: "constructionHireRoundDays",
  cullAnonRoundDays: "cullAnonRoundDays",
  cullBoardRefreshDays: "cullBoardRefreshDays",
  escortAnonRoundDays: "escortAnonRoundDays",
  escortBoardRefreshDays: "escortBoardRefreshDays",
  /** Next market-flow diagnostics cycle index. */
  flowCycleIndex: "flowCycleIndex"
} as const;

export type CadencePhaseKey = (typeof CADENCE_PHASE)[keyof typeof CADENCE_PHASE];
type CadencePhases = Partial<Record<CadencePhaseKey, number>>;

let fallbackPhases: CadencePhases = {};
registerContextFallbackReset(() => {
  fallbackPhases = {};
});

/** Reading never adds the record, so a world that has not advanced yet saves unchanged. */
function phases(create: boolean): CadencePhases | null {
  const slice = getEconomySlice();
  if (!slice) return fallbackPhases;
  const existing = slice.cadencePhases;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) return existing as CadencePhases;
  if (!create) return null;
  const created: CadencePhases = {};
  slice.cadencePhases = created;
  return created;
}

export function getCadencePhase(key: CadencePhaseKey): number {
  const value = phases(false)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function setCadencePhase(key: CadencePhaseKey, value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Cadence phase ${key} must be a finite non-negative number`);
  const record = phases(value !== 0 || getCadencePhase(key) !== 0);
  if (record) record[key] = value;
}
