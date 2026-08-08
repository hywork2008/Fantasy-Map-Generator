import { measureGenerationStep } from "../generators/generationProfiler";
import { useMapReadyTaskState } from "../store/mapReadyTaskState";

export type MapReadyTaskContext = {
  isCurrent(): boolean;
  reportProgress(progress: number): void;
};

export type MapReadyTask = {
  id: string;
  label: string;
  dependsOn?: readonly string[];
  run(context: MapReadyTaskContext): void | Promise<void>;
};

const tasks = new Map<string, MapReadyTask>();
let runId = 0;
let coreMapReady = false;
let fullRunId: number | null = null;
let requestedRunId: number | null = null;
const requestedTaskIds = new Set<string>();

export function registerMapReadyTask(task: MapReadyTask): () => void {
  tasks.set(task.id, task);
  return () => {
    if (tasks.get(task.id) === task) tasks.delete(task.id);
  };
}

export function cancelMapReadyTasks(): void {
  runId++;
  coreMapReady = false;
  fullRunId = null;
  requestedRunId = null;
  requestedTaskIds.clear();
  useMapReadyTaskState.getState().cancel();
}

/** Mark an externally loaded map as safe for per-extension initialization requests. */
export function markMapReadyTasksAvailable(): void {
  coreMapReady = true;
}

/**
 * Run an extension's initialization after the current map is complete.
 *
 * During core generation the normal post-generation pass will see the latest extension
 * enable state, so no work is scheduled here. On an already completed map this queues the
 * requested task (and its declared dependencies) without reinitializing unrelated extensions.
 */
export function requestMapReadyTask(taskId: string): void {
  if (!tasks.has(taskId) || !coreMapReady) return;

  requestedTaskIds.add(taskId);
  if (fullRunId !== null || requestedRunId !== null) return;
  queueMicrotask(() => void runRequestedTasks());
}

function nextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function orderTasks(): MapReadyTask[] {
  const ordered: MapReadyTask[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (task: MapReadyTask) => {
    if (visited.has(task.id)) return;
    if (visiting.has(task.id)) throw new Error(`Circular map-ready task dependency at ${task.id}`);
    visiting.add(task.id);
    for (const dependencyId of task.dependsOn ?? []) {
      const dependency = tasks.get(dependencyId);
      if (!dependency) throw new Error(`Map-ready task ${task.id} requires missing task ${dependencyId}`);
      visit(dependency);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    ordered.push(task);
  };

  for (const task of tasks.values()) visit(task);
  return ordered;
}

function orderRequestedTasks(): MapReadyTask[] {
  const requested = new Set<string>();
  const collect = (taskId: string) => {
    if (requested.has(taskId)) return;
    const task = tasks.get(taskId);
    if (!task) return;
    requested.add(taskId);
    for (const dependencyId of task.dependsOn ?? []) collect(dependencyId);
  };

  for (const taskId of requestedTaskIds) collect(taskId);
  return orderTasks().filter(task => requested.has(task.id));
}

async function runTasks(ordered: readonly MapReadyTask[], currentRun: number): Promise<void> {
  const isCurrent = () => currentRun === runId;
  useMapReadyTaskState.getState().start(ordered.length);

  for (let index = 0; index < ordered.length; index++) {
    if (!isCurrent()) return;
    const task = ordered[index];
    useMapReadyTaskState.getState().begin(task.label, index);
    await task.run({
      isCurrent,
      reportProgress: progress => {
        if (isCurrent()) useMapReadyTaskState.getState().report(progress);
      }
    });
  }

  if (!isCurrent()) return;
  useMapReadyTaskState.getState().finish();
  document.dispatchEvent(new CustomEvent("fmg:map-ready-tasks-completed"));
}

async function runRequestedTasks(): Promise<void> {
  if (!coreMapReady || fullRunId !== null || requestedRunId !== null || !requestedTaskIds.size) return;

  const currentRun = ++runId;
  requestedRunId = currentRun;
  try {
    const ordered = orderRequestedTasks();
    requestedTaskIds.clear();
    await runTasks(ordered, currentRun);
  } catch (error) {
    console.error(error);
    useMapReadyTaskState.getState().cancel();
  } finally {
    if (requestedRunId === currentRun) requestedRunId = null;
    if (coreMapReady && requestedTaskIds.size) queueMicrotask(() => void runRequestedTasks());
  }
}

/**
 * Runs after core rendering has been committed. The double RAF guarantees the browser has a
 * chance to paint the new map before extension initialization can consume the main thread.
 */
export async function startMapReadyTasks(): Promise<void> {
  const currentRun = ++runId;
  const isCurrent = () => currentRun === runId;
  coreMapReady = true;
  fullRunId = currentRun;
  let ordered: MapReadyTask[];
  try {
    ordered = orderTasks();
  } catch (error) {
    console.error(error);
    useMapReadyTaskState.getState().cancel();
    if (fullRunId === currentRun) fullRunId = null;
    return;
  }

  await nextPaint();
  if (!isCurrent()) {
    if (fullRunId === currentRun) fullRunId = null;
    return;
  }

  useMapReadyTaskState.getState().start(ordered.length + 1);
  useMapReadyTaskState.getState().begin("Preparing extensions", 0);

  // Dynamic extensions retain the documented event contract. Built-in extensions use the
  // explicit task API below so ordering and UI progress are known to the host.
  measureGenerationStep("generateExtensionEvent", () => {
    document.dispatchEvent(new CustomEvent("fmg:generate-post-core"));
  });
  if (isCurrent()) {
    for (let index = 0; index < ordered.length; index++) {
      if (!isCurrent()) break;
      const task = ordered[index];
      useMapReadyTaskState.getState().begin(task.label, index + 1);
      await task.run({
        isCurrent,
        reportProgress: progress => {
          if (isCurrent()) useMapReadyTaskState.getState().report(progress);
        }
      });
    }
  }

  if (isCurrent()) {
    useMapReadyTaskState.getState().finish();
    document.dispatchEvent(new CustomEvent("fmg:map-ready-tasks-completed"));
  }
  if (fullRunId === currentRun) fullRunId = null;
  if (coreMapReady && requestedTaskIds.size) queueMicrotask(() => void runRequestedTasks());
}
