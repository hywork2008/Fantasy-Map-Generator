import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import type { MilitaryRegiment } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { advanceAllRegimentMovement } from "./regimentMovement";

function makeWorldContext(): WorldContext {
  return { distanceScale: 1, options: { year: 1000 } } as unknown as WorldContext;
}

function makeGarrison(overrides: Partial<MilitaryRegiment> = {}): MilitaryRegiment {
  return {
    i: 0,
    t: 100,
    a: 100,
    name: "Test Garrison",
    s: 0,
    cell: 1,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: { infantry: 100 },
    n: 0,
    type: "melee",
    state: 1,
    ...overrides
  };
}

// State 1 owns cell1 (capital, isolated), cell2 (border, adjacent to hostile cell4) and cell3
// (province admin seat, where the garrison actually starts, far from the border). No "roads"/
// "trails" routes exist, so reaching cell2 from cell3 must go through the cells.c off-road
// fallback (§1.2 option (a)) — cell3 <-> cell2 is the only link available.
function makeLandThreatPack(): PackedGraph {
  return {
    cells: {
      i: [0, 1, 2, 3, 4],
      h: [0, 50, 50, 50, 50],
      c: [[], [], [3, 4], [2], [2]],
      state: [0, 1, 1, 1, 2],
      province: [0, 1, 2, 2, 0],
      f: [0, 10, 10, 10, 10],
      p: [
        [-1000, -1000],
        [-1000, -1000],
        [300, 0],
        [0, 300],
        [310, 0]
      ]
    },
    burgs: [0],
    provinces: [],
    routes: [],
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      {
        i: 1,
        name: "Alpha",
        diplomacy: [undefined, "x", "Enemy"],
        campaigns: [],
        military: [] as MilitaryRegiment[]
      },
      {
        i: 2,
        name: "Beta",
        diplomacy: [undefined, "Enemy", "x"],
        campaigns: []
      }
    ]
  } as unknown as PackedGraph;
}

describe("advanceAllRegimentMovement — land garrison, off-road fallback", () => {
  it("marches from its start cell onto the owned border cell (not a floating pulled point) given enough time", () => {
    const pack = makeLandThreatPack();
    // Regiment starts at the province's admin seat (cell3, (0,300)) — far from the border.
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    // 100 years is far more marching budget than the ~424 map-unit hop from cell3 to cell2 needs.
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(true);
    expect(garrison.cell).toBe(2);
    expect([garrison.x, garrison.y]).toEqual([300, 0]);
    // No march order left once the destination is reached.
    expect(garrison.destinationCell).toBeUndefined();
    expect(garrison.path).toBeUndefined();
  });

  it("only advances partway along the path when the tick's time budget is small", () => {
    const pack = makeLandThreatPack();
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    // 5 days at ~16.8 map-units/day (foot pace with the off-road penalty, distanceScale 1) =
    // ~84 units, well short of the ~424 unit hop from cell3 to cell2.
    const moved = advanceAllRegimentMovement(pack, worldContext, 5 / 365);

    expect(moved).toBe(true);
    // Still mid-hop: hasn't reached the border cell yet, but has moved off its start position.
    expect(garrison.cell).toBe(3);
    expect(garrison.destinationCell).toBe(2);
    expect(garrison.path).toBeDefined();
    expect(garrison.x).not.toBe(0);
    expect(garrison.y).not.toBe(300);
    // Moving toward (300, 0) from (0, 300): x increases, y decreases.
    expect(garrison.x).toBeGreaterThan(0);
    expect(garrison.y).toBeLessThan(300);
  });

  it("marks the path off-road when no charted road/trail connects the regiment to its destination", () => {
    const pack = makeLandThreatPack();
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 5 / 365);

    expect(garrison.offRoad).toBe(true);
  });

  it("prefers a charted road over the off-road fallback when one connects the two cells", () => {
    const pack = makeLandThreatPack();
    (pack as unknown as { routes: unknown[] }).routes = [
      {
        i: 0,
        group: "roads",
        feature: 1,
        points: [
          [0, 300, 3],
          [300, 0, 2]
        ]
      }
    ];
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 5 / 365);

    expect(garrison.offRoad).toBe(false);
  });

  it("holds position (no march order, no crash) when the destination is unreachable", () => {
    const pack = makeLandThreatPack();
    // Sever the only link between the admin seat (cell3) and the border cell (cell2).
    pack.cells.c = [[], [], [4], [], [2]] as unknown as typeof pack.cells.c;
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(false);
    expect(garrison.cell).toBe(3);
    expect([garrison.x, garrison.y]).toEqual([0, 300]);
    expect(garrison.destinationCell).toBeUndefined();
  });
});

describe("advanceAllRegimentMovement — no threat", () => {
  it("leaves a regiment with no hostile frontier holding its position", () => {
    const pack = makeLandThreatPack();
    // No diplomacy entry at all toward state 2 (as opposed to e.g. "Ally", which still carries
    // a small nonzero RELATION_THREAT_WEIGHT) means getThreatWeight() returns 0 and
    // analyzeFrontiers() produces no segment for state 1 at all.
    (pack.states[1].diplomacy as unknown[]) = [undefined, "x", undefined];
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(false);
    expect(garrison.destinationCell).toBeUndefined();
    expect([garrison.x, garrison.y]).toEqual([0, 300]);
  });
});

// State 1's port/capital (cell1, haven at cell2) and state 2's port (cell3) sit on separate,
// unconnected landmasses (cells.c empty everywhere). `withRoute` controls whether a searoutes
// route (via water waypoint cell4) links the two ports — mirrors naval-sea-lanes.md Phase 4.
function makeFleetThreatPack(overrides: { withRoute: boolean }): PackedGraph {
  const { withRoute } = overrides;

  return {
    cells: {
      i: [0, 1, 2, 3, 4],
      h: [0, 50, 0, 50, 0],
      c: [[], [], [], [], []],
      state: [0, 1, 0, 2, 0],
      province: [0, 1, 0, 0, 0],
      f: [0, 10, 0, 20, 0],
      haven: [0, 2, 0, 0, 0],
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
      { i: 1, cell: 1, x: 100, y: 0, capital: 1, state: 1, population: 10000, culture: 1, port: 1, removed: false },
      { i: 2, cell: 3, x: 500, y: 0, capital: 1, state: 2, population: 5000, culture: 1, port: 1, removed: false }
    ],
    provinces: [],
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy"], campaigns: [] },
      { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
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

describe("advanceAllRegimentMovement — fleet (docs/plan/naval-sea-lanes.md + military-movement.md §4.6)", () => {
  it("marches a fleet partway along the charted route toward a threatening neighbor's port, given enough time", () => {
    const pack = makeFleetThreatPack({ withRoute: true });
    const fleet = makeGarrison({ cell: 1, x: 100, y: 0, bx: 100, by: 0, n: 1, type: "naval" });
    pack.states[1].military = [fleet];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(true);
    // Path is [port(1) -> waypoint(4) -> enemy port(3)]; a single sea segment means pull ratio
    // is always 1, so GARRISON_PULL_STRENGTH (0.5) targets the path's midpoint node — the
    // waypoint, not the home port and not the enemy's own port.
    expect(fleet.cell).toBe(4);
    expect([fleet.x, fleet.y]).toEqual([300, 0]);
  });

  it("leaves a fleet at its home port when no charted route reaches the threatening neighbor", () => {
    const pack = makeFleetThreatPack({ withRoute: false });
    const fleet = makeGarrison({ cell: 1, x: 100, y: 0, bx: 100, by: 0, n: 1, type: "naval" });
    pack.states[1].military = [fleet];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(false);
    expect(fleet.cell).toBe(1);
    expect(fleet.destinationCell).toBeUndefined();
  });
});

// Same layout as makeFleetThreatPack, plus an interior land province (cell5, far from the port)
// with no land border of its own anywhere. Confirms land regiments need no naval-specific code:
// merging sea frontier segments into the same frontiers map ensureGarrisonMarchOrder already
// reads is enough to march them toward a threatened port (naval-sea-lanes.md §2.5).
function makeLandArmyNearSeaThreatPack(overrides: { withRoute: boolean }): PackedGraph {
  const pack = makeFleetThreatPack(overrides);
  const cells = pack.cells as unknown as {
    i: number[];
    h: number[];
    c: number[][];
    state: number[];
    province: number[];
    f: number[];
    haven: number[];
    p: [number, number][];
  };
  cells.i.push(5);
  cells.h.push(50);
  cells.c.push([1]);
  cells.c[1] = [5];
  cells.state.push(1);
  cells.province.push(2);
  cells.f.push(10);
  cells.haven.push(0);
  cells.p.push([100, 300]);
  pack.provinces = [
    null,
    { i: 1, state: 1, center: 1, burg: 1 },
    { i: 2, state: 1, center: 5, burg: 0 }
  ] as unknown as PackedGraph["provinces"];
  return pack;
}

describe("advanceAllRegimentMovement — land army pulled by a sea-origin threat", () => {
  it("marches an interior land army toward a threatened port with no naval-specific code", () => {
    const withRoute = makeLandArmyNearSeaThreatPack({ withRoute: true });
    const armyWithRoute = makeGarrison({ cell: 5, x: 100, y: 300, bx: 100, by: 300, state: 1 });
    withRoute.states[1].military = [armyWithRoute];

    const withoutRoute = makeLandArmyNearSeaThreatPack({ withRoute: false });
    const armyWithoutRoute = makeGarrison({ cell: 5, x: 100, y: 300, bx: 100, by: 300, state: 1 });
    withoutRoute.states[1].military = [armyWithoutRoute];

    const worldContext = makeWorldContext();
    // No route at all means analyzeSeaFrontiers() produces no segment for state 1 (its only
    // port can't reach any hostile port), so the army never gets a march order.
    advanceAllRegimentMovement(withoutRoute, worldContext, 100);
    expect(armyWithoutRoute.destinationCell).toBeUndefined();
    expect(armyWithoutRoute.y).toBe(300);

    // With the route, the merged sea segment gives the interior army a march order toward the
    // port (y: 0) — even a short tick should move it off its start position, off-road (cell5
    // only connects to cell1 via cells.c, no charted road).
    const moved = advanceAllRegimentMovement(withRoute, worldContext, 5 / 365);
    expect(moved).toBe(true);
    expect(armyWithRoute.y).toBeLessThan(armyWithoutRoute.y);
  });
});
