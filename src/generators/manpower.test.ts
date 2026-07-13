import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { Burg, MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  currentLandTroops,
  effectiveTroopTarget,
  fillRegimentFromManpower,
  reconcileStateManpower,
  removeCivilianMalePoints,
  sumCivilianMalePoints,
  tickManpower,
  troopsToPoints
} from "./manpower";

function makePack(): PackedGraph {
  const cells = {
    i: [0, 1, 2],
    state: [0, 1, 1],
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
    worldContext.pack = makePack();
  });

  it("sums civilian male points across cells and burgs", () => {
    const pack = worldContext.pack as PackedGraph;
    // cells: 22+11, burg: 2.2 → 35.2
    expect(sumCivilianMalePoints(pack, 1)).toBeCloseTo(35.2, 5);
  });

  it("reconcile deducts under-arms from civilians once", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    const before = sumCivilianMalePoints(pack, 1);
    const troopPts = troopsToPoints(currentLandTroops(state), 1000);
    reconcileStateManpower(pack, state, 1000);
    expect(state.manpowerReconciled).toBe(true);
    expect(sumCivilianMalePoints(pack, 1)).toBeCloseTo(before - troopPts, 4);
    // second call is a no-op
    reconcileStateManpower(pack, state, 1000);
    expect(sumCivilianMalePoints(pack, 1)).toBeCloseTo(before - troopPts, 4);
  });

  it("removeCivilianMalePoints never goes negative", () => {
    const pack = worldContext.pack as PackedGraph;
    const removed = removeCivilianMalePoints(pack, 1, 1e9);
    expect(removed).toBeCloseTo(35.2, 4);
    expect(sumCivilianMalePoints(pack, 1)).toBeCloseTo(0, 5);
  });

  it("fillRegimentFromManpower draws civilians and raises a", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    const r = state.military![0];
    r.a = 1000;
    r.t = 5000;
    r.u = { infantry: 1000 };
    const maleBefore = sumCivilianMalePoints(pack, 1);
    fillRegimentFromManpower(pack, state, r, 1, 1000);
    expect(r.a).toBeGreaterThan(1000);
    expect(sumCivilianMalePoints(pack, 1)).toBeLessThan(maleBefore);
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

  it("effectiveTroopTarget is capped by male stock", () => {
    const pack = worldContext.pack as PackedGraph;
    const state = pack.states[1];
    // wipe males almost entirely and field no troops
    removeCivilianMalePoints(pack, 1, 1e9);
    state.military![0].a = 0;
    state.military![0].t = 0;
    state.military![0].u = { infantry: 0 };
    const target = effectiveTroopTarget(pack, state, 1000);
    // policy target would be 10_000 people; with ~0 males physical cap ≈ 0
    expect(target).toBeLessThan(1);
    expect(sumCivilianMalePoints(pack, 1)).toBeCloseTo(0, 5);
  });
});
