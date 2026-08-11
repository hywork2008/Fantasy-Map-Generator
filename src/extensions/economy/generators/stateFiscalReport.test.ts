import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { getStateFiscalReportState } from "../store/stateFiscalReportState";
import { clearStateFiscalReports, recordStateFiscalReport } from "./stateFiscalReport";

describe("stateFiscalReport", () => {
  afterEach(() => {
    clearStateFiscalReports();
    clearEconomyContext();
  });

  it("records a cleaned, dated public-treasury settlement without mutating its inputs", () => {
    initEconomyContext({
      simulationContext: { currentYear: 120, currentMonth: 4, currentDay: 1 },
      worldContext: { options: {} }
    } as unknown as ExtensionAPI);
    const income = { pollTax: 12, ignored: 0 };

    recordStateFiscalReport({
      stateId: 3,
      openingTreasury: 10,
      closingTreasury: 18,
      income,
      expenses: { administrativeUpkeep: 4, ignored: 0 }
    });

    expect(getStateFiscalReportState().reports).toEqual([
      expect.objectContaining({
        stateId: 3,
        year: 120,
        month: 4,
        day: 1,
        income: { pollTax: 12 },
        expenses: { administrativeUpkeep: 4 }
      })
    ]);
    expect(income).toEqual({ pollTax: 12, ignored: 0 });
  });
});
