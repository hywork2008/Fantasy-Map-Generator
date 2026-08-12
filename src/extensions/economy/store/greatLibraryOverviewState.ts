import { create } from "zustand";
import type { GreatLibraryPhase, GreatLibraryStatus } from "../generators/greatLibraryTypes";

export interface GreatLibraryOverviewProjectRow {
  id: number;
  stateName: string;
  burgName: string;
  status: GreatLibraryStatus;
  phase: GreatLibraryPhase;
  progress: number;
  buildPoints: number;
  startedYear: number;
  completedYear?: number;
  ruinedYear?: number;
  totalSpent: number;
  endowment: number;
  /** Site Burg currently held by a different State than the one that commissioned the project. */
  occupied: boolean;
}

export interface GreatLibraryOverviewEligibilityRow {
  stateId: number;
  stateName: string;
  eligible: boolean;
  cultureOk: boolean;
  rulerOk: boolean;
  wealthOk: boolean;
  peaceOk: boolean;
  knowledgeValue: number;
  rulerScore: number;
  learning: number;
  treasury: number;
  projectedCoverage: number;
}

interface GreatLibraryOverviewState {
  projects: GreatLibraryOverviewProjectRow[];
  eligibility: GreatLibraryOverviewEligibilityRow[];
}

export const useGreatLibraryOverviewState = create<GreatLibraryOverviewState>(() => ({
  projects: [],
  eligibility: []
}));

export function setGreatLibraryOverviewState(state: GreatLibraryOverviewState): void {
  useGreatLibraryOverviewState.setState(state);
}
