import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyFrontierSimulationState, FRONTIER_STAGE, simulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { MilitaryRegiment } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  advanceAllRegimentMovement,
  advanceAlongPath,
  getMilitaryGradeEffectStrength,
  isOccupiedHomeBurg,
  regimentGradeSensitivity
} from "./regimentMovement";

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

describe("advanceAllRegimentMovement — unclaimed frontier relief", () => {
  it("sends a patrol to a State-supported outpost without treating wilderness as a diplomatic enemy", () => {
    const pack = {
      cells: {
        i: [0, 1, 2],
        h: [50, 50, 50],
        c: [[1, 2], [0], [0]],
        state: [1, 1, 0],
        province: [1, 1, 0],
        f: [10, 10, 10],
        burg: [0, 0, 0],
        routes: { 0: { 2: 0 }, 2: { 0: 0 } },
        p: [
          [100, 0],
          [0, 0],
          [60, 0]
        ]
      },
      burgs: [0],
      provinces: [],
      routes: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Alpha", diplomacy: [], military: [] }
      ]
    } as unknown as PackedGraph;
    const garrison = makeGarrison({ cell: 1, x: 0, y: 0, bx: 0, by: 0 });
    pack.states[1].military = [garrison];
    const previousFrontier = simulationContext.frontier;
    const frontier = createEmptyFrontierSimulationState(3);
    frontier.cellStages[2] = FRONTIER_STAGE.outpost;
    frontier.projects[2] = {
      cellId: 2,
      stateId: 1,
      stage: FRONTIER_STAGE.outpost,
      establishedYear: 1000,
      supportYears: 0,
      failedSupportYears: 0
    };
    simulationContext.frontier = frontier;

    try {
      const worldContext = makeWorldContext();
      worldContext.options.initialSettlementPattern = "frontier";

      expect(advanceAllRegimentMovement(pack, worldContext, 100)).toBe(true);
      expect(garrison.cell).toBe(2);
      expect(pack.cells.state[2]).toBe(0);
    } finally {
      simulationContext.frontier = previousFrontier;
    }
  });
});

describe("advanceAllRegimentMovement — reclaiming a lost enclave (Burg.stateHistory)", () => {
  // cell0 (state 1's border cell, the frontier anchor) -- cell1 (garrison start) -- cell2
  // (enclave: owned by state 2 now, but stateHistory shows it used to be state 1's). cell2 sits
  // essentially at the pull-toward-the-border midpoint, so it beats both cell0 and cell1 as the
  // nearest destination candidate once it's included — proving ensureGarrisonMarchOrder actually
  // offers it up instead of stopping dead at cell0 (its own border) forever.
  function makeEnclavePack(): PackedGraph {
    return {
      cells: {
        i: [0, 1, 2],
        h: [50, 50, 50],
        c: [[1, 2], [0], [0]],
        state: [1, 1, 2],
        province: [0, 0, 0],
        f: [10, 10, 10],
        burg: [0, 0, 3],
        p: [
          [100, 0],
          [0, 0],
          [50, 1]
        ]
      },
      burgs: [
        { i: 0, cell: -1, removed: true },
        { i: 3, cell: 2, x: 50, y: 1, state: 2, population: 10, stateHistory: [1, 2] }
      ],
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
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
      ]
    } as unknown as PackedGraph;
  }

  it("routes a garrison patrol into a burg it used to own instead of stopping at its own border", () => {
    const pack = makeEnclavePack();
    const garrison = makeGarrison({ cell: 1, x: 0, y: 0, bx: 0, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(true);
    expect(garrison.cell).toBe(2); // the enclave burg's cell, not cell0 (its own border)
  });

  it("does not offer a neighbor's burg that was never this state's own as a destination", () => {
    const pack = makeEnclavePack();
    (pack.burgs[1] as unknown as { stateHistory: number[] }).stateHistory = [2]; // never owned by state 1
    const garrison = makeGarrison({ cell: 1, x: 0, y: 0, bx: 0, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    // Falls back to its own border cell (cell0) since the enclave isn't a legitimate reclaim target.
    expect(garrison.cell).toBe(0);
  });

  it("does not offer a historically-owned enclave far beyond the current frontier (MAX_RECLAIM_DEPTH_MAP_UNITS)", () => {
    const pack = makeEnclavePack();
    // Push the enclave far past the reclaim depth cap from the border anchor (cell0, at [100, 0]).
    // stateHistory still says Alpha (state 1) owned it once, but this deep into Beta's current
    // territory it reads as Beta's legitimate heartland now, not a nearby lost enclave to retake.
    pack.cells.p[2] = [1100, 0];
    (pack.burgs[1] as unknown as { x: number; y: number }).x = 1100;
    const garrison = makeGarrison({ cell: 1, x: 0, y: 0, bx: 0, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    // Falls back to its own border cell (cell0) since the enclave is out of reclaim range.
    expect(garrison.cell).toBe(0);
  });
});

describe("advanceAllRegimentMovement — defense nodes (docs/plan/military-defense.md)", () => {
  // cell1 (state 1's admin seat, garrison start) -- cell3 (state 1's route junction, no burg) --
  // cell2 (state 1's border cell, adjacent to enemy cell4). Three charted road edges meet at
  // cell3 (to cell1, cell2, and cell4), making it a route junction with no settlement — exactly
  // the "burg-less chokepoint" docs/plan/military-defense.md describes. cell3 sits precisely at
  // the pull-toward-the-border point, so it should be chosen over the plain border cell (cell2).
  function makeJunctionPack(): PackedGraph {
    return {
      cells: {
        i: [0, 1, 2, 3, 4],
        h: [0, 50, 50, 50, 50],
        c: [[], [], [4], [], []],
        state: [0, 1, 1, 1, 2],
        province: [0, 0, 0, 0, 0],
        f: [0, 10, 10, 10, 10],
        p: [
          [-1, -1],
          [0, 300],
          [300, 0],
          [150, 150],
          [310, 0]
        ]
      },
      burgs: [0],
      provinces: [],
      routes: [
        {
          i: 0,
          group: "roads",
          feature: 1,
          points: [
            [0, 300, 1],
            [150, 150, 3]
          ]
        },
        {
          i: 1,
          group: "roads",
          feature: 1,
          points: [
            [150, 150, 3],
            [300, 0, 2]
          ]
        },
        {
          i: 2,
          group: "roads",
          feature: 1,
          points: [
            [150, 150, 3],
            [310, 0, 4]
          ]
        }
      ],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Alpha",
          diplomacy: [undefined, "x", "Enemy"],
          campaigns: [],
          military: [] as MilitaryRegiment[]
        },
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
      ]
    } as unknown as PackedGraph;
  }

  it("garrisons a burg-less route junction instead of marching all the way to the plain border cell", () => {
    const pack = makeJunctionPack();
    const garrison = makeGarrison({ cell: 1, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(true);
    expect(garrison.cell).toBe(3); // the junction, not cell2 (the border cell itself)
    expect(garrison.destinationCell).toBeUndefined();
  });
});

describe("advanceAllRegimentMovement — stranded regiment with no local threat", () => {
  it("marches a regiment standing on foreign soil back onto its own land instead of leaving it stranded", () => {
    const pack = makeLandThreatPack();
    // No hostile diplomacy toward state 2 at all — analyzeFrontiers() produces no segment, so
    // there's nothing threat-related to react to.
    (pack.states[1].diplomacy as unknown[]) = [undefined, "x", undefined];
    // Garrison is physically standing on cell4 — state 2's soil, not its own.
    const garrison = makeGarrison({ cell: 4, x: 310, y: 0, bx: 310, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(true);
    expect(garrison.cell).toBe(2); // nearest cell it actually owns, not left stranded on state 2's land
  });
});

describe("advanceAllRegimentMovement — onCellEntered hook", () => {
  it("fires once for every cell newly entered while marching, in order", () => {
    const pack = makeLandThreatPack();
    const garrison = makeGarrison({ cell: 3, x: 0, y: 300, bx: 0, by: 300 });
    pack.states[1].military = [garrison];

    const entered: number[] = [];
    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100, (_r, cell) => entered.push(cell));

    expect(entered).toEqual([2]);
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

// State 1's regiment sits at cell2, directly bordering state2's regiment at cell3 (50 map units
// apart, well within VISUAL_DETECTION_RADIUS). Own burg (state1's only city) is at cell1,
// reachable from cell2 via cells.c — the retreat destination. `enemyDistance` controls how far
// cell3 is placed (used by the detection-radius tests further down).
function makeReactionPack(enemyDistance = 50): PackedGraph {
  return {
    cells: {
      i: [0, 1, 2, 3],
      h: [0, 50, 50, 50],
      c: [[], [2], [1, 3], [2]],
      state: [0, 1, 1, 2],
      province: [0, 0, 0, 0],
      f: [0, 10, 10, 10],
      p: [
        [-1, -1],
        [0, 0],
        [100, 0],
        [100 + enemyDistance, 0]
      ]
    },
    burgs: [
      0,
      { i: 1, cell: 1, x: 0, y: 0, capital: 1, state: 1, population: 1000, culture: 1, port: 0, removed: false }
    ],
    provinces: [],
    routes: [],
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy"], campaigns: [] },
      { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
    ]
  } as unknown as PackedGraph;
}

describe("advanceAllRegimentMovement — reaction layer (docs/plan/military-movement.md §1.4/Phase 3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("breaks off its march to close in on a comfortably weaker nearby enemy", () => {
    const pack = makeReactionPack();
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemy = makeGarrison({ cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 50, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [enemy];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    // Intercepts the enemy's cell instead of holding the (otherwise no-op) frontier position.
    expect(own.cell).toBe(3);
  });

  it("abandons its march to retreat into its own city when badly outmatched", () => {
    const pack = makeReactionPack();
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemy = makeGarrison({ cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 1000, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [enemy];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    expect(own.cell).toBe(1); // the only burg belonging to state 1
  });

  it("holds its ground against a roughly even nearby enemy instead of gambling", () => {
    const pack = makeReactionPack();
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemy = makeGarrison({ cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 100, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [enemy];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    expect(own.destinationCell).toBeUndefined();
    expect(own.cell).toBe(2);
  });

  it("never reacts to a hostile regiment beyond the espionage awareness radius, no matter the roll", () => {
    const pack = makeReactionPack(2000); // well beyond ESPIONAGE_AWARENESS_RADIUS (1500)
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemy = makeGarrison({ cell: 3, x: 2100, y: 0, bx: 2100, by: 0, a: 100000, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [enemy];

    vi.spyOn(Math, "random").mockReturnValue(0); // would always pass the espionage roll if in range

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    expect(own.destinationCell).toBeUndefined();
    expect(own.cell).toBe(2);
  });

  it("retreats from a distant but espionage-detected overwhelming enemy when the roll succeeds", () => {
    const pack = makeReactionPack(800); // beyond VISUAL_DETECTION_RADIUS (400), within ESPIONAGE_AWARENESS_RADIUS (1500)
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemy = makeGarrison({ cell: 3, x: 900, y: 0, bx: 900, by: 0, a: 100000, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [enemy];

    vi.spyOn(Math, "random").mockReturnValue(0.1); // below ESPIONAGE_DETECTION_CHANCE (0.85) — detected

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    expect(own.cell).toBe(1);
  });

  it("misses a distant espionage-detectable enemy when the roll fails", () => {
    const pack = makeReactionPack(800);
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemy = makeGarrison({ cell: 3, x: 900, y: 0, bx: 900, by: 0, a: 100000, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [enemy];

    vi.spyOn(Math, "random").mockReturnValue(0.99); // above ESPIONAGE_DETECTION_CHANCE (0.85) — missed

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    // Not detected, and cell2 doesn't directly border a hostile cell (c[2] only lists 1 and 3,
    // and cell3 is 800 units away, not adjacent in this layout's own-border sense) — no frontier
    // segment forms either, so the regiment holds position entirely.
    expect(own.destinationCell).toBeUndefined();
    expect(own.cell).toBe(2);
  });

  it("does not engage a weak nearby enemy fleet — a land unit can't close melee with a ship", () => {
    const pack = makeReactionPack();
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemyFleet = makeGarrison({ cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 50, state: 2, n: 1, type: "naval" });
    pack.states[1].military = [own];
    pack.states[2].military = [enemyFleet];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    // Weak enough it would have been engaged if it were a land regiment, but engaging is
    // blocked for naval targets, and it's not weak enough to retreat from either — so it holds
    // instead of marching onto the fleet's cell.
    expect(own.cell).toBe(2);
  });

  it("still retreats from an overwhelming enemy fleet, even though it can't engage one", () => {
    const pack = makeReactionPack();
    const own = makeGarrison({ cell: 2, x: 100, y: 0, bx: 100, by: 0, a: 100, state: 1 });
    const enemyFleet = makeGarrison({ cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 1000, state: 2, n: 1, type: "naval" });
    pack.states[1].military = [own];
    pack.states[2].military = [enemyFleet];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 100);

    expect(own.cell).toBe(1); // the only burg belonging to state 1
  });
});

// State 1's regiment at cell2 faces two separate hostile forces belonging to state 2: a nearby
// one at cell3 (visual range) and a distant one at cell4, ~500 map units away in a different
// direction (well past SECOND_THREAT_SEPARATION from the first) — a genuine two-front situation
// a single march order can't address. cell4 is directly cells.c-adjacent to cell2 so the off-road
// BFS fallback can always find a detachment a path there.
function makeTwoThreatPack(): PackedGraph {
  return {
    cells: {
      i: [0, 1, 2, 3, 4],
      h: [0, 50, 50, 50, 50],
      c: [[], [2], [1, 3, 4], [2], [2]],
      state: [0, 1, 1, 2, 2],
      province: [0, 0, 0, 0, 0],
      f: [0, 10, 10, 10, 10],
      p: [
        [-1, -1],
        [0, 0],
        [100, 0],
        [150, 0],
        [100, 500]
      ]
    },
    burgs: [
      0,
      { i: 1, cell: 1, x: 0, y: 0, capital: 1, state: 1, population: 1000, culture: 1, port: 0, removed: false }
    ],
    provinces: [],
    routes: [],
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy"], campaigns: [] },
      { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
    ]
  } as unknown as PackedGraph;
}

describe("advanceAllRegimentMovement — dynamic hierarchy split/merge (docs/plan/military-movement.md §1.3/Phase 4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useOptionsState.getState().setOption("militaryHierarchy", "simple");
  });

  it("peels off a ~150-troop detachment to respond to a second, distinct hostile force", () => {
    useOptionsState.getState().setOption("militaryHierarchy", "dynamic");
    vi.spyOn(Math, "random").mockReturnValue(0); // guarantees the espionage roll on the distant second enemy succeeds

    const pack = makeTwoThreatPack();
    const own = makeGarrison({
      i: 0,
      cell: 2,
      x: 100,
      y: 0,
      bx: 100,
      by: 0,
      a: 1000,
      t: 1000,
      u: { infantry: 1000 },
      state: 1
    });
    const primary = makeGarrison({ i: 0, cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 1000, state: 2 });
    const secondary = makeGarrison({ i: 1, cell: 4, x: 100, y: 500, bx: 100, by: 500, a: 500, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [primary, secondary];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 1);

    const military = pack.states[1].military!;
    expect(military.length).toBe(2);
    const detachment = military.find(r => r.parentId !== undefined);
    expect(detachment).toBeDefined();
    expect(detachment!.parentId).toBe(own.i);
    expect(detachment!.a).toBeGreaterThanOrEqual(150);
    expect(own.a).toBe(1000 - detachment!.a);
    // A full year's marching budget is far more than the ~500 unit hop to cell4, so the
    // detachment already arrives and clears its own march order this same tick.
    expect(detachment!.cell).toBe(4);
    expect(detachment!.destinationCell).toBeUndefined();
  });

  it("does not split when the abstraction toggle is left at the simple (default) setting", () => {
    // militaryHierarchy defaults to "simple" — no need to set it explicitly.
    vi.spyOn(Math, "random").mockReturnValue(0);

    const pack = makeTwoThreatPack();
    const own = makeGarrison({
      i: 0,
      cell: 2,
      x: 100,
      y: 0,
      bx: 100,
      by: 0,
      a: 1000,
      t: 1000,
      u: { infantry: 1000 },
      state: 1
    });
    const primary = makeGarrison({ i: 0, cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 1000, state: 2 });
    const secondary = makeGarrison({ i: 1, cell: 4, x: 100, y: 500, bx: 100, by: 500, a: 500, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [primary, secondary];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 1);

    expect(pack.states[1].military!.length).toBe(1);
  });

  it("does not split when the army can't spare a detachment without gutting itself", () => {
    useOptionsState.getState().setOption("militaryHierarchy", "dynamic");
    vi.spyOn(Math, "random").mockReturnValue(0);

    const pack = makeTwoThreatPack();
    const own = makeGarrison({
      i: 0,
      cell: 2,
      x: 100,
      y: 0,
      bx: 100,
      by: 0,
      a: 200,
      t: 200,
      u: { infantry: 200 },
      state: 1
    });
    const primary = makeGarrison({ i: 0, cell: 3, x: 150, y: 0, bx: 150, by: 0, a: 200, state: 2 });
    const secondary = makeGarrison({ i: 1, cell: 4, x: 100, y: 500, bx: 100, by: 500, a: 200, state: 2 });
    pack.states[1].military = [own];
    pack.states[2].military = [primary, secondary];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 1);

    expect(pack.states[1].military!.length).toBe(1);
  });

  it("merges a detachment back into its parent once it closes back within range", () => {
    useOptionsState.getState().setOption("militaryHierarchy", "dynamic");

    const pack = makeTwoThreatPack();
    pack.states[2].military = []; // no hostiles this tick — nothing for either regiment to react to

    const parent = makeGarrison({
      i: 0,
      cell: 2,
      x: 100,
      y: 0,
      bx: 100,
      by: 0,
      a: 750,
      t: 750,
      u: { infantry: 750 },
      state: 1
    });
    const detachment = makeGarrison({
      i: 1,
      cell: 2,
      x: 110,
      y: 0,
      bx: 110,
      by: 0,
      a: 250,
      t: 250,
      u: { infantry: 250 },
      state: 1,
      parentId: 0
    });
    pack.states[1].military = [parent, detachment];

    const worldContext = makeWorldContext();
    advanceAllRegimentMovement(pack, worldContext, 1);

    expect(pack.states[1].military!.length).toBe(1);
    expect(pack.states[1].military![0].a).toBe(1000);
    expect(pack.states[1].military![0].u.infantry).toBe(1000);
  });
});

describe("isOccupiedHomeBurg", () => {
  // cell0 (state 1, the burg's only neighbor) -- cell1 (state 2's burg, fully enclosed by state
  // 1's own land). cell2 (state 2) is an extra, initially-disconnected neighbor some tests attach
  // to the burg to make it no longer fully enclosed.
  function makePack(): PackedGraph {
    return {
      cells: {
        i: [0, 1, 2],
        h: [50, 50, 50],
        c: [[1], [0], []],
        state: [1, 2, 2],
        f: [10, 10, 10],
        p: [
          [100, 0],
          [110, 0],
          [120, 0]
        ]
      },
      burgs: [0]
    } as unknown as PackedGraph;
  }

  it("is true for a historically-own burg whose every land neighbor is now own territory", () => {
    const pack = makePack();
    const burg = { i: 1, cell: 1, x: 110, y: 0, state: 2, population: 100, stateHistory: [1, 2] };
    expect(isOccupiedHomeBurg(pack, burg, 1)).toBe(true);
  });

  it("is false when the burg was never this state's own (stateHistory doesn't include it)", () => {
    const pack = makePack();
    const burg = { i: 1, cell: 1, x: 110, y: 0, state: 2, population: 100, stateHistory: [2] };
    expect(isOccupiedHomeBurg(pack, burg, 1)).toBe(false);
  });

  it("is false when at least one land neighbor is still enemy territory (a genuinely contested border town)", () => {
    const pack = makePack();
    // Add a second neighbor (cell2, state 2) to the burg — no longer fully enclosed by state 1.
    (pack.cells.c as unknown as number[][])[1] = [0, 2];
    const burg = { i: 1, cell: 1, x: 110, y: 0, state: 2, population: 100, stateHistory: [1, 2] };
    expect(isOccupiedHomeBurg(pack, burg, 1)).toBe(false);
  });

  it("is false when the burg is already owned by ownState again", () => {
    const pack = makePack();
    const burg = { i: 1, cell: 1, x: 110, y: 0, state: 1, population: 100, stateHistory: [1, 2, 1] };
    expect(isOccupiedHomeBurg(pack, burg, 1)).toBe(false);
  });
});

describe("advanceAllRegimentMovement — domestic recapture assignment (docs/plan/military-defense.md)", () => {
  // cell1 (state 1's interior hub) -- cell5 (state 1's ring cell) -- cell3 (state 2's occupied
  // home burg, fully enclosed by state 1's land — used to be state 1's per stateHistory).
  // cell1 -- cell2 (state 1's real border cell) -- cell4 (state 2's actual, never-owned territory)
  // is the genuine front, far away. A regiment starting at the interior hub is much closer to the
  // domestic pocket (distance 110) than to the real front (distance 5000), so it should be sent to
  // retake the pocket instead of garrisoning the border.
  function makeHomeRecapturePack(): PackedGraph {
    return {
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        h: [0, 50, 50, 50, 50, 50],
        c: [[], [5, 2], [1, 4], [5], [2], [1, 3]],
        state: [0, 1, 1, 2, 2, 1],
        province: [0, 0, 0, 0, 0, 0],
        f: [0, 10, 10, 10, 10, 10],
        p: [
          [-1, -1],
          [0, 0],
          [5000, 0],
          [110, 0],
          [5010, 0],
          [100, 0]
        ]
      },
      burgs: [0, { i: 1, cell: 3, x: 110, y: 0, state: 2, population: 100, stateHistory: [1, 2], removed: false }],
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
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
      ]
    } as unknown as PackedGraph;
  }

  it("sends an interior regiment to retake a domestic pocket instead of garrisoning the (much farther) front", () => {
    const pack = makeHomeRecapturePack();
    const garrison = makeGarrison({ cell: 1, x: 0, y: 0, bx: 0, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(true);
    expect(garrison.cell).toBe(3); // the occupied home burg, not the border
    expect(garrison.destinationCell).toBeUndefined();
  });

  it("does not divert a regiment that's already at (and needed at) the real front", () => {
    const pack = makeHomeRecapturePack();
    const garrison = makeGarrison({ cell: 2, x: 5000, y: 0, bx: 5000, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const moved = advanceAllRegimentMovement(pack, worldContext, 100);

    expect(moved).toBe(false);
    expect(garrison.cell).toBe(2);
    expect(garrison.destinationCell).toBeUndefined();
  });
});

describe("advanceAllRegimentMovement — strategic siege march order (docs/plan/strategy.md)", () => {
  // Reuses makeLandThreatPack's border: state 1 owns cell2, adjacent to hostile state 2's cell4.
  function makeSiegeTargetPack(thirdPartyBurgState?: number): PackedGraph {
    const pack = makeLandThreatPack();
    pack.burgs = [
      0,
      { i: 1, cell: 4, x: 310, y: 0, state: 2, population: 10, removed: false },
      ...(thirdPartyBurgState !== undefined
        ? [{ i: 2, cell: 4, x: 310, y: 0, state: thirdPartyBurgState, population: 10, removed: false }]
        : [])
    ] as unknown as PackedGraph["burgs"];
    return pack;
  }

  it("marches a border regiment into a committed siege target belonging to its own frontier neighbor", () => {
    const pack = makeSiegeTargetPack();
    const garrison = makeGarrison({ cell: 2, x: 300, y: 0, bx: 300, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const activeSiegeTargets = new Map([[1, [1]]]); // state 1's committed goal targets burg id 1

    const moved = advanceAllRegimentMovement(pack, worldContext, 100, undefined, activeSiegeTargets);

    expect(moved).toBe(true);
    expect(garrison.cell).toBe(4); // marched onto the enemy burg itself, not just the border
    expect(garrison.destinationCell).toBeUndefined();
  });

  it("does not march toward a siege target belonging to a different neighbor than its own frontier duty", () => {
    // Burg id 2 sits on the same cell but belongs to state 3, a state this regiment has no
    // border with at all — committing to that war isn't this regiment's job.
    const pack = makeSiegeTargetPack(3);
    const garrison = makeGarrison({ cell: 2, x: 300, y: 0, bx: 300, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const activeSiegeTargets = new Map([[1, [2]]]); // targets burg id 2 (state 3's), not id 1

    const moved = advanceAllRegimentMovement(pack, worldContext, 100, undefined, activeSiegeTargets);

    expect(moved).toBe(false);
    expect(garrison.cell).toBe(2);
    expect(garrison.destinationCell).toBeUndefined();
  });

  it("does not march toward its own already-owned burg (goal already achieved)", () => {
    const pack = makeSiegeTargetPack();
    pack.burgs[1].state = 1; // already captured
    const garrison = makeGarrison({ cell: 2, x: 300, y: 0, bx: 300, by: 0 });
    pack.states[1].military = [garrison];

    const worldContext = makeWorldContext();
    const activeSiegeTargets = new Map([[1, [1]]]);

    const moved = advanceAllRegimentMovement(pack, worldContext, 100, undefined, activeSiegeTargets);

    expect(moved).toBe(false);
    expect(garrison.cell).toBe(2);
  });
});

describe("advanceAlongPath seasonal ocean currents", () => {
  // Two cells 100 map units apart, due east of each other (increasing x = east).
  function makeFleetPack(): PackedGraph {
    return {
      cells: {
        p: [
          [0, 0],
          [100, 0]
        ]
      }
    } as unknown as PackedGraph;
  }

  function makeFleet(overrides: Partial<MilitaryRegiment> = {}): MilitaryRegiment {
    return {
      i: 0,
      t: 10,
      a: 10,
      name: "Test Fleet",
      s: 0,
      cell: 0,
      x: 0,
      y: 0,
      bx: 0,
      by: 0,
      u: { naval: 10 },
      n: 5,
      type: "naval",
      state: 1,
      path: [0, 1],
      pathIndex: 0,
      edgeProgress: 0,
      ...overrides
    } as unknown as MilitaryRegiment;
  }

  it("covers more eastward distance in a current-favorable month than an unfavorable one, for the same budget", () => {
    const budget = 50; // half the 100-unit edge, if unaffected by current

    const favorable = makeFleet();
    advanceAlongPath(makeFleetPack(), favorable, budget, undefined, 7); // July -> current favors east

    const unfavorable = makeFleet();
    advanceAlongPath(makeFleetPack(), unfavorable, budget, undefined, 1); // January -> current favors west

    expect(favorable.x).toBeGreaterThan(unfavorable.x);
  });

  it("does not affect land regiments (n=0) regardless of month", () => {
    const budget = 50;

    const july = makeFleet({ n: 0 });
    advanceAlongPath(makeFleetPack(), july, budget, undefined, 7);

    const january = makeFleet({ n: 0 });
    advanceAlongPath(makeFleetPack(), january, budget, undefined, 1);

    expect(july.x).toBe(january.x);
  });

  it("does not apply a current effect when month is omitted", () => {
    const noMonth = makeFleet();
    advanceAlongPath(makeFleetPack(), noMonth, 50);

    expect(noMonth.x).toBe(50);
  });
});

describe("regiment grade profiles and advanceAlongPath grade cost", () => {
  beforeEach(() => {
    try {
      localStorage.setItem("fmg-grade-effect-strength", "1");
    } catch {
      /* vitest may not have localStorage */
    }
  });

  afterEach(() => {
    try {
      localStorage.removeItem("fmg-grade-effect-strength");
    } catch {
      /* ignore */
    }
  });

  it("uses mounted sensitivity for type=mounted and infantry otherwise", () => {
    const foot = regimentGradeSensitivity(makeGarrison({ type: "melee" }));
    const horse = regimentGradeSensitivity(makeGarrison({ type: "mounted" }));
    expect(horse.criticalGrade).toBeLessThan(foot.criticalGrade);
    expect(foot.minMultiplier).toBeGreaterThan(horse.minMultiplier);
  });

  it("slows land advance on a steep climb when worldContext is provided", () => {
    // 10 map-unit edge, +1500 m (exp=1) → hard grade; flat same edge for comparison.
    const steepPack = {
      cells: {
        p: [
          [0, 0],
          [10, 0]
        ],
        h: [20, 20 + 1500]
      }
    } as unknown as PackedGraph;
    const flatPack = {
      cells: {
        p: [
          [0, 0],
          [10, 0]
        ],
        h: [20, 20]
      }
    } as unknown as PackedGraph;

    const world = makeWorldContext();
    world.distanceScale = 1;

    const steep = makeGarrison({
      cell: 0,
      x: 0,
      y: 0,
      path: [0, 1],
      pathIndex: 0,
      edgeProgress: 0,
      type: "melee"
    });
    const flat = makeGarrison({
      cell: 0,
      x: 0,
      y: 0,
      path: [0, 1],
      pathIndex: 0,
      edgeProgress: 0,
      type: "melee"
    });

    const budget = 5; // half the planar edge if costMultiplier=1
    advanceAlongPath(steepPack, steep, budget, undefined, undefined, world);
    advanceAlongPath(flatPack, flat, budget, undefined, undefined, world);

    // Flat regiment covers more planar distance for the same budget.
    expect(flat.x).toBeGreaterThan(steep.x);
  });

  it("ignores grade when fmg-grade-effect-strength is 0", () => {
    try {
      localStorage.setItem("fmg-grade-effect-strength", "0");
    } catch {
      /* ignore */
    }
    expect(getMilitaryGradeEffectStrength()).toBe(0);

    const pack = {
      cells: {
        p: [
          [0, 0],
          [10, 0]
        ],
        h: [20, 20 + 1500]
      }
    } as unknown as PackedGraph;
    const world = makeWorldContext();
    const r = makeGarrison({
      cell: 0,
      x: 0,
      y: 0,
      path: [0, 1],
      pathIndex: 0,
      edgeProgress: 0
    });
    advanceAlongPath(pack, r, 5, undefined, undefined, world);
    // Planar-only: budget 5 of 10 units → x=5
    expect(r.x).toBeCloseTo(5, 5);
  });
});
