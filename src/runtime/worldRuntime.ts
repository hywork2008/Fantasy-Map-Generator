import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import {
  applyPresentationPatch,
  createPresentationData,
  type PresentationData,
  type PresentationPatch,
  presentationData
} from "./presentationData";

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
  /** Persisted rendering rules; DOM and deck.gl objects are intentionally absent. */
  readonly presentation: Readonly<PresentationData>;
}

export interface WorldCommit<T> {
  readonly result: T;
  readonly changes: WorldChangeSet;
}

export interface LegacyMutationOutcome<T> {
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

export interface MoveMarkerRequest {
  readonly markerId: number;
  readonly x: number;
  readonly y: number;
  /** Omit during an in-progress drag; commit the cell on drag end. */
  readonly cellId?: number;
}

export interface MoveMarkerCommand {
  readonly type: "marker.move";
  readonly payload: MoveMarkerRequest;
}

export interface MoveBurgRequest {
  readonly burgId: number;
  readonly cellId: number;
  readonly stateId: number;
  readonly x: number;
  readonly y: number;
}

export interface MoveBurgCommand {
  readonly type: "burg.move";
  readonly payload: MoveBurgRequest;
}

export interface MoveRegimentRequest {
  readonly stateId: number;
  readonly regimentId: number;
  readonly x: number;
  readonly y: number;
}

export interface MoveRegimentCommand {
  readonly type: "regiment.move";
  readonly payload: MoveRegimentRequest;
}

export interface PresentationPatchCommand {
  readonly type: "presentation.patch";
  readonly payload: PresentationPatch;
}

export type PositionCommand = MoveMarkerCommand | MoveBurgCommand | MoveRegimentCommand;
export type WorldCommand<T> = LegacyMutationCommand<T> | PositionCommand | PresentationPatchCommand;

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
    private readonly simulation: SimulationContext,
    private readonly presentation: PresentationData
  ) {}

  read(): WorldReadView {
    return {
      revision: this.revision,
      topicRevisions: { ...this.topicRevisions },
      world: this.world,
      simulation: this.simulation,
      presentation: this.presentation
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
      const outcome = this.getOutcome(command);
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

  private getOutcome<T>(command: WorldCommand<T>): LegacyMutationOutcome<T> {
    if (command.type === "legacy.mutation") return command.execute();

    if (command.type === "presentation.patch") {
      const stylesChanged = Object.entries(command.payload.styles ?? {}).some(([selector, attributes]) =>
        Object.entries(attributes).some(
          ([attribute, value]) => this.presentation.styles[selector]?.[attribute] !== value
        )
      );
      const layersChanged = Object.entries(command.payload.activeLayers ?? {}).some(
        ([id, visible]) => this.presentation.activeLayers[id] !== visible
      );
      const changed = applyPresentationPatch(this.presentation, command.payload);
      return {
        result: undefined as T,
        topics: changed
          ? [
              ...(stylesChanged ? (["presentation.styles"] as const) : []),
              ...(layersChanged ? (["presentation.layers"] as const) : [])
            ]
          : []
      };
    }

    if (command.type === "marker.move") {
      const { markerId, x, y, cellId } = command.payload;
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("marker.move requires finite coordinates");
      const marker = this.world.pack.markers.find(item => item.i === markerId);
      if (!marker) throw new Error(`marker.move could not find marker ${markerId}`);

      marker.x = x;
      marker.y = y;
      if (cellId !== undefined) marker.cell = cellId;
      return { result: undefined as T, topics: ["map.annotations"] };
    }

    if (command.type === "burg.move") {
      const { burgId, cellId, stateId, x, y } = command.payload;
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("burg.move requires finite coordinates");
      const burg = this.world.pack.burgs[burgId];
      const cells = this.world.pack.cells;
      if (!burg?.i) throw new Error(`burg.move could not find burg ${burgId}`);
      if (!Number.isInteger(cellId) || cellId < 0 || cellId >= cells.burg.length) {
        throw new Error(`burg.move received invalid cell ${cellId}`);
      }
      if (!this.world.pack.states[stateId]) throw new Error(`burg.move could not find state ${stateId}`);

      cells.burg[burg.cell] = 0;
      cells.burg[cellId] = burgId;
      burg.cell = cellId;
      burg.state = stateId;
      burg.x = x;
      burg.y = y;
      if (burg.capital) this.world.pack.states[stateId].center = cellId;
      return { result: undefined as T, topics: ["map.settlements"] };
    }

    const { stateId, regimentId, x, y } = command.payload;
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("regiment.move requires finite coordinates");
    const regiment = this.world.pack.states[stateId]?.military?.find(item => item.i === regimentId);
    if (!regiment) throw new Error(`regiment.move could not find regiment ${stateId}/${regimentId}`);

    regiment.x = x;
    regiment.y = y;
    return { result: undefined as T, topics: ["simulation.military"] };
  }
}

export function createWorldRuntime(
  world: WorldContext,
  simulation: SimulationContext,
  presentation: PresentationData = createPresentationData()
): WorldRuntime {
  return new LegacyWorldRuntime(world, simulation, presentation);
}

/** The one runtime instance for the current in-memory world. */
export const worldRuntime = createWorldRuntime(worldContext, simulationContext, presentationData);

/**
 * Transitional private mutation bridge. Existing synchronous writers use this
 * until they have a first-class typed command implementation.
 */
export function legacyMutation<T>(execute: () => LegacyMutationOutcome<T>): WorldCommit<T> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "legacy.mutation", execute });
}

/** Phase 2 compatibility commands for bounded, ID-addressed position edits. */
export function moveMarker(request: MoveMarkerRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "marker.move", payload: request });
}

export function moveBurg(request: MoveBurgRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "burg.move", payload: request });
}

export function moveRegiment(request: MoveRegimentRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "regiment.move", payload: request });
}

/** Phase 3 command for persisted style and layer-visibility changes. */
export function patchPresentation(patch: PresentationPatch): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "presentation.patch", payload: patch });
}
