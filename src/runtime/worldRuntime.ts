import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";

/**
 * Coarse ownership topics used while the legacy pack/grid representation remains
 * the canonical backing store. More granular ranges and entity ids can be added
 * without changing the commit subscription seam.
 */
export type DataTopic =
  | "map.identity"
  | "map.topology"
  | "map.physical"
  | "map.politics"
  | "map.settlements"
  | "map.networks"
  | "map.annotations"
  | "simulation.clock"
  | "simulation.cells"
  | "simulation.states"
  | "simulation.burgs"
  | "simulation.military"
  | "presentation.styles"
  | "presentation.layers"
  | "presentation.labels"
  | "presentation.overlays"
  | `extension.${string}`;

export interface TopicChange {
  readonly topic: DataTopic;
  readonly kind: "replace";
}

export interface WorldChangeSet {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly fullReplace: boolean;
  readonly changes: readonly TopicChange[];
}

export interface WorldReadView {
  readonly revision: number;
  readonly topicRevisions: Readonly<Record<string, number>>;
  /**
   * Transitional trusted-core projection. It deliberately is not exposed to
   * dynamic extensions: nested values are still the mutable legacy backing data.
   */
  readonly world: Readonly<WorldContext>;
  /** Transitional trusted-core projection; see `world`. */
  readonly simulation: Readonly<SimulationContext>;
}

export interface WorldCommit<T> {
  readonly result: T;
  readonly changes: WorldChangeSet;
}

interface LegacyMutationOutcome<T> {
  readonly result: T;
  /** Empty means the operation was a no-op and must not create a commit. */
  readonly topics: readonly DataTopic[];
}

/**
 * Compatibility-only command. It keeps existing synchronous writers intact
 * while making the one resulting commit observable. New commands must be
 * added as typed domain commands, not as additional legacy mutations.
 *
 * @internal
 */
export interface LegacyMutationCommand<T> {
  readonly type: "legacy.mutation";
  readonly execute: () => LegacyMutationOutcome<T>;
}

export type WorldCommand<T> = LegacyMutationCommand<T>;

export interface WorldRuntime {
  read(): WorldReadView;
  dispatch<T>(command: WorldCommand<T>): Promise<WorldCommit<T> | null>;
  subscribe(listener: (commit: WorldCommit<unknown>) => void): () => void;
}

class LegacyWorldRuntime implements WorldRuntime {
  private revision = 0;
  private readonly topicRevisions: Record<string, number> = {};
  private readonly listeners = new Set<(commit: WorldCommit<unknown>) => void>();
  private committing = false;

  constructor(
    private readonly world: WorldContext,
    private readonly simulation: SimulationContext
  ) {}

  read(): WorldReadView {
    return {
      revision: this.revision,
      topicRevisions: { ...this.topicRevisions },
      world: this.world,
      simulation: this.simulation
    };
  }

  dispatch<T>(command: WorldCommand<T>): Promise<WorldCommit<T> | null> {
    try {
      return Promise.resolve(this.execute(command));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  subscribe(listener: (commit: WorldCommit<unknown>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @internal Synchronous bridge required by legacy callers such as advanceTime(). */
  execute<T>(command: WorldCommand<T>): WorldCommit<T> | null {
    if (this.committing) {
      throw new Error("WorldRuntime does not allow synchronous dispatch re-entry");
    }

    this.committing = true;
    try {
      const outcome = command.execute();
      const topics = [...new Set(outcome.topics)];
      if (!topics.length) return null;

      const fromRevision = this.revision;
      const toRevision = fromRevision + 1;
      const changes = topics.map(topic => ({ topic, kind: "replace" }) as const);

      for (const topic of topics) {
        this.topicRevisions[topic] = (this.topicRevisions[topic] ?? 0) + 1;
      }
      this.revision = toRevision;

      const commit: WorldCommit<T> = {
        result: outcome.result,
        changes: { fromRevision, toRevision, fullReplace: false, changes }
      };

      // A listener is isolated from its peers; it must not make a successful
      // world mutation look as though it failed.
      for (const listener of this.listeners) {
        try {
          listener(commit);
        } catch (error) {
          console.error("[WorldRuntime] Commit listener failed", error);
        }
      }

      return commit;
    } finally {
      this.committing = false;
    }
  }
}

export function createWorldRuntime(world: WorldContext, simulation: SimulationContext): WorldRuntime {
  return new LegacyWorldRuntime(world, simulation);
}

/** The one runtime instance for the current in-memory world. */
export const worldRuntime = createWorldRuntime(worldContext, simulationContext);

/**
 * Transitional private mutation bridge. Existing synchronous writers use this
 * until they have a first-class typed command implementation.
 */
export function legacyMutation<T>(execute: () => LegacyMutationOutcome<T>): WorldCommit<T> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "legacy.mutation", execute });
}
