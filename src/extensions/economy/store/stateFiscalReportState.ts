import { create } from "zustand";

/**
 * A completed public-treasury settlement. Reports are session-scoped: they explain
 * the live Advance Time run and are intentionally not written into map saves.
 */
export interface StateFiscalReport {
  readonly id: number;
  readonly stateId: number;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly openingTreasury: number;
  readonly closingTreasury: number;
  readonly income: Readonly<Record<string, number>>;
  readonly expenses: Readonly<Record<string, number>>;
}

interface StateFiscalReportState {
  reports: StateFiscalReport[];
  addReport: (report: StateFiscalReport) => void;
  clear: () => void;
}

export const useStateFiscalReportState = create<StateFiscalReportState>(set => ({
  reports: [],
  addReport: report => set(state => ({ reports: [...state.reports, report] })),
  clear: () => set({ reports: [] })
}));

export const getStateFiscalReportState = useStateFiscalReportState.getState;
