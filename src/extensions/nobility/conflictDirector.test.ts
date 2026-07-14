import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../context/simulationContext";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import { applyConflictAutonomy, getConflictAutonomy, mayAdvanceAutonomousConflict } from "./conflictDirector";
import { clearNobilityContext, initNobilityContext } from "./nobilityContext";

describe("conflictDirector", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    simulationContext.strategicGoals = {};
  });

  afterEach(() => {
    clearNobilityContext();
    simulationContext.strategicGoals = {};
  });

  it("defaults missing and invalid saved values to autonomous behavior", () => {
    worldContext.options = {} as never;
    expect(getConflictAutonomy()).toBe("autonomous");
    expect(mayAdvanceAutonomousConflict()).toBe(true);

    worldContext.options = { conflictAutonomy: "unexpected" } as never;
    expect(getConflictAutonomy()).toBe("autonomous");
  });

  it("clears AI siege goals and only their matching march orders in player-directed mode", () => {
    worldContext.options = { conflictAutonomy: "playerDirected" } as never;
    worldContext.pack = {
      burgs: Object.assign([], { 7: { i: 7, cell: 42, x: 0, y: 0 } }),
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Attacker",
          military: [
            {
              i: 0,
              a: 10,
              cell: 1,
              x: 0,
              y: 0,
              u: { infantry: 10 },
              state: 1,
              goalTargetBurg: 7,
              destinationCell: 42,
              path: [1, 42],
              pathIndex: 0,
              actionStatus: "moving"
            },
            {
              i: 1,
              a: 10,
              cell: 2,
              x: 5,
              y: 0,
              u: { infantry: 10 },
              state: 1,
              destinationCell: 99,
              path: [2, 99],
              pathIndex: 0,
              actionStatus: "moving"
            }
          ]
        }
      ]
    } as unknown as PackedGraph;
    simulationContext.strategicGoals = {
      1: [
        {
          targetBurg: 7,
          targetState: 2,
          type: "siege",
          tension: 100,
          expectedCasualties: "moderate",
          justification: "border_expansion",
          requiredAttackForce: 10
        }
      ]
    };

    applyConflictAutonomy("playerDirected");

    const [siegeRegiment, manualRegiment] = worldContext.pack.states[1].military!;
    expect(simulationContext.strategicGoals).toEqual({});
    expect(siegeRegiment.goalTargetBurg).toBeUndefined();
    expect(siegeRegiment.destinationCell).toBeUndefined();
    expect(siegeRegiment.path).toBeUndefined();
    expect(siegeRegiment.actionStatus).toBe("waiting");
    expect(manualRegiment.destinationCell).toBe(99);
    expect(mayAdvanceAutonomousConflict()).toBe(false);
  });
});
