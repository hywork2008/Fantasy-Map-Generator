import { create } from "zustand";

export interface StateEmploymentOverviewRow {
  stateId: number;
  stateName: string;
  /** ruralPopulation + urbanPopulation (adults, care/subsistence-only claims excluded). */
  totalLaborForce: number;
  /** Rural adults (cells.maleAdults + femaleAdults × populationRate) across the State's land cells. */
  ruralPopulation: number;
  /** Peak-month rural labor commitment (staple crop + hunting + fishing + viticulture + husbandry combined). */
  ruralEmployed: number;
  /** Subsistence hunting headcount — informational "of which" breakdown of ruralEmployed. */
  huntingWorkers: number;
  /** Fishing headcount — informational "of which" breakdown of ruralEmployed. */
  fishingWorkers: number;
  /** Viticulture headcount — informational "of which" breakdown of ruralEmployed. */
  viticultureWorkers: number;
  /** Husbandry headcount — informational "of which" breakdown of ruralEmployed. */
  husbandryWorkers: number;
  /**
   * Rural adults left after food-first planting. Independent: reserved child→adult outflow.
   * Megacity: hinterland labour-export pool (~32%) plus land-constrained leftover.
   */
  ruralSurplus: number;
  /** Urban market labor force (adults after household-care band is excluded). */
  urbanPopulation: number;
  /** Urban non-market household-care band (informational; excluded from urbanPopulation/labor force). */
  householdCare: number;
  administration: number;
  mining: number;
  smelting: number;
  trade: number;
  strategicIndustry: number;
  /** Guild/manufacturing artisan employment (recipe-production-derived). */
  craft: number;
  construction: number;
  /** Sum of each Burg's positive labor residual (unassigned urban market adults). */
  urbanSurplus: number;
  /** ruralSurplus + urbanSurplus. */
  totalSurplus: number;
  /** totalSurplus / totalLaborForce × 100. */
  unemploymentPct: number;
}

interface StateEmploymentOverviewState {
  rows: StateEmploymentOverviewRow[];
}

export const useStateEmploymentOverviewState = create<StateEmploymentOverviewState>(() => ({ rows: [] }));

export const getStateEmploymentOverviewState = useStateEmploymentOverviewState.getState;
export const setStateEmploymentOverviewState = useStateEmploymentOverviewState.setState;
