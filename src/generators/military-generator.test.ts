import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "../types/WorldState";
import { Military } from "./military-generator";

// ---------------------------------------------------------------------------
// Two states, one hostile border:
//   cell 1 (state 1, populated recruitment site) at (0, 0)
//   cell 2 (state 1, empty border cell)          at (100, 0) — adjacent to cell 3
//   cell 3 (state 2, empty border cell)          at (150, 0) — adjacent to cell 2
// ---------------------------------------------------------------------------

function makePack(relation: string): PackedGraph {
  return {
    cells: {
      i: [0, 1, 2, 3],
      h: [0, 50, 50, 50],
      c: [[], [], [3], [2]],
      state: [0, 1, 1, 2],
      pop: [0, 10000, 0, 0],
      biome: [0, 5, 5, 5],
      culture: [0, 1, 1, 1],
      religion: [0, 1, 1, 1],
      f: [0, 1, 1, 1],
      haven: [0, 0, 0, 0],
      burg: [0, 0, 0, 0],
      province: [0, 0, 0, 0],
      p: [
        [0, 0],
        [0, 0],
        [100, 0],
        [150, 0]
      ]
    },
    burgs: [0],
    provinces: [null],
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
        diplomacy: [undefined, "x", relation],
        neighbors: [2],
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
        diplomacy: [undefined, relation, "x"],
        neighbors: [1],
        campaigns: []
      }
    ]
  } as unknown as PackedGraph;
}

function makeState(pack: PackedGraph): WorldState {
  return { pack, options: { year: 1000 } } as unknown as WorldState;
}

describe("MilitaryModule.generate — frontier-based garrison redistribution", () => {
  it("pulls a state's regiment from its recruitment site toward a hostile border", () => {
    worldContext.pack = makePack("Enemy");
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.notes = [];
    worldContext.options = { military: undefined } as unknown as typeof worldContext.options;

    Military.generate(worldContext, viewContext, appServices, makeState(worldContext.pack));

    const regiments = worldContext.pack.states[1].military!;
    expect(regiments).toHaveLength(1);
    // recruited at (0, 0); the hostile border with state 2 sits at (100, 0), pull strength 0.5
    expect(regiments[0].x).toBeCloseTo(50, 5);
    expect(regiments[0].y).toBeCloseTo(0, 5);
  });

  it("leaves a peaceful state's regiment exactly at its recruitment site", () => {
    worldContext.pack = makePack("Ally");
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.notes = [];
    worldContext.options = { military: undefined } as unknown as typeof worldContext.options;

    Military.generate(worldContext, viewContext, appServices, makeState(worldContext.pack));

    const regiments = worldContext.pack.states[1].military!;
    expect(regiments).toHaveLength(1);
    expect(regiments[0].x).toBe(0);
    expect(regiments[0].y).toBe(0);
  });
});
