import type { DataTopic } from "../runtime/worldRuntime";

/** Fixed execution order for one simulation tick. */
export const simulationPhases = [
  "clock",
  "environment",
  "population",
  "economy",
  "politics",
  "military",
  "finalize"
] as const;

export type SimulationPhase = (typeof simulationPhases)[number];

/**
 * Compatibility ticks are calls to legacy `advanceTime`, not canonical calendar
 * days. `every: 2` therefore runs on ticks 1, 3, 5, and so on.
 */
export interface SimulationCadence {
  readonly every: number;
}

export interface SimulationTickDelta {
  readonly years: number;
  readonly months: number;
  readonly days: number;
}

/** Plain, DOM-free input shared by all systems in a single legacy tick. */
export interface SimulationStepContext {
  readonly tick: number;
  readonly delta: SimulationTickDelta;
}

/**
 * A synchronous simulation unit. Its declared writes are used for the
 * compatibility WorldChangeSet until TransactionWriter is introduced.
 */
export interface SimulationSystem {
  readonly id: string;
  readonly phase: SimulationPhase;
  readonly reads: readonly DataTopic[];
  readonly writes: readonly DataTopic[];
  readonly after?: readonly string[];
  readonly before?: readonly string[];
  readonly cadence: SimulationCadence;
  /** Optional compatibility label for the existing tick profiler. */
  readonly profileLabel?: string;
  run(context: SimulationStepContext): void;
}

export interface SimulationSystemRegistry {
  register(system: SimulationSystem): () => void;
  run(context: SimulationStepContext, execute?: (system: SimulationSystem) => void): readonly SimulationSystem[];
  list(): readonly SimulationSystem[];
}

class OrderedSimulationSystemRegistry implements SimulationSystemRegistry {
  private readonly systems = new Map<string, SimulationSystem>();
  private running = false;

  register(system: SimulationSystem): () => void {
    this.assertCanRegister(system);
    this.systems.set(system.id, system);

    try {
      this.resolveOrder();
    } catch (error) {
      this.systems.delete(system.id);
      throw error;
    }

    return () => {
      if (this.running) throw new Error("Simulation systems cannot be removed during a tick");
      const dependent = [...this.systems.values()].find(candidate =>
        [...(candidate.after ?? []), ...(candidate.before ?? [])].includes(system.id)
      );
      if (dependent) {
        throw new Error(`Simulation system '${system.id}' cannot be removed while '${dependent.id}' depends on it`);
      }
      this.systems.delete(system.id);
    };
  }

  run(context: SimulationStepContext, execute: (system: SimulationSystem) => void = system => system.run(context)) {
    if (this.running) throw new Error("Simulation systems cannot re-enter a tick");

    this.running = true;
    try {
      const executed: SimulationSystem[] = [];
      for (const system of this.resolveOrder()) {
        if (!runsOnTick(system.cadence, context.tick)) continue;
        execute(system);
        executed.push(system);
      }
      return executed;
    } finally {
      this.running = false;
    }
  }

  list(): readonly SimulationSystem[] {
    return this.resolveOrder();
  }

  private assertCanRegister(system: SimulationSystem): void {
    if (this.running) throw new Error("Simulation systems cannot be registered during a tick");
    if (!system.id.trim()) throw new Error("Simulation system id is required");
    if (this.systems.has(system.id)) throw new Error(`Simulation system '${system.id}' is already registered`);
    if (!Number.isInteger(system.cadence.every) || system.cadence.every < 1) {
      throw new Error(`Simulation system '${system.id}' requires a positive integer cadence`);
    }

    for (const dependencyId of [...(system.after ?? []), ...(system.before ?? [])]) {
      const dependency = this.systems.get(dependencyId);
      if (!dependency) {
        throw new Error(`Simulation system '${system.id}' references unknown dependency '${dependencyId}'`);
      }
      if (dependency.phase !== system.phase) {
        throw new Error(
          `Simulation system '${system.id}' can only order against systems in its '${system.phase}' phase`
        );
      }
    }
  }

  private resolveOrder(): SimulationSystem[] {
    const ordered: SimulationSystem[] = [];
    for (const phase of simulationPhases) {
      const phaseSystems = [...this.systems.values()].filter(system => system.phase === phase);
      ordered.push(...topologicallyOrder(phaseSystems));
    }
    return ordered;
  }
}

function runsOnTick(cadence: SimulationCadence, tick: number): boolean {
  return (tick - 1) % cadence.every === 0;
}

function topologicallyOrder(systems: readonly SimulationSystem[]): SimulationSystem[] {
  const byId = new Map(systems.map(system => [system.id, system]));
  const outgoing = new Map<string, Set<string>>(systems.map(system => [system.id, new Set<string>()]));
  const indegree = new Map<string, number>(systems.map(system => [system.id, 0]));

  const addEdge = (from: string, to: string) => {
    const targets = outgoing.get(from);
    if (!targets || targets.has(to)) return;
    targets.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };

  for (const system of systems) {
    for (const dependency of system.after ?? []) addEdge(dependency, system.id);
    for (const dependency of system.before ?? []) addEdge(system.id, dependency);
  }

  const ready = [...systems.filter(system => indegree.get(system.id) === 0).map(system => system.id)].sort();
  const result: SimulationSystem[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    const system = byId.get(id);
    if (!system) continue;
    result.push(system);
    for (const target of outgoing.get(id) ?? []) {
      const nextDegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }

  if (result.length !== systems.length) {
    const ids = systems
      .filter(system => !result.some(ordered => ordered.id === system.id))
      .map(system => system.id)
      .sort();
    throw new Error(`Simulation system dependency cycle: ${ids.join(", ")}`);
  }
  return result;
}

export function createSimulationSystemRegistry(): SimulationSystemRegistry {
  return new OrderedSimulationSystemRegistry();
}
