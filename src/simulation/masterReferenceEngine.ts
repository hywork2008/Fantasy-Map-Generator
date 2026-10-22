import { setReferenceEvaluation } from "../extensions/characters/reference/evaluation";
import { encodeReference, validateReference } from "../extensions/characters/reference/model";
import { BUILTIN_SIMULATION_EXTENSIONS } from "../extensions/simulation";
import type { MapReadyTask } from "../runtime/mapReadyTaskCoordinator";
import { worldRuntime } from "../runtime/worldRuntime";
import { optionsStore } from "../state/optionsStore";
import { uiPreferencesStore } from "../state/uiPreferencesStore";
import { simEvents } from "./events";
import { createSimulationHost } from "./host";
import type { MasterReferenceMessage, MasterReferenceRequest } from "./masterReferenceProtocol";
import { createMemorySettings, installSimulationSettings } from "./ports";

/** Runs only in an isolated worker. Live maps never expose these evaluation Characters. */
export async function evaluateMasterReference(
  request: MasterReferenceRequest,
  report: (message: MasterReferenceMessage) => void
) {
  setReferenceEvaluation(true);
  installSimulationSettings(createMemorySettings(request.settings));
  const tasks = new Map<string, MapReadyTask>();
  const host = createSimulationHost({
    extensions: BUILTIN_SIMULATION_EXTENSIONS.filter(e => request.extensions.includes(e.id)),
    mapReadyTasks: {
      register(task) {
        tasks.set(task.id, task);
        return () => {
          tasks.delete(task.id);
        };
      },
      request() {}
    }
  });
  try {
    worldRuntime.restoreRollbackDocument(request.document);
    optionsStore.setState(request.options);
    uiPreferencesStore.setState(request.preferences);
    const inputBytes = new TextEncoder().encode(
      JSON.stringify([
        request.document.world,
        request.document.simulation,
        request.extensions,
        request.settings,
        request.options,
        request.preferences
      ])
    );
    const digest = await crypto.subtle.digest("SHA-256", inputBytes);
    const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
    const ordered: MapReadyTask[] = [],
      visiting = new Set<string>();
    const visit = (task: MapReadyTask) => {
      if (ordered.includes(task)) return;
      if (visiting.has(task.id)) throw Error("Reference task dependency cycle");
      visiting.add(task.id);
      for (const id of task.dependsOn ?? []) {
        const dependency = tasks.get(id);
        if (dependency) visit(dependency);
      }
      visiting.delete(task.id);
      ordered.push(task);
    };
    for (const task of tasks.values()) visit(task);
    for (const [index, task] of ordered.entries()) {
      report({ kind: "progress", done: index, total: ordered.length, task: task.label });
      await task.run({
        isCurrent: () => true,
        reportProgress: progress =>
          report({ kind: "progress", done: index + progress, total: ordered.length, task: task.label })
      });
    }
    simEvents.dispatchEvent(new CustomEvent("fmg:map-ready-tasks-completed"));
    const people =
      (host.api.simulationContext.extensions.characters
        ?.characters as import("../extensions/characters/characterTypes").Character[]) ?? [];
    const plan = encodeReference(
      people,
      host.api.simulationContext,
      hash,
      ordered.map(t => t.id)
    );
    validateReference(plan);
    host.api.simulationContext.extensions.characters ??= {};
    host.api.simulationContext.extensions.characters.referenceGeneration = plan;
    host.api.simulationContext.extensions.characters.nextCharacterId = people.reduce((n, c) => Math.max(n, c.i + 1), 1);
    host.api.simulationContext.extensions.characters.characters = [];
    const result = worldRuntime.captureRollbackDocument();
    report({ kind: "complete", document: result });
    return result;
  } finally {
    host.dispose();
    setReferenceEvaluation(false);
  }
}
