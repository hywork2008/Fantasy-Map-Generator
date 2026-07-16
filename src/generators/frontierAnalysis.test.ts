import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import {
  analyzeFrontiers,
  analyzeSeaFrontiers,
  getChronicleContestedBurgs,
  getProvinceThreats,
  mergeFrontiers,
  normalizeHabitability,
  pickPrimaryFrontier
} from "./frontierAnalysis";
import { buildSeaRouteGraph } from "./seaRouteGraph";

// Two adjacent land cells, each owned by a different state: cell 0 -> state 1, cell 1 -> state 2.
function makePack(overrides: {
  relation?: string;
  campaigns?: { attacker: number; defender: number; start: number; end?: number }[];
}): PackedGraph {
  const { relation = "Enemy", campaigns = [] } = overrides;

  return {
    cells: {
      i: [0, 1],
      h: [50, 50],
      c: [[1], [0]],
      state: [1, 2],
      f: [1, 1], // both cells on the same landmass
      p: [
        [0, 0],
        [10, 0]
      ]
    },
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      // diplomacy is indexed by target state id: index 1 = self, index 2 = relation to the other state
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", relation], campaigns },
      { i: 2, name: "Beta", diplomacy: [undefined, relation, "x"], campaigns: [] }
    ]
  } as unknown as PackedGraph;
}

describe("analyzeFrontiers", () => {
  it("creates a frontier segment for a hostile neighbor", () => {
    const pack = makePack({ relation: "Enemy" });
    const frontiers = analyzeFrontiers(pack, 1000);

    const segments = frontiers.get(1);
    expect(segments).toHaveLength(1);
    expect(segments![0].neighborState).toBe(2);
    expect(segments![0].relation).toBe("Enemy");
    expect(segments![0].cells).toEqual([0]);
    expect(segments![0].threatWeight).toBe(1);
  });

  it("assigns a very low threat weight for non-hostile relations to keep a reserve", () => {
    const pack = makePack({ relation: "Ally" });
    const frontiers = analyzeFrontiers(pack, 1000);
    const seg = frontiers.get(1)![0];
    expect(seg.relation).toBe("Ally");
    expect(seg.threatWeight).toBe(0.02);
  });

  it("boosts threat weight for an active (ongoing) war", () => {
    const pack = makePack({
      relation: "Rival",
      campaigns: [{ attacker: 1, defender: 2, start: 900 }] // no `end` = ongoing
    });
    const frontiers = analyzeFrontiers(pack, 1000);
    expect(frontiers.get(1)![0].threatWeight).toBeCloseTo(0.5 * 2.5, 5);
  });

  it("boosts threat weight for a recently ended war but not an old one", () => {
    const recentPack = makePack({
      relation: "Rival",
      campaigns: [{ attacker: 1, defender: 2, start: 900, end: 990 }] // 10 years ago
    });
    expect(analyzeFrontiers(recentPack, 1000).get(1)![0].threatWeight).toBeCloseTo(0.5 * 2.5, 5);

    const oldPack = makePack({
      relation: "Rival",
      campaigns: [{ attacker: 1, defender: 2, start: 800, end: 850 }] // 150 years ago
    });
    expect(analyzeFrontiers(oldPack, 1000).get(1)![0].threatWeight).toBeCloseTo(0.5, 5);
  });

  it("keeps border segments against the same neighbor separate per landmass", () => {
    // State 1 touches state 2 twice: once on its mainland (cell 0, landmass 1) and once
    // from an exclave across the sea (cell 2, landmass 5) — these must not be merged into
    // a single segment, or a regiment on the exclave could get pulled toward the mainland
    // border centroid straight across open water.
    const pack = {
      cells: {
        i: [0, 1, 2, 3],
        h: [50, 50, 50, 50],
        c: [[1], [0], [3], [2]],
        state: [1, 2, 1, 2],
        f: [1, 1, 5, 5],
        p: [
          [0, 0],
          [10, 0],
          [500, 500],
          [510, 500]
        ]
      },
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy"], campaigns: [] },
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
      ]
    } as unknown as PackedGraph;

    const segments = analyzeFrontiers(pack, 1000).get(1)!;
    expect(segments).toHaveLength(2);

    const mainland = segments.find(s => s.landmass === 1);
    const exclave = segments.find(s => s.landmass === 5);
    expect(mainland?.cells).toEqual([0]);
    expect(exclave?.cells).toEqual([2]);
    expect(mainland?.cx).toBe(0);
    expect(exclave?.cx).toBe(500);
  });

  it("snaps the segment anchor to a real border cell instead of an arbitrary midpoint", () => {
    // Three border cells forming a concave "L" shape: their arithmetic mean (33.3, 33.3)
    // is not any of the three points and could land in water on a real map. The anchor
    // must snap to whichever border cell is actually closest to that mean, here (0, 0).
    const pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        h: [50, 50, 50, 50, 50, 50],
        c: [[1], [0], [3], [2], [5], [4]],
        state: [1, 2, 1, 2, 1, 2],
        f: [1, 1, 1, 1, 1, 1],
        p: [
          [0, 0],
          [10, 0],
          [100, 0],
          [110, 0],
          [0, 100],
          [10, 100]
        ]
      },
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy"], campaigns: [] },
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
      ]
    } as unknown as PackedGraph;

    const segments = analyzeFrontiers(pack, 1000).get(1)!;
    expect(segments).toHaveLength(1);
    expect(segments[0].cells.sort()).toEqual([0, 2, 4]);
    expect(segments[0].cx).toBe(0);
    expect(segments[0].cy).toBe(0);
  });
});

describe("getChronicleContestedBurgs", () => {
  it("collects fromBurg/toBurg across all wars in the chronicle", () => {
    const pack = {
      states: [
        {
          i: 0,
          name: "Neutrals",
          diplomacy: [
            ["The Alpha-Betan War", { id: "w1", from: 1, to: 2, fromBurg: 5, toBurg: 7, action: "x", rawText: "x" }],
            ["The Gamma-Deltan War", { id: "w2", from: 3, to: 4, fromBurg: 9, action: "x", rawText: "x" }]
          ]
        }
      ]
    } as unknown as PackedGraph;

    expect(getChronicleContestedBurgs(pack)).toEqual(new Set([5, 7, 9]));
  });

  it("returns an empty set when there is no chronicle yet", () => {
    const pack = { states: [{ i: 0, name: "Neutrals" }] } as unknown as PackedGraph;
    expect(getChronicleContestedBurgs(pack)).toEqual(new Set());
  });
});

describe("pickPrimaryFrontier", () => {
  it("prefers the closer segment when weights are equal", () => {
    const near = { neighborState: 2, relation: "Enemy", threatWeight: 1, cells: [], cx: 10, cy: 0, landmass: 1 };
    const far = { neighborState: 3, relation: "Enemy", threatWeight: 1, cells: [], cx: 5000, cy: 0, landmass: 1 };
    expect(pickPrimaryFrontier(0, 0, [far, near])).toBe(near);
  });

  it("prefers the higher-weight segment when it outweighs distance", () => {
    const nearWeak = {
      neighborState: 2,
      relation: "Suspicion",
      threatWeight: 0.1,
      cells: [],
      cx: 10,
      cy: 0,
      landmass: 1
    };
    const farStrong = { neighborState: 3, relation: "Enemy", threatWeight: 5, cells: [], cx: 200, cy: 0, landmass: 1 };
    expect(pickPrimaryFrontier(0, 0, [nearWeak, farStrong])).toBe(farStrong);
  });

  it("returns null for an empty segment list", () => {
    expect(pickPrimaryFrontier(0, 0, [])).toBeNull();
  });
});

describe("normalizeHabitability", () => {
  it("clamps to [0, 1] relative to mean/max", () => {
    expect(normalizeHabitability(50, 20, 80)).toBeCloseTo(0.5, 5);
    expect(normalizeHabitability(0, 20, 80)).toBe(0);
    expect(normalizeHabitability(200, 20, 80)).toBe(1);
  });

  it("returns 0 when max does not exceed mean", () => {
    expect(normalizeHabitability(50, 30, 30)).toBe(0);
  });
});

describe("getProvinceThreats", () => {
  const pack = {
    cells: {
      province: [0, 5, 5, 7]
    }
  } as unknown as PackedGraph;

  it("sums threat weight per province and tracks the strongest neighbor", () => {
    const segments = [
      { neighborState: 2, relation: "Enemy", threatWeight: 1, cells: [1, 2], cx: 0, cy: 0, landmass: 1 },
      { neighborState: 3, relation: "Rival", threatWeight: 0.5, cells: [2], cx: 0, cy: 0, landmass: 1 }
    ];

    const threats = getProvinceThreats(pack, segments);

    // province 5 (cells 1, 2) sees both segments: 1 (state 2) + 0.5 (state 3), state 2 dominant
    expect(threats.get(5)).toEqual({ totalWeight: 1.5, primaryNeighbor: 2 });
  });

  it("ignores border cells with no province (province id 0)", () => {
    const segments = [{ neighborState: 2, relation: "Enemy", threatWeight: 1, cells: [0], cx: 0, cy: 0, landmass: 1 }];
    expect(getProvinceThreats(pack, segments).size).toBe(0);
  });

  it("keeps separate provinces separate", () => {
    const segments = [{ neighborState: 2, relation: "Enemy", threatWeight: 1, cells: [3], cx: 0, cy: 0, landmass: 1 }];
    const threats = getProvinceThreats(pack, segments);
    expect(threats.get(7)).toEqual({ totalWeight: 1, primaryNeighbor: 2 });
    expect(threats.has(5)).toBe(false);
  });
});

// Port A (state 1, cell 0, landmass 1) and port B (state 2, cell 2, landmass 5) are linked by
// a searoute through water cell 1. Port C (state 3, cell 3, landmass 9) is hostile to state 1
// too, but no route reaches it at all.
function makeSeaPack(overrides: { relationAB?: string; relationAC?: string } = {}): PackedGraph {
  const { relationAB = "Enemy", relationAC = "Enemy" } = overrides;

  return {
    cells: {
      f: [1, 0, 5, 9],
      p: [
        [0, 0],
        [50, 50],
        [100, 0],
        [200, 200]
      ]
    },
    burgs: [
      { i: 1, cell: 0, state: 1, port: 1 },
      { i: 2, cell: 2, state: 2, port: 1 },
      { i: 3, cell: 3, state: 3, port: 2 }
    ],
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", relationAB, relationAC], campaigns: [] },
      { i: 2, name: "Beta", diplomacy: [undefined, relationAB, "x", undefined], campaigns: [] },
      { i: 3, name: "Gamma", diplomacy: [undefined, relationAC, undefined, "x"], campaigns: [] }
    ],
    routes: [
      {
        i: 0,
        group: "searoutes",
        feature: 1,
        points: [
          [0, 0, 0],
          [50, 50, 1],
          [100, 0, 2]
        ]
      }
    ]
  } as unknown as PackedGraph;
}

describe("analyzeSeaFrontiers", () => {
  it("creates a segment between ports linked by a charted sea route", () => {
    const pack = makeSeaPack();
    const graph = buildSeaRouteGraph(pack);
    const frontiers = analyzeSeaFrontiers(pack, graph, 1000);

    const segments = frontiers.get(1);
    expect(segments).toHaveLength(1);
    expect(segments![0].neighborState).toBe(2);
    expect(segments![0].relation).toBe("Enemy");
    expect(segments![0].threatWeight).toBe(1);
    // landmass is the OWN port's landmass (state 1's, cell 0), not the target's
    expect(segments![0].landmass).toBe(1);
    expect(segments![0].cells).toEqual([0]);
    expect(segments![0].cx).toBe(0);
    expect(segments![0].cy).toBe(0);
  });

  it("is symmetric: the other side gets its own segment anchored at its own port", () => {
    const pack = makeSeaPack();
    const graph = buildSeaRouteGraph(pack);
    const segments = analyzeSeaFrontiers(pack, graph, 1000).get(2);

    expect(segments).toHaveLength(1);
    expect(segments![0].neighborState).toBe(1);
    expect(segments![0].landmass).toBe(5); // state 2's own port landmass
    expect(segments![0].cells).toEqual([2]);
  });

  it("creates no segment for a hostile state whose port has no charted route to it", () => {
    const pack = makeSeaPack();
    const graph = buildSeaRouteGraph(pack);
    const segments = analyzeSeaFrontiers(pack, graph, 1000).get(1);

    // Only the reachable neighbor (state 2) shows up — state 3 is hostile but unreachable by sea.
    expect(segments!.some(s => s.neighborState === 3)).toBe(false);
  });

  it("assigns a low threat weight for non-hostile relations, same as the land version", () => {
    const pack = makeSeaPack({ relationAB: "Ally" });
    const graph = buildSeaRouteGraph(pack);
    const segments = analyzeSeaFrontiers(pack, graph, 1000).get(1);
    expect(segments![0].threatWeight).toBe(0.02);
  });

  it("ignores burgs that aren't ports, are removed, or have no state", () => {
    const pack = {
      cells: {
        f: [1, 0, 5],
        p: [
          [0, 0],
          [50, 50],
          [100, 0]
        ]
      },
      burgs: [
        { i: 1, cell: 0, state: 1, port: 1 },
        { i: 2, cell: 2, state: 2 }, // not a port
        { i: 3, cell: 2, state: 2, port: 1, removed: true }, // removed
        { i: 4, cell: 2, port: 1 } // no state
      ],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy"], campaigns: [] },
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x"], campaigns: [] }
      ],
      routes: [
        {
          i: 0,
          group: "searoutes",
          feature: 1,
          points: [
            [0, 0, 0],
            [100, 0, 2]
          ]
        }
      ]
    } as unknown as PackedGraph;

    const graph = buildSeaRouteGraph(pack);
    expect(analyzeSeaFrontiers(pack, graph, 1000).has(1)).toBe(false);
  });
});

describe("mergeFrontiers", () => {
  it("concatenates segment lists per state across maps", () => {
    const landSeg = { neighborState: 2, relation: "Enemy", threatWeight: 1, cells: [0], cx: 0, cy: 0, landmass: 1 };
    const seaSeg = { neighborState: 3, relation: "Rival", threatWeight: 0.5, cells: [5], cx: 5, cy: 5, landmass: 1 };

    const land = new Map([[1, [landSeg]]]);
    const sea = new Map([[1, [seaSeg]]]);

    const merged = mergeFrontiers(land, sea);
    expect(merged.get(1)).toEqual([landSeg, seaSeg]);
  });

  it("includes states that only appear in one of the maps", () => {
    const seaOnlySeg = { neighborState: 9, relation: "Enemy", threatWeight: 1, cells: [], cx: 0, cy: 0, landmass: 2 };
    const merged = mergeFrontiers(new Map(), new Map([[4, [seaOnlySeg]]]));
    expect(merged.get(4)).toEqual([seaOnlySeg]);
  });
});
