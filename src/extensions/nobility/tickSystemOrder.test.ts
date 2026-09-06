import { describe, expect, it } from "vitest";
import { createSimulationSystemRegistry, type SimulationSystem } from "../../generators/simulationSystem";
import { NOBILITY_TICK_SYSTEM_IDS, NOBILITY_TICK_TOPIC_CONTRACTS } from "./tickSystemIds";

/**
 * The nobility tick is a linear chain of `after`-ordered systems (index.tsx's
 * `registerNobilityTickSystem`) rather than one run() with the order implied by call-site
 * position — docs/plan/advance-time-history-mode.md Phase H1, mirroring the economy split.
 *
 * The chain is read from tickSystemIds.ts — the list index.tsx registers against — so this
 * cannot drift from the real order the way a copied array would.
 */

function chainSystem(id: string, after?: string[]): SimulationSystem {
  return { id, phase: "military", reads: [], writes: [], after, cadence: { every: 1 }, run: () => {} };
}

function registerChain(registry: ReturnType<typeof createSimulationSystemRegistry>): (() => void)[] {
  const undo: (() => void)[] = [];
  let previous: string | null = null;
  for (const id of NOBILITY_TICK_SYSTEM_IDS) {
    undo.push(registry.register(chainSystem(id, previous ? [previous] : undefined)));
    previous = id;
  }
  return undo;
}

describe("nobility tick system chain", () => {
  it("gives every extracted step a distinct, non-empty topic contract", () => {
    expect(Object.keys(NOBILITY_TICK_TOPIC_CONTRACTS)).toEqual([...NOBILITY_TICK_SYSTEM_IDS]);

    for (const id of NOBILITY_TICK_SYSTEM_IDS) {
      const { reads, writes } = NOBILITY_TICK_TOPIC_CONTRACTS[id];
      expect(reads.length).toBeGreaterThan(0);
      expect(writes.length).toBeGreaterThan(0);
      expect(new Set(reads).size).toBe(reads.length);
      expect(new Set(writes).size).toBe(writes.length);
    }
  });

  it("keeps the lifecycle → appointments → travel → governance → strategy → combat → march order", () => {
    // The split must not reorder the steps the monolithic run() executed in this sequence:
    // successions decide who is available before appointments fill vacancies, governance spends
    // before war planning commits, and armies march only after this tick's battles resolved.
    expect([...NOBILITY_TICK_SYSTEM_IDS]).toEqual([
      "nobility.characterLifecycle",
      "nobility.appointments",
      "nobility.playerTravel",
      "nobility.frontierGovernance",
      "nobility.strategy",
      "nobility.combat",
      "nobility.regimentMovement",
      "nobility.finalize"
    ]);
  });

  it("does not retain nobility.tick's blanket topic contract", () => {
    // Player travel only moves a character; it must not claim politics/military write rights.
    expect(NOBILITY_TICK_TOPIC_CONTRACTS["nobility.playerTravel"]).toEqual({
      reads: ["map.settlements", "extension.characters"],
      writes: ["extension.characters"]
    });
    expect(NOBILITY_TICK_TOPIC_CONTRACTS["nobility.frontierGovernance"].writes).not.toContain("map.politics");
  });

  it("declares the topics each step marks: borders and military stay with combat and marching", () => {
    for (const id of ["nobility.combat", "nobility.regimentMovement"] as const) {
      const { writes } = NOBILITY_TICK_TOPIC_CONTRACTS[id];
      expect(writes).toContain("map.politics");
      expect(writes).toContain("map.settlements");
      expect(writes).toContain("simulation.military");
    }
    // finalize marks these unconditionally on every tick, whichever steps a mask disabled.
    expect(NOBILITY_TICK_TOPIC_CONTRACTS["nobility.finalize"].writes).toEqual([
      "extension.characters",
      "extension.nobility"
    ]);
  });

  it("resolves to registration order", () => {
    const registry = createSimulationSystemRegistry();
    registerChain(registry);

    expect(registry.list().map(system => system.id)).toEqual([...NOBILITY_TICK_SYSTEM_IDS]);
  });

  it("requires cleanup() to unregister in reverse, since each step is depended on by the next", () => {
    const registry = createSimulationSystemRegistry();
    const undo = registerChain(registry);

    expect(() => undo[0]()).toThrow(/cannot be removed/);
    expect(() => {
      for (const unregister of [...undo].reverse()) unregister();
    }).not.toThrow();
    expect(registry.list()).toEqual([]);
  });
});
