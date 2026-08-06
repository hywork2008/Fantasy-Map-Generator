import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { getCoastalHabitatCode } from "../data/coastalHabitatCatalog";
import type { Grid } from "../types/Grid";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { Burgs } from "./burgs-generator";
import type { FrontierSegment } from "./frontierAnalysis";

// ---------------------------------------------------------------------------
// Minimal pack geometry used across all scenarios
// ---------------------------------------------------------------------------
//
// Cell layout (index = cell id):
//   0 – dummy land cell
//   1 – land cell, burg 1 lives here; voronoi-adjacent to lake cell 4
//   2 – land cell, burg 2 lives here; voronoi-adjacent to lake cell 4
//   3 – unused
//   4 – lake water cell (belongs to whichever lake feature the test sets up)
//   5 – ocean water cell (feature 2 – ocean)
//
// Vertices shared between land and lake cells (required by getCloseToEdgePoint):
//   v0, v1  →  shared by cell 1 and cell 4
//   v2, v3  →  shared by cell 2 and cell 4
//
// River 10 is the outlet river that flows [cell 4 → cell 5] (lake → ocean)
// and is used in the "open lake draining to ocean" scenario.

const BASE_CELLS = {
  // Land cells 1 & 2 sit at sea-level (h=20 -> ~3.5m, Elevation "ideal" tier) so the
  // Elevation Unsuitable gate (docs/plan/harbor-siting.md §3.1) never excludes them here —
  // that gate is exercised by dedicated tests below. Water cells stay h<20.
  h: [0, 20, 20, 0, 19, 19],
  haven: [0, 4, 4, 0, 0, 0], // cells 1 & 2 look onto lake cell 4
  harbor: [0, 1, 1, 0, 0, 0], // safe harbour on both land cells
  f: [0, 0, 0, 0, 1, 2], // cell 4 → feature 1 (lake); cell 5 → feature 2 (ocean)
  g: [0, 0, 0, 0, 0, 0], // grid-cell index for temperature lookup
  r: [0, 0, 0, 0, 0, 0], // no rivers on land cells
  fl: [0, 0, 0, 0, 0, 0], // no flux
  p: [
    [0, 0],
    [0, 5],
    [10, 5],
    [0, 0],
    [5, 5],
    [20, 5]
  ] as [number, number][],
  v: [[], [0, 1], [2, 3], [], [], []] // cell 1 → vertices 0,1; cell 2 → vertices 2,3
};

const BASE_VERTICES = {
  // c[v] = cells that share vertex v
  c: [
    [1, 4],
    [1, 4],
    [2, 4],
    [2, 4]
  ],
  // p[v] = [x, y] of vertex v
  p: [
    [5, 0],
    [5, 10],
    [15, 0],
    [15, 10]
  ] as [number, number][]
};

function makeBurgs() {
  return [
    0 as any, // index 0 is the dummy placeholder
    { i: 1, cell: 1, x: 0, y: 5, capital: 0 },
    { i: 2, cell: 2, x: 10, y: 5, capital: 0 }
  ];
}

// ---------------------------------------------------------------------------

describe("BurgsModule.shift — open-lake port promotion", () => {
  beforeEach(() => {
    worldContext.grid = { cells: { temp: new Array(10).fill(20) } } as unknown as Grid;
  });

  // -------------------------------------------------------------------------
  it("gives lake-shore burgs burg.port = oceanFeatureId when a substantial lake drains to the sea", () => {
    // Feature 1 = open lake (outlet → river 10); feature 2 = ocean.
    // River 10: lake cell 4 → ocean cell 5.
    worldContext.pack = {
      burgs: makeBurgs(),
      cells: { ...BASE_CELLS, i: new Uint16Array(4000) },
      features: [null, { i: 1, type: "lake", cells: 12, outlet: 10 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: [{ i: 10, cells: [4, 5] }]
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(2); // ocean feature id
    expect(burgs[2].port).toBe(2);
  });

  // -------------------------------------------------------------------------
  it("keeps burg.port = lakeFeatureId for burgs on a closed lake (no outlet)", () => {
    // Feature 1 = closed lake (no outlet property).
    worldContext.pack = {
      burgs: makeBurgs(),
      cells: { ...BASE_CELLS },
      features: [
        null,
        { i: 1, type: "lake", cells: 12 }, // no outlet
        { i: 2, type: "ocean" }
      ],
      vertices: BASE_VERTICES,
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(1); // lake feature id
    expect(burgs[2].port).toBe(1);
  });

  // -------------------------------------------------------------------------
  it.each(["dry", "frozen", "lava"])("does not make ports on a %s lake (cannot be sailed)", group => {
    worldContext.pack = {
      burgs: makeBurgs(),
      cells: { ...BASE_CELLS },
      features: [null, { i: 1, type: "lake", cells: 3, group }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBeUndefined();
    expect(burgs[2].port).toBeUndefined();
  });

  it("does not turn a small lake shore into formal ports", () => {
    worldContext.pack = {
      burgs: makeBurgs(),
      cells: { ...BASE_CELLS, i: new Uint16Array(4000) },
      features: [null, { i: 1, type: "lake", cells: 11 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    expect(worldContext.pack.burgs[1].port).toBeUndefined();
    expect(worldContext.pack.burgs[2].port).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  it("keeps burg.port = lakeFeatureId when the outlet river exits the map", () => {
    // River 10's last cell is -1 (off-map), so resolveLakeDrainFeature returns null.
    worldContext.pack = {
      burgs: makeBurgs(),
      cells: { ...BASE_CELLS },
      features: [null, { i: 1, type: "lake", cells: 12, outlet: 10 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: [{ i: 10, cells: [4, -1] }] // -1 = exits map
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(1); // stays on lake, not promoted to ocean
    expect(burgs[2].port).toBe(1);
  });

  it("does not connect a lake port to the sea through an unnavigable outlet", () => {
    const cells = {
      ...BASE_CELLS,
      f: [0, 0, 0, 0, 1, 0, 2],
      r: [0, 0, 0, 0, 0, 10, 0],
      fl: [0, 0, 0, 0, 0, 99, 0],
      p: [
        [0, 0],
        [0, 5],
        [10, 5],
        [0, 0],
        [5, 5],
        [15, 5],
        [20, 5]
      ] as [number, number][],
      v: [[], [0, 1], [2, 3], [], [], [], []]
    };
    worldContext.pack = {
      burgs: makeBurgs(),
      cells,
      features: [null, { i: 1, type: "lake", cells: 12, outlet: 10 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: [{ i: 10, cells: [4, 5, 6] }]
    } as unknown as PackedGraph;

    Burgs.shift();

    expect(worldContext.pack.burgs[1].port).toBe(1);
    expect(worldContext.pack.burgs[2].port).toBe(1);
  });

  // -------------------------------------------------------------------------
  it("promotes lake-shore burgs to a downstream closed lake when the chain ends there", () => {
    // Feature 1 = open lake (outlet → river 10).
    // River 10 ends in cell 6 which belongs to feature 3 = closed lake.
    const cells = {
      ...BASE_CELLS,
      f: [0, 0, 0, 0, 1, 2, 3], // cell 6 → feature 3 (closed downstream lake)
      haven: [0, 4, 4, 0, 0, 0, 0],
      harbor: [0, 1, 1, 0, 0, 0, 0],
      g: [0, 0, 0, 0, 0, 0, 0],
      r: [0, 0, 0, 0, 0, 0, 0],
      fl: [0, 0, 0, 0, 0, 0, 0],
      p: [
        [0, 0],
        [0, 5],
        [10, 5],
        [0, 0],
        [5, 5],
        [20, 5],
        [30, 5]
      ] as [number, number][],
      v: [[], [0, 1], [2, 3], [], [], [], []]
    };

    worldContext.pack = {
      burgs: makeBurgs(),
      cells,
      features: [
        null,
        { i: 1, type: "lake", cells: 12, outlet: 10 }, // open lake
        { i: 2, type: "ocean" },
        { i: 3, type: "lake", cells: 2 } // closed downstream lake
      ],
      vertices: BASE_VERTICES,
      rivers: [{ i: 10, cells: [4, 6] }] // drains into closed lake cell 6
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(3); // closed-lake feature id
    expect(burgs[2].port).toBe(3);
  });

  // -------------------------------------------------------------------------
  it("does not assign a port when fewer than 2 candidates share a feature", () => {
    // Only burg 1 qualifies (burg 2 has no harbour).
    const cells = {
      ...BASE_CELLS,
      harbor: [0, 1, 0, 0, 0, 0] // only cell 1 has a safe harbour
    };

    worldContext.pack = {
      burgs: makeBurgs(),
      cells,
      features: [null, { i: 1, type: "lake", cells: 12, outlet: 10 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: [{ i: 10, cells: [4, 5] }]
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBeUndefined(); // single candidate → no port
    expect(burgs[2].port).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  it("does not alter locked burgs", () => {
    worldContext.pack = {
      burgs: [
        0 as any,
        { i: 1, cell: 1, x: 0, y: 5, capital: 0, lock: true, port: 99 },
        { i: 2, cell: 2, x: 10, y: 5, capital: 0 }
      ],
      cells: { ...BASE_CELLS },
      features: [null, { i: 1, type: "lake", cells: 12, outlet: 10 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: [{ i: 10, cells: [4, 5] }]
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(99); // locked — unchanged
    expect(burgs[2].port).toBe(2); // the fixed lake port fills the second and final lake slot
  });

  it("limits a navigable lake to two formal ports", () => {
    worldContext.pack = {
      burgs: [
        0 as unknown as Burg,
        { i: 1, cell: 1, x: 0, y: 5, capital: 0 },
        { i: 2, cell: 2, x: 10, y: 5, capital: 0 },
        { i: 3, cell: 3, x: 20, y: 5, capital: 0 }
      ],
      cells: {
        i: new Uint16Array(4000),
        h: [0, 20, 20, 20, 19], // land cells 1-3 at sea-level (Elevation "ideal"); cell 4 is lake water
        haven: [0, 4, 4, 4, 0],
        harbor: [0, 1, 1, 1, 0],
        f: [0, 0, 0, 0, 1],
        g: [0, 0, 0, 0, 0],
        r: [0, 0, 0, 0, 0],
        fl: [0, 0, 0, 0, 0],
        p: [
          [0, 0],
          [0, 5],
          [10, 5],
          [20, 5],
          [10, 10]
        ] as [number, number][],
        v: [[], [0, 1], [2, 3], [4, 5], []]
      },
      features: [null, { i: 1, type: "lake", cells: 12 }],
      vertices: {
        c: [
          [1, 4],
          [1, 4],
          [2, 4],
          [2, 4],
          [3, 4],
          [3, 4]
        ],
        p: [
          [5, 0],
          [5, 10],
          [10, 0],
          [10, 10],
          [15, 0],
          [15, 10]
        ] as [number, number][]
      },
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const ports = worldContext.pack.burgs.filter(burg => burg.i && burg.port);
    const nonPort = worldContext.pack.burgs.find(burg => burg.i && !burg.port);
    expect(ports).toHaveLength(2);
    expect(nonPort).toBeDefined();
    if (!nonPort) throw new Error("A third lake-shore burg is required for this cap test");
    expect(Burgs.developPort(nonPort)).toBe(false);
  });

  it("reserves representative ports for States on a large lake", () => {
    worldContext.pack = {
      burgs: [
        0 as unknown as Burg,
        { i: 1, cell: 1, x: 0, y: 5, capital: 0, state: 1 },
        { i: 2, cell: 2, x: 10, y: 5, capital: 0, state: 1 },
        { i: 3, cell: 3, x: 20, y: 5, capital: 0, state: 2 },
        { i: 4, cell: 4, x: 30, y: 5, capital: 0, state: 3 }
      ],
      cells: {
        i: new Uint16Array(4000),
        h: [0, 20, 20, 20, 20, 19], // land cells 1-4 at sea-level (Elevation "ideal"); cell 5 is lake water
        haven: [0, 5, 5, 5, 5, 0],
        harbor: [0, 1, 1, 1, 1, 0],
        f: [0, 0, 0, 0, 0, 1],
        g: [0, 0, 0, 0, 0, 0],
        r: [0, 0, 0, 0, 0, 0],
        fl: [0, 0, 0, 0, 0, 0],
        p: [
          [0, 0],
          [0, 5],
          [10, 5],
          [20, 5],
          [30, 5],
          [15, 10]
        ] as [number, number][],
        v: [[], [0, 1], [2, 3], [4, 5], [6, 7], []]
      },
      features: [null, { i: 1, type: "lake", cells: 24, area: 100 }],
      vertices: {
        c: [
          [1, 5],
          [1, 5],
          [2, 5],
          [2, 5],
          [3, 5],
          [3, 5],
          [4, 5],
          [4, 5]
        ],
        p: [
          [5, 0],
          [5, 10],
          [10, 0],
          [10, 10],
          [20, 0],
          [20, 10],
          [25, 0],
          [25, 10]
        ] as [number, number][]
      },
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const portStates = worldContext.pack.burgs.filter(burg => burg.i && burg.port).map(burg => burg.state);
    expect(portStates).toEqual([1, 2, 3]);
  });

  it("does not promote a formal port on a sandy coast", () => {
    const cells = {
      ...BASE_CELLS,
      coastalHabitat: [0, getCoastalHabitatCode("sandyBeach"), getCoastalHabitatCode("sandyBeach"), 0, 0, 0]
    };
    worldContext.pack = {
      burgs: makeBurgs(),
      cells,
      features: [null, { i: 1, type: "lake", cells: 12 }, { i: 2, type: "ocean" }],
      vertices: BASE_VERTICES,
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    expect(worldContext.pack.burgs[1].port).toBeUndefined();
    expect(worldContext.pack.burgs[2].port).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Two islands share ocean feature 2. Island A's burg has a safe harbour;
  // island B's burg only has an exposed coast (harbor = 2, not a capital).
  // Both must become ports so neither island is cut off from sea trade.
  it("promotes an exposed coastal burg so its island is not left portless", () => {
    worldContext.pack = {
      burgs: [0 as any, { i: 1, cell: 1, x: 5, y: 5, capital: 0 }, { i: 2, cell: 2, x: 15, y: 5, capital: 0 }],
      cells: {
        h: [0, 20, 20, 19], // land cells 1-2 at sea-level (Elevation "ideal"); cell 3 is ocean water
        haven: [0, 3, 3, 0],
        harbor: [0, 1, 2, 0], // burg 1 safe harbour, burg 2 exposed coast
        f: [0, 10, 11, 2], // burg 1 → island 10, burg 2 → island 11, cell 3 → ocean 2
        g: [0, 0, 0, 0],
        r: [0, 0, 0, 0],
        fl: [0, 0, 0, 0],
        p: [
          [0, 0],
          [5, 5],
          [15, 5],
          [10, 5]
        ] as [number, number][],
        v: [[], [0, 1], [2, 3], []]
      },
      features: [null, null, { i: 2, type: "ocean", cells: 5 }],
      vertices: {
        c: [
          [1, 3],
          [1, 3],
          [2, 3],
          [2, 3]
        ],
        p: [
          [5, 0],
          [5, 10],
          [15, 0],
          [15, 10]
        ] as [number, number][]
      },
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(2); // safe-harbour island
    expect(burgs[2].port).toBe(2); // exposed-coast island — now reachable
  });

  // -------------------------------------------------------------------------
  // A single island borders its own sea with two exposed coastal burgs and no
  // safe harbour. Both should become ports so an internal sea route can form.
  it("gives a lone island two ports when it has no safe harbour", () => {
    worldContext.pack = {
      burgs: [0 as any, { i: 1, cell: 1, x: 5, y: 5, capital: 0 }, { i: 2, cell: 2, x: 15, y: 5, capital: 0 }],
      cells: {
        h: [0, 20, 20, 19], // land cells 1-2 at sea-level (Elevation "ideal"); cell 3 is ocean water
        haven: [0, 3, 3, 0],
        harbor: [0, 2, 2, 0], // both exposed, neither a safe harbour
        f: [0, 10, 10, 2], // both burgs on island 10; cell 3 → ocean 2
        g: [0, 0, 0, 0],
        r: [0, 0, 0, 0],
        fl: [0, 0, 0, 0],
        p: [
          [0, 0],
          [5, 5],
          [15, 5],
          [10, 5]
        ] as [number, number][],
        v: [[], [0, 1], [2, 3], []]
      },
      features: [null, null, { i: 2, type: "ocean", cells: 5 }],
      vertices: {
        c: [
          [1, 3],
          [1, 3],
          [2, 3],
          [2, 3]
        ],
        p: [
          [5, 0],
          [5, 10],
          [15, 0],
          [15, 10]
        ] as [number, number][]
      },
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBe(2);
    expect(burgs[2].port).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Three burgs share one ocean coast; burg 1's cell sits at h=31 (~101m, Elevation
  // Unsuitable — docs/plan/harbor-siting.md §3.1). It must be excluded from port
  // promotion even though it otherwise qualifies (safe harbour, warm, no bad substrate) —
  // the other two, at sea level, still form the required pair of port endpoints.
  it("excludes a formal port when the burg cell's elevation is Unsuitable (>100m)", () => {
    worldContext.pack = {
      burgs: [
        0 as any,
        { i: 1, cell: 1, x: 0, y: 5, capital: 0 },
        { i: 2, cell: 2, x: 10, y: 5, capital: 0 },
        { i: 3, cell: 3, x: 20, y: 5, capital: 0 }
      ],
      cells: {
        h: [0, 31, 20, 20, 19], // burg 1 unsuitable (~101m); burgs 2 & 3 ideal (sea level)
        haven: [0, 4, 4, 4, 0],
        harbor: [0, 1, 1, 1, 0], // all "safe harbour" (harbor === 1) — otherwise unconditionally preferred
        f: [0, 0, 0, 0, 2], // land cells share landmass 0; cell 4 → ocean feature 2
        g: [0, 0, 0, 0, 0],
        r: [0, 0, 0, 0, 0],
        fl: [0, 0, 0, 0, 0],
        p: [
          [0, 0],
          [0, 5],
          [10, 5],
          [20, 5],
          [10, 10]
        ] as [number, number][],
        v: [[], [0, 1], [2, 3], [4, 5], []]
      },
      features: [null, null, { i: 2, type: "ocean", cells: 5 }],
      vertices: {
        c: [
          [1, 4],
          [1, 4],
          [2, 4],
          [2, 4],
          [3, 4],
          [3, 4]
        ],
        p: [
          [5, 0],
          [5, 10],
          [10, 0],
          [10, 10],
          [15, 0],
          [15, 10]
        ] as [number, number][]
      },
      rivers: []
    } as unknown as PackedGraph;

    Burgs.shift();

    const { burgs } = worldContext.pack;
    expect(burgs[1].port).toBeUndefined(); // Elevation Unsuitable — gate excludes it
    expect(burgs[2].port).toBe(2);
    expect(burgs[3].port).toBe(2);
  });
});

describe("BurgsModule.shift — river-bank shift", () => {
  beforeEach(() => {
    worldContext.grid = { cells: { temp: new Array(10).fill(20) } } as unknown as Grid;
  });

  it("shifts a non-port river burg perpendicular to the local river course", () => {
    // River 10 runs diagonally [1 → 2 → 3] along (1,1); burg sits on the middle cell.
    // The river stays on land (no drain feature) so the burg never becomes a port.
    worldContext.pack = {
      burgs: [0 as any, { i: 1, cell: 2, x: 10, y: 10, capital: 0 }],
      cells: {
        h: [20, 25, 25, 25],
        r: [0, 10, 10, 10],
        fl: [0, 300, 300, 300],
        f: [0, 0, 0, 0],
        g: [0, 0, 0, 0],
        haven: [0, 0, 0, 0],
        harbor: [0, 0, 0, 0],
        v: [[], [], [], []],
        p: [
          [0, 0],
          [0, 0],
          [10, 10],
          [20, 20]
        ] as [number, number][]
      },
      features: [null],
      vertices: { c: [], p: [] },
      rivers: [{ i: 10, cells: [1, 2, 3] }]
    } as unknown as PackedGraph;

    Burgs.shift();

    const burg = worldContext.pack.burgs[1];
    const dx = burg.x - 10;
    const dy = burg.y - 10;

    // Displacement is perpendicular to the river tangent (1,1): dot product ≈ 0.
    expect(dx * 1 + dy * 1).toBeCloseTo(0, 6);
    // Displacement magnitude is the shift amount min(fl/200, 0.6) (±2-decimal rounding).
    const expectedShift = Math.min(300 / 200, 0.6);
    expect(Math.hypot(dx, dy)).toBeCloseTo(expectedShift, 1);
    // The burg actually moved off the cell center.
    expect(dx === 0 && dy === 0).toBe(false);
  });

  it("falls back to an axis nudge for a single-cell river (no course direction)", () => {
    worldContext.pack = {
      burgs: [0 as any, { i: 1, cell: 1, x: 5, y: 5, capital: 0 }],
      cells: {
        h: [20, 25],
        r: [0, 10],
        fl: [0, 150],
        f: [0, 0],
        g: [0, 0],
        haven: [0, 0],
        harbor: [0, 0],
        v: [[], []],
        p: [
          [0, 0],
          [5, 5]
        ] as [number, number][]
      },
      features: [null],
      vertices: { c: [], p: [] },
      rivers: [{ i: 10, cells: [1] }] // single cell → no tangent
    } as unknown as PackedGraph;

    Burgs.shift();

    const burg = worldContext.pack.burgs[1];
    // Still shifted (axis-aligned fallback), just not crashing on the missing course.
    expect(burg.x === 5 && burg.y === 5).toBe(false);
  });
});

// ---------------------------------------------------------------------------

interface StrategicContext {
  frontiers: Map<number, FrontierSegment[]>;
  contestedBurgs: Set<number>;
  meanS: number;
  maxS: number;
}

const emptyStrategicContext: StrategicContext = {
  frontiers: new Map(),
  contestedBurgs: new Set(),
  meanS: 0,
  maxS: 0
};

const callDefineFeatures = (burg: Burg, context: StrategicContext) => (Burgs as any).defineFeatures(burg, context);

describe("BurgsModule.defineFeatures — strategic citadel bonus", () => {
  beforeEach(() => {
    worldContext.pack = {
      cells: { routes: {}, religion: [0, 0], s: [0, 0] },
      states: [{ i: 0 }, { i: 1, form: "Monarchy" }],
      routes: []
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not grant a citadel when there is no strategic bonus and the base roll fails", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // fails every P() roll, including the base P(0.1)
    const burg = { i: 1, cell: 0, state: 1, capital: 0, population: 10 } as unknown as Burg;

    callDefineFeatures(burg, emptyStrategicContext);

    expect(burg.citadel).toBe(0);
  });

  it("grants a citadel via the frontier bonus for a chronicle-contested burg, even when the base roll fails", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3); // fails base P(0.1) (pop <= 15), passes bonus P(0.5)
    const burg = { i: 1, cell: 0, state: 1, capital: 0, population: 10 } as unknown as Burg;
    const context: StrategicContext = { ...emptyStrategicContext, contestedBurgs: new Set([1]) };

    callDefineFeatures(burg, context);

    expect(burg.citadel).toBe(1);
  });

  it("grants a citadel via the frontier bonus for a burg sitting on a hostile border segment", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const burg = { i: 2, cell: 0, state: 1, capital: 0, population: 10 } as unknown as Burg;
    const segment: FrontierSegment = {
      neighborState: 2,
      relation: "Enemy",
      threatWeight: 1,
      cells: [0],
      cx: 0,
      cy: 0,
      landmass: 1
    };
    const context: StrategicContext = { ...emptyStrategicContext, frontiers: new Map([[1, [segment]]]) };

    callDefineFeatures(burg, context);

    expect(burg.citadel).toBe(1);
  });

  it("grants a citadel via the breadbasket bonus for a high-habitability burg", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    worldContext.pack.cells.s = [100, 0] as unknown as PackedGraph["cells"]["s"]; // this burg's cell has the highest habitability on the map
    const burg = { i: 3, cell: 0, state: 1, capital: 0, population: 10 } as unknown as Burg;
    const context: StrategicContext = { ...emptyStrategicContext, meanS: 20, maxS: 100 };

    callDefineFeatures(burg, context);

    expect(burg.citadel).toBe(1);
  });

  it("ignores a border segment belonging to a different state", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const burg = { i: 4, cell: 0, state: 1, capital: 0, population: 10 } as unknown as Burg;
    const segment: FrontierSegment = {
      neighborState: 3,
      relation: "Enemy",
      threatWeight: 1,
      cells: [0],
      cx: 0,
      cy: 0,
      landmass: 1
    };
    // segment stored under state 2, not this burg's state (1)
    const context: StrategicContext = { ...emptyStrategicContext, frontiers: new Map([[2, [segment]]]) };

    callDefineFeatures(burg, context);

    expect(burg.citadel).toBe(0);
  });
});
