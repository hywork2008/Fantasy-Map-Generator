import { describe, expect, it } from "vitest";
import { CYCLES_PER_YEAR } from "./marketFlowBudget";
import {
  aggregateFlowSamples,
  buildFlowReportSummary,
  type FlowCycleSnapshot,
  formatFlowReportCsv,
  type MarketGoodCycleSample,
  trimFlowCycleHistory
} from "./marketFlowReport";

function sample(
  partial: Partial<MarketGoodCycleSample> & Pick<MarketGoodCycleSample, "marketId" | "goodId">
): MarketGoodCycleSample {
  return {
    cycleDemand: 10,
    cycleProduction: 12,
    cycleExport: 2,
    cycleImport: 0,
    endStock: 20,
    cargoSlotsPerUnit: 1,
    monthsOfCover: 2,
    ...partial
  };
}

describe("marketFlowReport", () => {
  it("aggregates multi-cycle samples into annualized rows", () => {
    const cycles: MarketGoodCycleSample[][] = [
      [sample({ marketId: 1, goodId: 3, cycleProduction: 10, cycleExport: 2, cycleDemand: 8, endStock: 15 })],
      [sample({ marketId: 1, goodId: 3, cycleProduction: 14, cycleExport: 4, cycleDemand: 8, endStock: 18 })]
    ];

    const rows = aggregateFlowSamples(cycles);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.cycles).toBe(2);
    expect(row.totalProduction).toBeCloseTo(24);
    expect(row.totalExport).toBeCloseTo(6);
    // annualize: total * 12/2
    expect(row.annualProd).toBeCloseTo(24 * (CYCLES_PER_YEAR / 2));
    expect(row.annualExport).toBeCloseTo(6 * (CYCLES_PER_YEAR / 2));
    expect(row.endStock).toBeCloseTo(18);
    expect(row.monthsCover).toBeCloseTo(18 / 8);
    expect(row.exportSlots).toBeCloseTo(row.annualExport * 1);
  });

  it("keeps separate rows per market×good and sorts by export slots", () => {
    const cycles: MarketGoodCycleSample[][] = [
      [
        sample({ marketId: 1, goodId: 1, cycleExport: 1, cargoSlotsPerUnit: 1 }),
        sample({ marketId: 2, goodId: 1, cycleExport: 5, cargoSlotsPerUnit: 2 })
      ]
    ];
    const rows = aggregateFlowSamples(cycles);
    expect(rows).toHaveLength(2);
    expect(rows[0].marketId).toBe(2);
    expect(rows[0].exportSlots).toBeGreaterThan(rows[1].exportSlots);
  });

  it("formats CSV with required A0 columns", () => {
    const rows = aggregateFlowSamples([
      [sample({ marketId: 7, goodId: 2, cycleExport: 3, cycleProduction: 9, cycleDemand: 5, endStock: 11 })]
    ]);
    const csv = formatFlowReportCsv(rows, {
      marketName: id => `M${id}`,
      goodName: id => `G${id}`
    });
    const lines = csv.split("\n");
    expect(lines[0]).toContain("annualProd");
    expect(lines[0]).toContain("annualDemand");
    expect(lines[0]).toContain("annualExport");
    expect(lines[0]).toContain("monthsCover");
    expect(lines[0]).toContain("exportSlots");
    expect(lines[1]).toContain("M7");
    expect(lines[1]).toContain("G2");
  });

  it("trims history to the newest maxCycles snapshots", () => {
    const snapshots: FlowCycleSnapshot[] = Array.from({ length: 15 }, (_, i) => ({
      cycleIndex: i,
      year: 1000,
      month: (i % 12) + 1,
      day: 1,
      samples: []
    }));
    const trimmed = trimFlowCycleHistory(snapshots, 12);
    expect(trimmed).toHaveLength(12);
    expect(trimmed[0].cycleIndex).toBe(3);
    expect(trimmed[11].cycleIndex).toBe(14);
  });

  it("builds a summary with caravan utilization averages", () => {
    const snapshots: FlowCycleSnapshot[] = [
      {
        cycleIndex: 0,
        year: 1,
        month: 1,
        day: 1,
        samples: [sample({ marketId: 1, goodId: 1, cycleExport: 2 })],
        caravanUtilization: {
          count: 2,
          meanUtilization: 0.4,
          medianUtilization: 0.35,
          shareUnder10pct: 0.1,
          shareUnder20pct: 0.25,
          totalUsedSlots: 40,
          totalCapacitySlots: 100
        }
      },
      {
        cycleIndex: 1,
        year: 1,
        month: 2,
        day: 1,
        samples: [sample({ marketId: 1, goodId: 1, cycleExport: 4 })],
        caravanUtilization: {
          count: 2,
          meanUtilization: 0.6,
          medianUtilization: 0.55,
          shareUnder10pct: 0,
          shareUnder20pct: 0.15,
          totalUsedSlots: 60,
          totalCapacitySlots: 100
        }
      }
    ];

    const summary = buildFlowReportSummary(snapshots);
    expect(summary.cyclesRecorded).toBe(2);
    expect(summary.targetCycles).toBe(CYCLES_PER_YEAR);
    expect(summary.meanCaravanUtilization).toBeCloseTo(0.5);
    expect(summary.medianCaravanUtilization).toBeCloseTo(0.45);
    expect(summary.shareUnder20pct).toBeCloseTo(0.2);
    expect(summary.rows[0].annualExport).toBeCloseTo(6 * (CYCLES_PER_YEAR / 2));
    expect(summary.totalAnnualExportSlots).toBeGreaterThan(0);
  });
});
