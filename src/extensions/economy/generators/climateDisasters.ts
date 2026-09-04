/**
 * Priority 0 "災害共通基盤" (a lightly generalized hysteretic stage machine + partial-spend
 * treasury relief + chronicle log) applied to Priority 1 "干魃・熱波" (docs/plan/disaster-mode.md).
 *
 * Unlike river-levee-and-flood-damage.md and epidemic-cholera-and-water-security.md — both of
 * which deliberately stayed a continuous background drag and explicitly deferred the discrete
 * "予兆→進行度→発災→復旧" cycle to this foundation — Drought/Heatwave is the first disaster to
 * actually implement that discrete cycle end to end. Design: docs/plan/climate-disaster-drought.md.
 */

import type { RNGService } from "../../../context/appServices";
import type { PackedGraphCells } from "../../../types/PackedGraph";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getIrrigationDevelopment,
  getSimulationYear,
  getWorldContext,
  setClimateFoodStress,
  settleAnnualOnce
} from "../economyContext";
import { clamp01 } from "./chemMedCommon";

export type DisasterStage = "calm" | "watch" | "active" | "severe" | "recovering";

export interface DisasterLogEntry {
  id: number;
  kind: "drought";
  stage: DisasterStage;
  year: number;
  severity: number;
  reliefSpent?: number;
  summary: string;
}

const LAND_HEIGHT = 20;
const DISASTER_LOG_MAX = 24;

/** grid.cells.prec units (100 mm/yr). Below this a State's average land is semi-arid. calibration TBD. */
export const DROUGHT_DRY_PREC = 5;
/** grid.cells.prec units (100 mm/yr). At or above this a State's average land is comfortably humid. */
export const DROUGHT_WET_PREC = 15;
/** °C annual mean. Below this heat contributes nothing to aridity. */
export const DROUGHT_MILD_TEMP = 8;
/** °C annual mean. At or above this heat contributes its full share to aridity. */
export const DROUGHT_HOT_TEMP = 26;
/** Fraction of last year's climateAnomaly retained before this year's random shock. */
export const DROUGHT_ANOMALY_MEAN_REVERSION = 0.6;
/** Fraction severity is reduced by at full state-average irrigationDevelopment coverage. */
export const DROUGHT_IRRIGATION_SEVERITY_MITIGATION = 0.55;
export const DROUGHT_WATCH_AT = 0.28;
export const DROUGHT_ACTIVE_AT = 0.5;
export const DROUGHT_SEVERE_AT = 0.75;
/** Below this, a recovering State returns to calm. */
export const DROUGHT_CALM_BELOW = 0.2;
/** Consecutive active/severe years before an active-severity year is escalated straight to severe. */
export const DROUGHT_ESCALATION_YEARS = 2;
/** calibration TBD — well below DAM_BUDGET(26); a season's emergency grain purchase, not capital works. */
export const DROUGHT_RELIEF_BUDGET_ACTIVE = 8;
export const DROUGHT_RELIEF_BUDGET_SEVERE = 18;
/** Fraction climateFoodStress is cut by when relief is funded at 100% coverage. */
export const DROUGHT_RELIEF_MITIGATION = 0.35;

/** 0..1, higher = drier/hotter. Precipitation dominates (75%); heat is a secondary amplifier (25%),
 *  giving the combined "干魃・熱波" a single severity axis per docs/plan/climate-disaster-drought.md §4.1. */
export function computeStateAridity(avgPrec: number, avgTemp: number): number {
  const precAridity = clamp01((DROUGHT_WET_PREC - avgPrec) / (DROUGHT_WET_PREC - DROUGHT_DRY_PREC));
  const heatFactor = clamp01((avgTemp - DROUGHT_MILD_TEMP) / (DROUGHT_HOT_TEMP - DROUGHT_MILD_TEMP));
  return clamp01(precAridity * 0.75 + heatFactor * 0.25);
}

/** -1..1 mean-reverting random walk. Uses gauss(), not rand() — rand(min,max) only returns
 *  integers, too coarse for a smooth year-to-year climate signal. */
export function rollClimateAnomaly(previous: number, rng: Pick<RNGService, "gauss">): number {
  const shock = rng.gauss(0, 28, -100, 100, 0) / 100;
  return clampRange(previous * DROUGHT_ANOMALY_MEAN_REVERSION + shock * (1 - DROUGHT_ANOMALY_MEAN_REVERSION), -1, 1);
}

/** 0..1 post-mitigation severity: structural aridity blended with this year's anomaly (only the
 *  dry/hot half of the swing matters — a wet anomaly cannot cause a drought), then discounted by
 *  the State's average irrigation development. */
export function computeDroughtSeverity(aridity: number, anomaly: number, avgIrrigationDevelopment: number): number {
  const raw = clamp01(aridity * 0.55 + Math.max(0, anomaly) * 0.45);
  const mitigation = clamp01(avgIrrigationDevelopment) * DROUGHT_IRRIGATION_SEVERITY_MITIGATION;
  return clamp01(raw * (1 - mitigation));
}

/**
 * Hysteretic stage machine — escalates immediately on threshold crossing, but de-escalates through
 * "recovering" for at least one full year before returning to "calm" rather than flipping straight
 * back to normal. docs/plan/climate-disaster-drought.md §3.2.
 */
export function advanceDisasterStage(
  currentStage: DisasterStage,
  severity: number,
  consecutiveActiveYears: number
): DisasterStage {
  if (
    severity >= DROUGHT_SEVERE_AT ||
    (severity >= DROUGHT_ACTIVE_AT && consecutiveActiveYears >= DROUGHT_ESCALATION_YEARS)
  ) {
    return "severe";
  }
  if (severity >= DROUGHT_ACTIVE_AT) return "active";
  if (severity >= DROUGHT_WATCH_AT) return "watch";
  if (currentStage === "active" || currentStage === "severe") return "recovering";
  if (currentStage === "recovering") return severity < DROUGHT_CALM_BELOW ? "calm" : "recovering";
  if (currentStage === "watch") return severity < DROUGHT_CALM_BELOW ? "calm" : "watch";
  return "calm";
}

/** 0..1 pre-relief food-production drag for a given stage/severity pair. */
export function climateFoodStressForStage(stage: DisasterStage, severity: number): number {
  switch (stage) {
    case "calm":
      return 0;
    case "watch":
      return severity * 0.25;
    case "active":
      return severity;
    case "severe":
      return Math.min(1, severity * 1.25);
    case "recovering":
      return severity * 0.4;
  }
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextDisasterLogId(state: State): number {
  const log = state.disasterLog;
  if (!log?.length) return 1;
  return (log[log.length - 1]?.id ?? 0) + 1;
}

function appendDisasterLog(state: State, entry: Omit<DisasterLogEntry, "id">): void {
  const log = state.disasterLog ? [...state.disasterLog] : [];
  log.push({ id: nextDisasterLogId(state), ...entry });
  while (log.length > DISASTER_LOG_MAX) log.shift();
  state.disasterLog = log;
}

function summarizeStageChange(stage: DisasterStage, severity: number, reliefSpent: number): string {
  const pct = Math.round(severity * 100);
  switch (stage) {
    case "watch":
      return `Drought/heatwave watch: land dryness at ${pct}%. Wells and granaries should be inspected.`;
    case "active":
      return (
        `Drought declared: crop yields under stress (${pct}% severity).` +
        (reliefSpent > 0 ? ` Emergency relief funded ${rn(reliefSpent, 1)} SP.` : " Treasury funded no relief.")
      );
    case "severe":
      return (
        `Severe drought: widespread crop failure risk (${pct}% severity).` +
        (reliefSpent > 0 ? ` Emergency relief funded ${rn(reliefSpent, 1)} SP.` : " Treasury could not fund relief.")
      );
    case "recovering":
      return `Drought easing: conditions recovering (${pct}% residual stress).`;
    case "calm":
      return "Drought over: conditions have returned to normal.";
  }
}

/**
 * Partial spend up to available treasury. Unlike debitTreasury() (all-or-nothing), a cash-strapped
 * State gets partial relief coverage instead of none — the chronicle then shows an underfunded
 * relief effort rather than silently skipping it. docs/plan/climate-disaster-drought.md §3.3.
 */
function spendAvailableTreasury(state: State, wanted: number): number {
  if (wanted <= 0) return 0;
  const available = state.treasury ?? 0;
  const spent = rn(Math.max(0, Math.min(wanted, available)), 2);
  if (spent > 0) state.treasury = rn(available - spent, 2);
  return spent;
}

interface StateClimateAccumulator {
  sumPrec: number;
  sumTemp: number;
  sumIrrigation: number;
  count: number;
}

class ClimateDisastersModule {
  clear(): void {
    setClimateFoodStress(new Float32Array());
  }

  /**
   * Once-per-simulation-year: rolls each State's drought/heatwave severity, advances its stage,
   * spends emergency relief, appends chronicle entries, and rebroadcasts climateFoodStress onto
   * every cell — called before DevelopmentPotential.updateAnnualAgriculture() in the same tick so
   * this year's dryness feeds this year's harvest, not next year's (docs/plan/
   * climate-disaster-drought.md §3.1).
   */
  settleAnnual(rng: Pick<RNGService, "gauss">): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.climateDisasters)) return false;

    const world = getWorldContext();
    const { cells, states } = world.pack;
    const cellCount = cells?.i?.length ?? 0;
    if (!cellCount) return true;

    const irrigationByCell = getIrrigationDevelopment();
    const gridCells = world.grid?.cells;
    const accByState = this.summarizeStates(cells, gridCells, irrigationByCell);

    const stressByState = new Map<number, number>();
    for (const state of states ?? []) {
      if (!state?.i || state.removed) continue;
      const acc = accByState.get(state.i);
      if (!acc || acc.count === 0) {
        stressByState.set(state.i, 0);
        continue;
      }

      const avgPrec = acc.sumPrec / acc.count;
      const avgTemp = acc.sumTemp / acc.count;
      const avgIrrigation = acc.sumIrrigation / acc.count;

      const aridity = computeStateAridity(avgPrec, avgTemp);
      const anomaly = rollClimateAnomaly(state.climateAnomaly ?? 0, rng);
      state.climateAnomaly = rn(anomaly, 3);
      const severity = computeDroughtSeverity(aridity, anomaly, avgIrrigation);

      const previousStage: DisasterStage = state.droughtStage ?? "calm";
      const consecutiveActiveYears = state.droughtYears ?? 0;
      const stage = advanceDisasterStage(previousStage, severity, consecutiveActiveYears);
      state.droughtYears = stage === "active" || stage === "severe" ? consecutiveActiveYears + 1 : 0;
      state.droughtStage = stage;
      state.droughtSeverity = rn(severity, 3);

      let stress = climateFoodStressForStage(stage, severity);
      const reliefWanted =
        stage === "severe" ? DROUGHT_RELIEF_BUDGET_SEVERE : stage === "active" ? DROUGHT_RELIEF_BUDGET_ACTIVE : 0;
      const reliefSpent = reliefWanted > 0 ? spendAvailableTreasury(state, reliefWanted) : 0;
      if (reliefWanted > 0) {
        const coverage = reliefSpent / reliefWanted;
        stress = clamp01(stress * (1 - coverage * DROUGHT_RELIEF_MITIGATION));
      }
      state.lastDisasterRelief = reliefSpent;
      // Round once and reuse everywhere — state.climateFoodStress is the authoritative value
      // shown in TreasuryOverviewDialog, and the cell broadcast below must match it exactly
      // rather than silently carrying a few extra digits of unrounded precision.
      const finalStress = rn(stress, 3);
      state.climateFoodStress = finalStress;

      if (stage !== previousStage) {
        appendDisasterLog(state, {
          kind: "drought",
          stage,
          year,
          severity: rn(severity, 3),
          reliefSpent: reliefSpent > 0 ? reliefSpent : undefined,
          summary: summarizeStageChange(stage, severity, reliefSpent)
        });
      }

      stressByState.set(state.i, finalStress);
    }

    const climateFoodStressByCell = new Float32Array(cellCount);
    for (const cellId of cells.i) {
      if ((cells.h?.[cellId] ?? 0) < LAND_HEIGHT) continue;
      const stateId = cells.state?.[cellId] ?? 0;
      climateFoodStressByCell[cellId] = stressByState.get(stateId) ?? 0;
    }
    setClimateFoodStress(climateFoodStressByCell);
    return true;
  }

  private summarizeStates(
    cells: PackedGraphCells,
    gridCells: { prec?: ArrayLike<number>; temp?: ArrayLike<number> } | undefined,
    irrigationByCell: Float32Array
  ): Map<number, StateClimateAccumulator> {
    const acc = new Map<number, StateClimateAccumulator>();
    for (const cellId of cells.i) {
      if ((cells.h?.[cellId] ?? 0) < LAND_HEIGHT) continue;
      const stateId = cells.state?.[cellId] ?? 0;
      if (!stateId) continue;
      const gridCellId = cells.g?.[cellId] ?? cellId;
      const entry = acc.get(stateId) ?? { sumPrec: 0, sumTemp: 0, sumIrrigation: 0, count: 0 };
      entry.sumPrec += gridCells?.prec?.[gridCellId] ?? 45;
      entry.sumTemp += gridCells?.temp?.[gridCellId] ?? 12;
      entry.sumIrrigation += irrigationByCell[cellId] ?? 0;
      entry.count++;
      acc.set(stateId, entry);
    }
    return acc;
  }
}

export const ClimateDisasters = new ClimateDisastersModule();
