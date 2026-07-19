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
import { projectPresentationToSvg } from "../renderers/presentationProjection";
import { buildLandCellGeometry } from "../renderers/webgl/adapters/deckDataAdapters";
import {
  clearPendingLandTopologyProjection,
  getLandTopologySignature,
  markLandTopologyProjectionPending,
  primeLandTopologyCache
} from "../renderers/webgl/buildDeckLayers";
import { LandTopologyProjectionScheduler } from "../renderers/webgl/landTopologyProjectionScheduler";
import {
  InProcessLandTopologyProjectionJobAdapter,
  WorkerLandTopologyProjectionAdapter
} from "../renderers/webgl/landTopologyProjectionWorkerAdapter";
import { useLayerState } from "../store/layerState";
import { layerIsOn } from "../utils/nodeUtils";
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
  scheduleLandTopologyProjection(): void;
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
  let pendingTopics = new Set<DataTopic>();
  let pendingFullReplace = false;
  let frameQueued = false;

  const flush = () => {
    frameQueued = false;
    const commit: WorldCommit<unknown> = {
      result: undefined,
      changes: {
        fromRevision: 0,
        toRevision: 0,
        fullReplace: pendingFullReplace,
        changes: [...pendingTopics].map(topic => ({ topic, kind: "replace" as const }))
      }
    };
    pendingTopics = new Set();
    pendingFullReplace = false;
    applyCommit(commit, effects);
  };

  const queueFrame = () => {
    if (frameQueued) return;
    frameQueued = true;
    // Unit tests and headless consumers have no browser frame scheduler. They
    // still observe the same coalescing seam synchronously.
    if (typeof requestAnimationFrame === "undefined") {
      flush();
      return;
    }
    requestAnimationFrame(flush);
  };

  return runtime.subscribe(commit => {
    pendingFullReplace ||= commit.changes.fullReplace;
    for (const change of commit.changes.changes) pendingTopics.add(change.topic);
    queueFrame();
  });
}

function applyCommit(commit: WorldCommit<unknown>, effects: RenderEffects): void {
  if (commit.changes.fullReplace) {
    effects.syncPresentation();
    effects.scheduleLandTopologyProjection();
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
    if (topics.has("map.topology") || topics.has("map.physical")) effects.scheduleLandTopologyProjection();
    effects.scheduleWebglUpdate();
    effects.schedule3dTerrainUpdate();
  }

  if (topics.has("map.politics") || topics.has("map.settlements") || topics.has("map.annotations")) {
    effects.refreshEditors();
  }
}

let stopCoordinator: (() => void) | null = null;
let landTopologyScheduler: LandTopologyProjectionScheduler | null = null;

/** Install the production renderer adapter once application view infrastructure is ready. */
export function initRenderCoordinator(): void {
  stopCoordinator?.();
  landTopologyScheduler?.dispose();
  landTopologyScheduler = new LandTopologyProjectionScheduler({
    adapter:
      typeof Worker === "undefined"
        ? new InProcessLandTopologyProjectionJobAdapter()
        : new WorkerLandTopologyProjectionAdapter(),
    source: {
      getSignature: () => getLandTopologySignature(worldContext, viewContext, worldRuntime.readTrusted()),
      buildRequest: () => {
        const snapshot = worldRuntime.readTrusted();
        return {
          revision: snapshot.revision,
          geometry: buildLandCellGeometry(worldContext, viewContext.focusScope)
        };
      }
    },
    cache: {
      markPending: markLandTopologyProjectionPending,
      publish: (signature, result) => primeLandTopologyCache(signature, result.topology),
      clearPending: clearPendingLandTopologyProjection
    },
    onReady: scheduleWebglUpdate,
    onFailure: () => scheduleWebglUpdate()
  });
  stopCoordinator = createRenderCoordinator(worldRuntime, {
    syncPresentation: () => {
      projectPresentationToSvg(viewContext.svg.node(), presentationData);
      useLayerState.getState().hydrateActiveLayers(presentationData.activeLayers);
      useLayerState.getState().hydrateLayerOrder(presentationData.layerOrder);
    },
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
      if (!viewContext.renderMap || !layerIsOn("toggleMilitary")) return;
      MilitaryRenderer.render(worldContext, viewContext, appServices);
    },
    scheduleWebglUpdate,
    scheduleLandTopologyProjection: () => landTopologyScheduler?.schedule(),
    schedule3dTerrainUpdate,
    schedule3dSceneUpdate,
    refreshEditors: () => document.dispatchEvent(new CustomEvent("fmg:refresh-editors")),
    refreshMilitary: () => document.dispatchEvent(new CustomEvent("fmg:refresh-military"))
  });
}
