import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategicGoal } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { BattleResolutionGenerator } from "./battle-resolution";

function makeGoal(overrides: Partial<StrategicGoal> = {}): StrategicGoal {
  return {
    targetBurg: 5,
    targetState: 2,
    type: "siege",
    tension: 100,
    expectedCasualties: "moderate",
    justification: "border_expansion",
    ...overrides
  };
}

describe("BattleResolutionGenerator.resolveSiege", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    vi.spyOn(Math, "random").mockReturnValue(0); // strip randomness out of the detection roll
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearNobilityContext();
  });

  it("resolves detection using the state's actual Spymaster, not always the ruler", () => {
    // Attacker's ruler is a poor spy (intrigue 5) but their real Spymaster is excellent (95).
    // Defender has no Spymaster office, so it falls back to its mediocre ruler (50).
    // With the fix, the attacker's Spymaster wins detection -> surprise attack -> the lone
    // distant defending regiment never arrives -> only the tiny militia defends -> city falls.
    worldContext.pack = {
      cells: {
        i: [0, 1, 2],
        p: [
          [0, 0],
          [500, 500],
          [2000, 0]
        ],
        f: [1, 1, 1],
        burg: [5, 0, 0],
        state: [2, 2, 2]
      },
      burgs: { 5: { i: 5, cell: 0, x: 0, y: 0, population: 20, state: 2, citadel: false } },
      characters: [
        { i: 10, dead: false, skills: { intrigue: 5 }, titles: [] },
        {
          i: 11,
          dead: false,
          skills: { intrigue: 95 },
          titles: [{ title: "Spymaster", entityType: "state", entityId: 1, landed: false }]
        },
        { i: 20, dead: false, skills: { intrigue: 50 }, titles: [] }
      ],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Attackers",
          rulerId: 10,
          military: [{ i: 0, a: 50, x: 500, y: 500, u: { infantry: 50 }, state: 1 }]
        },
        {
          i: 2,
          name: "Defenders",
          rulerId: 20,
          military: [{ i: 0, a: 1000, x: 2000, y: 0, u: { infantry: 1000 }, state: 2 }]
        }
      ]
    } as unknown as PackedGraph;

    BattleResolutionGenerator.resolveSiege(makeGoal(), 1);

    expect((worldContext.pack.burgs as unknown as Record<number, { state: number }>)[5].state).toBe(1);
  });

  it("does not give a regiment a combat bonus when it has no assigned commander", () => {
    const pack = makeEvenFightPack();
    BattleResolutionGenerator.resolveSiege(makeGoal(), 1);
    // Equal raw troop counts (100 vs 90, ratio 1.11) is not enough to break through (needs > 1.5).
    expect(pack.burgs[5].state).toBe(2);
  });

  it("lets a regiment with a skilled commander punch above its raw troop count", () => {
    const pack = makeEvenFightPack();
    pack.states[1].military[0].commanderId = 99;
    pack.characters.push({
      i: 99,
      dead: false,
      skills: { martial: 100 },
      titles: [{ title: "Commander", entityType: "state", entityId: 1, landed: false }]
    });

    BattleResolutionGenerator.resolveSiege(makeGoal(), 1);

    // Same 100 vs 90 raw troops, but the +50% commander bonus pushes the ratio past 1.5.
    expect(pack.burgs[5].state).toBe(1);
  });

  function makeEvenFightPack() {
    worldContext.pack = {
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [500, 500]
        ],
        f: [1, 1],
        burg: [5, 0],
        state: [2, 2]
      },
      burgs: { 5: { i: 5, cell: 0, x: 0, y: 0, population: 0, state: 2, citadel: false } },
      characters: [
        { i: 10, dead: false, skills: { intrigue: 50 }, titles: [] },
        { i: 20, dead: false, skills: { intrigue: 50 }, titles: [] }
      ],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Attackers",
          rulerId: 10,
          military: [{ i: 0, a: 100, x: 500, y: 500, u: { infantry: 100 }, state: 1 }]
        },
        {
          i: 2,
          name: "Defenders",
          rulerId: 20,
          military: [{ i: 0, a: 90, x: 500, y: 500, u: { infantry: 90 }, state: 2 }]
        }
      ]
    } as unknown as PackedGraph;
    return worldContext.pack as unknown as {
      burgs: Record<number, { state: number }>;
      characters: { i: number; dead: boolean; skills: Record<string, number>; titles: unknown[] }[];
      states: { i: number; military: { commanderId?: number }[] }[];
    };
  }
});
