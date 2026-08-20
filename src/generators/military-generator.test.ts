import { beforeEach, describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { Military } from "./military-generator";
import { resetTechnologyProgress, setTechnologyProgressForTests } from "./technologyProgress";

function makeState(pack: PackedGraph): WorldState {
  return {
    pack,
    options: { year: 1000 },
    biomesData: createDefaultBiomesData()
  } as unknown as WorldState;
}

function generate(pack: PackedGraph) {
  worldContext.pack = pack;
  worldContext.populationRate = 1;
  worldContext.urbanization = 1;
  worldContext.notes = [];
  worldContext.biomesData = createDefaultBiomesData();
  worldContext.options = { military: undefined } as unknown as typeof worldContext.options;
  Military.generate(worldContext, viewContext, appServices, makeState(pack));
  return worldContext.pack.states[1];
}

// ---------------------------------------------------------------------------
// Shared land layout:
//   cell 1: state 1 capital (province 1), no rural population — burg only
//   cell 2: state 1 interior province (province 2), rural population, no border
//   cell 3: state 1 frontier province (province 3), rural population, borders cell 4
//   cell 4: state 2 (hostile), border cell
// Provinces have no burg of their own (burg: 0), so they anchor on their center cell.
// ---------------------------------------------------------------------------

function makeBaseCells(overrides: { province2Pop?: number; interiorBordersHostile?: boolean } = {}) {
  const { province2Pop = 10000 } = overrides;
  const pop = [0, 0, province2Pop, 10000, 0];
  return {
    i: [0, 1, 2, 3, 4],
    h: [0, 50, 50, 50, 50],
    c: [[], [], [], [4], [3]],
    state: [0, 1, 1, 1, 2],
    province: [0, 1, 2, 3, 0],
    pop,
    // Matches main.ts's real-generation seeding (pop * 0.2205/0.2295) so the manpower
    // reconciliation step (src/generators/manpower.ts, on by default) has civilian males
    // to draw from instead of scaling every regiment's troops down to zero.
    maleAdults: pop.map(v => v * 0.2205),
    femaleAdults: pop.map(v => v * 0.2295),
    biomeCode: [0, 5, 5, 5, 5],
    culture: [0, 1, 1, 1, 1],
    religion: [0, 1, 1, 1, 1],
    f: [0, 10, 10, 10, 10],
    haven: [0, 0, 0, 0, 0],
    burg: [0, 1, 0, 0, 0],
    p: [
      [0, 0],
      [0, 0],
      [100, 0],
      [200, 0],
      [210, 0]
    ]
  };
}

function makeBaseState1(relationToState2: string) {
  return {
    i: 1,
    name: "Alpha",
    type: "Generic",
    expansionism: 1,
    area: 100,
    center: 1,
    culture: 1,
    formName: "Kingdom",
    diplomacy: [undefined, "x", relationToState2],
    neighbors: relationToState2 === "x" ? [] : [2],
    campaigns: []
  };
}

function makeBasePack(relation: string): PackedGraph {
  return {
    cells: makeBaseCells(),
    burgs: [0, { i: 1, cell: 1, x: 0, y: 0, capital: 1, state: 1, population: 10000, culture: 1, port: 0 }],
    provinces: [
      null,
      { i: 1, state: 1, center: 1, burg: 1, name: "Capitalia" },
      { i: 2, state: 1, center: 2, burg: 0, name: "Interior" },
      { i: 3, state: 1, center: 3, burg: 0, name: "Frontier" }
    ],
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      makeBaseState1(relation),
      {
        i: 2,
        name: "Beta",
        type: "Generic",
        expansionism: 1,
        area: 100,
        center: 4,
        culture: 1,
        formName: "Kingdom",
        diplomacy: [undefined, relation, "x"],
        neighbors: [1],
        campaigns: []
      }
    ]
  } as unknown as PackedGraph;
}

describe("MilitaryModule.generate — consolidated regiment structure", () => {
  // Every test in this file runs Military.generate(), which now reads per-State technology
  // gates (docs/plan/military-era-progression.md §3). Without a reset, a technologyProgress
  // entry seeded by one test (or lazily seeded from an earlier test's pack) would leak into the
  // next test's identical state ids (see technologyProgress.test.ts for the same pattern).
  beforeEach(() => {
    resetTechnologyProgress();
  });

  it("excludes artillery from regiments when the gunpowder era is disabled", () => {
    const pack = makeBasePack("Enemy");
    const state = makeState(pack);
    state.options = {
      year: 1000,
      gunpowderEraEnabled: false,
      military: Military.getDefaultOptions().map(unit =>
        unit.name === "artillery" ? { ...unit, enabled: true } : unit
      )
    };
    worldContext.pack = pack;
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.notes = [];

    Military.generate(worldContext, viewContext, appServices, state);

    const artillery = worldContext.pack.states
      .flatMap(stateEntry => stateEntry.military || [])
      .flatMap(regiment => Object.keys(regiment.u))
      .filter(unitName => unitName === "artillery");
    expect(artillery).toEqual([]);
  });

  it("keeps interior province's troops as a distinct field army when MAX_FIELD_ARMIES allows", () => {
    const withInterior = generate(makeBasePack("Enemy"));

    const guards = withInterior.military!.filter(r => r.isCapitalGuard)!;
    const armies = withInterior.military!.filter(r => !r.isCapitalGuard);

    expect(new Set(guards.map(r => r.cell)).size).toBe(1);

    const armyCells = new Set(armies.map(a => a.cell));
    expect(armyCells.size).toBe(2);
    expect(armyCells.has(2)).toBe(true); // interior cell
    expect(armyCells.has(3)).toBe(true); // frontier cell
  });

  it("gives a peaceful state a capital guard and distinct field armies for each province (up to MAX)", () => {
    const s = generate(makeBasePack("Ally"));

    const guards = s.military!.filter(r => r.isCapitalGuard);
    const armies = s.military!.filter(r => !r.isCapitalGuard);

    expect(new Set(guards.map(r => r.cell)).size).toBe(1);
    expect(new Set(armies.map(r => r.cell)).size).toBe(2);
  });

  it("caps distinct field armies at MAX_FIELD_ARMIES", () => {
    // State 1 has 3 separate frontier provinces (3, 4, 5), each bordering a *different*
    // hostile state (2, 3, 4) and 1 interior province (2). Since MAX_FIELD_ARMIES = 9,
    // all 4 provinces should get their own distinct army.
    const pop = [0, 0, 5000, 5000, 5000, 5000, 0, 0, 0];
    const pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        h: [0, 50, 50, 50, 50, 50, 50, 50, 50],
        c: [[], [], [], [6], [7], [8], [3], [4], [5]],
        state: [0, 1, 1, 1, 1, 1, 2, 3, 4],
        province: [0, 1, 2, 3, 4, 5, 0, 0, 0],
        pop,
        // See makeBaseCells() above for why manpower reconciliation needs this.
        maleAdults: pop.map(v => v * 0.2205),
        femaleAdults: pop.map(v => v * 0.2295),
        biomeCode: [0, 5, 5, 5, 5, 5, 5, 5, 5],
        culture: [0, 1, 1, 1, 1, 1, 1, 1, 1],
        religion: [0, 1, 1, 1, 1, 1, 1, 1, 1],
        f: [0, 10, 10, 10, 10, 10, 10, 10, 10],
        haven: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        burg: [0, 1, 0, 0, 0, 0, 0, 0, 0],
        p: [
          [0, 0],
          [0, 0],
          [50, 0],
          [100, 0],
          [150, 0],
          [200, 0],
          [110, 0],
          [160, 0],
          [210, 0]
        ]
      },
      burgs: [0, { i: 1, cell: 1, x: 0, y: 0, capital: 1, state: 1, population: 10000, culture: 1, port: 0 }],
      provinces: [
        null,
        { i: 1, state: 1, center: 1, burg: 1, name: "Capitalia" },
        { i: 2, state: 1, center: 2, burg: 0, name: "Interior" },
        { i: 3, state: 1, center: 3, burg: 0, name: "FrontierA" },
        { i: 4, state: 1, center: 4, burg: 0, name: "FrontierB" },
        { i: 5, state: 1, center: 5, burg: 0, name: "FrontierC" }
      ],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Alpha",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 1,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "x", "Enemy", "Enemy", "Enemy"],
          neighbors: [2, 3, 4],
          campaigns: []
        },
        {
          i: 2,
          name: "Beta",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 6,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "Enemy", "x", undefined, undefined],
          neighbors: [1],
          campaigns: []
        },
        {
          i: 3,
          name: "Gamma",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 7,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "Enemy", undefined, "x", undefined],
          neighbors: [1],
          campaigns: []
        },
        {
          i: 4,
          name: "Delta",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 8,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "Enemy", undefined, undefined, "x"],
          neighbors: [1],
          campaigns: []
        }
      ]
    } as unknown as PackedGraph;

    const s1 = generate(pack);
    const fieldArmies = s1.military!.filter(r => !r.isCapitalGuard);
    const armyCells = new Set(fieldArmies.map(r => r.cell));
    expect(armyCells.size).toBe(4); // 4 distinct provinces

    // all provinces' troops must still be accounted for somewhere
    const totalFieldTroops = fieldArmies.reduce((sum, r) => sum + r.a, 0);
    expect(totalFieldTroops).toBeGreaterThan(0);
  });

  it("grows the capital guard when the capital's own province is threatened", () => {
    const safePack = makeBasePack("Enemy");
    const safeState = generate(safePack);
    const safeGuard = safeState.military!.find(r => r.isCapitalGuard)!;

    // Move the capital into the frontier province itself (province 3, which borders state 2).
    const threatenedPack = makeBasePack("Enemy");
    threatenedPack.cells.province = [0, 3, 2, 3, 0] as unknown as typeof threatenedPack.cells.province;
    (threatenedPack.states[1] as { center: number }).center = 1;
    // cell 1 (capital) now shares province 3 with the already-threatened frontier cell 3
    const threatenedState = generate(threatenedPack);
    const threatenedGuard = threatenedState.military!.find(r => r.isCapitalGuard)!;

    expect(threatenedGuard.a).toBeGreaterThan(safeGuard.a);
  });
});

// docs/plan/military-era-progression.md Phase 1: per-State technology gating for era-5/6 units
// (riflemen/fieldArtillery/machineGunners) and gradual obsolescence of the units they supersede.
describe("MilitaryModule.generate — era-5/6 technology-gated units", () => {
  beforeEach(() => {
    resetTechnologyProgress();
  });

  function unitTotals(state: ReturnType<typeof generate>): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const regiment of state.military ?? []) {
      for (const [unitName, amount] of Object.entries(regiment.u)) {
        totals[unitName] = (totals[unitName] ?? 0) + amount;
      }
    }
    return totals;
  }

  it("keeps riflemen/fieldArtillery/machineGunners out of the roster while their technology is locked", () => {
    // No setTechnologyProgressForTests() call — every technology defaults to "locked", same as
    // the pre-Phase-1 behavior for every existing (ungated) unit.
    const state = generate(makeBasePack("Enemy"));
    const totals = unitTotals(state);

    expect(totals.riflemen ?? 0).toBe(0);
    expect(totals.fieldArtillery ?? 0).toBe(0);
    expect(totals.machineGunners ?? 0).toBe(0);
    expect(totals.musketeers ?? 0).toBeGreaterThan(0);
    expect(totals.artillery ?? 0).toBeGreaterThan(0);
  });

  it("recruits riflemen once standardMachineWorks is adopted, and shrinks musketeers' share", () => {
    const lockedState = generate(makeBasePack("Enemy"));
    const lockedTotals = unitTotals(lockedState);

    resetTechnologyProgress();
    setTechnologyProgressForTests([
      { technologyId: "standardMachineWorks", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    const adoptedState = generate(makeBasePack("Enemy"));
    const adoptedTotals = unitTotals(adoptedState);

    expect(adoptedTotals.riflemen ?? 0).toBeGreaterThan(0);
    // obsoletes: "musketeers" — adopted (share 0.75) leaves musketeers only 25% of what they'd
    // otherwise be, so the state's musketeer total should drop well below the locked baseline.
    expect(adoptedTotals.musketeers ?? 0).toBeLessThan((lockedTotals.musketeers ?? 0) * 0.5);
    // fieldArtillery/machineGunners are gated on a different technology (modernSteelmaking) and
    // must stay unaffected by standardMachineWorks alone.
    expect(adoptedTotals.fieldArtillery ?? 0).toBe(0);
    expect(adoptedTotals.machineGunners ?? 0).toBe(0);
  });

  it("recruits machineGunners once modernSteelmaking is demonstrated, below fieldArtillery's adopted bar", () => {
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    const state = generate(makeBasePack("Enemy"));
    const totals = unitTotals(state);

    expect(totals.machineGunners ?? 0).toBeGreaterThan(0);
    // fieldArtillery requires "adopted", one stage further than machineGunners' "demonstrated".
    expect(totals.fieldArtillery ?? 0).toBe(0);
    // machineGunners has no `obsoletes` relationship — artillery keeps its full share.
    expect(totals.artillery ?? 0).toBeGreaterThan(0);
  });

  it("recruits fieldArtillery once modernSteelmaking is adopted, and shrinks artillery's share", () => {
    const lockedState = generate(makeBasePack("Enemy"));
    const lockedTotals = unitTotals(lockedState);

    resetTechnologyProgress();
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    const adoptedState = generate(makeBasePack("Enemy"));
    const adoptedTotals = unitTotals(adoptedState);

    expect(adoptedTotals.fieldArtillery ?? 0).toBeGreaterThan(0);
    expect(adoptedTotals.machineGunners ?? 0).toBeGreaterThan(0); // "adopted" also clears "demonstrated"
    expect(adoptedTotals.artillery ?? 0).toBeLessThan((lockedTotals.artillery ?? 0) * 0.5);
  });

  it("does not gate riflemen/fieldArtillery/machineGunners when the gunpowder era is disabled, same as musketeers/artillery", () => {
    setTechnologyProgressForTests([
      { technologyId: "standardMachineWorks", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    const pack = makeBasePack("Enemy");
    const state = makeState(pack);
    state.options = { year: 1000, gunpowderEraEnabled: false };
    worldContext.pack = pack;
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.notes = [];

    Military.generate(worldContext, viewContext, appServices, state);
    const totals = unitTotals(worldContext.pack.states[1]);

    for (const name of ["musketeers", "artillery", "riflemen", "fieldArtillery", "machineGunners"]) {
      expect(totals[name] ?? 0).toBe(0);
    }
  });
});
