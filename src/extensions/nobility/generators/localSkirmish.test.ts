import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { LocalSkirmishGenerator } from "./localSkirmish";

/** Marks state `attackerId` as genuinely tense toward `targetStateId` (hasStrategicTension). */
function giveStrategicGoal(attackerId: number, targetStateId: number, targetBurg = 0) {
  simulationContext.strategicGoals = {
    [attackerId]: [
      {
        targetBurg,
        targetState: targetStateId,
        type: "siege",
        tension: 80,
        expectedCasualties: "moderate",
        justification: "x",
        requiredAttackForce: 0
      }
    ]
  };
}

describe("LocalSkirmishGenerator.resolve", () => {
  const skirmish = new LocalSkirmishGenerator();

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    simulationContext.strategicGoals = {};
    // calculateRegimentPower looks up each unit's `.power` by name — without this, every
    // regiment's power is 0 regardless of troop count, since the test fixtures below don't
    // otherwise touch worldContext.options.
    worldContext.options.military = [
      { name: "infantry", power: 1 },
      { name: "cavalry", power: 1 },
      { name: "fleet", power: 1 }
    ] as unknown as typeof worldContext.options.military;
  });

  afterEach(() => {
    clearNobilityContext();
    simulationContext.strategicGoals = {};
  });

  it("annihilates an isolated garrison overwhelmed by a co-located hostile army, and captures its burg", () => {
    // Mirrors the reported scenario: a tiny exclave garrison (868 troops) shares a cell with
    // a much larger enemy division (58,133 troops), both already at declared war, but
    // the state-level tension clock would take years to ever resolve it.
    worldContext.pack = {
      cells: {
        burg: [1, 0],
        state: [5, 5]
      },
      burgs: [
        { i: 0, cell: -1, x: 0, y: 0 }, // unused placeholder index
        { i: 1, cell: 0, x: 620, y: 570, state: 5, population: 15, removed: false }
      ],
      characters: [],
      states: Object.assign([], {
        0: { i: 0, name: "Neutrals", diplomacy: [] },
        5: {
          i: 5,
          name: "Defender",
          diplomacy: Object.assign([], { 5: "x", 13: "Enemy" }),
          military: [
            {
              i: 0,
              a: 868,
              x: 620,
              y: 570,
              u: { infantry: 859, cavalry: 9 },
              state: 5,
              cell: 0,
              name: "Kautongwu Garrison"
            }
          ]
        },
        13: {
          i: 13,
          name: "Attacker",
          diplomacy: Object.assign([], { 5: "Enemy", 13: "x" }),
          military: [
            // Same packed cell as the garrison — required for background combat.
            { i: 0, a: 58133, x: 625, y: 575, u: { infantry: 58133 }, state: 13, cell: 0, name: "1st Division" }
          ]
        }
      })
    } as unknown as PackedGraph;
    giveStrategicGoal(13, 5, 1);

    const occurred = skirmish.resolve(0, 0, 1);

    expect(occurred).toBe(true);
    const defender = worldContext.pack.states[5] as unknown as { military: { a: number }[] };
    const attacker = worldContext.pack.states[13] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(0);
    expect(attacker.military[0].a).toBeGreaterThan(0);
    expect(attacker.military[0].a).toBeLessThan(58133);

    const burg = worldContext.pack.burgs[1] as unknown as { state: number };
    expect(burg.state).toBe(13);
  });

  it("does not touch regiments on different cells, even when close in map coordinates", () => {
    worldContext.pack = {
      cells: { burg: [] },
      burgs: [],
      characters: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Defender",
          diplomacy: [undefined, "x", "Enemy"],
          military: [{ i: 0, a: 10, x: 0, y: 0, u: { infantry: 10 }, state: 1, cell: 0, name: "Weak" }]
        },
        {
          i: 2,
          name: "Attacker",
          diplomacy: [undefined, "Enemy", "x"],
          // Adjacent cell, tiny Euclidean distance — must still not fight without co-location.
          military: [{ i: 0, a: 10000, x: 1, y: 0, u: { infantry: 10000 }, state: 2, cell: 1, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;
    giveStrategicGoal(2, 1);

    expect(skirmish.resolve(0, 0, 1)).toBe(false);
    const defender = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(10);
  });

  it("does not fire between states that are not at declared war", () => {
    worldContext.pack = {
      cells: { burg: [] },
      burgs: [],
      characters: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Defender",
          diplomacy: [undefined, "x", "Rival"],
          military: [{ i: 0, a: 10, x: 0, y: 0, u: { infantry: 10 }, state: 1, cell: 0, name: "Weak" }]
        },
        {
          i: 2,
          name: "Attacker",
          diplomacy: [undefined, "Rival", "x"],
          military: [{ i: 0, a: 10000, x: 0, y: 0, u: { infantry: 10000 }, state: 2, cell: 0, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;
    giveStrategicGoal(2, 1);

    expect(skirmish.resolve(0, 0, 1)).toBe(false);
    const defender = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(10);
  });

  it("does not fire on an Enemy-labeled pair with no active strategic tension", () => {
    // Same overwhelming force ratio and co-location as the Kautongwu scenario, but no
    // StrategicGoal exists for this pair — a leftover/flavor Relations History label alone
    // must not be enough to trigger an instant, un-paced annihilation.
    worldContext.pack = {
      cells: { burg: [] },
      burgs: [],
      characters: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Defender",
          diplomacy: [undefined, "x", "Enemy"],
          military: [{ i: 0, a: 10, x: 0, y: 0, u: { infantry: 10 }, state: 1, cell: 0, name: "Weak" }]
        },
        {
          i: 2,
          name: "Attacker",
          diplomacy: [undefined, "Enemy", "x"],
          military: [{ i: 0, a: 10000, x: 0, y: 0, u: { infantry: 10000 }, state: 2, cell: 0, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;
    // Deliberately not calling giveStrategicGoal() here.

    expect(skirmish.resolve(0, 0, 1)).toBe(false);
    const defender = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(10);
  });

  it("never annihilates or is annihilated by a capital guard", () => {
    worldContext.pack = {
      cells: { burg: [] },
      burgs: [],
      characters: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Defender",
          diplomacy: [undefined, "x", "Enemy"],
          military: [
            {
              i: 0,
              a: 10,
              x: 0,
              y: 0,
              u: { infantry: 10 },
              state: 1,
              cell: 0,
              name: "Royal Guard",
              isCapitalGuard: true
            }
          ]
        },
        {
          i: 2,
          name: "Attacker",
          diplomacy: [undefined, "Enemy", "x"],
          military: [{ i: 0, a: 10000, x: 0, y: 0, u: { infantry: 10000 }, state: 2, cell: 0, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;
    giveStrategicGoal(2, 1);

    expect(skirmish.resolve(0, 0, 1)).toBe(false);
    const defender = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(10);
  });

  it("does not annihilate a regiment that has a friendly regiment nearby able to reinforce it", () => {
    worldContext.pack = {
      cells: { burg: [] },
      burgs: [],
      characters: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Defender",
          diplomacy: [undefined, "x", "Enemy"],
          military: [
            { i: 0, a: 10, x: 0, y: 0, u: { infantry: 10 }, state: 1, cell: 0, name: "Weak" },
            // Within regimentReinforcementRadius.infantry (50) of the Weak regiment above.
            { i: 1, a: 500, x: 40, y: 0, u: { infantry: 500 }, state: 1, cell: 2, name: "Relief Force" }
          ]
        },
        {
          i: 2,
          name: "Attacker",
          diplomacy: [undefined, "Enemy", "x"],
          military: [{ i: 0, a: 10000, x: 0, y: 0, u: { infantry: 10000 }, state: 2, cell: 0, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;
    giveStrategicGoal(2, 1);

    expect(skirmish.resolve(0, 0, 1)).toBe(false);
    const defender = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(10);
    expect(defender.military[1].a).toBe(500);
  });

  it("caps a winning regiment at one kill per resolve() call, even with more valid targets on the same cell", () => {
    // Attacker's single regiment shares a cell with two separate weak enemy regiments
    // belonging to two *different* states — each is isolated on its own terms (no sibling of
    // its own state nearby), so both are eligible, but the attacker can still only fight once
    // per resolve() call.
    worldContext.pack = {
      cells: { burg: [] },
      burgs: [],
      characters: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Defender A",
          diplomacy: [undefined, "x", undefined, "Enemy"],
          military: [{ i: 0, a: 868, x: 0, y: 0, u: { infantry: 868 }, state: 1, cell: 0, name: "Garrison A" }]
        },
        {
          i: 2,
          name: "Defender B",
          diplomacy: [undefined, undefined, "x", "Enemy"],
          military: [{ i: 0, a: 868, x: 1, y: 0, u: { infantry: 868 }, state: 2, cell: 0, name: "Garrison B" }]
        },
        {
          i: 3,
          name: "Attacker",
          diplomacy: [undefined, "Enemy", "Enemy", "x"],
          military: [{ i: 0, a: 58133, x: 0, y: 0, u: { infantry: 58133 }, state: 3, cell: 0, name: "1st Division" }]
        }
      ]
    } as unknown as PackedGraph;
    giveStrategicGoal(3, 1);
    simulationContext.strategicGoals[3]!.push({
      targetBurg: 0,
      targetState: 2,
      type: "siege",
      tension: 80,
      expectedCasualties: "moderate",
      justification: "x",
      requiredAttackForce: 0
    });

    expect(skirmish.resolve(0, 0, 1)).toBe(true);
    const defenderA = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    const defenderB = worldContext.pack.states[2] as unknown as { military: { a: number }[] };
    // Exactly one of the two garrisons falls this tick — the attacker's lone regiment
    // already fought once and can't chain into the second target in the same call.
    const survivors = [...defenderA.military, ...defenderB.military].filter(r => r.a > 0).length;
    expect(survivors).toBe(1);
  });

  // A fleet (state 13) vs a coastal garrison (state 5) — same overwhelming force ratio as the
  // Kautongwu scenario, but the attacker is naval this time. Combat requires co-location on
  // the same packed cell (not merely a charted sea-route link at distance).
  function makeNavalSkirmishPack(overrides: { sameCell: boolean }): PackedGraph {
    const { sameCell } = overrides;

    return {
      cells: { burg: [1, 0], state: [5, 13] },
      burgs: [
        { i: 0, cell: -1, x: 0, y: 0 }, // unused placeholder index
        { i: 1, cell: 0, x: 0, y: 0, state: 5, population: 15, removed: false }
      ],
      characters: [],
      states: Object.assign([], {
        0: { i: 0, name: "Neutrals", diplomacy: [] },
        5: {
          i: 5,
          name: "Defender",
          diplomacy: Object.assign([], { 5: "x", 13: "Enemy" }),
          military: [
            { i: 0, a: 868, x: 0, y: 0, u: { infantry: 859, cavalry: 9 }, state: 5, cell: 0, name: "Port Garrison" }
          ]
        },
        13: {
          i: 13,
          name: "Attacker",
          diplomacy: Object.assign([], { 5: "Enemy", 13: "x" }),
          military: [
            {
              i: 0,
              a: 58133,
              x: sameCell ? 0 : 100,
              y: 0,
              u: { fleet: 58133 },
              state: 13,
              cell: sameCell ? 0 : 1,
              n: 1,
              name: "1st Fleet"
            }
          ]
        }
      }),
      routes: [
        {
          i: 0,
          group: "searoutes",
          feature: 1,
          points: [
            [100, 0, 1],
            [0, 0, 0]
          ]
        }
      ]
    } as unknown as PackedGraph;
  }

  it("lets a fleet annihilate a coastal garrison when they share a cell", () => {
    worldContext.pack = makeNavalSkirmishPack({ sameCell: true });
    giveStrategicGoal(13, 5, 1);

    const occurred = skirmish.resolve(0, 0, 1);

    expect(occurred).toBe(true);
    const defender = worldContext.pack.states[5] as unknown as { military: { a: number }[] };
    const attacker = worldContext.pack.states[13] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(0);
    expect(attacker.military[0].a).toBeGreaterThan(0);

    const burg = worldContext.pack.burgs[1] as unknown as { state: number };
    expect(burg.state).toBe(13);
  });

  it("does not let a fleet fight a coastal garrison on a different cell, even with a charted sea route", () => {
    worldContext.pack = makeNavalSkirmishPack({ sameCell: false });
    giveStrategicGoal(13, 5, 1);

    expect(skirmish.resolve(0, 0, 1)).toBe(false);
    const defender = worldContext.pack.states[5] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(868);
  });
});
