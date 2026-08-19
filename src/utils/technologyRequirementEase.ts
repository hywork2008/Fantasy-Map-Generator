/**
 * Options → Simulation ease for technology evidence gates.
 * 1× is the historical bar (mines, treasury, trial years, guild stocks).
 * Higher values lower those bars so later nodes such as steam pumping do not
 * stall on a missing deep mine or a multi-year trial. Knowledge-stock time
 * constants stay on `technologyDevelopmentSpeed`.
 */

import { useOptionsState } from "../store/optionsState";

export const MIN_TECHNOLOGY_REQUIREMENT_EASE = 1;
export const MAX_TECHNOLOGY_REQUIREMENT_EASE = 100;
export const DEFAULT_TECHNOLOGY_REQUIREMENT_EASE = 1;

/** 0..1 stocks this small after scaling are treated as waived. */
const RATIO_WAIVE = 0.05;
/** Absolute amounts (treasury, population, …) this small after scaling are waived. */
const AMOUNT_WAIVE = 1;

export type TechnologyRequirementKind = "count" | "ratio" | "amount";

export function clampTechnologyRequirementEase(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TECHNOLOGY_REQUIREMENT_EASE;
  return Math.min(MAX_TECHNOLOGY_REQUIREMENT_EASE, Math.max(MIN_TECHNOLOGY_REQUIREMENT_EASE, Math.round(n)));
}

export function getTechnologyRequirementEase(): number {
  return clampTechnologyRequirementEase(useOptionsState.getState().technologyRequirementEase);
}

/** Discrete counts (mines, trial years, ports). Floor-scaled; 0 means waived. */
export function scaleCountRequirement(need: number, ease = getTechnologyRequirementEase()): number {
  const e = Math.max(1, ease);
  if (e <= 1) return need;
  return Math.max(0, Math.floor(need / e + 1e-9));
}

export function meetsTechnologyRequirement(
  value: number,
  need: number,
  kind: TechnologyRequirementKind,
  ease = getTechnologyRequirementEase()
): boolean {
  if (ease >= MAX_TECHNOLOGY_REQUIREMENT_EASE) return true;
  if (kind === "count") return value + 1e-9 >= scaleCountRequirement(need, ease);
  const required = need / Math.max(1, ease);
  if (kind === "ratio" && required < RATIO_WAIVE) return true;
  if (kind === "amount" && required < AMOUNT_WAIVE) return true;
  return value + 1e-9 >= required;
}

/** True when a "at least one deep mine" gate would be waived. */
export function isDeepMineRequirementRelaxed(ease = getTechnologyRequirementEase()): boolean {
  return ease >= MAX_TECHNOLOGY_REQUIREMENT_EASE || scaleCountRequirement(1, ease) === 0;
}
