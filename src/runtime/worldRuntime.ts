import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import type { Province, State } from "../types/models";
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
  | "simulation.rng"
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

/** Cell ownership columns that are edited as a single atomic command. */
export type CellAssignmentField = "state" | "province" | "culture" | "religion";

export interface CellAssignment {
  readonly cellId: number;
  readonly entityId: number;
}

export interface AssignCellsRequest {
  readonly field: CellAssignmentField;
  /**
   * A brush may visit one cell more than once. The final entry for a cell wins,
   * so callers can pass their collected edits without a separate de-dup pass.
   */
  readonly assignments: readonly CellAssignment[];
}

export interface AssignCellsCommand {
  readonly type: "cells.assign";
  readonly payload: AssignCellsRequest;
}

export interface RemoveStateRequest {
  readonly stateId: number;
}

export interface RemoveStateResult {
  readonly stateId: number;
  readonly removedProvinceIds: readonly number[];
  readonly removedRegimentIds: readonly number[];
  readonly formerCapitalBurgIds: readonly number[];
}

export interface RemoveStateCommand {
  readonly type: "state.remove";
  readonly payload: RemoveStateRequest;
}

export interface PresentationPatchCommand {
  readonly type: "presentation.patch";
  readonly payload: PresentationPatch;
}

export type PositionCommand = MoveMarkerCommand | MoveBurgCommand | MoveRegimentCommand;
export type WorldCommand<T> =
  | LegacyMutationCommand<T>
  | PositionCommand
  | AssignCellsCommand
  | RemoveStateCommand
  | PresentationPatchCommand;

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

    if (command.type === "cells.assign") {
      return this.assignCells(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "state.remove") {
      return this.removeState(command.payload) as LegacyMutationOutcome<T>;
    }

    const { stateId, regimentId, x, y } = command.payload;
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("regiment.move requires finite coordinates");
    const regiment = this.world.pack.states[stateId]?.military?.find(item => item.i === regimentId);
    if (!regiment) throw new Error(`regiment.move could not find regiment ${stateId}/${regimentId}`);

    regiment.x = x;
    regiment.y = y;
    return { result: undefined as T, topics: ["simulation.military"] };
  }

  private assignCells(request: AssignCellsRequest): LegacyMutationOutcome<{ changedCellIds: readonly number[] }> {
    const cells = this.world.pack.cells;
    const column = cells[request.field];
    if (!column || typeof column.length !== "number") {
      throw new Error(`cells.assign could not find the ${request.field} column`);
    }

    const finalAssignments = new Map<number, number>();
    for (const { cellId, entityId } of request.assignments) {
      if (!Number.isInteger(cellId) || cellId < 0 || cellId >= column.length) {
        throw new Error(`cells.assign received invalid cell ${cellId}`);
      }
      this.assertAssignmentTarget(request.field, entityId);
      if (request.field === "province" && entityId !== 0) {
        const province = this.world.pack.provinces[entityId];
        if (cells.state[cellId] !== province.state) {
          throw new Error(`cells.assign cannot assign cell ${cellId} to a province from another state`);
        }
      }
      finalAssignments.set(cellId, entityId);
    }

    const changedCellIds: number[] = [];
    let burgChanged = false;
    for (const [cellId, entityId] of finalAssignments) {
      if (column[cellId] === entityId) continue;
      column[cellId] = entityId;
      changedCellIds.push(cellId);

      // A burg inherits its cell's state and culture in the legacy data model.
      // Keeping that invariant in the command avoids a post-commit controller write.
      const burgId = cells.burg[cellId];
      if (!burgId) continue;
      const burg = this.world.pack.burgs[burgId];
      if (!burg) continue;
      if (request.field === "state" && burg.state !== entityId) {
        burg.state = entityId;
        burgChanged = true;
      }
      if (request.field === "culture" && burg.culture !== entityId) {
        burg.culture = entityId;
        burgChanged = true;
      }
    }

    return {
      result: { changedCellIds },
      topics: changedCellIds.length ? ["map.politics", ...(burgChanged ? (["map.settlements"] as const) : [])] : []
    };
  }

  private assertAssignmentTarget(field: CellAssignmentField, entityId: number): void {
    if (!Number.isInteger(entityId) || entityId < 0) {
      throw new Error(`cells.assign received invalid ${field} id ${entityId}`);
    }
    if (entityId === 0) return;

    const entities =
      field === "state"
        ? this.world.pack.states
        : field === "province"
          ? this.world.pack.provinces
          : field === "culture"
            ? this.world.pack.cultures
            : this.world.pack.religions;
    const entity = entities[entityId];
    if (!entity || entity.removed) {
      throw new Error(`cells.assign could not find active ${field} ${entityId}`);
    }
  }

  private removeState(request: RemoveStateRequest): LegacyMutationOutcome<RemoveStateResult> {
    const { stateId } = request;
    const states = this.world.pack.states;
    const state = states[stateId];
    if (!Number.isInteger(stateId) || stateId <= 0 || !state || state.removed) {
      throw new Error(`state.remove could not find active state ${stateId}`);
    }

    // Do not trust the denormalized `state.provinces` list as the source of
    // truth. Legacy maps can contain a valid province whose owner list was not
    // refreshed; its foreign key still has to be cascaded on removal.
    const removedProvinceIds = this.world.pack.provinces.flatMap((province, provinceId) =>
      province?.i && !province.removed && province.state === stateId ? [provinceId] : []
    );
    const removedProvinceSet = new Set(removedProvinceIds);
    const formerCapitalBurgIds: number[] = [];
    const removedRegimentIds = (state.military ?? []).flatMap(regiment =>
      regiment.i === undefined ? [] : [regiment.i]
    );

    for (const burg of this.world.pack.burgs) {
      if (burg.state !== stateId) continue;
      burg.state = 0;
      if (burg.capital) {
        burg.capital = 0;
        if (burg.i !== undefined) formerCapitalBurgIds.push(burg.i);
      }
    }

    this.world.pack.cells.state.forEach((assignedState, cellId) => {
      if (assignedState === stateId) this.world.pack.cells.state[cellId] = 0;
    });
    this.world.pack.cells.province.forEach((provinceId, cellId) => {
      if (removedProvinceSet.has(provinceId)) this.world.pack.cells.province[cellId] = 0;
    });

    for (const provinceId of removedProvinceIds) {
      if (this.world.pack.provinces[provinceId]) {
        this.world.pack.provinces[provinceId] = { i: provinceId, removed: true } as Province;
      }
    }

    const regimentIds = new Set(removedRegimentIds.map(regimentId => `regiment${stateId}-${regimentId}`));
    const retainedNotes = this.world.notes.filter(note => !regimentIds.has(note.id));
    this.world.notes.splice(0, this.world.notes.length, ...retainedNotes);
    for (const candidate of states) {
      if (!candidate.i || candidate.removed || !candidate.neighbors) continue;
      candidate.neighbors = candidate.neighbors.filter(neighborId => neighborId !== stateId);
    }
    states[stateId] = { i: stateId, removed: true } as State;

    return {
      result: { stateId, removedProvinceIds, removedRegimentIds, formerCapitalBurgIds },
      topics: ["map.politics", "map.settlements", "simulation.military", "map.annotations"]
    };
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

/** Phase 5 command for atomic state / province / culture / religion cell ownership edits. */
export function assignCells(request: AssignCellsRequest): WorldCommit<{ changedCellIds: readonly number[] }> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "cells.assign", payload: request });
}

/** Phase 5 command for the data cascade of a state deletion. */
export function removeState(request: RemoveStateRequest): WorldCommit<RemoveStateResult> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "state.remove", payload: request });
}

/** Phase 3 command for persisted style and layer-visibility changes. */
export function patchPresentation(patch: PresentationPatch): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "presentation.patch", payload: patch });
}
