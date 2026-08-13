import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../context/simulationContext";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import {
  applyConflictAutonomy,
  endPlayerConflict,
  getConflictAutonomy,
  mayAdvanceAnyConflict,
  mayAdvanceAutonomousConflict,
  mayAdvanceConflict,
  shouldSuppressConflictAdvance,
  startPlayerConflict
} from "./conflictDirector";
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

  it("defaults missing and invalid saved values to the default policy (playerDirected)", () => {
    worldContext.options = {} as never;
    expect(getConflictAutonomy()).toBe("playerDirected");
    expect(mayAdvanceAutonomousConflict()).toBe(false);

    worldContext.options = { conflictAutonomy: "unexpected" } as never;
    expect(getConflictAutonomy()).toBe("playerDirected");
  });

  it("preserves an explicit autonomous policy instead of coercing it to the default", () => {
    worldContext.options = { conflictAutonomy: "autonomous" } as never;
    expect(getConflictAutonomy()).toBe("autonomous");
    expect(mayAdvanceAutonomousConflict()).toBe(true);
  });

  it("shouldSuppressConflictAdvance: suppresses only a bulk multi-day advance under player-directed policy (docs/plan/advance-time-loop-reduction.md Phase 1b)", () => {
    worldContext.options = { conflictAutonomy: "playerDirected" } as never;
    expect(shouldSuppressConflictAdvance(true)).toBe(true);
    // A lone Advance Day step always resolves military in full, even player-directed.
    expect(shouldSuppressConflictAdvance(false)).toBe(false);
  });

  it("shouldSuppressConflictAdvance: never suppresses under autonomous policy, bulk or not", () => {
    worldContext.options = { conflictAutonomy: "autonomous" } as never;
    expect(shouldSuppressConflictAdvance(true)).toBe(false);
    expect(shouldSuppressConflictAdvance(false)).toBe(false);
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
        },
        { i: 2, name: "Defender", diplomacy: [undefined, "Enemy", "x"] }
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

    const suspended = applyConflictAutonomy("playerDirected");

    const [siegeRegiment, manualRegiment] = worldContext.pack.states[1].military!;
    expect(suspended).toEqual({ goalCount: 1, statePairs: ["Attacker–Defender"] });
    expect(simulationContext.strategicGoals).toEqual({});
    expect(siegeRegiment.goalTargetBurg).toBeUndefined();
    expect(siegeRegiment.destinationCell).toBeUndefined();
    expect(siegeRegiment.path).toBeUndefined();
    expect(siegeRegiment.actionStatus).toBe("waiting");
    expect(manualRegiment.destinationCell).toBe(99);
    expect(mayAdvanceAutonomousConflict()).toBe(false);
    const chronicle = worldContext.pack.states[0].diplomacy as unknown as [string, unknown][];
    expect(chronicle[0][0]).toBe("Conflict plans suspended");
  });

  it("authorizes, persists, and ends an explicit player conflict", () => {
    worldContext.options = { conflictAutonomy: "playerDirected" } as never;
    worldContext.pack = {
      burgs: Object.assign([], { 7: { i: 7, cell: 42, x: 0, y: 0 } }),
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Attacker", diplomacy: [undefined, "x", "Rival"] },
        { i: 2, name: "Defender", diplomacy: [undefined, "Rival", "x"] }
      ]
    } as unknown as PackedGraph;
    simulationContext.currentYear = 120;
    simulationContext.currentMonth = 6;
    simulationContext.currentDay = 9;
    simulationContext.strategicGoals = {
      1: [
        {
          targetBurg: 7,
          targetState: 2,
          type: "siege",
          tension: 80,
          expectedCasualties: "moderate",
          justification: "border_expansion",
          requiredAttackForce: 10
        }
      ]
    };

    expect(startPlayerConflict({ attackerStateId: 1, defenderStateId: 2 })).toEqual({ started: true });
    expect(worldContext.pack.states[1].conflictAuthorizations?.[2]).toEqual({
      origin: "player",
      startedAt: { year: 120, month: 6, day: 9 }
    });
    expect(worldContext.pack.states[2].conflictAuthorizations?.[1]?.origin).toBe("player");
    expect(worldContext.pack.states[1].diplomacy?.[2]).toBe("Enemy");
    expect(mayAdvanceAnyConflict()).toBe(true);
    expect(mayAdvanceConflict(1, 2)).toBe(true);

    endPlayerConflict({ attackerStateId: 1, defenderStateId: 2 });

    expect(worldContext.pack.states[1].conflictAuthorizations?.[2]).toBeUndefined();
    expect(worldContext.pack.states[2].conflictAuthorizations?.[1]).toBeUndefined();
    expect(simulationContext.strategicGoals).toEqual({});
    expect(mayAdvanceAnyConflict()).toBe(false);
  });
});
