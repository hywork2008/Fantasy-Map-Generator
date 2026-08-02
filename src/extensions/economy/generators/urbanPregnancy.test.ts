import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBirthFloorProvider } from "../../../generators/birthModifiers";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getUrbanPregnancy, initEconomyContext } from "../economyContext";
import {
  advanceBurgPregnancy,
  clearUrbanPregnancy,
  clearUrbanPregnancyBirthFloorRegistration,
  GESTATION_YEARS,
  getBurgRoomForGrowth,
  getExpectedBirthsLowerBoundAnnual,
  isBirthFloorProviderActive,
  MAX_PREGNANT_FRACTION,
  registerUrbanPregnancyBirthFloor,
  setBirthFloorProviderActive,
  tickUrbanPregnancy,
  unregisterUrbanPregnancyBirthFloor,
  urbanPregnancyBirthFloorProvider
} from "./urbanPregnancy";

function setUpBurgs(
  options: {
    femaleAdults?: number;
    capacity?: number;
    effectiveCapacity?: number;
    group?: string;
    populationRate?: number;
  } = {}
): void {
  const femaleAdults = options.femaleAdults ?? 100;
  const capacity = options.capacity ?? 400;
  worldContext.populationRate = options.populationRate ?? 1000;
  worldContext.pack = {
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        removed: 0,
        group: options.group ?? "town",
        population: 10,
        demographics: {
          capacity,
          effectiveCapacity: options.effectiveCapacity ?? capacity,
          children: 80,
          maleAdults: 100,
          femaleAdults,
          elders: 40
        }
      }
    ]
  } as unknown as PackedGraph;
}

describe("getBurgRoomForGrowth", () => {
  it("matches demography room when under capacity", () => {
    // total = 80+100+100+40 = 320; capacity 400 → room = 1 - 0.8 = 0.2
    expect(
      getBurgRoomForGrowth({
        demographics: {
          capacity: 400,
          children: 80,
          maleAdults: 100,
          femaleAdults: 100,
          elders: 40
        }
      })
    ).toBeCloseTo(0.2, 5);
  });

  it("returns 0 when effectiveCapacity is missing/zero", () => {
    expect(getBurgRoomForGrowth({ demographics: { capacity: 0, children: 1 } })).toBe(0);
  });
});

describe("advanceBurgPregnancy", () => {
  it("conceives when room for growth and caps at MAX_PREGNANT_FRACTION", () => {
    const birthRate = 0.25;
    let record = advanceBurgPregnancy(undefined, {
      burgId: 1,
      femaleAdults: 100,
      roomForGrowth: 1,
      deltaYears: 1,
      birthRate
    });
    // conceptions = 100 * 0.25 * 1 * 1 = 25, cap = 15
    expect(record.pregnant).toBeCloseTo(MAX_PREGNANT_FRACTION * 100, 5);
    expect(record.pregnant).toBeLessThanOrEqual(MAX_PREGNANT_FRACTION * 100 + 1e-9);

    // Steady-state over many years stays at cap
    for (let i = 0; i < 20; i++) {
      record = advanceBurgPregnancy(record, {
        burgId: 1,
        femaleAdults: 100,
        roomForGrowth: 1,
        deltaYears: 1,
        birthRate
      });
    }
    expect(record.pregnant).toBeLessThanOrEqual(MAX_PREGNANT_FRACTION * 100 + 1e-6);
    expect(record.pregnant).toBeGreaterThan(0);
  });

  it("produces due and drains stock over gestation", () => {
    const start = advanceBurgPregnancy(
      { burgId: 1, pregnant: 12 },
      {
        burgId: 1,
        femaleAdults: 100,
        roomForGrowth: 0, // no new conceptions
        deltaYears: GESTATION_YEARS,
        birthRate: 0.25
      }
    );
    expect(start.lastDue).toBeCloseTo(12, 4);
    expect(start.pregnant).toBeCloseTo(0, 4);
  });

  it("does not conceive when roomForGrowth ≤ 0", () => {
    const record = advanceBurgPregnancy(undefined, {
      burgId: 1,
      femaleAdults: 100,
      roomForGrowth: 0,
      deltaYears: 1,
      birthRate: 0.25
    });
    expect(record.pregnant).toBe(0);
    expect(record.lastDue).toBe(0);
  });

  it("lower bound annual equals pregnant / GESTATION_YEARS", () => {
    expect(getExpectedBirthsLowerBoundAnnual(9)).toBeCloseTo(9 / GESTATION_YEARS, 5);
  });
});

describe("tickUrbanPregnancy", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    useOptionsState.setState({ demographicBirthRate: 0.25 });
    setBirthFloorProviderActive(false);
  });
  afterEach(() => {
    clearEconomyContext();
    setBirthFloorProviderActive(false);
  });

  it("builds pregnancy stock for towns with room", () => {
    setUpBurgs({ femaleAdults: 100, capacity: 1000 }); // lots of room
    tickUrbanPregnancy(1);

    const [record] = getUrbanPregnancy();
    expect(record?.burgId).toBe(1);
    expect(record?.pregnant ?? 0).toBeGreaterThan(0);
    expect(record!.pregnant).toBeLessThanOrEqual(MAX_PREGNANT_FRACTION * 100 + 1e-6);
  });

  it("skips forts", () => {
    setUpBurgs({ group: "fort", femaleAdults: 100, capacity: 1000 });
    tickUrbanPregnancy(1);
    expect(getUrbanPregnancy()).toHaveLength(0);
  });

  it("does not conceive when over capacity (room ≤ 0)", () => {
    // total 320, capacity 300 → room negative
    setUpBurgs({ capacity: 300, femaleAdults: 100 });
    tickUrbanPregnancy(1);
    const record = getUrbanPregnancy().find(r => r.burgId === 1);
    expect(record?.pregnant ?? 0).toBe(0);
  });

  it("is a no-op when birth-floor provider is active (PR-P2 guard)", () => {
    setUpBurgs({ femaleAdults: 100, capacity: 1000 });
    setBirthFloorProviderActive(true);
    expect(isBirthFloorProviderActive()).toBe(true);
    tickUrbanPregnancy(1);
    expect(getUrbanPregnancy()).toHaveLength(0);
  });

  it("clearUrbanPregnancy empties the slice", () => {
    setUpBurgs({ femaleAdults: 100, capacity: 1000 });
    tickUrbanPregnancy(1);
    expect(getUrbanPregnancy().length).toBeGreaterThan(0);
    clearUrbanPregnancy();
    expect(getUrbanPregnancy()).toHaveLength(0);
  });

  it("preserves stock across ticks without exceeding the cap", () => {
    setUpBurgs({ femaleAdults: 80, capacity: 2000 });
    for (let i = 0; i < 30; i++) tickUrbanPregnancy(1 / 12); // ~2.5 years monthly
    const pregnant = getUrbanPregnancy().find(r => r.burgId === 1)?.pregnant ?? 0;
    expect(pregnant).toBeLessThanOrEqual(MAX_PREGNANT_FRACTION * 80 + 1e-6);
  });
});

describe("urbanPregnancy birth floor provider (PR-P2)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    useOptionsState.setState({ demographicBirthRate: 0.25 });
    clearUrbanPregnancyBirthFloorRegistration();
  });
  afterEach(() => {
    clearUrbanPregnancyBirthFloorRegistration();
    clearEconomyContext();
  });

  it("returns due and writes slice when registered", () => {
    setUpBurgs({ femaleAdults: 100, capacity: 1000 });
    // Seed stock via observability path first
    setBirthFloorProviderActive(false);
    tickUrbanPregnancy(1);
    const pregnantBefore = getUrbanPregnancy().find(r => r.burgId === 1)?.pregnant ?? 0;
    expect(pregnantBefore).toBeGreaterThan(0);

    registerUrbanPregnancyBirthFloor();
    expect(isBirthFloorProviderActive()).toBe(true);
    expect(getBirthFloorProvider()).toBe(urbanPregnancyBirthFloorProvider);

    // economy.tick path must not mutate while provider active
    const snapshot = getUrbanPregnancy().map(r => ({ ...r }));
    tickUrbanPregnancy(1);
    expect(getUrbanPregnancy()).toEqual(snapshot);

    const due = urbanPregnancyBirthFloorProvider({
      burgId: 1,
      femaleAdults: 100,
      continuousBirths: 1,
      roomForGrowth: 0.5,
      deltaYears: GESTATION_YEARS
    });
    expect(due).toBeGreaterThan(0);
    // After full gestation, prior stock is largely due
    expect(due).toBeCloseTo(pregnantBefore, 1);
  });

  it("unregister restores economy.tick mutation ownership", () => {
    setUpBurgs({ femaleAdults: 100, capacity: 1000 });
    registerUrbanPregnancyBirthFloor();
    unregisterUrbanPregnancyBirthFloor();
    expect(isBirthFloorProviderActive()).toBe(false);
    expect(getBirthFloorProvider()).toBeNull();
    tickUrbanPregnancy(1);
    expect(getUrbanPregnancy().some(r => r.burgId === 1 && r.pregnant > 0)).toBe(true);
  });
});
