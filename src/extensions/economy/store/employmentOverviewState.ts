import { create } from "zustand";

export interface EmploymentOverviewRow {
  id: number; // burgId
  burgName: string;
  stateName: string;
  isCapital: boolean;
  administration: number;
  mining: number;
  smelting: number;
  trade: number;
  strategicIndustry: number;
  craft: number;
  construction: number;
  /** Built permanent dwellings (housing ledger). */
  dwellings: number;
  /** Required dwellings from population × populationRate / 4.5. */
  requiredDwellings: number;
  /** Housing gap 0–100 (% of required still unbuilt). */
  housingGapPct: number;
  /** Estimated dwellings under construction (labor-limited). */
  underConstruction: number;
  /** Adults after household care still unassigned to market work. */
  laborResidual: number;
  /** Market unemployment 0–100 among market labor force. */
  marketUnemploymentPct: number;
  /** Suggested sector to expand when residual is high. */
  employmentFocus: string;
  /** Household-care band (non-market adults). */
  householdCare: number;
  /** Market labor force after care. */
  marketLaborForce: number;
  basicEmploymentDemand: number;
  serviceEmploymentDemand: number;
  employmentDemand: number;
}

interface EmploymentOverviewState {
  rows: EmploymentOverviewRow[];
}

export const useEmploymentOverviewState = create<EmploymentOverviewState>(() => ({ rows: [] }));

export const getEmploymentOverviewState = useEmploymentOverviewState.getState;
export const setEmploymentOverviewState = useEmploymentOverviewState.setState;
