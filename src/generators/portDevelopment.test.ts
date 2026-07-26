import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyFrontierSimulationState, type SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { Burgs } from "./burgs-generator";
import { advancePortDevelopment } from "./portDevelopment";
import { Routes } from "./routes-generator";

describe("advancePortDevelopment", () => {
  const developPort = vi.spyOn(Burgs, "developPort");
  const connectPort = vi.spyOn(Routes, "connectPort");

  beforeEach(() => {
    developPort.mockImplementation(burg => {
      burg.port = 1;
      return true;
    });
    connectPort.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("funds the strongest eligible harbour or river town once per State each January", () => {
    const world = {
      pack: {
        states: [{ i: 0 }, { i: 1, treasury: 30 }],
        burgs: [{ i: 0 }, { i: 1, state: 1, cell: 0, population: 3 }, { i: 2, state: 1, cell: 1, population: 4 }],
        cells: { harbor: [0, 1], r: [1, 0], fl: [500, 0] }
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
});
