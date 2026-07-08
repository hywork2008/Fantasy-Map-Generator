import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { StrategicPlannerGenerator } from "./strategic-planner";

/**
 * Two states share a land border (cell 0 -> state 1, cell 1 -> state 2, both on landmass 1).
 * State 2's border burg sits on cell 1. A second, distant state-2 burg (cell 2) keeps the
 * target from being treated as "cornered" (targetBurgsOnLandmass.length === 1).
 */
function makeFrontierPack(overrides: {
  defenderBurgPopulation: number;
  defenderLocalRegimentPower?: number;
  defenderBulkRegimentPower: number;
  attackerPower: number;
  fortified: boolean;
}): PackedGraph {
  const { defenderBurgPopulation, defenderLocalRegimentPower, defenderBulkRegimentPower, attackerPower, fortified } =
    overrides;

  const defenderMilitary = [
    // A huge army stationed far from the border burg — must NOT count as its defense.
    { i: 0, a: defenderBulkRegimentPower, x: 100000, y: 100000, u: { infantry: defenderBulkRegimentPower }, state: 2 }
  ];
  if (defenderLocalRegimentPower) {
    defenderMilitary.push({
      i: 1,
      a: defenderLocalRegimentPower,
      x: 10,
      y: 0, // co-located with the target burg
      u: { infantry: defenderLocalRegimentPower },
      state: 2
    });
  }

  return {
    cells: {
      i: [0, 1],
      h: [50, 50],
      c: [[1], [0]],
      state: [1, 2],
      f: [1, 1, 1], // shared landmass, plus an entry for the second (unconnected) defender burg's cell
      p: [
        [0, 0],
        [10, 0]
      ]
    },
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      {
        i: 1,
        name: "Attacker",
        diplomacy: [undefined, "x", "Enemy"],
        military: [{ i: 0, a: attackerPower, x: 0, y: 0, u: { infantry: attackerPower }, state: 1 }]
      },
      {
        i: 2,
        name: "Defender",
        diplomacy: [undefined, "Enemy", "x"],
        military: defenderMilitary
      }
    ],
    burgs: [
      { i: 0, cell: -1, x: 0, y: 0 }, // unused placeholder index
      {
        i: 1,
        cell: 1,
        x: 10,
        y: 0,
        state: 2,
        population: defenderBurgPopulation,
        citadel: fortified ? 1 : 0,
        walls: fortified ? 1 : 0
      },
      { i: 2, cell: 2, x: 500, y: 500, state: 2, population: 1 }
    ],
    characters: []
  } as unknown as PackedGraph;
}

describe("StrategicPlannerGenerator.generate", () => {
  const planner = new StrategicPlannerGenerator();

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1000 } as never;
    simulationContext.currentYear = 1000;
    simulationContext.strategicGoals = {};
    simulationContext.intelligence = {
      1: {
        2: {
          estimatedMilitaryPower: 999999,
          estimatedWealth: 0,
          lastUpdatedYear: 1000,
          accuracyLevel: "accurate",
          hiddenBySpymaster: false
        }
      }
    };
  });

  afterEach(() => {
    clearNobilityContext();
  });

  it("plans an attack on a weakly-garrisoned border burg even though the defender's total army is far larger", () => {
    // Defender's real national total is ~100,010, all but 10 of it sitting far from this
    // burg. The old code used the national total as "perceived defense" and made every
    // target look impregnable; the fix estimates defense from what's actually nearby.
    worldContext.pack = makeFrontierPack({
      defenderBurgPopulation: 20, // cityGarrison = 1
      defenderLocalRegimentPower: 10,
      defenderBulkRegimentPower: 100000,
      attackerPower: 100,
      fortified: false
    });

    planner.generate();

    const goals = simulationContext.strategicGoals[1];
    expect(goals).toHaveLength(1);
    expect(goals[0].targetBurg).toBe(1);
    expect(goals[0].targetState).toBe(2);
  });

  it("does not plan an attack when the local garrison alone already beats the attacker", () => {
    worldContext.pack = makeFrontierPack({
      defenderBurgPopulation: 20,
      defenderLocalRegimentPower: 10000, // now genuinely well-defended locally
      defenderBulkRegimentPower: 100000,
      attackerPower: 100,
      fortified: false
    });

    planner.generate();

    expect(simulationContext.strategicGoals[1]).toHaveLength(0);
  });

  it("requires only a modest edge against an unfortified target but the full 3x ratio against a fortified one", () => {
    // Local defense ≈ 50 (city garrison only, no local regiment). Attacker has 100.
    // 100 clears the field ratio (50 * 1.3 = 65) but not the siege ratio (50 * 3 = 150).
    const unfortified = makeFrontierPack({
      defenderBurgPopulation: 1000,
      defenderBulkRegimentPower: 100000,
      attackerPower: 100,
      fortified: false
    });
    worldContext.pack = unfortified;
    planner.generate();
    expect(simulationContext.strategicGoals[1]).toHaveLength(1);

    simulationContext.strategicGoals = {};
    const fortified = makeFrontierPack({
      defenderBurgPopulation: 1000,
      defenderBulkRegimentPower: 100000,
      attackerPower: 100,
      fortified: true
    });
    worldContext.pack = fortified;
    planner.generate();
    expect(simulationContext.strategicGoals[1]).toHaveLength(0);
  });
});

/**
 * State 1's port (cell 0) and state 2's port (cell 2, the "lost" burg state 1 wants back)
 * are on separate, unconnected landmasses (cells.c is empty everywhere — no land border
 * exists between them at all, so analyzeFrontiers() alone would never see this pair). They
 * are linked only by a searoutes route through water cell 1, when `withRoute` is true.
 */
function makeSeaFrontierPack(overrides: { withRoute: boolean; attackerNavalPower: number }): PackedGraph {
  const { withRoute, attackerNavalPower } = overrides;

  return {
    cells: {
      i: [0, 1, 2],
      h: [50, 0, 50],
      c: [[], [], []], // no land adjacency anywhere — isolates this scenario to the sea path
      state: [1, 0, 2],
      f: [1, 0, 5],
      p: [
        [0, 0],
        [50, 50],
        [100, 0]
      ]
    },
    states: [
      { i: 0, name: "Neutrals", diplomacy: [] },
      {
        i: 1,
        name: "Attacker",
        diplomacy: [undefined, "x", "Enemy"],
        military: [
          { i: 0, a: attackerNavalPower, x: 0, y: 0, cell: 0, n: 1, u: { fleet: attackerNavalPower }, state: 1 }
        ]
      },
      { i: 2, name: "Defender", diplomacy: [undefined, "Enemy", "x"], military: [] }
    ],
    burgs: [
      { i: 0, cell: -1, x: 0, y: 0 }, // unused placeholder index
      { i: 1, cell: 0, x: 0, y: 0, state: 1, port: 1, population: 100 },
      { i: 2, cell: 2, x: 100, y: 0, state: 2, port: 1, population: 20 }
    ],
    routes: withRoute
      ? [
          {
            i: 0,
            group: "searoutes",
            feature: 1,
            points: [
              [0, 0, 0],
              [50, 50, 1],
              [100, 0, 2]
            ]
          }
        ]
      : [],
    characters: []
  } as unknown as PackedGraph;
}

describe("StrategicPlannerGenerator.generate — sea frontiers", () => {
  const planner = new StrategicPlannerGenerator();

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1000 } as never;
    simulationContext.currentYear = 1000;
    simulationContext.strategicGoals = {};
    simulationContext.intelligence = {
      1: {
        2: {
          estimatedMilitaryPower: 999999,
          estimatedWealth: 0,
          lastUpdatedYear: 1000,
          accuracyLevel: "accurate",
          hiddenBySpymaster: false
        }
      }
    };
  });

  afterEach(() => {
    clearNobilityContext();
  });

  it("plans a retake of an enemy-held port reachable only by a charted sea route", () => {
    worldContext.pack = makeSeaFrontierPack({ withRoute: true, attackerNavalPower: 50 });

    planner.generate();

    const goals = simulationContext.strategicGoals[1];
    expect(goals).toHaveLength(1);
    expect(goals[0].targetBurg).toBe(2);
    expect(goals[0].targetState).toBe(2);
  });

  it("plans no invasion at all when no charted sea route connects the two ports", () => {
    worldContext.pack = makeSeaFrontierPack({ withRoute: false, attackerNavalPower: 50 });

    planner.generate();

    expect(simulationContext.strategicGoals[1] ?? []).toHaveLength(0);
  });
});

describe("StrategicPlannerGenerator.generate — reclaiming a historically-own burg (docs/plan/strategy.md)", () => {
  const planner = new StrategicPlannerGenerator();

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1000 } as never;
    simulationContext.currentYear = 1000;
    simulationContext.strategicGoals = {};
    simulationContext.intelligence = {
      1: {
        2: {
          estimatedMilitaryPower: 1,
          estimatedWealth: 0,
          lastUpdatedYear: 1000,
          accuracyLevel: "accurate",
          hiddenBySpymaster: false
        }
      }
    };
  });

  afterEach(() => {
    clearNobilityContext();
  });

  it("prefers a farther historically-own burg over a closer never-owned one", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1, 2],
        h: [50, 50, 50],
        c: [[1], [0], []],
        state: [1, 2, 2],
        f: [1, 1, 1],
        p: [
          [0, 0],
          [10, 0],
          [50, 0]
        ]
      },
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Attacker",
          diplomacy: [undefined, "x", "Enemy"],
          military: [{ i: 0, a: 100000, x: 0, y: 0, u: { infantry: 100000 }, state: 1 }]
        },
        { i: 2, name: "Defender", diplomacy: [undefined, "Enemy", "x"], military: [] }
      ],
      burgs: [
        { i: 0, cell: -1, x: 0, y: 0 },
        { i: 1, cell: 1, x: 10, y: 0, state: 2, population: 10 }, // closer, never owned by Attacker
        { i: 2, cell: 2, x: 50, y: 0, state: 2, population: 10, stateHistory: [1, 2] } // farther, historically Attacker's
      ],
      characters: []
    } as unknown as PackedGraph;

    planner.generate();

    const goals = simulationContext.strategicGoals[1];
    expect(goals).toHaveLength(1);
    expect(goals[0].targetBurg).toBe(2);
  });
});

describe("StrategicPlannerGenerator.advanceTension — stale goalTargetBurg cleanup", () => {
  const planner = new StrategicPlannerGenerator();

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearNobilityContext();
  });

  it("clears a regiment's goalTargetBurg tag once its target burg is already owned by the state", () => {
    const regiment = { i: 0, a: 100, state: 1, goalTargetBurg: 1, x: 0, y: 0, u: {} };
    worldContext.pack = {
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Attacker", diplomacy: [undefined, "x"], military: [regiment] }
      ],
      burgs: [
        { i: 0, cell: -1 },
        { i: 1, cell: 0, state: 1 }
      ], // already owned by state 1
      characters: []
    } as unknown as PackedGraph;

    simulationContext.strategicGoals = {
      1: [
        {
          targetBurg: 1,
          targetState: 2,
          type: "siege",
          tension: 40,
          expectedCasualties: "moderate",
          justification: "border_expansion",
          requiredAttackForce: 10
        }
      ]
    };

    planner.advanceTension();

    expect(simulationContext.strategicGoals[1]).toHaveLength(0);
    expect((regiment as unknown as { goalTargetBurg?: number }).goalTargetBurg).toBeUndefined();
  });
});

describe("StrategicPlannerGenerator.getActiveSiegeTargets", () => {
  const planner = new StrategicPlannerGenerator();

  it("returns only goals that have reached tension 100, keyed by attacker state", () => {
    simulationContext.strategicGoals = {
      1: [
        {
          targetBurg: 5,
          targetState: 2,
          type: "siege",
          tension: 100,
          expectedCasualties: "moderate",
          justification: "x",
          requiredAttackForce: 1
        },
        {
          targetBurg: 6,
          targetState: 2,
          type: "siege",
          tension: 40,
          expectedCasualties: "moderate",
          justification: "x",
          requiredAttackForce: 1
        }
      ],
      3: [
        {
          targetBurg: 9,
          targetState: 4,
          type: "siege",
          tension: 100,
          expectedCasualties: "moderate",
          justification: "x",
          requiredAttackForce: 1
        }
      ]
    };

    const targets = planner.getActiveSiegeTargets();

    expect(targets.get(1)).toEqual([5]);
    expect(targets.get(3)).toEqual([9]);
  });

  it("omits a state entirely once none of its goals are committed", () => {
    simulationContext.strategicGoals = {
      1: [
        {
          targetBurg: 5,
          targetState: 2,
          type: "siege",
          tension: 40,
          expectedCasualties: "moderate",
          justification: "x",
          requiredAttackForce: 1
        }
      ]
    };

    expect(planner.getActiveSiegeTargets().has(1)).toBe(false);
  });
});
