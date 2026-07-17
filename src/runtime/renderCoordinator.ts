import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { scheduleWebglUpdate } from "../controllers/layers";
import {
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  MilitaryRenderer,
  StateLabelsRenderer
} from "../renderers";
import { type DataTopic, type WorldCommit, type WorldRuntime, worldRuntime } from "./worldRuntime";

export interface RenderEffects {
  renderBorders(): void;
  renderStateLabels(): void;
  renderBurgIcons(): void;
  renderBurgLabels(): void;
  renderMilitary(): void;
  scheduleWebglUpdate(): void;
}

const visualTopic = (topic: DataTopic): boolean =>
  topic !== "simulation.clock" &&
  (topic.startsWith("map.") || topic.startsWith("simulation.") || topic.startsWith("extension."));

/**
 * Maps semantic change topics to renderer work. This is deliberately coarse in
 * Phase 1: the coordinator centralizes invalidation first, then later phases
 * can replace these calls with per-layer revision comparisons.
 */
export function createRenderCoordinator(runtime: WorldRuntime, effects: RenderEffects): () => void {
  return runtime.subscribe(commit => applyCommit(commit, effects));
}

function applyCommit(commit: WorldCommit<unknown>, effects: RenderEffects): void {
  const topics = new Set(commit.changes.changes.map(change => change.topic));

  if (topics.has("map.politics")) {
    effects.renderBorders();
    effects.renderStateLabels();
  }

  if (topics.has("map.settlements")) {
    effects.renderBurgIcons();
    effects.renderBurgLabels();
  }

  if (topics.has("simulation.military")) effects.renderMilitary();
  if ([...topics].some(visualTopic)) effects.scheduleWebglUpdate();
}

let stopCoordinator: (() => void) | null = null;

/** Install the production renderer adapter once application view infrastructure is ready. */
export function initRenderCoordinator(): void {
  stopCoordinator?.();
  stopCoordinator = createRenderCoordinator(worldRuntime, {
    renderBorders: () => {
      if (!viewContext.renderMap) return;
      BordersRenderer.render(worldContext, viewContext, appServices);
    },
    renderStateLabels: () => {
      if (!viewContext.renderMap) return;
      StateLabelsRenderer.render(worldContext, viewContext, appServices);
    },
    renderBurgIcons: () => {
      if (!viewContext.renderMap) return;
      BurgIconsRenderer.render(worldContext, viewContext, appServices);
    },
    renderBurgLabels: () => {
      if (!viewContext.renderMap) return;
      BurgLabelsRenderer.render(worldContext, viewContext, appServices);
    },
    renderMilitary: () => {
      if (!viewContext.renderMap) return;
      MilitaryRenderer.render(worldContext, viewContext, appServices);
    },
    scheduleWebglUpdate
  });
}
