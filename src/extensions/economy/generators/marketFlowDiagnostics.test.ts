import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowCycleSnapshot } from "./marketFlowReport";

const markets = [
  {
    i: 1,
    name: "Port",
    centerBurgId: 1,
    goods: {
      1: { stock: 10, price: 2 },
      2: { stock: 0, price: 1 }
    }
  }
];

const goods = [
  {
    i: 1,
    name: "Salt",
    tags: [] as string[],
    value: 5,
    trade: { bulk: 2, weight: 2 },
    demandCoverage: { food: 0.5 },
    distribution: "1",
    cargo: { cargoSlotsPerUnit: 1, handlingClass: "crated" as const }
  },
  {
    i: 2,
    name: "Grain",
    tags: ["stapleFood"],
    value: 1,
    trade: { bulk: 5, weight: 4 },
    demandCoverage: { food: 1 },
    distribution: "1"
  }
];

const deals = [
  {
    i: 0,
    seller: 1,
    sellerType: "market" as const,
    buyer: 9,
    buyerType: "market" as const,
    good: 1,
    units: 3,
    remainingUnits: 3,
    price: 2,
    tax: 0,
    distance: 100,
    durationDays: 5,
    maintenanceCost: 1,
    accountingPeriodDays: 30
  }
];

const mockState: { history: FlowCycleSnapshot[] } = { history: [] };

vi.mock("../economyContext", () => ({
  getMarkets: () => markets,
  getGoods: () => goods,
  getDeals: () => deals,
  getCaravans: () => [],
  getFlowCycleHistory: () => mockState.history,
  setFlowCycleHistory: (next: FlowCycleSnapshot[]) => {
    mockState.history = [...next];
  },
  getWorldContext: () => ({
    pack: {
      burgs: [{ i: 0 }, { i: 1, name: "Portburg", market: 1, population: 50, removed: false }]
    },
    options: { year: 1000, month: 3, day: 15 }
  }),
  getSimulationYear: () => 1000,
  getSimulationMonth: () => 3,
  getSimulationDay: () => 15
}));

vi.mock("./goods-generator", async () => {
  const actual = await vi.importActual<typeof import("./goods-generator")>("./goods-generator");
  return {
    ...actual,
    Goods: {
      get: (id: number) => goods.find(good => good.i === id)
    },
    isGoodEnabled: () => true
  };
});

import {
  __resetFlowDiagnosticsForTests,
  __setPendingStartStocksForTests,
  beginFlowCycleCapture,
  clearFlowDiagnostics,
  getFlowReport,
  recordFlowCycleEnd,
  snapshotMarketStocks
} from "./marketFlowDiagnostics";

describe("marketFlowDiagnostics", () => {
  beforeEach(() => {
    mockState.history = [];
    __resetFlowDiagnosticsForTests();
    markets[0].goods[1].stock = 10;
  });

  it("snapshots start stock and records export + production estimate", () => {
    beginFlowCycleCapture();
    // Simulate production adding stock, then export of 3 units leaving end stock 12
    markets[0].goods[1].stock = 12;

    const snapshot = recordFlowCycleEnd();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.samples.length).toBeGreaterThan(0);

    const salt = snapshot!.samples.find(sample => sample.goodId === 1);
    expect(salt).toBeDefined();
    expect(salt!.cycleExport).toBe(3);
    // production estimate: end(12) - start(10) - import(0) + export(3) = 5
    expect(salt!.cycleProduction).toBeCloseTo(5);
    expect(salt!.endStock).toBe(12);
    expect(salt!.cycleDemand).toBeGreaterThan(0);

    // stapleFood grain is excluded
    expect(snapshot!.samples.some(sample => sample.goodId === 2)).toBe(false);

    const report = getFlowReport();
    expect(report.cyclesRecorded).toBe(1);
    expect(report.rows.some(row => row.goodId === 1 && row.totalExport === 3)).toBe(true);
  });

  it("keeps a rolling window of 12 cycles", () => {
    for (let i = 0; i < 14; i++) {
      __setPendingStartStocksForTests(snapshotMarketStocks());
      markets[0].goods[1].stock = 10 + i;
      recordFlowCycleEnd({ year: 1000, month: (i % 12) + 1, day: 1 });
    }
    const report = getFlowReport();
    expect(report.cyclesRecorded).toBe(12);
  });

  it("clearFlowDiagnostics empties history", () => {
    beginFlowCycleCapture();
    recordFlowCycleEnd();
    expect(getFlowReport().cyclesRecorded).toBe(1);
    clearFlowDiagnostics();
    expect(getFlowReport().cyclesRecorded).toBe(0);
  });
});
