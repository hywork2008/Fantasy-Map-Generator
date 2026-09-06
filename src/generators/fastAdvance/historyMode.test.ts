import { afterEach, describe, expect, it } from "vitest";
import type { PackedGraph } from "../../types/PackedGraph";
import { createSimulationSystemRegistry, type SimulationSystem } from "../simulationSystem";
import {
  DEFAULT_STUB_FUNDING,
  HISTORY_MODE_PROFILES,
  type StubFundingConfig,
  strideStepDays
} from "./historyModeProfiles";
import {
  beginHistoryModeRun,
  endHistoryModeRun,
  historyModeForcesAutonomousConflict,
  isHistoryModeRunActive,
  isSystemDisabledByHistoryMode,
  resetHistoryModeRunForTests
} from "./historyModeRun";
import { applyHistoryStubFunding } from "./historyStubFunding";

afterEach(() => {
  resetHistoryModeRunForTests();
});

describe("strideStepDays", () => {
  it("always steps one day when the profile is day-strided", () => {
    expect(strideStepDays("day", 400, 12)).toBe(1);
    expect(strideStepDays("day", 1, 1)).toBe(1);
  });

  it("lands exactly on the 1st of the next month", () => {
    // 31-day month, clock on the 1st: one stride covers the whole month and lands on the next 1st.
    expect(strideStepDays("month", 400, 31)).toBe(31);
    // Clock mid-month: the first stride is short so every later one starts on a 1st.
    expect(strideStepDays("month", 400, 9)).toBe(9);
  });

  it("never overshoots the days the advance actually asked for", () => {
    expect(strideStepDays("month", 5, 31)).toBe(5);
    expect(strideStepDays("month", 0, 31)).toBe(1);
  });

  it("walks a 365-day year in 12 strides that each land on a month start", () => {
    // The property Phase H2 depends on: annual gates written as
    // `currentDay === 1 && currentMonth === 1` must still fire exactly once per year.
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let month = 0;
    let dayOfMonth = 1;
    let remaining = 365;
    const monthStarts: number[] = [];

    while (remaining > 0) {
      if (dayOfMonth === 1) monthStarts.push(month + 1);
      const step = strideStepDays("month", remaining, daysInMonth[month] - dayOfMonth + 1);
      remaining -= step;
      dayOfMonth += step;
      while (dayOfMonth > daysInMonth[month]) {
        dayOfMonth -= daysInMonth[month];
        month = (month + 1) % 12;
      }
    }

    expect(monthStarts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("history-mode run bracket", () => {
  it("is inactive by default, so ordinary advances are untouched", () => {
    expect(isHistoryModeRunActive()).toBe(false);
    expect(isSystemDisabledByHistoryMode("economy.caravans")).toBe(false);
    expect(historyModeForcesAutonomousConflict()).toBe(false);
  });

  it("reports the profile's mask and conflict override while open", () => {
    beginHistoryModeRun(HISTORY_MODE_PROFILES.chronicle);

    expect(isHistoryModeRunActive()).toBe(true);
    expect(isSystemDisabledByHistoryMode("economy.caravans")).toBe(true);
    // chronicle deliberately keeps these two: war intensity drives rise and fall, and the
    // knowledge block is where technology history comes from.
    expect(isSystemDisabledByHistoryMode("economy.warIntensity")).toBe(false);
    expect(isSystemDisabledByHistoryMode("economy.annualKnowledge")).toBe(false);
    expect(isSystemDisabledByHistoryMode("nobility.characterLifecycle")).toBe(false);
    expect(historyModeForcesAutonomousConflict()).toBe(true);

    endHistoryModeRun();
    expect(isHistoryModeRunActive()).toBe(false);
  });

  it("masks armies and the whole economy off under dynastyOnly, but never the lifecycle", () => {
    beginHistoryModeRun(HISTORY_MODE_PROFILES.dynastyOnly);

    expect(isSystemDisabledByHistoryMode("economy.annualKnowledge")).toBe(true);
    expect(isSystemDisabledByHistoryMode("nobility.regimentMovement")).toBe(true);
    expect(isSystemDisabledByHistoryMode("nobility.combat")).toBe(true);
    expect(isSystemDisabledByHistoryMode("nobility.characterLifecycle")).toBe(false);
    expect(isSystemDisabledByHistoryMode("nobility.appointments")).toBe(false);
    // finalize keeps the per-tick UI refresh honest whichever steps are masked.
    expect(isSystemDisabledByHistoryMode("nobility.finalize")).toBe(false);
  });

  it("only the outermost bracket clears the run", () => {
    beginHistoryModeRun(HISTORY_MODE_PROFILES.chronicle);
    beginHistoryModeRun(HISTORY_MODE_PROFILES.chronicle);
    endHistoryModeRun();
    expect(isHistoryModeRunActive()).toBe(true);
    endHistoryModeRun();
    expect(isHistoryModeRunActive()).toBe(false);
  });

  it("every masked id names a system that exists in the registry naming scheme", () => {
    // Guards against a mask entry silently doing nothing after a system is renamed.
    for (const profile of [HISTORY_MODE_PROFILES.chronicle, HISTORY_MODE_PROFILES.dynastyOnly]) {
      for (const id of profile.disabledSystemIds) {
        expect(id).toMatch(/^(economy|nobility|shipbuilding)\./);
      }
    }
  });
});

describe("simulation registry filter", () => {
  const system = (id: string): SimulationSystem => ({
    id,
    phase: "economy",
    reads: [],
    writes: [],
    cadence: { every: 1 },
    run: () => {}
  });
  const context = { tick: 1, delta: { years: 0, months: 0, days: 1 }, rng: {} as never, isBulkAdvance: true };

  it("skips a masked system entirely — it does not run and draws no RNG", () => {
    const registry = createSimulationSystemRegistry();
    const ran: string[] = [];
    registry.register({ ...system("economy.caravans"), run: () => ran.push("economy.caravans") });
    registry.register({ ...system("economy.warIntensity"), run: () => ran.push("economy.warIntensity") });
    registry.setFilter(s => !isSystemDisabledByHistoryMode(s.id));

    beginHistoryModeRun(HISTORY_MODE_PROFILES.chronicle);
    registry.run(context);

    expect(ran).toEqual(["economy.warIntensity"]);
  });

  it("runs everything once the bracket closes", () => {
    const registry = createSimulationSystemRegistry();
    const ran: string[] = [];
    registry.register({ ...system("economy.caravans"), run: () => ran.push("economy.caravans") });
    registry.setFilter(s => !isSystemDisabledByHistoryMode(s.id));

    beginHistoryModeRun(HISTORY_MODE_PROFILES.chronicle);
    endHistoryModeRun();
    registry.run(context);

    expect(ran).toEqual(["economy.caravans"]);
  });
});

describe("history stub funding", () => {
  const makePack = (treasuries: number[], populations: number[]): PackedGraph =>
    ({
      states: [
        { i: 0, removed: false },
        ...treasuries.map((treasury, index) => ({ i: index + 1, treasury, removed: false }))
      ],
      burgs: [{ i: 0 }],
      cells: {
        i: Uint32Array.from(populations.map((_, index) => index)),
        state: Uint16Array.from(populations.map((_, index) => index + 1)),
        pop: Float32Array.from(populations)
      }
    }) as unknown as PackedGraph;

  const noWar = () => false;
  const balanced: StubFundingConfig = { ...DEFAULT_STUB_FUNDING, upkeepRatio: 0, warUpkeepMultiplier: 1 };

  it("does nothing when disabled", () => {
    const pack = makePack([100], [1000]);
    applyHistoryStubFunding(pack, 1, { ...balanced, enabled: false }, noWar);
    expect(pack.states[1].treasury).toBe(100);
  });

  it("credits income proportional to population and elapsed years", () => {
    const pack = makePack([0], [1000]);
    applyHistoryStubFunding(pack, 1, { ...balanced, revenuePerCapitaPerYear: 0.1 }, noWar);
    expect(pack.states[1].treasury).toBeCloseTo(100, 6);
  });

  it("keeps a larger realm richer than a smaller one — the rise-and-fall driver", () => {
    const pack = makePack([0, 0], [4000, 1000]);
    applyHistoryStubFunding(pack, 1, { ...balanced, revenuePerCapitaPerYear: 0.1 }, noWar);
    expect(pack.states[1].treasury).toBeCloseTo(4 * (pack.states[2].treasury ?? 0), 6);
  });

  it("lifts a bankrupt realm back off zero, unlike the multiplicative Fast-Forward model", () => {
    // The whole reason this exists: `treasury * (1 + r)^years` can never leave 0.
    const pack = makePack([0], [2000]);
    applyHistoryStubFunding(pack, 1, { ...balanced, revenuePerCapitaPerYear: 0.1 }, noWar);
    expect(pack.states[1].treasury).toBeGreaterThan(0);
  });

  it("drains a realm at war when upkeep exceeds income", () => {
    const pack = makePack([500], [1000]);
    applyHistoryStubFunding(
      pack,
      1,
      { ...DEFAULT_STUB_FUNDING, revenuePerCapitaPerYear: 0.1, upkeepRatio: 1, warUpkeepMultiplier: 2 },
      () => true
    );
    // income 100, upkeep 200 → net -100.
    expect(pack.states[1].treasury).toBeCloseTo(400, 6);
  });

  it("allows bankruptcy at the default floorRatio of 0", () => {
    const pack = makePack([10], [1000]);
    applyHistoryStubFunding(
      pack,
      1,
      { ...DEFAULT_STUB_FUNDING, revenuePerCapitaPerYear: 0.1, upkeepRatio: 1, warUpkeepMultiplier: 5 },
      () => true
    );
    expect(pack.states[1].treasury).toBe(0);
  });

  it("holds a realm at the safety net when floorRatio is raised", () => {
    const pack = makePack([10], [1000]);
    applyHistoryStubFunding(
      pack,
      1,
      {
        ...DEFAULT_STUB_FUNDING,
        revenuePerCapitaPerYear: 0.1,
        upkeepRatio: 1,
        warUpkeepMultiplier: 5,
        floorRatio: 0.5
      },
      () => true
    );
    // floor is half of one year's income (100) regardless of the tick stride.
    expect(pack.states[1].treasury).toBeCloseTo(50, 6);
  });

  it("gives the same year of income whether applied monthly or in one step", () => {
    const monthly = makePack([0], [1000]);
    for (let month = 0; month < 12; month += 1) {
      applyHistoryStubFunding(monthly, 1 / 12, { ...balanced, revenuePerCapitaPerYear: 0.1 }, noWar);
    }
    const annual = makePack([0], [1000]);
    applyHistoryStubFunding(annual, 1, { ...balanced, revenuePerCapitaPerYear: 0.1 }, noWar);

    expect(monthly.states[1].treasury).toBeCloseTo(annual.states[1].treasury ?? 0, 6);
  });
});
