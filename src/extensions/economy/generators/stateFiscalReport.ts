import { getSimulationDay, getSimulationMonth, getSimulationYear } from "../economyContext";
import { getStateFiscalReportState, type StateFiscalReport } from "../store/stateFiscalReportState";

export type StateFiscalAmounts = Readonly<Record<string, number>>;

let nextReportId = 1;

function cleanAmounts(amounts: StateFiscalAmounts): Record<string, number> {
  const cleaned: Record<string, number> = {};
  for (const [key, value] of Object.entries(amounts)) {
    if (Number.isFinite(value) && Math.abs(value) > 0.0001) cleaned[key] = value;
  }
  return cleaned;
}

/** Records one actual settlement; it never recalculates or changes the treasury. */
export function recordStateFiscalReport(args: Omit<StateFiscalReport, "id" | "year" | "month" | "day">): void {
  getStateFiscalReportState().addReport({
    id: nextReportId++,
    year: getSimulationYear(),
    month: getSimulationMonth(),
    day: getSimulationDay(),
    ...args,
    income: cleanAmounts(args.income),
    expenses: cleanAmounts(args.expenses)
  });
}

export function clearStateFiscalReports(): void {
  nextReportId = 1;
  getStateFiscalReportState().clear();
}
