import { describe, expect, it } from "vitest";
import type { Burg, MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { collectLivingStatsByState } from "./populationOverviewStats";

function makePack(): PackedGraph {
  const cells = {
    i: [0, 1, 2],
    state: [0, 1, 1],
    pop: [0, 100, 50],
    children: new Float32Array([0, 40, 20]),
    maleAdults: new Float32Array([0, 22, 11]),
    femaleAdults: new Float32Array([0, 23, 12]),
    elders: new Float32Array([0, 15, 7])
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
      demographics: { capacity: 12, children: 4, maleAdults: 2, femaleAdults: 3, elders: 1 }
    }
  ];
  const regiment: MilitaryRegiment = {
    i: 0,
    t: 1000,
    a: 1000,
    s: 1,
    cell: 1,
    x: 1,
    y: 1,
    bx: 1,
    by: 1,
    u: { infantry: 1000 },
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
    color: "#f00",
    military: [regiment]
  };
  return {
    cells,
    burgs,
    states: [{ i: 0, name: "neutral" } as State, state]
  } as unknown as PackedGraph;
}

describe("collectLivingStatsByState", () => {
  it("aggregates rural/urban, age buckets, under arms, and rates", () => {
    const rows = collectLivingStatsByState(makePack(), 1000, 1);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.name).toBe("A");
    // rural pts 150 × 1000
    expect(r.rural).toBeCloseTo(150_000);
    // urban pts 10 × 1000 × 1
    expect(r.urban).toBeCloseTo(10_000);
    expect(r.underArms).toBe(1000);
    expect(r.total).toBeCloseTo(161_000);
    // children 40+20+4
    expect(r.children).toBeCloseTo(64_000);
    expect(r.civilianMale).toBeCloseTo(35_000); // 22+11+2
    expect(r.civilianFemale).toBeCloseTo(38_000); // 23+12+3
    expect(r.elders).toBeCloseTo(23_000); // 15+7+1
    expect(r.mobilizationPct).toBeCloseTo((1000 / 161_000) * 100, 5);
    // adult male % includes under arms
    const adultMalePct = ((35_000 + 1000) / (35_000 + 1000 + 38_000)) * 100;
    expect(r.adultMalePct).toBeCloseTo(adultMalePct, 5);
  });

  it("applies urbanization consistently to urban totals and age buckets", () => {
    const rows = collectLivingStatsByState(makePack(), 1000, 2);
    const row = rows[0];
    expect(row.urban).toBeCloseTo(20_000);
    expect(row.rural).toBeCloseTo(150_000);
    expect(row.children).toBeCloseTo(68_000); // 60 rural points + 4 urban points × 2
    expect(row.civilianMale).toBeCloseTo(37_000); // 33 rural points + 2 urban points × 2
    expect(row.civilianFemale).toBeCloseTo(41_000); // 35 rural points + 3 urban points × 2
    expect(row.elders).toBeCloseTo(24_000); // 22 rural points + 1 urban point × 2
  });
});
