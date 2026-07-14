import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { Route } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { FrontierForts } from "./frontierFortsGenerator";

function makeState(pack: PackedGraph): WorldState {
  return { pack, options: { year: 1000 } } as unknown as WorldState;
}

function generate(pack: PackedGraph) {
  worldContext.pack = pack;
  worldContext.notes = [];
  worldContext.grid = { spacing: 10 } as unknown as typeof worldContext.grid;
  FrontierForts.generate(worldContext, viewContext, appServices, makeState(pack));
  return worldContext.pack.frontierForts;
}

// ---------------------------------------------------------------------------
// Shared 2-cell border: cell 0 (state 1) borders cell 1 (state 2, hostile).
// cell 2 exists only to pull the map-wide mean flux down below cell 0's value
// when a test wants cell 0 to qualify as a river crossing.
// ---------------------------------------------------------------------------

function makeBasePack(overrides: {
  relation?: string;
  cell0?: Partial<{ h: number; r: number; fl: number; burg: number }>;
  routes?: Route[];
}): PackedGraph {
  const { relation = "Enemy", cell0 = {}, routes = [] } = overrides;
  const { h = 50, r = 0, fl = 0, burg = 0 } = cell0;

  return {
    cells: {
      i: [0, 1, 2],
      h: [h, 50, 50],
      c: [[1], [0], []],
      state: [1, 2, 1],
      f: [10, 10, 10],
      r: [r, 0, 0],
      fl: [fl, 0, 10],
      burg: [burg, 0, 0],
      culture: [1, 1, 1],
      p: [
        [0, 0],
        [10, 0],
        [50, 50]
      ]
    },
    cultures: [null, { i: 1, base: 0 }],
    routes,
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      { i: 1, name: "Alpha", diplomacy: [undefined, "x", relation], campaigns: [] },
      { i: 2, name: "Beta", diplomacy: [undefined, relation, "x"], campaigns: [] }
    ]
  } as unknown as PackedGraph;
}

describe("FrontierFortsModule.generate", () => {
  it("places a fort at a river-crossing cell on a hostile border", () => {
    const pack = makeBasePack({ cell0: { r: 1, fl: 100 } });
    const forts = generate(pack);

    expect(forts).toHaveLength(1);
    expect(forts[0].siteType).toBe("river");
    expect(forts[0].state).toBe(1);
    expect(forts[0].neighborState).toBe(2);
  });

  it("places a fort at a mountain-elevation cell", () => {
    const pack = makeBasePack({ cell0: { h: 65 } });
    const forts = generate(pack);

    expect(forts).toHaveLength(1);
    expect(forts[0].siteType).toBe("mountain");
  });

  it("places a fort at a road/trail cell", () => {
    const pack = makeBasePack({
      routes: [
        {
          i: 0,
          group: "roads",
          points: [
            [0, 0, 0],
            [10, 0, 1]
          ]
        } as unknown as Route
      ]
    });
    const forts = generate(pack);

    expect(forts).toHaveLength(1);
    expect(forts[0].siteType).toBe("road");
  });

  it("places no fort on a border segment with no qualifying chokepoint", () => {
    const pack = makeBasePack({});
    const forts = generate(pack);

    expect(forts).toHaveLength(0);
  });

  it("places no fort on a chokepoint cell that already has a burg", () => {
    const pack = makeBasePack({ cell0: { h: 65, burg: 1 } });
    const forts = generate(pack);

    expect(forts).toHaveLength(0);
  });

  it("places no fort on a low-threat border with no active war", () => {
    const pack = makeBasePack({ relation: "Suspicion", cell0: { h: 65 } });
    const forts = generate(pack);

    expect(forts).toHaveLength(0);
  });

  it("collapses two qualifying candidates within minimum spacing to one fort", () => {
    const pack = {
      cells: {
        i: [0, 1, 2, 3],
        h: [65, 65, 65, 65],
        c: [[1], [0], [3], [2]],
        state: [1, 2, 1, 3],
        f: [10, 10, 10, 10],
        r: [0, 0, 0, 0],
        fl: [0, 0, 0, 0],
        burg: [0, 0, 0, 0],
        culture: [1, 1, 1, 1],
        p: [
          [0, 0],
          [10, 0],
          [5, 0],
          [15, 0]
        ]
      },
      cultures: [null, { i: 1, base: 0 }],
      routes: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Alpha", diplomacy: [undefined, "x", "Enemy", "Enemy"], campaigns: [] },
        { i: 2, name: "Beta", diplomacy: [undefined, "Enemy", "x", undefined], campaigns: [] },
        { i: 3, name: "Gamma", diplomacy: [undefined, "Enemy", undefined, "x"], campaigns: [] }
      ]
    } as unknown as PackedGraph;

    const forts = generate(pack);

    expect(forts).toHaveLength(1);
    expect(forts[0].cell).toBe(0);
  });

  it("does not duplicate forts or notes on repeated generation", () => {
    const pack = makeBasePack({ cell0: { h: 65 } });
    generate(pack);
    const forts = generate(pack);

    expect(forts).toHaveLength(1);
    const fortNotes = worldContext.notes.filter(note => note.id.startsWith("frontierFort"));
    expect(fortNotes).toHaveLength(1);
  });

  it("places the fort at the raw cell point, not a burg-snapped point", () => {
    const pack = makeBasePack({ cell0: { h: 65 } });
    const forts = generate(pack);

    expect(forts[0].x).toBe(0);
    expect(forts[0].y).toBe(0);
  });
});
