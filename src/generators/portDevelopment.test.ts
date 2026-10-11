import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyFrontierSimulationState, type SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { Burgs } from "./burgs-generator";
import { advancePortDevelopment } from "./portDevelopment";
import { Routes } from "./routes-generator";

describe("advancePortDevelopment", () => {
  let developPort: ReturnType<typeof vi.spyOn<typeof Burgs, "developPort">>;
  let connectPort: ReturnType<typeof vi.spyOn<typeof Routes, "connectPort">>;

  beforeEach(() => {
    developPort = vi.spyOn(Burgs, "developPort");
    connectPort = vi.spyOn(Routes, "connectPort");
    developPort.mockImplementation(burg => {
      burg.port = 1;
      return true;
    });
    connectPort.mockReturnValue(undefined);
    vi.spyOn(Routes, "connectRiverPort").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("funds the strongest eligible harbour or river town once per State each January", () => {
    const world = {
      pack: {
        states: [{ i: 0 }, { i: 1, treasury: 30 }],
        burgs: [{ i: 0 }, { i: 1, state: 1, cell: 0, population: 3 }, { i: 2, state: 1, cell: 1, population: 4 }],
        cells: { harbor: [0, 1], r: [1, 0], fl: [500, 0] },
        routes: []
      }
    } as unknown as WorldContext;
    const simulation = {
      currentMonth: 1,
      currentDay: 1,
      frontier: createEmptyFrontierSimulationState()
    } as SimulationContext;

    expect(advancePortDevelopment(world, simulation)).toEqual([{ stateId: 1, burgId: 2, routeAdded: false }]);
    expect(world.pack.states[1].treasury).toBe(20);
    expect(connectPort).toHaveBeenCalledWith(1, 1);
  });

  it("moves the promoted town's road ends to its new quay position", () => {
    developPort.mockImplementation(burg => {
      burg.port = 1;
      burg.x = 12;
      burg.y = 3;
      return true;
    });
    const road = {
      i: 0,
      group: "roads",
      points: [
        [0, 0, 5],
        [10, 0, 1]
      ],
      cells: [5, 1]
    };
    const lane = { i: 1, group: "searoutes", points: [[10, 0, 1]], cells: [1] };
    const world = {
      pack: {
        states: [{ i: 0 }, { i: 1, treasury: 30 }],
        burgs: [{ i: 0 }, { i: 1, state: 1, cell: 1, x: 10, y: 0, population: 4 }],
        cells: { harbor: [0, 1], r: [0, 0], fl: [0, 0] },
        routes: [road, lane]
      }
    } as unknown as WorldContext;
    const simulation = {
      currentMonth: 1,
      currentDay: 1,
      frontier: createEmptyFrontierSimulationState()
    } as SimulationContext;

    advancePortDevelopment(world, simulation);

    expect(road.points.at(-1)).toEqual([12, 3, 1]);
    expect(road.cells).toEqual([5, 1]);
    expect(lane.points).toEqual([[10, 0, 1]]);
  });
});
