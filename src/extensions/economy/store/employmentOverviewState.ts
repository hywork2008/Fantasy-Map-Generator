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
  craft: number;
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
