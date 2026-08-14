import { beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Burg, MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  assertManpowerInvariant,
  currentLandCapacity,
  currentLandTroops,
  effectiveTroopTarget,
  fillRegimentFromManpower,
  GREEN_RECRUIT_QUALITY,
  getDraftEfficiency,
  reconcileStateManpower,
  regimentQualityMultiplier,
  removeCivilianMalePeople,
  scaleLandMilitary,
  stateHasActiveConflict,
  sumCivilianMalePeople,
  tickManpower
} from "./manpower";

function makePack(): PackedGraph {
  const cells = {
    i: [0, 1, 2],
    state: [0, 1, 1],
    province: [0, 5, 9],
    pop: [0, 100, 50],
    maleAdults: new Float32Array([0, 22, 11]),
    femaleAdults: new Float32Array([0, 23, 12]),
    children: new Float32Array([0, 40, 20]),
    elders: new Float32Array([0, 15, 7]),
    p: [
      [0, 0],
      [1, 1],
      [2, 2]
    ]
  };
  const burgs: Burg[] = [
    { cell: 0, x: 0, y: 0 },
    {
      i: 1,
      cell: 1,
      x: 1,
      y: 1,
      state: 1,
      population: 10,
      demographics: { capacity: 12, children: 4, maleAdults: 2.2, femaleAdults: 2.3, elders: 1.5 }
    }
  ];
  const regiment: MilitaryRegiment = {
    i: 0,
    t: 5000,
    a: 5000,
    s: 1,
    cell: 1,
    x: 1,
    y: 1,
    bx: 1,
    by: 1,
    u: { infantry: 5000 },
    n: 0,
    type: "melee",
    state: 1,
    name: "Test"
  };
  const state: State = {
    i: 1,
    name: "A",
    expansionism: 1,
    capital: 1,
    type: "Generic",
    center: 1,
    culture: 1,
    coa: null,
    rural: 800,
    urban: 200,
    military: [regiment],
    diplomacy: []
  };
  return {
    cells,
    burgs,
    states: [{ i: 0, name: "neutral" } as State, state]
  } as unknown as PackedGraph;
}

describe("manpower ledger", () => {
  beforeEach(() => {
    worldContext.populationRate = 1000;
    worldContext.urbanization = 2;
    worldContext.pack = makePack();
    worldContext.options = { conflictAutonomy: "playerDirected" } as typeof worldContext.options;
    simulationContext.extensions = {};
    simulationContext.strategicGoals = {};
  });

  it("sums civilian males as people across rural and urban populations", () => {
    const pack = worldContext.pack as PackedGraph;
    // rural: (22+11) × 1000, burg: 2.2 × 1000 × 2
    expect(sumCivilianMalePeople(pack, 1, 1000, 2)).toBeCloseTo(37400, 5);
  });

  it("counts equipment-gated establishments as capacity without treating them as troops under arms", () => {
    const regiment = worldContext.pack.states[1].military![0];
    regiment.a = 70;
    regiment.t = 70;
    regiment.u = { infantry: 70 };
    regiment.plannedU = { musketeers: 30 };

    expect(currentLandTroops(worldContext.pack.states[1])).toBe(70);
    expect(currentLandCapacity(worldContext.pack.states[1])).toBe(100);

    regiment.u.musketeers = 10;
    regiment.a = 80;
    regiment.t = 80;
    expect(currentLandCapacity(worldContext.pack.states[1])).toBe(100);
  });

  it("reconcile deducts under-arms from civilians once", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    const before = sumCivilianMalePeople(pack, 1, 1000, 2);
    const troops = currentLandTroops(state);
    reconcileStateManpower(pack, state, 1000, 2);
    expect(state.manpowerReconciled).toBe(true);
    expect(sumCivilianMalePeople(pack, 1, 1000, 2)).toBeCloseTo(before - troops, 2);
    // second call is a no-op
    reconcileStateManpower(pack, state, 1000, 2);
    expect(sumCivilianMalePeople(pack, 1, 1000, 2)).toBeCloseTo(before - troops, 2);
  });

  it("removeCivilianMalePeople never goes negative", () => {
    const pack = worldContext.pack as PackedGraph;
    const removed = removeCivilianMalePeople(pack, 1, 1e9, undefined, 1000, 2);
    expect(removed).toBeCloseTo(37400, 4);
    expect(sumCivilianMalePeople(pack, 1, 1000, 2)).toBeCloseTo(0, 5);
  });

  it("fillRegimentFromManpower draws civilians and raises a", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    const r = state.military![0];
    r.a = 1000;
    r.t = 5000;
    r.u = { infantry: 1000 };
    const maleBefore = sumCivilianMalePeople(pack, 1, 1000, 2);
    fillRegimentFromManpower(pack, state, r, 1, 1000);
    expect(r.a).toBeGreaterThan(1000);
    expect(sumCivilianMalePeople(pack, 1, 1000, 2)).toBeLessThan(maleBefore);
  });

  it("tickManpower raises capacity when under peacetime target", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    // people = 1e6, 1% = 10000; start tiny
    const r = state.military![0];
    r.a = 100;
    r.t = 100;
    r.u = { infantry: 100 };
    state.manpowerReconciled = true;
    tickManpower(pack, 1, 1000);
    expect(r.t).toBeGreaterThan(100);
  });

  it("batching a week's worth of deltaYears into one call matches seven separate daily calls closely (docs/plan/advance-time-loop-reduction.md Phase 1)", () => {
    // tickManpower's growth branch is pure Euler integration of a gap-closing rate
    // (ANNUAL_DRAFT_SHARE × deltaYears, no probability rolls, no rounding thresholds), so seven
    // tiny daily steps and one accumulated weekly step should land within a fraction of a
    // percent of each other. This is the numeric-safety assumption manpower.tick's day-accumulator
    // self-gate (src/generators/timeEngine.ts) relies on.
    const DAYS_PER_YEAR = 365.2425;
    const dailyDeltaYears = 1 / DAYS_PER_YEAR;
    const weeklyDeltaYears = 7 / DAYS_PER_YEAR;

    const dailyPack = makePack();
    const dailyRegiment = dailyPack.states[1].military![0];
    dailyRegiment.a = 100;
    dailyRegiment.t = 100;
    dailyRegiment.u = { infantry: 100 };
    for (let day = 0; day < 7; day++) {
      tickManpower(dailyPack, dailyDeltaYears, 1000);
    }

    const weeklyPack = makePack();
    const weeklyRegiment = weeklyPack.states[1].military![0];
    weeklyRegiment.a = 100;
    weeklyRegiment.t = 100;
    weeklyRegiment.u = { infantry: 100 };
    tickManpower(weeklyPack, weeklyDeltaYears, 1000);

    expect(weeklyRegiment.t).toBeGreaterThan(100);
    expect(weeklyRegiment.t / dailyRegiment.t).toBeCloseTo(1, 2); // within ~0.5%
  });

  it("effectiveTroopTarget is capped by male stock", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    // wipe males almost entirely and field no troops
    removeCivilianMalePeople(pack, 1, 1e9, undefined, 1000, 2);
    state.military![0].a = 0;
    state.military![0].t = 0;
    state.military![0].u = { infantry: 0 };
    const target = effectiveTroopTarget(pack, state, 1000);
    // policy target would be 10_000 people; with ~0 males physical cap ≈ 0
    expect(target).toBeLessThan(1);
    expect(sumCivilianMalePeople(pack, 1, 1000, 2)).toBeCloseTo(0, 5);
  });

  it("preferred province takes a larger share of the draft", () => {
    const pack = worldContext.pack as PackedGraph;
    const maleBefore5 = pack.cells.maleAdults[1]; // province 5
    const maleBefore9 = pack.cells.maleAdults[2]; // province 9
    removeCivilianMalePeople(pack, 1, 10_000, { preferredProvince: 5 }, 1000, 2);
    const lost5 = maleBefore5 - pack.cells.maleAdults[1];
    const lost9 = maleBefore9 - pack.cells.maleAdults[2];
    expect(lost5).toBeGreaterThan(lost9);
  });

  it("scaleLandMilitary shrinks land regiments only", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    const r = state.military![0];
    r.a = 1000;
    r.t = 1000;
    r.u = { infantry: 1000 };
    scaleLandMilitary(state, 0.9);
    expect(r.a).toBeCloseTo(900);
    expect(r.t).toBeCloseTo(900);
    expect(r.u.infantry).toBeCloseTo(900);
  });

  it("assertManpowerInvariant fails when under-arms exceed war max levy", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    removeCivilianMalePeople(pack, 1, 1e9, undefined, 1000, 2);
    state.military![0].a = 50_000;
    state.military![0].t = 50_000;
    expect(assertManpowerInvariant(pack, 1, 1000)).toBe(false);
  });

  it("getDraftEfficiency falls with supplyStrain", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    state.supplyStrain = 0;
    expect(getDraftEfficiency(state)).toBeCloseTo(1, 5);
    state.supplyStrain = 1;
    expect(getDraftEfficiency(state)).toBeCloseTo(0.6, 5);
  });

  it("does not mobilize for a diplomatic Enemy relation until the player authorizes the conflict", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    state.diplomacy![2] = "Enemy";

    expect(stateHasActiveConflict(state)).toBe(false);

    simulationContext.extensions = {
      nobility: {
        conflictAuthorizationsByState: {
          1: { 2: { origin: "player" } }
        }
      }
    };
    expect(stateHasActiveConflict(state)).toBe(true);
  });

  it("fillRegimentFromManpower dilutes quality with green recruits", () => {
    useOptionsState.getState().setOption("recruitQualityEnabled", true);
    useOptionsState.getState().setOption("simManpower", true);
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    const r = state.military![0];
    r.a = 100;
    r.t = 1000;
    r.u = { infantry: 100 };
    r.quality = 1;
    r.homeProvince = 5;
    fillRegimentFromManpower(pack, state, r, 1, 1000);
    expect(r.a).toBeGreaterThan(100);
    expect(r.quality!).toBeLessThan(1);
    expect(r.quality!).toBeGreaterThanOrEqual(GREEN_RECRUIT_QUALITY - 0.01);
    expect(regimentQualityMultiplier(r)).toBeCloseTo(r.quality!, 5);
  });
});
