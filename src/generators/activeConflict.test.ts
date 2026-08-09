import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { isStateInActiveConflict } from "./activeConflict";

describe("isStateInActiveConflict", () => {
  const originalOptions = worldContext.options;
  const originalExtensions = simulationContext.extensions;
  const originalGoals = simulationContext.strategicGoals;

  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.strategicGoals = {};
  });

  afterEach(() => {
    worldContext.options = originalOptions;
    simulationContext.extensions = originalExtensions;
    simulationContext.strategicGoals = originalGoals;
  });

  it("does not treat a player-directed diplomatic Enemy relation as an active conflict", () => {
    worldContext.options = { conflictAutonomy: "playerDirected" } as typeof worldContext.options;

    expect(isStateInActiveConflict(1)).toBe(false);
  });

  it("recognizes a player-directed conflict only after player authorization", () => {
    worldContext.options = { conflictAutonomy: "playerDirected" } as typeof worldContext.options;
    simulationContext.extensions = {
      nobility: {
        conflictAuthorizationsByState: {
          1: { 2: { origin: "player" } }
        }
      }
    };

    expect(isStateInActiveConflict(1)).toBe(true);
    expect(isStateInActiveConflict(2)).toBe(true);
  });

  it("recognizes autonomous conflicts only after their strategic goal is committed", () => {
    worldContext.options = { conflictAutonomy: "autonomous" } as typeof worldContext.options;
    simulationContext.strategicGoals = {
      1: [
        {
          targetBurg: 2,
          targetState: 2,
          type: "siege",
          tension: 99,
          expectedCasualties: "low",
          justification: "test",
          requiredAttackForce: 1
        }
      ]
    };

    expect(isStateInActiveConflict(1)).toBe(false);
    simulationContext.strategicGoals[1][0].tension = 100;
    expect(isStateInActiveConflict(1)).toBe(true);
    expect(isStateInActiveConflict(2)).toBe(true);
  });
});
