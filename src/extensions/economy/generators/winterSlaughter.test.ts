import { describe, expect, it } from "vitest";
import {
  createWinterSlaughterState,
  forecastWinterFeedGap,
  isWinterPreparationSeason,
  settleWinterSlaughterCell,
  type WinterSlaughterInput
} from "./winterSlaughter";
import { WINTER_SLAUGHTER_POLICY as policy } from "./winterSlaughterPolicy";

const temperatures = [0, 2, 6, 12, 17, 21, 23, 22, 16, 10, 4, 1];
const input = (): WinterSlaughterInput => ({
  cellId: 1,
  period: 1300 * 12 + 9,
  people: 100,
  herds: { Sheep: { young: 30, breeding: 40, old: 20 }, Horses: { young: 5, breeding: 10, old: 5 } },
  allowedSpecies: ["Sheep"],
  temperaturesC: temperatures,
  forageKg: [0, 0, 0],
  hayKg: 0,
  workDays: 100,
  handlingKg: 2000,
  storageKg: 1000,
  saltKg: 500,
  woodKg: 0,
  saltPricePerKg: 1,
  woodPricePerKg: 0.1,
  cashBudget: 1000
});

describe("winter slaughter and private preservation", () => {
  it("refuses a rewound cell marker rather than reusing a committed batch to debit more animals", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.workDays = 1;
    settleWinterSlaughterCell(state, resources);
    delete state.lastPeriodByCell[resources.cellId];
    const before = structuredClone(resources.herds);
    expect(() => settleWinterSlaughterCell(state, resources)).toThrow("Conflicting winter slaughter batch");
    expect(resources.herds).toEqual(before);
  });
  it("takes only whole surplus cohorts, reduces real feed demand and creates no finished food before curing", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    const sample = settleWinterSlaughterCell(state, resources)!;
    expect(sample.heads.Sheep).toBe(30);
    expect(resources.herds.Sheep).toEqual({ young: 20, breeding: 40, old: 0 });
    expect(resources.herds.Horses).toEqual({ young: 5, breeding: 10, old: 5 });
    expect(sample.feedNeedBeforeKg - sample.feedNeedAfterKg).toBeCloseTo((30 * 500) / 12);
    expect(sample.forecastUnmetAfterKg).toBeGreaterThan(0); // Protected animals still need real feed.
    expect(sample.carcassKg).toBeCloseTo(sample.edibleRecoveredKg + sample.nonFoodKg);
    expect(sample.edibleRecoveredKg).toBeCloseTo(sample.freshConsumedKg + sample.preservationInputKg);
    expect(sample.workDays).toBeLessThanOrEqual(resources.workDays);
    expect(
      Object.values(state.jobs).every(job => job.status === "processing" && job.readyPeriod > resources.period)
    ).toBe(true);
    expect(Object.values(state.stocks)).toHaveLength(0);
    expect(Object.values(state.portions).every(portion => portion.remainingKg === 0)).toBe(true);
    expect(Object.values(state.receipts).every(receipt => receipt.ownerId === "rural-cell:1")).toBe(true);
  });

  it.each(["work", "handling", "storage", "salt", "cash"] as const)("bounds slaughter by actual %s capacity", limit => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.people = 0; // No fresh outlet to bypass preservation limits.
    if (limit === "work") resources.workDays = 0;
    if (limit === "handling") resources.handlingKg = 0;
    if (limit === "storage") resources.storageKg = 0;
    if (limit === "salt") resources.saltKg = 0;
    if (limit === "cash") resources.cashBudget = 0;
    const before = structuredClone(resources.herds);
    const sample = settleWinterSlaughterCell(state, resources)!;
    expect(sample.heads).toEqual({});
    expect(resources.herds).toEqual(before);
    expect(sample.spending).toBe(0);
  });

  it("shares finite work, storage and material budgets across species and rounds payments without creating money", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.herds.Cattle = { young: 0, breeding: 10, old: 20 };
    resources.allowedSpecies = ["Cattle", "Sheep"];
    resources.workDays = 8;
    resources.handlingKg = 300;
    resources.saltKg = 25;
    resources.cashBudget = 23.13;
    const sample = settleWinterSlaughterCell(state, resources)!;
    expect(sample.workDays).toBeLessThanOrEqual(resources.workDays + 1e-9);
    expect(sample.carcassKg).toBeLessThanOrEqual(resources.handlingKg);
    expect(sample.saltKg).toBeLessThanOrEqual(resources.saltKg);
    expect(sample.spending).toBeLessThanOrEqual(resources.cashBudget + 1e-9);
    expect(sample.preservationInputKg).toBeLessThanOrEqual(resources.storageKg);
    expect(sample.heads.Cattle).toBeGreaterThan(0);
  });

  it("closes only the forecast gap rather than slaughtering a fixed herd percentage", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.herds = { Sheep: { young: 0, breeding: 10, old: 20 } };
    const need = (30 * 500) / 12;
    resources.forageKg = [need - 1, need - 1, need - 1];
    const sample = settleWinterSlaughterCell(state, resources)!;
    expect(sample.heads.Sheep).toBe(1);
    expect(sample.forecastUnmetAfterKg).toBe(0);
  });

  it("does not invent feed from future summer growth or apply a northern month in the south", () => {
    expect(isWinterPreparationSeason(temperatures, 9)).toBe(true);
    const southern = [...temperatures.slice(6), ...temperatures.slice(0, 6)];
    expect(isWinterPreparationSeason(southern, 9)).toBe(false);
    expect(isWinterPreparationSeason(southern, 3)).toBe(true);
    expect(isWinterPreparationSeason(Array(12).fill(8), 9)).toBe(false);
    const state = createWinterSlaughterState();
    const resources = input();
    resources.hayKg = 100000;
    expect(settleWinterSlaughterCell(state, resources)!.heads).toEqual({});
    expect(forecastWinterFeedGap(10, [0, 0, 0], 30)).toBeGreaterThan(0); // Storage loss is real.
  });

  it("records pig preparation separately without claiming grazing feed savings", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.herds = { Pig: { young: 5, breeding: 10, old: 3 } };
    resources.allowedSpecies = ["Pig"];
    const sample = settleWinterSlaughterCell(state, resources)!;
    expect(sample.heads.Pig).toBe(3);
    expect(sample.pigFeedSavedKg).toBeNull();
    expect(sample.feedNeedBeforeKg).toBe(0);
    expect(sample.feedNeedAfterKg).toBe(0);
    expect(sample.reason).toBe("mast-finish");
  });

  it("preserves jobs through serialization, completes once, consumes privately and expires unused meat", () => {
    let state = createWinterSlaughterState();
    const resources = input();
    settleWinterSlaughterCell(state, resources);
    const before = structuredClone(state);
    expect(settleWinterSlaughterCell(state, resources)).toBeNull();
    expect(state).toEqual(before);
    state = JSON.parse(JSON.stringify(state));
    const next = { ...resources, period: resources.period + 1, allowedSpecies: [] };
    const sample = settleWinterSlaughterCell(state, next)!;
    expect(sample.completedKg).toBeGreaterThan(0);
    expect(sample.preservedConsumedKg).toBeGreaterThan(0);
    expect(sample.completedKg + sample.processingLossKg).toBeCloseTo(before.samples[0].preservationInputKg);
    expect(sample.stockEndKg).toBeCloseTo(sample.completedKg - sample.preservedConsumedKg);
    expect(sample.preservationInputKg).toBe(0);
    const stock = Object.values(state.stocks).reduce((sum, row) => sum + row.remainingKg, 0);
    const late = settleWinterSlaughterCell(state, {
      ...next,
      people: 0,
      period: next.period + policy.preservedShelfPeriods
    })!;
    expect(late.completedKg).toBe(0);
    expect(late.spoilageKg).toBeCloseTo(stock);
    expect(late.stockEndKg).toBe(0);
  });

  it("uses fuel and the longer waiting period only for actual smoking", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.woodKg = 10000;
    const sample = settleWinterSlaughterCell(state, resources)!;
    expect(sample.woodKg).toBeCloseTo(sample.preservationInputKg * policy.smokingWoodKgPerInputKg);
    expect(
      Object.values(state.jobs).every(job => job.method === "smoked" && job.readyPeriod === resources.period + 2)
    ).toBe(true);
    const waiting = settleWinterSlaughterCell(state, {
      ...resources,
      period: resources.period + 1,
      allowedSpecies: []
    })!;
    expect(waiting.completedKg).toBe(0);
  });

  it("keeps completed food with its owner, including when another cell has hungry people", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    settleWinterSlaughterCell(state, resources);
    const other = settleWinterSlaughterCell(state, {
      ...resources,
      cellId: 2,
      period: resources.period + 1,
      allowedSpecies: []
    })!;
    expect(other.completedKg).toBe(0);
    expect(other.preservedConsumedKg).toBe(0);
    expect(Object.values(state.jobs).every(job => job.status === "processing")).toBe(true);
  });

  it("rejects invalid resources before changing any ledger", () => {
    const state = createWinterSlaughterState();
    const resources = input();
    resources.workDays = Number.NaN;
    const before = structuredClone(state);
    expect(() => settleWinterSlaughterCell(state, resources)).toThrow("Invalid winter slaughter resources");
    expect(state).toEqual(before);
  });
});
