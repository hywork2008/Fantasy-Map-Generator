import { describe, expect, it } from "vitest";
import { createSimulationSystemRegistry, type SimulationSystem } from "../../generators/simulationSystem";
import { ECONOMY_TICK_SYSTEM_IDS } from "./tickSystemIds";

/**
 * The economy tick is a linear chain of `after`-ordered systems (index.tsx's
 * `registerEconomyTickSystem`) rather than one run() with the order buried in comments —
 * docs/plan/economy-coupling-audit.md T1 step 1. Two properties that refactor depends on are
 * host-registry behaviour, not economy code, so assert them here rather than assuming them.
 *
 * The chain is read from tickSystemIds.ts — the list index.tsx registers against — so this
 * cannot drift from the real order the way a copied array would.
 */

function chainSystem(id: string, after?: string[]): SimulationSystem {
  return { id, phase: "economy", reads: [], writes: [], after, cadence: { every: 1 }, run: () => {} };
}

function registerChain(registry: ReturnType<typeof createSimulationSystemRegistry>): (() => void)[] {
  const undo: (() => void)[] = [];
  let previous: string | null = null;
  for (const id of ECONOMY_TICK_SYSTEM_IDS) {
    undo.push(registry.register(chainSystem(id, previous ? [previous] : undefined)));
    previous = id;
  }
  return undo;
}

describe("economy tick system chain", () => {
  it("resolves to registration order and still runs before shipbuilding.tick", () => {
    const registry = createSimulationSystemRegistry();
    // Shipbuilding declares no ordering edge to economy; it stays last only because every
    // economy id sorts lexically before "shipbuilding.tick" in the registry's tie-break, which
    // is what keeps forest regrowth ahead of Shipbuilding's logging in the same phase.
    registry.register(chainSystem("shipbuilding.tick"));
    registerChain(registry);

    expect(registry.list().map(system => system.id)).toEqual([...ECONOMY_TICK_SYSTEM_IDS, "shipbuilding.tick"]);
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
