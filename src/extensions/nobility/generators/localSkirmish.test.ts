import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { LocalSkirmishGenerator } from "./localSkirmish";

describe("LocalSkirmishGenerator.resolve", () => {
  const skirmish = new LocalSkirmishGenerator();

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearNobilityContext();
  });

  it("annihilates an isolated garrison overwhelmed by an adjacent hostile army, and captures its burg", () => {
    // Mirrors the reported scenario: a tiny exclave garrison (868 troops) sits right next
    // to a much larger enemy division (58,133 troops), both already at declared war, but
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
            { i: 0, a: 58133, x: 640, y: 580, u: { infantry: 58133 }, state: 13, cell: 1, name: "1st Division" }
          ]
        }
      })
    } as unknown as PackedGraph;

    const occurred = skirmish.resolve();

    expect(occurred).toBe(true);
    const defender = worldContext.pack.states[5] as unknown as { military: { a: number }[] };
    const attacker = worldContext.pack.states[13] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(0);
    expect(attacker.military[0].a).toBeGreaterThan(0);
    expect(attacker.military[0].a).toBeLessThan(58133);

    const burg = worldContext.pack.burgs[1] as unknown as { state: number };
    expect(burg.state).toBe(13);
  });

  it("does not touch regiments outside the contact radius", () => {
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
          military: [{ i: 0, a: 10000, x: 5000, y: 5000, u: { infantry: 10000 }, state: 2, cell: 1, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;

    expect(skirmish.resolve()).toBe(false);
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
          military: [{ i: 0, a: 10000, x: 0, y: 0, u: { infantry: 10000 }, state: 2, cell: 1, name: "Strong" }]
        }
      ]
    } as unknown as PackedGraph;

    expect(skirmish.resolve()).toBe(false);
    const defender = worldContext.pack.states[1] as unknown as { military: { a: number }[] };
    expect(defender.military[0].a).toBe(10);
  });
});
