import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { Military } from "./military-generator";

function makeState(pack: PackedGraph): WorldState {
  return { pack, options: { year: 1000 } } as unknown as WorldState;
}

function generate(pack: PackedGraph) {
  worldContext.pack = pack;
  worldContext.populationRate = 1;
  worldContext.urbanization = 1;
  worldContext.notes = [];
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
  return {
    i: [0, 1, 2, 3, 4],
    h: [0, 50, 50, 50, 50],
    c: [[], [], [], [4], [3]],
    state: [0, 1, 1, 1, 2],
    province: [0, 1, 2, 3, 0],
    pop: [0, 0, province2Pop, 10000, 0],
    biome: [0, 5, 5, 5, 5],
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
    const pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        h: [0, 50, 50, 50, 50, 50, 50, 50, 50],
        c: [[], [], [], [6], [7], [8], [3], [4], [5]],
        state: [0, 1, 1, 1, 1, 1, 2, 3, 4],
        province: [0, 1, 2, 3, 4, 5, 0, 0, 0],
        pop: [0, 0, 5000, 5000, 5000, 5000, 0, 0, 0],
        biome: [0, 5, 5, 5, 5, 5, 5, 5, 5],
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

describe("redistributeGarrisons — stays on owned land", () => {
  it("snaps the pulled position onto an actual owned cell instead of a raw midpoint", () => {
    // Province 2's administrative city (cell 3, where its `burg` sits) is far from the
    // actual border cell that puts it on the frontier (cell 2, its rural `center`). Pulling
    // the field army halfway from the burg toward the border cell's exact position lands
    // on (150, 150) — a point this state doesn't own at all (no cell sits there). The fix
    // must snap that back onto a cell the state actually holds, not leave it floating.
    const pack = {
      cells: {
        i: [0, 1, 2, 3, 4],
        h: [0, 50, 50, 50, 50],
        c: [[], [], [4], [], [2]],
        state: [0, 1, 1, 1, 2],
        province: [0, 1, 2, 2, 0],
        pop: [0, 0, 100, 0, 0],
        biome: [0, 5, 5, 5, 5],
        culture: [0, 1, 1, 1, 1],
        religion: [0, 1, 1, 1, 1],
        f: [0, 10, 10, 10, 10],
        haven: [0, 0, 0, 0, 0],
        burg: [0, 1, 0, 3, 0],
        p: [
          [-1000, -1000],
          [-1000, -1000],
          [300, 0],
          [0, 300],
          [310, 0]
        ]
      },
      burgs: [
        0,
        { i: 1, cell: 1, x: -1000, y: -1000, capital: 1, state: 1, population: 10000, culture: 1, port: 0 },
        0,
        { i: 3, cell: 3, x: 0, y: 300, capital: 0, state: 1, population: 5000, culture: 1, port: 0 }
      ],
      provinces: [
        null,
        { i: 1, state: 1, center: 1, burg: 1, name: "Capitalia" },
        { i: 2, state: 1, center: 2, burg: 3, name: "Frontier" }
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
          diplomacy: [undefined, "x", "Enemy"],
          neighbors: [2],
          campaigns: []
        },
        {
          i: 2,
          name: "Beta",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 4,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "Enemy", "x"],
          neighbors: [1],
          campaigns: []
        }
      ]
    } as unknown as PackedGraph;

    const s1 = generate(pack);
    const army = s1.military!.find(r => !r.isCapitalGuard)!;

    // The raw interpolated midpoint (150, 150) belongs to no cell this state owns.
    expect([army.x, army.y]).not.toEqual([150, 150]);
    // It must land exactly on a cell the state actually holds (cell 2, the border cell).
    expect(army.cell).toBe(2);
    expect([army.x, army.y]).toEqual([300, 0]);
  });
});

describe("redistributeGarrisons — naval threats (docs/plan/naval-sea-lanes.md Phase 4)", () => {
  // State 1's port/capital (cell 1, haven at cell 2) and state 2's port (cell 3) sit on
  // separate, unconnected landmasses (cells.c is empty everywhere — no land border exists
  // between them at all). `withRoute` controls whether a searoutes route (via water waypoint
  // cell 4) links the two ports.
  function makeFleetThreatPack(overrides: { withRoute: boolean }): PackedGraph {
    const { withRoute } = overrides;

    return {
      cells: {
        i: [0, 1, 2, 3, 4],
        h: [0, 50, 0, 50, 0],
        c: [[], [], [], [], []],
        state: [0, 1, 0, 2, 0],
        province: [0, 1, 0, 0, 0],
        pop: [0, 0, 0, 0, 0],
        biome: [0, 5, 5, 5, 5],
        culture: [0, 1, 1, 1, 1],
        religion: [0, 1, 1, 1, 1],
        f: [0, 10, 0, 20, 0],
        haven: [0, 2, 0, 0, 0],
        burg: [0, 1, 0, 2, 0],
        p: [
          [0, 0],
          [100, 0],
          [110, 10],
          [500, 0],
          [300, 0]
        ]
      },
      burgs: [
        0,
        { i: 1, cell: 1, x: 100, y: 0, capital: 1, state: 1, population: 10000, culture: 1, port: 1 },
        { i: 2, cell: 3, x: 500, y: 0, capital: 1, state: 2, population: 5000, culture: 1, port: 1 }
      ],
      provinces: [null, { i: 1, state: 1, center: 1, burg: 1, name: "Capitalia" }],
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
          diplomacy: [undefined, "x", "Enemy"],
          neighbors: [],
          campaigns: []
        },
        {
          i: 2,
          name: "Beta",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 3,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "Enemy", "x"],
          neighbors: [],
          campaigns: []
        }
      ],
      routes: withRoute
        ? [
            {
              i: 0,
              group: "searoutes",
              feature: 1,
              points: [
                [100, 0, 1],
                [300, 0, 4],
                [500, 0, 3]
              ]
            }
          ]
        : []
    } as unknown as PackedGraph;
  }

  it("moves a fleet partway along the charted route toward a threatening neighbor's port", () => {
    const s1 = generate(makeFleetThreatPack({ withRoute: true }));
    const fleet = s1.military!.find(r => r.n)!;

    // Path is [port(1) -> waypoint(4) -> enemy port(3)]; a single sea segment means pull
    // ratio is always 1, so GARRISON_PULL_STRENGTH (0.5) lands the fleet exactly on the
    // path's midpoint node — the waypoint, not the home port and not the enemy's own port.
    expect(fleet.cell).toBe(4);
    expect([fleet.x, fleet.y]).toEqual([300, 0]);
  });

  it("leaves a fleet at its home port when no charted route reaches the threatening neighbor", () => {
    const s1 = generate(makeFleetThreatPack({ withRoute: false }));
    const fleet = s1.military!.find(r => r.n)!;

    expect(fleet.cell).toBe(1);
  });

  // Same layout as makeFleetThreatPack, plus an interior land province (cell 5, far from the
  // port) with no land border of its own anywhere. Confirms the claim from
  // docs/plan/naval-sea-lanes.md §2.5: land regiments need no naval-specific code at all —
  // merging sea frontier segments into the same frontiers map the existing
  // redistributeGarrisons already reads is enough to pull them toward a threatened port.
  function makeLandArmyNearSeaThreatPack(overrides: { withRoute: boolean }): PackedGraph {
    const { withRoute } = overrides;

    return {
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        h: [0, 50, 0, 50, 0, 50],
        c: [[], [], [], [], [], []],
        state: [0, 1, 0, 2, 0, 1],
        province: [0, 1, 0, 0, 0, 2],
        pop: [0, 0, 0, 0, 0, 10000],
        biome: [0, 5, 5, 5, 5, 5],
        culture: [0, 1, 1, 1, 1, 1],
        religion: [0, 1, 1, 1, 1, 1],
        f: [0, 10, 0, 20, 0, 10],
        haven: [0, 2, 0, 0, 0, 0],
        burg: [0, 1, 0, 2, 0, 0],
        p: [
          [0, 0],
          [100, 0],
          [110, 10],
          [500, 0],
          [300, 0],
          [100, 300]
        ]
      },
      burgs: [
        0,
        { i: 1, cell: 1, x: 100, y: 0, capital: 1, state: 1, population: 10000, culture: 1, port: 1 },
        { i: 2, cell: 3, x: 500, y: 0, capital: 1, state: 2, population: 5000, culture: 1, port: 1 }
      ],
      provinces: [
        null,
        { i: 1, state: 1, center: 1, burg: 1, name: "Capitalia" },
        { i: 2, state: 1, center: 5, burg: 0, name: "Interior" }
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
          diplomacy: [undefined, "x", "Enemy"],
          neighbors: [],
          campaigns: []
        },
        {
          i: 2,
          name: "Beta",
          type: "Generic",
          expansionism: 1,
          area: 100,
          center: 3,
          culture: 1,
          formName: "Kingdom",
          diplomacy: [undefined, "Enemy", "x"],
          neighbors: [],
          campaigns: []
        }
      ],
      routes: withRoute
        ? [
            {
              i: 0,
              group: "searoutes",
              feature: 1,
              points: [
                [100, 0, 1],
                [300, 0, 4],
                [500, 0, 3]
              ]
            }
          ]
        : []
    } as unknown as PackedGraph;
  }

  it("pulls an interior land army toward a threatened port with no naval-specific code", () => {
    const withThreat = generate(makeLandArmyNearSeaThreatPack({ withRoute: true }));
    const armyWithThreat = withThreat.military!.find(r => !r.isCapitalGuard && !r.n)!;

    const withoutThreat = generate(makeLandArmyNearSeaThreatPack({ withRoute: false }));
    const armyWithoutThreat = withoutThreat.military!.find(r => !r.isCapitalGuard && !r.n)!;

    // No route at all means analyzeSeaFrontiers() produces no segment for state 1 (its only
    // port can't reach any hostile port), so the army stays exactly where it was recruited.
    expect(armyWithoutThreat.y).toBe(300);
    // With the route, the merged sea segment pulls the interior army toward the port (y: 0).
    expect(armyWithThreat.y).toBeLessThan(armyWithoutThreat.y);
  });
});
