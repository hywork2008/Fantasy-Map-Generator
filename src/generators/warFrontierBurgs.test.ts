import { describe, expect, it } from "vitest";
import type { Burg, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  areStatesSeaConnected,
  findBorderBurgs,
  findBorderCells,
  findFrontlineTargetBurg,
  findStagingBurg,
  resolveAlliedAttackerTarget,
  resolveLeaderWarEndpoints
} from "./warFrontierBurgs";

describe("warFrontierBurgs", () => {
  const mockPack: PackedGraph = {
    cells: {
      i: [0, 1, 2, 3, 4],
      h: [20, 25, 30, 20, 10], // cell 4 is ocean
      p: [
        [10, 10], // 0: State 1 interior
        [20, 10], // 1: State 1 border
        [30, 10], // 2: State 2 border
        [40, 10], // 3: State 2 interior
        [50, 10] // 4: ocean
      ],
      c: [
        [1], // 0
        [0, 2], // 1
        [1, 3], // 2
        [2, 4], // 3
        [3] // 4
      ],
      state: [1, 1, 2, 2, 0],
      f: [1, 1, 1, 1, 0]
    } as any,
    states: [
      { i: 0, removed: true } as State,
      { i: 1, name: "State One", center: 0 } as State,
      { i: 2, name: "State Two", center: 3 } as State,
      { i: 3, name: "State Three", center: 0 } as State
    ],
    burgs: [
      { i: 1, name: "City Interior 1", state: 1, x: 10, y: 10, cell: 0 } as Burg,
      { i: 2, name: "City Border 1", state: 1, x: 20, y: 10, cell: 1 } as Burg,
      { i: 3, name: "City Border 2", state: 2, x: 30, y: 10, cell: 2 } as Burg,
      { i: 4, name: "City Alt Border 2", state: 2, x: 32, y: 12, cell: 2 } as Burg,
      { i: 5, name: "City Far 2", state: 2, x: 40, y: 10, cell: 3 } as Burg,
      { i: 6, name: "Port City 3", state: 3, x: 100, y: 100, cell: 0, port: 1 } as Burg
    ]
  } as unknown as PackedGraph;

  it("finds border cells between adjacent states", () => {
    const { borderCellsA, borderCellsB } = findBorderCells(mockPack, 1, 2);
    expect(borderCellsA).toEqual([1]);
    expect(borderCellsB).toEqual([2]);
  });

  it("sorts burgs by border proximity", () => {
    const state1Burgs = findBorderBurgs(mockPack, 1, 2);
    expect(state1Burgs[0].name).toBe("City Border 1");
    expect(state1Burgs[1].name).toBe("City Interior 1");

    const state2Burgs = findBorderBurgs(mockPack, 2, 1);
    expect(state2Burgs[0].name).toBe("City Border 2");
    expect(state2Burgs[1].name).toBe("City Alt Border 2");
    expect(state2Burgs[2].name).toBe("City Far 2");
  });

  it("prioritizes ports for distant maritime states", () => {
    const maritimeBurgs = findBorderBurgs(mockPack, 3, 1);
    expect(maritimeBurgs[0].name).toBe("Port City 3");
  });

  it("resolves leader endpoints using closest border cities", () => {
    const endpoints = resolveLeaderWarEndpoints(mockPack, 1, 2);
    expect(endpoints.fromBurg?.name).toBe("City Border 1");
    expect(endpoints.toBurg?.name).toBe("City Border 2");
  });

  it("resolves allied attacker target with concentrated assault doctrine", () => {
    const leaderTarget = mockPack.burgs[2]; // City Border 2 (i: 3)
    const result = resolveAlliedAttackerTarget(mockPack, 1, 2, leaderTarget, {
      preferredRole: "concentrated"
    });
    expect(result.tacticalRole).toBe("concentrated");
    expect(result.toBurg?.name).toBe("City Border 2");
  });

  it("resolves allied attacker target with divide doctrine when multiple border cities exist", () => {
    const leaderTarget = mockPack.burgs[2]; // City Border 2 (i: 3)
    const result = resolveAlliedAttackerTarget(mockPack, 1, 2, leaderTarget, {
      preferredRole: "divide"
    });
    expect(result.tacticalRole).toBe("divide");
    expect(result.toBurg?.name).toBe("City Alt Border 2");
  });

  it("checks areStatesSeaConnected correctly", () => {
    // State 1 and State 2 have no ports in mockPack -> false
    expect(areStatesSeaConnected(mockPack, 1, 2)).toBe(false);

    // State 3 has a port, but State 1 has no port -> false
    expect(areStatesSeaConnected(mockPack, 1, 3)).toBe(false);

    // Create a pack where both states have ports on the same ocean
    const seaPack = {
      cells: {
        i: [0, 1, 2, 3],
        h: [25, 10, 10, 25], // 0, 3 land; 1, 2 ocean
        f: [1, 2, 2, 3], // ocean feature 2
        c: [[1], [0, 2], [1, 3], [2]],
        state: [1, 0, 0, 2],
        haven: [1, 0, 0, 2]
      },
      features: [null, { i: 1, type: "island" }, { i: 2, type: "ocean" }, { i: 3, type: "island" }],
      burgs: [
        { i: 1, name: "Port 1", state: 1, cell: 0, port: 1, x: 0, y: 0 },
        { i: 2, name: "Port 2", state: 2, cell: 3, port: 1, x: 30, y: 0 }
      ],
      routes: []
    } as unknown as PackedGraph;

    expect(areStatesSeaConnected(seaPack, 1, 2)).toBe(true);

    // If port 2 is on an isolated lake (feature 4)
    const isolatedLakePack = {
      ...seaPack,
      features: [
        null,
        { i: 1, type: "island" },
        { i: 2, type: "ocean" },
        { i: 3, type: "island" },
        { i: 4, type: "lake" }
      ],
      cells: {
        ...seaPack.cells,
        f: [1, 2, 4, 3],
        haven: [1, 0, 0, 2]
      }
    } as unknown as PackedGraph;

    expect(areStatesSeaConnected(isolatedLakePack, 1, 2)).toBe(false);
  });

  it("selects nearest staging burg to target rather than interior capital", () => {
    const targetBurg: Burg = { i: 10, name: "Target City", state: 2, x: 28, y: 10, cell: 2 };
    // State 1 has City Interior (x: 10, y: 10) and City Border (x: 20, y: 10)
    const staging = findStagingBurg(mockPack, 1, targetBurg);
    expect(staging?.name).toBe("City Border 1");
  });

  it("selects facing port in maritime invasion rather than back-side port", () => {
    // Defender (State 2) has:
    // Port West (facing Attacker on west): x: 50, y: 0
    // Port East (on opposite back side, like Tokyo on Pacific): x: 150, y: 0
    // Attacker (State 1) has Port at x: 0, y: 0
    const navalPack: PackedGraph = {
      cells: {
        i: [0, 1, 2],
        h: [25, 25, 25],
        state: [1, 2, 2],
        p: [
          [0, 0],
          [50, 0],
          [150, 0]
        ],
        c: [[1], [0, 2], [1]]
      },
      states: [
        { i: 0 },
        { i: 1, name: "Attacker State", neighbors: [] }, // maritime / non-land neighbor
        { i: 2, name: "Defender State", neighbors: [] }
      ],
      burgs: [
        { i: 1, name: "Attacker Port", state: 1, port: 1, x: 0, y: 0, cell: 0 },
        { i: 2, name: "Facing West Port", state: 2, port: 1, x: 50, y: 0, cell: 1 },
        { i: 3, name: "Back Side East Port", state: 2, port: 1, x: 150, y: 0, cell: 2 }
      ]
    } as unknown as PackedGraph;

    const targetPort = findFrontlineTargetBurg(navalPack, 2, 1);
    expect(targetPort?.name).toBe("Facing West Port");

    const endpoints = resolveLeaderWarEndpoints(navalPack, 1, 2);
    expect(endpoints.fromBurg?.name).toBe("Attacker Port");
    expect(endpoints.toBurg?.name).toBe("Facing West Port");
  });
});
