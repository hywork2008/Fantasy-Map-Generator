import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { drawLayers, schedule3dSceneUpdate, schedule3dTerrainUpdate, scheduleWebglUpdate } from "../controllers/layers";
import {
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  MarkersRenderer,
  MilitaryRenderer,
  StateLabelsRenderer
} from "../renderers";
import { useLayerState } from "../store/layerState";
import { presentationData } from "./presentationData";
import { type DataTopic, type WorldCommit, type WorldRuntime, worldRuntime } from "./worldRuntime";

export interface RenderEffects {
  syncPresentation(): void;
  renderFullWorld(): void;
  renderBorders(): void;
  renderStateLabels(): void;
  renderBurgIcons(): void;
  renderBurgLabels(): void;
  renderMarkers(): void;
  renderMilitary(): void;
  scheduleWebglUpdate(): void;
  schedule3dTerrainUpdate(): void;
  schedule3dSceneUpdate(): void;
  refreshEditors(): void;
  refreshMilitary(): void;
}

const visualTopic = (topic: DataTopic): boolean =>
  topic !== "simulation.clock" &&
  (topic.startsWith("map.") ||
    topic.startsWith("simulation.") ||
    topic.startsWith("presentation.") ||
    topic.startsWith("extension."));

/**
 * Maps semantic change topics to renderer work. This is deliberately coarse in
 * Phase 1: the coordinator centralizes invalidation first, then later phases
 * can replace these calls with per-layer revision comparisons.
 */
export function createRenderCoordinator(runtime: WorldRuntime, effects: RenderEffects): () => void {
  return runtime.subscribe(commit => applyCommit(commit, effects));
}

function applyCommit(commit: WorldCommit<unknown>, effects: RenderEffects): void {
  if (commit.changes.fullReplace) {
    effects.syncPresentation();
    effects.renderFullWorld();
    effects.refreshEditors();
    return;
  }

  const topics = new Set(commit.changes.changes.map(change => change.topic));

  if (topics.has("map.politics")) {
    effects.renderBorders();
    effects.renderStateLabels();
  }

  if (topics.has("map.settlements")) {
    effects.renderBurgIcons();
    effects.renderBurgLabels();
    effects.schedule3dSceneUpdate();
  }

  if (topics.has("map.annotations")) effects.renderMarkers();

  if (topics.has("simulation.military")) {
    effects.renderMilitary();
    effects.refreshMilitary();
  }

  if ([...topics].some(visualTopic)) {
    effects.scheduleWebglUpdate();
    effects.schedule3dTerrainUpdate();
  }

  if (topics.has("map.politics") || topics.has("map.settlements") || topics.has("map.annotations")) {
    effects.refreshEditors();
  }
}

let stopCoordinator: (() => void) | null = null;

/** Install the production renderer adapter once application view infrastructure is ready. */
export function initRenderCoordinator(): void {
  stopCoordinator?.();
  stopCoordinator = createRenderCoordinator(worldRuntime, {
    syncPresentation: () => useLayerState.getState().hydrateActiveLayers(presentationData.activeLayers),
    renderFullWorld: () => {
      if (viewContext.renderMap) drawLayers();
    },
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
    renderMarkers: () => {
      if (!viewContext.renderMap) return;
      MarkersRenderer.render(worldContext, viewContext, appServices);
    },
    renderMilitary: () => {
      if (!viewContext.renderMap) return;
      MilitaryRenderer.render(worldContext, viewContext, appServices);
    },
    scheduleWebglUpdate,
    schedule3dTerrainUpdate,
    schedule3dSceneUpdate,
    refreshEditors: () => document.dispatchEvent(new CustomEvent("fmg:refresh-editors")),
    refreshMilitary: () => document.dispatchEvent(new CustomEvent("fmg:refresh-military"))
  });
}
