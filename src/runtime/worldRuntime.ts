import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import type { Province, River, Route, State } from "../types/models";
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

/**
 * A narrowly registered extension-owned writer. The host owns commit creation
 * and topic invalidation; the extension must validate its unknown payload
 * before changing only data it owns.
 */
export interface ExtensionCommandDefinition {
  readonly extensionId: string;
  readonly name: string;
  readonly execute: (payload: unknown) => {
    readonly changed: boolean;
    readonly result?: unknown;
  };
}

export interface ExtensionCommandRequest {
  readonly extensionId: string;
  readonly name: string;
  readonly payload: unknown;
}

export interface ExtensionCommand {
  readonly type: "extension.command";
  readonly payload: ExtensionCommandRequest;
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

export interface RegimentMerge {
  readonly fromStateId: number;
  readonly fromRegimentId: number;
  readonly toRegimentId: number;
}

export interface MergeStatesRequest {
  readonly rulingStateId: number;
  readonly absorbedStateIds: readonly number[];
}

export interface MergeStatesResult {
  readonly rulingStateId: number;
  readonly absorbedStateIds: readonly number[];
  readonly regimentMerges: readonly RegimentMerge[];
  readonly formerCapitalBurgIds: readonly number[];
}

export interface MergeStatesCommand {
  readonly type: "state.merge";
  readonly payload: MergeStatesRequest;
}

export type RemovableEntityKind = "province" | "culture" | "religion";

export interface RemoveEntityRequest {
  readonly kind: RemovableEntityKind;
  readonly entityId: number;
}

export interface RemoveEntityResult {
  readonly kind: RemovableEntityKind;
  readonly entityId: number;
}

export interface RemoveEntityCommand {
  readonly type: "entity.remove";
  readonly payload: RemoveEntityRequest;
}

export interface RoutePatchRequest {
  readonly routeId: number;
  readonly name?: string;
  readonly group?: string;
  readonly lock?: boolean;
}

export interface PatchRouteCommand {
  readonly type: "route.patch";
  readonly payload: RoutePatchRequest;
}

export interface CreateRouteRequest {
  readonly route: Route;
}

export interface CreateRouteCommand {
  readonly type: "route.create";
  readonly payload: CreateRouteRequest;
}

export interface RemoveRouteRequest {
  readonly routeId: number;
}

export interface RemoveRouteCommand {
  readonly type: "route.remove";
  readonly payload: RemoveRouteRequest;
}

export interface ReplaceRoutePointsRequest {
  readonly routeId: number;
  readonly points: readonly (readonly [number, number, number])[];
}

export interface ReplaceRoutePointsCommand {
  readonly type: "route.replacePoints";
  readonly payload: ReplaceRoutePointsRequest;
}

export interface RiverPatchRequest {
  readonly riverId: number;
  readonly name?: string;
  readonly type?: string;
  readonly parentId?: number;
  readonly sourceWidth?: number;
  readonly widthFactor?: number;
}

export interface PatchRiverCommand {
  readonly type: "river.patch";
  readonly payload: RiverPatchRequest;
}

export interface ReplaceRiverGeometryRequest {
  readonly riverId: number;
  readonly points: readonly (readonly [number, number])[];
  readonly cellIds: readonly number[];
}

export interface ReplaceRiverGeometryCommand {
  readonly type: "river.replaceGeometry";
  readonly payload: ReplaceRiverGeometryRequest;
}

export interface FeaturePatchRequest {
  readonly featureId: number;
  readonly name?: string;
  readonly group?: string;
}

export interface PatchFeatureCommand {
  readonly type: "feature.patch";
  readonly payload: FeaturePatchRequest;
}

export interface MoveFeatureVertexRequest {
  readonly featureId: number;
  readonly vertexId: number;
  readonly x: number;
  readonly y: number;
}

export interface MoveFeatureVertexCommand {
  readonly type: "feature.vertexMove";
  readonly payload: MoveFeatureVertexRequest;
}

export interface PresentationPatchCommand {
  readonly type: "presentation.patch";
  readonly payload: PresentationPatch;
}

export type PositionCommand = MoveMarkerCommand | MoveBurgCommand | MoveRegimentCommand;
export type WorldCommand<T> =
  | LegacyMutationCommand<T>
  | ExtensionCommand
  | PositionCommand
  | AssignCellsCommand
  | RemoveStateCommand
  | MergeStatesCommand
  | RemoveEntityCommand
  | PatchRouteCommand
  | CreateRouteCommand
  | RemoveRouteCommand
  | ReplaceRoutePointsCommand
  | PatchRiverCommand
  | ReplaceRiverGeometryCommand
  | PatchFeatureCommand
  | MoveFeatureVertexCommand
  | PresentationPatchCommand;

export interface WorldRuntime {
  read(): WorldReadView;
  dispatch<T>(command: WorldCommand<T>): Promise<WorldCommit<T> | null>;
  subscribe(listener: (commit: WorldCommit<unknown>) => void): () => void;
  /** Register one synchronous, validated command owned by an extension. */
  registerExtensionCommand(command: ExtensionCommandDefinition): () => void;
}

class LegacyWorldRuntime implements WorldRuntime {
  private revision = 0;
  private readonly topicRevisions: Record<string, number> = {};
  private readonly listeners = new Set<(commit: WorldCommit<unknown>) => void>();
  private readonly extensionCommands = new Map<string, ExtensionCommandDefinition>();
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

  registerExtensionCommand(command: ExtensionCommandDefinition): () => void {
    if (!command.extensionId.trim() || !command.name.trim()) {
      throw new Error("Extension commands require a non-empty extension id and name");
    }
    const key = this.extensionCommandKey(command.extensionId, command.name);
    if (this.extensionCommands.has(key)) {
      throw new Error(`Extension command ${key} is already registered`);
    }
    this.extensionCommands.set(key, command);
    return () => {
      if (this.extensionCommands.get(key) === command) this.extensionCommands.delete(key);
    };
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

    if (command.type === "extension.command") {
      return this.executeExtensionCommand(command.payload) as LegacyMutationOutcome<T>;
    }

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

    if (command.type === "state.merge") {
      return this.mergeStates(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "entity.remove") {
      return this.removeEntity(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "route.patch") {
      return this.patchRoute(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "route.create") {
      return this.createRoute(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "route.remove") {
      return this.removeRoute(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "route.replacePoints") {
      return this.replaceRoutePoints(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "river.patch") {
      return this.patchRiver(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "river.replaceGeometry") {
      return this.replaceRiverGeometry(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "feature.patch") {
      return this.patchFeature(command.payload) as LegacyMutationOutcome<T>;
    }

    if (command.type === "feature.vertexMove") {
      return this.moveFeatureVertex(command.payload) as LegacyMutationOutcome<T>;
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

  private mergeStates(request: MergeStatesRequest): LegacyMutationOutcome<MergeStatesResult> {
    const { rulingStateId } = request;
    const rulingState = this.world.pack.states[rulingStateId];
    if (!Number.isInteger(rulingStateId) || rulingStateId <= 0 || !rulingState || rulingState.removed) {
      throw new Error(`state.merge could not find active ruling state ${rulingStateId}`);
    }

    const absorbedStateIds = [...new Set(request.absorbedStateIds)];
    if (!absorbedStateIds.length) {
      return {
        result: { rulingStateId, absorbedStateIds, regimentMerges: [], formerCapitalBurgIds: [] },
        topics: []
      };
    }
    for (const stateId of absorbedStateIds) {
      const state = this.world.pack.states[stateId];
      if (!Number.isInteger(stateId) || stateId <= 0 || stateId === rulingStateId || !state || state.removed) {
        throw new Error(`state.merge could not find active absorbed state ${stateId}`);
      }
    }

    const absorbedSet = new Set(absorbedStateIds);
    const regimentMerges: RegimentMerge[] = [];
    const formerCapitalBurgIds: number[] = [];
    const mergedNeighborIds = new Set<number>();
    rulingState.military ??= [];

    for (const stateId of absorbedStateIds) {
      const state = this.world.pack.states[stateId];
      for (const neighborId of state.neighbors ?? []) mergedNeighborIds.add(neighborId);
      for (const regiment of state.military ?? []) {
        if (regiment.i === undefined) continue;
        const toRegimentId = rulingState.military.length;
        rulingState.military.push({ ...regiment, i: toRegimentId });
        regimentMerges.push({ fromStateId: stateId, fromRegimentId: regiment.i, toRegimentId });
      }
      state.removed = true;
    }
    for (const neighborId of rulingState.neighbors ?? []) mergedNeighborIds.add(neighborId);

    const newRegimentIds = new Map(
      regimentMerges.map(regiment => [
        `regiment${regiment.fromStateId}-${regiment.fromRegimentId}`,
        `regiment${rulingStateId}-${regiment.toRegimentId}`
      ])
    );
    for (const note of this.world.notes) {
      const newId = newRegimentIds.get(note.id);
      if (newId) note.id = newId;
    }

    for (const burg of this.world.pack.burgs) {
      if (burg.state === undefined || !absorbedSet.has(burg.state)) continue;
      if (burg.capital) {
        burg.capital = 0;
        if (burg.i !== undefined) formerCapitalBurgIds.push(burg.i);
      }
      burg.state = rulingStateId;
    }
    for (const province of this.world.pack.provinces) {
      if (province?.i && !province.removed && absorbedSet.has(province.state)) province.state = rulingStateId;
    }
    this.world.pack.cells.state.forEach((stateId, cellId) => {
      if (absorbedSet.has(stateId)) this.world.pack.cells.state[cellId] = rulingStateId;
    });

    rulingState.provinces = this.world.pack.provinces.flatMap((province, provinceId) =>
      province?.i && !province.removed && province.state === rulingStateId ? [provinceId] : []
    );
    rulingState.neighbors = [...mergedNeighborIds].filter(neighborId => {
      const neighbor = this.world.pack.states[neighborId];
      return neighborId !== rulingStateId && !absorbedSet.has(neighborId) && !!neighbor?.i && !neighbor.removed;
    });
    for (const state of this.world.pack.states) {
      if (!state?.i || state.removed || state.i === rulingStateId || !state.neighbors) continue;
      state.neighbors = [
        ...new Set(state.neighbors.map(neighborId => (absorbedSet.has(neighborId) ? rulingStateId : neighborId)))
      ].filter(neighborId => neighborId !== state.i);
    }

    return {
      result: { rulingStateId, absorbedStateIds, regimentMerges, formerCapitalBurgIds },
      topics: ["map.politics", "map.settlements", "simulation.military", "map.annotations"]
    };
  }

  private removeEntity(request: RemoveEntityRequest): LegacyMutationOutcome<RemoveEntityResult> {
    const { kind, entityId } = request;
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new Error(`entity.remove received invalid ${kind} id ${entityId}`);
    }

    if (kind === "province") {
      const province = this.world.pack.provinces[entityId];
      if (!province || province.removed) throw new Error(`entity.remove could not find active province ${entityId}`);

      this.world.pack.cells.province.forEach((provinceId, cellId) => {
        if (provinceId === entityId) this.world.pack.cells.province[cellId] = 0;
      });
      const owner = this.world.pack.states[province.state];
      if (owner?.provinces) owner.provinces = owner.provinces.filter(provinceId => provinceId !== entityId);
      this.world.pack.provinces[entityId] = { i: entityId, removed: true } as Province;
      return { result: { kind, entityId }, topics: ["map.politics"] };
    }

    if (kind === "culture") {
      const culture = this.world.pack.cultures[entityId];
      if (!culture || culture.removed) throw new Error(`entity.remove could not find active culture ${entityId}`);

      this.world.pack.cells.culture.forEach((cultureId, cellId) => {
        if (cultureId === entityId) this.world.pack.cells.culture[cellId] = 0;
      });
      for (const burg of this.world.pack.burgs) {
        if (burg.culture === entityId) burg.culture = 0;
      }
      for (const state of this.world.pack.states) {
        if (state.culture === entityId) state.culture = 0;
      }
      culture.removed = true;
      for (const candidate of this.world.pack.cultures) {
        if (!candidate?.i || candidate.removed) continue;
        candidate.origins = (candidate.origins ?? []).filter(origin => origin !== null && origin !== entityId);
        if (!candidate.origins.length) candidate.origins = [0];
      }
      return { result: { kind, entityId }, topics: ["map.politics", "map.settlements"] };
    }

    const religion = this.world.pack.religions[entityId];
    if (!religion || religion.removed) throw new Error(`entity.remove could not find active religion ${entityId}`);

    this.world.pack.cells.religion.forEach((religionId, cellId) => {
      if (religionId === entityId) this.world.pack.cells.religion[cellId] = 0;
    });
    religion.removed = true;
    for (const candidate of this.world.pack.religions) {
      if (!candidate?.i || candidate.removed) continue;
      candidate.origins = (candidate.origins ?? []).filter(origin => origin !== entityId);
      if (!candidate.origins.length) candidate.origins = [0];
    }
    return { result: { kind, entityId }, topics: ["map.politics"] };
  }

  private patchRoute(request: RoutePatchRequest): LegacyMutationOutcome<void> {
    const route = this.findRoute(request.routeId);
    let changed = false;
    if (request.name !== undefined && route.name !== request.name) {
      route.name = request.name;
      changed = true;
    }
    if (request.group !== undefined && route.group !== request.group) {
      route.group = request.group;
      changed = true;
    }
    if (request.lock !== undefined && route.lock !== request.lock) {
      route.lock = request.lock;
      changed = true;
    }
    return { result: undefined, topics: changed ? ["map.networks"] : [] };
  }

  private createRoute(request: CreateRouteRequest): LegacyMutationOutcome<void> {
    const { route } = request;
    if (!Number.isInteger(route.i) || route.i < 0 || this.world.pack.routes.some(existing => existing.i === route.i)) {
      throw new Error(`route.create received duplicate or invalid route ${route.i}`);
    }
    this.assertRoutePoints(route);
    const created = { ...route, points: route.points.map(point => [...point] as [number, number, number]) };
    this.world.pack.routes.push(created);
    this.connectRoute(created);
    return { result: undefined, topics: ["map.networks"] };
  }

  private removeRoute(request: RemoveRouteRequest): LegacyMutationOutcome<void> {
    const route = this.findRoute(request.routeId);
    this.disconnectRoute(route.i);
    const index = this.world.pack.routes.indexOf(route);
    this.world.pack.routes.splice(index, 1);
    return { result: undefined, topics: ["map.networks"] };
  }

  private replaceRoutePoints(request: ReplaceRoutePointsRequest): LegacyMutationOutcome<void> {
    const route = this.findRoute(request.routeId);
    const updated = { ...route, points: request.points.map(point => [...point] as [number, number, number]) };
    this.assertRoutePoints(updated);
    const unchanged =
      route.points.length === updated.points.length &&
      route.points.every((point, index) =>
        point.every((coordinate, coordinateIndex) => coordinate === updated.points[index][coordinateIndex])
      );
    if (unchanged) return { result: undefined, topics: [] };

    this.disconnectRoute(route.i);
    route.points = updated.points;
    this.connectRoute(route);
    return { result: undefined, topics: ["map.networks"] };
  }

  private findRoute(routeId: number): Route {
    if (!Number.isInteger(routeId)) throw new Error(`route command received invalid route ${routeId}`);
    const route = this.world.pack.routes.find(candidate => candidate.i === routeId);
    if (!route) throw new Error(`route command could not find route ${routeId}`);
    return route;
  }

  private assertRoutePoints(route: Route): void {
    if (route.points.length < 2) throw new Error(`route command requires at least two points for route ${route.i}`);
    const cellCount = this.world.pack.cells.i.length;
    for (const point of route.points) {
      const cellId = point[2];
      if (!Number.isInteger(cellId) || cellId < 0 || cellId >= cellCount) {
        throw new Error(`route command received invalid cell ${cellId}`);
      }
    }
  }

  private connectRoute(route: Route): void {
    const routeMap = this.world.pack.cells.routes;
    for (let index = 0; index < route.points.length - 1; index++) {
      const from = route.points[index][2];
      const to = route.points[index + 1][2];
      if (from === to) continue;
      routeMap[from] ??= {};
      routeMap[to] ??= {};
      routeMap[from][to] = route.i;
      routeMap[to][from] = route.i;
    }
  }

  private disconnectRoute(routeId: number): void {
    const routeMap = this.world.pack.cells.routes;
    for (const [fromId, connections] of Object.entries(routeMap)) {
      const from = Number(fromId);
      for (const [to, connectedRouteId] of Object.entries(connections)) {
        if (connectedRouteId !== routeId) continue;
        delete connections[Number(to)];
        if (routeMap[Number(to)]) delete routeMap[Number(to)][from];
      }
    }
  }

  private patchRiver(request: RiverPatchRequest): LegacyMutationOutcome<void> {
    const river = this.findRiver(request.riverId);
    let changed = false;
    if (request.name !== undefined && river.name !== request.name) {
      river.name = request.name;
      changed = true;
    }
    if (request.type !== undefined && river.type !== request.type) {
      river.type = request.type;
      changed = true;
    }
    if (request.parentId !== undefined) {
      const parent = this.findRiver(request.parentId);
      const basin = parent.basin ?? parent.i;
      if (river.parent !== request.parentId || river.basin !== basin) {
        river.parent = request.parentId;
        river.basin = basin;
        changed = true;
      }
    }
    if (request.sourceWidth !== undefined) {
      if (!Number.isFinite(request.sourceWidth) || request.sourceWidth < 0) {
        throw new Error("river.patch requires a non-negative finite source width");
      }
      if (river.sourceWidth !== request.sourceWidth) {
        river.sourceWidth = request.sourceWidth;
        changed = true;
      }
    }
    if (request.widthFactor !== undefined) {
      if (!Number.isFinite(request.widthFactor) || request.widthFactor < 0) {
        throw new Error("river.patch requires a non-negative finite width factor");
      }
      if (river.widthFactor !== request.widthFactor) {
        river.widthFactor = request.widthFactor;
        changed = true;
      }
    }
    return { result: undefined, topics: changed ? ["map.networks"] : [] };
  }

  private findRiver(riverId: number): River {
    if (!Number.isInteger(riverId)) throw new Error(`river command received invalid river ${riverId}`);
    const river = this.world.pack.rivers.find(candidate => candidate.i === riverId);
    if (!river) throw new Error(`river command could not find river ${riverId}`);
    return river;
  }

  private replaceRiverGeometry(request: ReplaceRiverGeometryRequest): LegacyMutationOutcome<void> {
    const river = this.findRiver(request.riverId);
    if (request.points.length < 2 || request.points.length !== request.cellIds.length) {
      throw new Error("river.replaceGeometry requires matching point and cell lists with at least two entries");
    }
    const cellCount = this.world.pack.cells.i.length;
    for (const [index, point] of request.points.entries()) {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        throw new Error("river.replaceGeometry requires finite point coordinates");
      }
      const cellId = request.cellIds[index];
      if (!Number.isInteger(cellId) || cellId < 0 || cellId >= cellCount) {
        throw new Error(`river.replaceGeometry received invalid cell ${cellId}`);
      }
    }
    const points = request.points.map(point => [...point] as [number, number]);
    const cellIds = [...request.cellIds];
    const unchanged =
      river.points?.length === points.length &&
      river.points.every((point, index) => point[0] === points[index][0] && point[1] === points[index][1]) &&
      river.cells.length === cellIds.length &&
      river.cells.every((cellId, index) => cellId === cellIds[index]);
    if (unchanged) return { result: undefined, topics: [] };

    const previousCells = new Set(river.cells);
    const nextCells = new Set(cellIds);
    for (const cellId of previousCells) {
      if (!nextCells.has(cellId) && this.world.pack.cells.r[cellId] === river.i) this.world.pack.cells.r[cellId] = 0;
    }
    for (const cellId of nextCells) this.world.pack.cells.r[cellId] = river.i;
    river.points = points;
    river.cells = cellIds;
    return { result: undefined, topics: ["map.networks"] };
  }

  private patchFeature(request: FeaturePatchRequest): LegacyMutationOutcome<void> {
    if (!Number.isInteger(request.featureId)) {
      throw new Error(`feature command received invalid feature ${request.featureId}`);
    }
    const feature = this.world.pack.features[request.featureId];
    if (!feature) throw new Error(`feature command could not find feature ${request.featureId}`);

    let changed = false;
    if (request.name !== undefined && feature.name !== request.name) {
      feature.name = request.name;
      changed = true;
    }
    if (request.group !== undefined && feature.group !== request.group) {
      feature.group = request.group;
      changed = true;
    }
    return { result: undefined, topics: changed ? ["map.topology"] : [] };
  }

  private moveFeatureVertex(request: MoveFeatureVertexRequest): LegacyMutationOutcome<void> {
    const { featureId, vertexId, x, y } = request;
    if (!Number.isInteger(vertexId) || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("feature.vertexMove requires a vertex id and finite coordinates");
    }
    const feature = this.world.pack.features[featureId];
    if (!feature?.vertices?.includes(vertexId)) {
      throw new Error(`feature.vertexMove could not find vertex ${vertexId} on feature ${featureId}`);
    }
    if (!this.world.pack.vertices.p[vertexId]) {
      throw new Error(`feature.vertexMove could not find vertex ${vertexId}`);
    }
    const current = this.world.pack.vertices.p[vertexId];
    if (current[0] === x && current[1] === y) return { result: undefined, topics: [] };

    this.world.pack.vertices.p[vertexId] = [x, y];
    feature.area = Math.abs(this.polygonArea(feature.vertices.map(id => this.world.pack.vertices.p[id])));
    return { result: undefined, topics: ["map.topology"] };
  }

  private polygonArea(points: readonly (readonly [number, number])[]): number {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      area += x1 * y2 - x2 * y1;
    }
    return area / 2;
  }

  private executeExtensionCommand(request: ExtensionCommandRequest): LegacyMutationOutcome<unknown> {
    const command = this.extensionCommands.get(this.extensionCommandKey(request.extensionId, request.name));
    if (!command) {
      throw new Error(`Extension command ${request.extensionId}.${request.name} is not registered`);
    }
    const outcome = command.execute(request.payload);
    return {
      result: outcome.result,
      topics: outcome.changed ? [`extension.${request.extensionId}`] : []
    };
  }

  private extensionCommandKey(extensionId: string, name: string): string {
    return `${extensionId}:${name}`;
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

/** Dispatches a registered extension command through the host's commit seam. */
export function dispatchExtensionCommand(request: ExtensionCommandRequest): WorldCommit<unknown> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "extension.command", payload: request });
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

/** Phase 5 command for the data cascade of merging states. */
export function mergeStates(request: MergeStatesRequest): WorldCommit<MergeStatesResult> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "state.merge", payload: request });
}

/** Phase 5 command for province / culture / religion deletion cascades. */
export function removeEntity(request: RemoveEntityRequest): WorldCommit<RemoveEntityResult> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "entity.remove", payload: request });
}

/** Phase 5 commands for route metadata and topology changes. */
export function patchRoute(request: RoutePatchRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "route.patch", payload: request });
}

export function createRouteCommand(request: CreateRouteRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "route.create", payload: request });
}

export function removeRouteCommand(request: RemoveRouteRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "route.remove", payload: request });
}

/** Phase 5 command for route control-point edits. */
export function replaceRoutePoints(request: ReplaceRoutePointsRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "route.replacePoints", payload: request });
}

/** Phase 5 command for river metadata and width changes. */
export function patchRiver(request: RiverPatchRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "river.patch", payload: request });
}

/** Phase 5 command for river control-point geometry edits. */
export function replaceRiverGeometry(request: ReplaceRiverGeometryRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "river.replaceGeometry", payload: request });
}

/** Phase 5 command for persisted lake / coastline feature metadata. */
export function patchFeature(request: FeaturePatchRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "feature.patch", payload: request });
}

/** Phase 5 command for lake / coastline vertex geometry edits. */
export function moveFeatureVertex(request: MoveFeatureVertexRequest): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "feature.vertexMove", payload: request });
}

/** Phase 3 command for persisted style and layer-visibility changes. */
export function patchPresentation(patch: PresentationPatch): WorldCommit<void> | null {
  return (worldRuntime as LegacyWorldRuntime).execute({ type: "presentation.patch", payload: patch });
}
