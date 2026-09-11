import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { PackedGraph, Race } from "../types/models";
import {
  advanceFireSpirits,
  collectEstuaryAndNeighborCells,
  collectLavaBasinCells,
  evaluateCellFireSpiritStatus,
  isElvenRaceKey
} from "./fireSpirits";

function createMockPack(): PackedGraph {
  const cellCount = 10;
  return {
    cells: {
      i: Array.from({ length: cellCount }, (_, i) => i),
      c: [[1, 2], [0, 2, 3], [0, 1], [1, 4], [3, 5], [4], [], [], [], []],
      h: new Uint8Array([20, 20, 20, 20, 20, 20, 20, 20, 20, 20]),
      pop: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      burg: new Uint16Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
      culture: new Uint16Array(cellCount),
      state: new Uint16Array(cellCount),
      r: new Uint16Array(cellCount),
      haven: new Uint16Array(cellCount),
      f: new Uint16Array(cellCount),
      biomeCode: new Uint8Array(cellCount)
    },
    features: [
      { i: 0, group: "ocean", type: "ocean" },
      { i: 1, group: "lake", type: "lava" }
    ],
    biomesData: {
      name: ["Ocean", "Lava field", "Temperate rainforest"]
    },
    rivers: [{ i: 1, mouth: 1, source: 3, cells: [3, 1] }],
    lavaFlows: [{ i: 1, mouth: 5, source: 4, cells: [4, 5] }],
    races: [
      { id: 0, key: "human", name: "Human" },
      { id: 1, key: "elf", name: "Elf" },
      { id: 2, key: "dwarf", name: "Dwarf" }
    ] as Race[],
    cultures: [
      { i: 0, name: "Wild", race: 0 },
      { i: 1, name: "Human Culture", race: 0 },
      { i: 2, name: "Elven Culture", race: 1 }
    ],
    states: [
      { i: 0, name: "Neutrals", removed: true },
      {
        i: 1,
        name: "Human Empire",
        culture: 1,
        removed: false,
        military: [
          {
            i: 1,
            cell: 3,
            state: 1,
            a: 50,
            type: "infantry",
            u: { musketeers: 50 }
          }
        ]
      },
      {
        i: 2,
        name: "Elven Realm",
        culture: 2,
        removed: false,
        military: [
          {
            i: 2,
            cell: 7,
            state: 2,
            a: 50,
            type: "infantry",
            u: { musketeers: 50 }
          }
        ]
      }
    ],
    burgs: [
      { i: 0, name: "None", cell: 0, population: 0 },
      { i: 1, name: "Silver Lake", cell: 6, population: 15 }
    ]
  } as unknown as PackedGraph;
}

describe("fireSpirits", () => {
  it("recognizes elven race keys", () => {
    expect(isElvenRaceKey("elf")).toBe(true);
    expect(isElvenRaceKey("dark_elf")).toBe(true);
    expect(isElvenRaceKey("half_elf")).toBe(true);
    expect(isElvenRaceKey("human")).toBe(false);
    expect(isElvenRaceKey("dwarf")).toBe(false);
    expect(isElvenRaceKey(null)).toBe(false);
  });

  it("identifies lava basin cells correctly", () => {
    const pack = createMockPack();
    // cell 4 and 5 are on lava flow
    // cell 8 is on lava lake feature
    pack.cells.f[8] = 1;
    // cell 9 has Lava field biome
    pack.cells.biomeCode[9] = 1;

    const lavaCells = collectLavaBasinCells(pack);
    expect(lavaCells.has(4)).toBe(true);
    expect(lavaCells.has(5)).toBe(true);
    expect(lavaCells.has(8)).toBe(true);
    expect(lavaCells.has(9)).toBe(true);
    expect(lavaCells.has(0)).toBe(false);
  });

  it("identifies estuary mouth and adjacent cells correctly", () => {
    const pack = createMockPack();
    // river 1 mouth is cell 1; cell 1 neighbors are 0, 2, 3
    const estuary = collectEstuaryAndNeighborCells(pack);
    expect(estuary.has(1)).toBe(true); // mouth
    expect(estuary.has(0)).toBe(true); // neighbor of mouth
    expect(estuary.has(2)).toBe(true); // neighbor of mouth
    expect(estuary.has(3)).toBe(true); // neighbor of mouth
    expect(estuary.has(9)).toBe(false);
  });

  it("evaluates presence and elven control under High/Dark Fantasy", () => {
    const pack = createMockPack();
    const options = { culturesSet: "highFantasy", fireSpiritsEnabled: true };

    // Cell 1: River mouth (estuary) -> present even with 0 population
    const statusEstuary = evaluateCellFireSpiritStatus(pack, 1, options);
    expect(statusEstuary.present).toBe(true);
    expect(statusEstuary.reason).toBe("estuary");

    // Cell 4: Lava flow -> present even with 0 population
    const statusLava = evaluateCellFireSpiritStatus(pack, 4, options);
    expect(statusLava.present).toBe(true);
    expect(statusLava.reason).toBe("lava");

    // Cell 6: Has burg with pop 15 -> present by population
    const statusBurg = evaluateCellFireSpiritStatus(pack, 6, options);
    expect(statusBurg.present).toBe(true);
    expect(statusBurg.reason).toBe("population");

    // Cell 7: Pop 0, not estuary, not lava -> not present
    const statusEmpty = evaluateCellFireSpiritStatus(pack, 7, options);
    expect(statusEmpty.present).toBe(false);

    // If options.fireSpiritsEnabled is false -> never present
    const statusDisabled = evaluateCellFireSpiritStatus(pack, 1, { ...options, fireSpiritsEnabled: false });
    expect(statusDisabled.present).toBe(false);

    // If culturesSet is world (non-fantasy) -> never present
    const statusWorld = evaluateCellFireSpiritStatus(pack, 1, { culturesSet: "world", fireSpiritsEnabled: true });
    expect(statusWorld.present).toBe(false);
  });

  it("verifies that military garrison does not count as civilian population fire source", () => {
    const pack = createMockPack();
    // Cell 7 has pop 0, but has elven regiment stationed
    pack.cells.pop[7] = 0;
    const status = evaluateCellFireSpiritStatus(pack, 7, { culturesSet: "highFantasy", fireSpiritsEnabled: true });
    expect(status.present).toBe(false);
  });

  it("checks elven control pacifies fire spirit explosion hazard", () => {
    const pack = createMockPack();
    const options = { culturesSet: "highFantasy", fireSpiritsEnabled: true };

    // Cell 6: Assign to Human culture (culture 1)
    pack.cells.culture[6] = 1;
    const humanStatus = evaluateCellFireSpiritStatus(pack, 6, options);
    expect(humanStatus.present).toBe(true);
    expect(humanStatus.controlledByElves).toBe(false);
    expect(humanStatus.hazardActive).toBe(true);

    // Cell 6: Assign to Elven culture (culture 2)
    pack.cells.culture[6] = 2;
    const elvenStatus = evaluateCellFireSpiritStatus(pack, 6, options);
    expect(elvenStatus.present).toBe(true);
    expect(elvenStatus.controlledByElves).toBe(true);
    expect(elvenStatus.hazardActive).toBe(false);
  });

  it("simulates fire spirits causing chain gunpowder explosion in unwarded cells", () => {
    const pack = createMockPack();
    const world = {
      pack,
      options: { culturesSet: "highFantasy", fireSpiritsEnabled: true }
    } as unknown as WorldContext;
    const simulation = { currentYear: 120 } as SimulationContext;

    // Regiment in State 1 (Human) is at cell 3 (estuary neighbor -> fire spirit present, unwarded)
    pack.cells.culture[3] = 1;
    pack.cells.pop[3] = 5;

    // Force random roll to trigger explosion
    const deterministicRng = () => 0.01;

    const result = advanceFireSpirits(world, simulation, deterministicRng);
    expect(result.changed).toBe(true);
    expect(result.incidents.length).toBeGreaterThan(0);
    const incident = result.incidents[0];
    expect(incident.stateId).toBe(1);
    expect(incident.gunpowderLost).toBeGreaterThan(0);
    expect(incident.militaryCasualties).toBeGreaterThan(0);
    expect(pack.states[1].military[0].a).toBeLessThan(50);
  });
});
