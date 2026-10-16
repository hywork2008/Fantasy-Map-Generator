import { appServices } from "../context/appServices";
import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import {
  advanceTime,
  registerSimulationSystem,
  registerTimeTickHook,
  runTimeSimulation
} from "../generators/timeEngine";
import type { CalendarDuration } from "../runtime/calendarDuration";
import { DUAL_PORT_PLACEMENT_TASK_ID, dualPortPlacementTask } from "../runtime/dualPortPlacementTask";
import type { MapReadyTask } from "../runtime/mapReadyTaskCoordinator";
import { ChunkedWorldCodecAdapter, decodeAndValidateWorldArchive } from "../runtime/worldArchive";
import {
  createMarker,
  dispatchExtensionCommand,
  type ExtensionCommandRequest,
  type WorldCommit,
  worldRuntime
} from "../runtime/worldRuntime";
import { updateAllBurgWaterAccess } from "../services/burgWaterAccess";
import { applyMapMarkerPatch, markerNoteId, nextMarkerId } from "../services/mapMarkerApi";
import { raceService } from "../services/raceService";
import { getEffectiveSkill, registerSkillModifier } from "../services/skillModifierService";
import { optionsStore } from "../state/optionsStore";
import type { SimulationExtension, SimulationExtensionAPI } from "../types/extension-api";
import { installDeterministicMath } from "./deterministicMath";
import { simEvents } from "./events";
import {
  createStaticEnablement,
  installExtensionEnablement,
  type SimulationExtensionEnablement
} from "./extensionEnablement";
import { normalizeLoadedWorld } from "./loadedWorld";
import { simulationSettings, yieldToHost } from "./ports";
import { applySimulationTimeline, type SimulationTimelineChoice } from "./simulationTimeline";
import { materializeWorldSettings } from "./worldSettings";

/**
 * SimulationHost — the one entry to the simulation core (docs/plan/simulation-core-separation.md §5, S5).
 *
 * The browser app and a headless runner drive the same host: extensions register their simulation
 * entries here, and time advances through `advance` / `startAdvance`. Keeping one execution path is
 * what makes a browser run and a Node run of the same world produce the same result.
 */

/** Where map-ready tasks run: the browser's progress-reporting coordinator, or the host's own list. */
export interface MapReadyTaskPort {
  register(task: MapReadyTask): () => void;
  request(taskId: string): void;
}

export interface SimulationHostOptions {
  /** Which extensions are enabled. Default: every extension registered with the host. */
  readonly enablement?: SimulationExtensionEnablement;
  /** Default: the host runs the tasks itself in `prepare()`. */
  readonly mapReadyTasks?: MapReadyTaskPort;
  /** Called after a map marker was created or changed (the browser redraws). */
  readonly onMapAnnotationsChanged?: () => void;
  /** Simulation entries to register right away, in this order. */
  readonly extensions?: readonly SimulationExtension[];
}

export interface LoadArchiveOptions {
  /** Default `{ mode: "continue" }`: keep the saved RNG state, so a load replays the saved future. */
  readonly timeline?: SimulationTimelineChoice;
}

export interface SimulationHost {
  /** The API every simulation entry receives (the browser's ExtensionAPI builds on it). */
  readonly api: SimulationExtensionAPI;
  readonly enablement: SimulationExtensionEnablement;
  readonly world: Readonly<WorldContext>;
  readonly simulation: Readonly<SimulationContext>;
  /**
   * Registers a simulation entry; one per id. Entries only reach each other at run time (events,
   * enablement), so registration order matters only for listener order — keep it the same in every
   * host (BUILTIN_SIMULATION_EXTENSIONS). Returns the function that unregisters it again.
   */
  registerExtension(extension: SimulationExtension): () => void;
  /** Decodes a .fmg, applies the timeline choice and replaces the world (no view work). */
  loadArchive(data: Uint8Array, options?: LoadArchiveOptions): Promise<void>;
  /**
   * Runs host-owned map-ready tasks to completion: by default the ones requested since the last
   * run (after `loadArchive`, the port repair — as a browser load does); `{ all: true }` runs every
   * task, as after map generation (economy preparation etc.).
   */
  prepare(options?: { readonly all?: boolean }): Promise<void>;
  /** Advances synchronously, one calendar day per step. */
  advance(duration: CalendarDuration): void;
  /** Advances in time-budgeted chunks, reporting through the time-simulation store (Tools tab). */
  startAdvance(duration: CalendarDuration): void;
  /** Encodes the current world as a .fmg. */
  saveArchive(): Promise<Uint8Array>;
  dispatch(request: ExtensionCommandRequest): WorldCommit<unknown> | null;
  /** Unregisters every simulation entry (reverse order). Module caches are listed in the plan §19. */
  dispose(): void;
}

function createHostMapReadyTasks(): MapReadyTaskPort & { run(all: boolean): Promise<void>; requested: Set<string> } {
  const tasks = new Map<string, MapReadyTask>();
  const requested = new Set<string>();
  return {
    requested,
    register: task => {
      tasks.set(task.id, task);
      return () => {
        if (tasks.get(task.id) === task) tasks.delete(task.id);
      };
    },
    request: taskId => {
      if (tasks.has(taskId)) requested.add(taskId);
    },
    run: async all => {
      const wanted = new Set(requested);
      requested.clear();
      const ordered: MapReadyTask[] = [];
      const visiting = new Set<string>();
      const visit = (task: MapReadyTask) => {
        if (ordered.includes(task)) return;
        if (visiting.has(task.id)) throw new Error(`Map-ready task cycle at '${task.id}'`);
        visiting.add(task.id);
        for (const dependency of task.dependsOn ?? []) {
          const required = tasks.get(dependency);
          if (required) visit(required);
        }
        visiting.delete(task.id);
        ordered.push(task);
      };
      if (all) for (const task of tasks.values()) visit(task);
      else
        for (const id of wanted) {
          const task = tasks.get(id);
          if (task) visit(task);
        }
      for (const task of ordered) await task.run({ isCurrent: () => true, reportProgress: () => {} });
    }
  };
}

export function createSimulationHost(options: SimulationHostOptions = {}): SimulationHost {
  // Same doubles in every engine (§21): before any extension registers or a world loads.
  installDeterministicMath();
  const registeredIds = new Set<string>();
  const enablement = options.enablement ?? createStaticEnablement();
  const ownEnablement = options.enablement ? null : (enablement as ReturnType<typeof createStaticEnablement>);
  installExtensionEnablement(enablement);
  const hostTasks = options.mapReadyTasks ? null : createHostMapReadyTasks();
  const mapReadyTasks = options.mapReadyTasks ?? hostTasks!;
  const notifyAnnotations = options.onMapAnnotationsChanged ?? (() => {});
  const registrations: { id: string; unregister: () => void }[] = [];
  const unregisterCoreTasks = [mapReadyTasks.register(dualPortPlacementTask)];

  const api: SimulationExtensionAPI = {
    races: raceService,
    worldContext,
    appServices,
    simulationContext,
    isExtensionEnabled: id => enablement.isEnabled(id),
    subscribeExtensionState: listener => enablement.subscribe(listener),
    registerMapReadyTask: task => mapReadyTasks.register(task),
    requestMapReadyTask: taskId => mapReadyTasks.request(taskId),
    registerTimeTickHook,
    registerSimulationSystem,
    registerExtensionCommand: command => worldRuntime.registerExtensionCommand(command),
    dispatchExtensionCommand,
    registerStateSlice: spec => worldRuntime.registerStateSlice(spec),
    registerSkillModifier,
    getEffectiveSkill,
    createMapMarker: input => {
      const markerI = nextMarkerId(worldContext.pack.markers);
      const noteId = markerNoteId(markerI);
      try {
        const commit = createMarker({
          marker: { ...input.marker, i: markerI },
          note: { id: noteId, name: input.note.name, legend: input.note.legend }
        });
        if (!commit) return null;
      } catch {
        // Duplicate id / invalid cell — reject instead of throwing into caller code.
        return null;
      }
      notifyAnnotations();
      return { markerId: markerI, noteId };
    },
    updateMapMarker: (markerId, patch) => {
      const marker = worldContext.pack.markers.find(candidate => candidate.i === markerId);
      if (!marker) return false;
      const note = worldContext.notes.find(candidate => candidate.id === markerNoteId(markerId));
      applyMapMarkerPatch(marker, note, patch);
      notifyAnnotations();
      return true;
    },
    events: simEvents,
    settings: simulationSettings,
    yieldToHost
  };

  const host: SimulationHost = {
    api,
    enablement,
    world: worldContext,
    simulation: simulationContext,
    registerExtension: extension => {
      if (registeredIds.has(extension.id)) throw new Error(`Simulation extension '${extension.id}' already registered`);
      registeredIds.add(extension.id);
      ownEnablement?.setEnabled(extension.id, true);
      const registration = { id: extension.id, unregister: extension.register(api) };
      registrations.push(registration);
      return () => {
        const index = registrations.indexOf(registration);
        if (index < 0) return;
        registrations.splice(index, 1);
        registeredIds.delete(registration.id);
        registration.unregister();
      };
    },
    loadArchive: async (data, loadOptions = {}) => {
      const validated = await decodeAndValidateWorldArchive({
        blob: new Blob([data as BlobPart]),
        header: data.subarray(0, 4)
      });
      applySimulationTimeline(
        validated.document.simulation,
        validated.document.world.seed,
        loadOptions.timeline ?? { mode: "continue" }
      );
      materializeWorldSettings(validated.document.simulation);
      const { options: archivedOptions } = validated.document.world;
      const facts = {
        seaRouteGenerationMode: archivedOptions.seaRouteGenerationMode,
        landRouteGenerationMode: archivedOptions.landRouteGenerationMode,
        landRouteElevationAversion: archivedOptions.landRouteElevationAversion,
        currentYear: validated.document.simulation.currentYear,
        era: validated.document.simulation.era
      };
      const commit = await worldRuntime.dispatch({ type: "world.replace", payload: validated });
      if (!commit) throw new Error("World archive did not produce a replacement commit");
      normalizeLoadedWorld(facts);
      mapReadyTasks.request(DUAL_PORT_PLACEMENT_TASK_ID);
      simEvents.dispatchEvent(new CustomEvent("fmg:world-loaded"));
    },
    prepare: async prepareOptions => {
      if (!hostTasks) throw new Error("prepare() runs host-owned map-ready tasks only");
      await hostTasks.run(prepareOptions?.all ?? false);
      // Same completion signal as the browser's coordinator (frontier budgets snapshot etc.).
      simEvents.dispatchEvent(new CustomEvent("fmg:map-ready-tasks-completed"));
    },
    advance: ({ years = 0, months = 0, days = 0 }) => advanceTime(years, months, days),
    startAdvance: ({ years = 0, months = 0, days = 0 }) => runTimeSimulation(years, months, days),
    saveArchive: async () => {
      updateAllBurgWaterAccess(worldContext.pack);
      // Same as the browser save: the map name lives in the options store, not the world.
      worldContext.options.mapName = optionsStore.getState().mapName;
      const blob = await new ChunkedWorldCodecAdapter().encode(await worldRuntime.captureArchiveDocument());
      return new Uint8Array(await blob.arrayBuffer());
    },
    dispatch: request => dispatchExtensionCommand(request),
    dispose: () => {
      while (registrations.length) {
        const registration = registrations.pop()!;
        registration.unregister();
        ownEnablement?.setEnabled(registration.id, false);
      }
      registeredIds.clear();
      for (const unregister of unregisterCoreTasks.splice(0)) unregister();
    }
  };

  for (const extension of options.extensions ?? []) host.registerExtension(extension);
  return host;
}

let current: SimulationHost | null = null;

/** The app's host (set once at start-up); controllers drive time through it. */
export function setSimulationHost(host: SimulationHost): void {
  current = host;
}

export function getSimulationHost(): SimulationHost {
  if (!current) throw new Error("SimulationHost is not created yet");
  return current;
}
