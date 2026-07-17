import { Deck, OrthographicView, type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import type { AppServices } from "../../context/appServices";
import { type ViewContext, viewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { worldRuntime } from "../../runtime/worldRuntime";
import type {
  WebglDragDetail,
  WebglDragKind,
  WebglPickCandidatesDetail,
  WebglPickDetail,
  WebglPickKind
} from "../../types/webglPicking";
import { buildDeckLayers } from "./buildDeckLayers";
import { applyHybridLayerPolicy, isHybridSvgOverlayElement } from "./hybridLayerPolicy";

const BODY_HYBRID_CLASS = "fmg-webgl-hybrid";
const PICK_RADIUS = 6;
const PICK_CANDIDATE_DEPTH = 20;
const SEMANTIC_PICK_RADIUS = 8;
let pickingEventTarget: SVGSVGElement | null = null;
let lastHoverPickId: string | null = null;
let activePickingViewContext: ViewContext | null = null;
// Satellite viewMesh renders its own terrain and procedural texture. Keep the Deck instance
// available for a fast return to Standard view, but release its map layers while that mode owns
// the second WebGL context.
let deckLayersSuspended = false;

interface ActiveWebglDrag {
  kind: WebglDragKind;
  id: string;
  cellId: number | null;
  startCoordinate: [number, number];
}

let activeDrag: ActiveWebglDrag | null = null;

function isWebglDraggableKind(kind: WebglPickKind): kind is WebglDragKind {
  return kind === "marker" || kind === "ice";
}

/**
 * Lets a controller declare which currently-picked WebGL object is drag-eligible right now
 * (e.g. "this marker is selected and its editor is open"), without deckRenderer importing
 * controller modules directly. See `registerWebglDragTargetPredicate` usage in `controllers/editors.ts`.
 */
let dragTargetPredicate: (detail: WebglPickDetail) => boolean = () => false;

export function registerWebglDragTargetPredicate(predicate: (detail: WebglPickDetail) => boolean): void {
  dragTargetPredicate = predicate;
}

/**
 * Cheap companion to `dragTargetPredicate`: "is there any drag-eligible entity right now at all"
 * (e.g. "a marker editor is open"), without needing a pick result to ask. `handlePointerDown`
 * checks this before running the multi-object candidate pick so ordinary clicks (no editor open,
 * the overwhelming majority of pointerdowns) skip that extra GPU readback entirely.
 */
let hasWebglDragTarget: () => boolean = () => false;

export function registerWebglDragAvailability(check: () => boolean): void {
  hasWebglDragTarget = check;
}

type DeckDatum = Record<string, unknown>;
type DeckLayerLike = { id?: string; props?: { data?: unknown } };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function getOrthographicViewState(viewContext: Readonly<ViewContext>): OrthographicViewState {
  const scale = Math.max(viewContext.scale || 1, 0.0001);
  return {
    target: [
      (viewContext.svgWidth / 2 - viewContext.viewX) / scale,
      (viewContext.svgHeight / 2 - viewContext.viewY) / scale,
      0
    ],
    zoom: Math.log2(scale)
  };
}

function sizeCanvas(canvas: HTMLCanvasElement, viewContext: Readonly<ViewContext>): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(viewContext.svgWidth * ratio));
  const height = Math.max(1, Math.round(viewContext.svgHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${viewContext.svgWidth}px`;
  canvas.style.height = `${viewContext.svgHeight}px`;
}

function getPickedObjectId(info: WebglPickDetail | null): string | null {
  return info ? `${info.layerId}:${info.id}` : null;
}

function isWebglPickKind(value: unknown): value is WebglPickKind {
  return (
    value === "background" ||
    value === "land" ||
    value === "height" ||
    value === "biome" ||
    value === "culture" ||
    value === "religion" ||
    value === "state" ||
    value === "province" ||
    value === "zone" ||
    value === "temperature" ||
    value === "population" ||
    value === "precipitation" ||
    value === "danger" ||
    value === "lake" ||
    value === "coastline" ||
    value === "ice" ||
    value === "emblem" ||
    value === "burgIcon" ||
    value === "marker" ||
    value === "military" ||
    value === "label" ||
    value === "cell" ||
    value === "grid" ||
    value === "border" ||
    value === "river" ||
    value === "route" ||
    value === "extension"
  );
}

function toPickDetail(info: PickingInfo | null): WebglPickDetail | null {
  const object = info?.object;
  if (!object || typeof object !== "object") return null;
  const record = object as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const kind = isWebglPickKind(record.kind) ? record.kind : null;
  if (!id || !kind || !info.layer?.id) return null;
  const extensionId = typeof record.extensionId === "string" ? record.extensionId : null;
  if (kind === "extension" && !extensionId) return null;
  const cellId =
    typeof record.cellId === "number" && Number.isFinite(record.cellId) && record.cellId >= 0 ? record.cellId : null;
  const coordinate =
    Array.isArray(info.coordinate) && typeof info.coordinate[0] === "number" && typeof info.coordinate[1] === "number"
      ? ([info.coordinate[0], info.coordinate[1], info.coordinate[2]].filter(value => typeof value === "number") as [
          number,
          number,
          number?
        ])
      : null;
  return {
    kind,
    extensionId,
    id,
    cellId,
    layerId: info.layer.id,
    index: info.index,
    x: info.x,
    y: info.y,
    coordinate
  };
}

function toUniquePickDetails(infos: PickingInfo[]): WebglPickDetail[] {
  return uniquePickDetails(infos.map(toPickDetail).filter((detail): detail is WebglPickDetail => detail !== null));
}

function uniquePickDetails(source: WebglPickDetail[]): WebglPickDetail[] {
  const details: WebglPickDetail[] = [];
  const seen = new Set<string>();
  for (const detail of source) {
    const key = `${detail.layerId}:${detail.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    details.push(detail);
  }
  return details;
}

/** Converts canvas-local pointer coordinates to map-space coordinates (inverse of the deck.gl orthographic view transform driven by pan/zoom). */
function screenToMapPoint(viewContext: ViewContext, x: number, y: number): [number, number] {
  return [(x - viewContext.viewX) / viewContext.scale, (y - viewContext.viewY) / viewContext.scale];
}

function collectSemanticPickDetails(
  viewContext: ViewContext,
  x: number,
  y: number,
  visualCandidates: WebglPickDetail[]
): WebglPickDetail[] {
  const mapPointVal = screenToMapPoint(viewContext, x, y);
  const padding = Math.max(SEMANTIC_PICK_RADIUS / Math.max(viewContext.scale, 0.0001), 1);
  const military = collectMilitaryBoxCandidates(viewContext, mapPointVal, x, y, padding);
  const militaryBounds = military.map(candidate => candidate.bounds);
  const burgs = collectBurgIconCandidates(viewContext, mapPointVal, x, y, padding, militaryBounds);
  const markers = collectMarkerCandidates(viewContext, mapPointVal, x, y, padding);
  const caravans = collectCaravanCandidates(viewContext, mapPointVal, x, y, padding);

  return uniquePickDetails([
    ...visualCandidates,
    ...military.map(candidate => candidate.detail),
    ...burgs,
    ...markers,
    ...caravans
  ]).slice(visualCandidates.length);
}

function collectMilitaryBoxCandidates(
  viewContext: ViewContext,
  mapPoint: [number, number],
  x: number,
  y: number,
  padding: number
): Array<{ detail: WebglPickDetail; bounds: Bounds }> {
  const candidates: Array<{ detail: WebglPickDetail; bounds: Bounds }> = [];
  getLayerData(viewContext, "fmg-webgl-military").forEach((datum, index) => {
    const polygon = getPointList(datum.polygon);
    const bounds = getBounds(polygon);
    if (!bounds || !boundsContainsPoint(bounds, mapPoint, padding)) return;
    const id = stringValue(datum.id);
    const cellId = numberValue(datum.cellId);
    if (!id || cellId === null) return;
    candidates.push({
      bounds,
      detail: {
        kind: "military",
        extensionId: null,
        id,
        cellId,
        layerId: "fmg-webgl-military",
        index,
        x,
        y,
        coordinate: getBoundsCenter(bounds)
      }
    });
  });
  return candidates;
}

function collectBurgIconCandidates(
  viewContext: ViewContext,
  mapPoint: [number, number],
  x: number,
  y: number,
  padding: number,
  militaryBounds: Bounds[]
): WebglPickDetail[] {
  const candidates: WebglPickDetail[] = [];
  getLayerData(viewContext, "fmg-webgl-burg-icons").forEach((datum, index) => {
    const position = getPoint(datum.position);
    if (!position) return;
    const bounds = getIconBounds(position, numberValue(datum.size) ?? 0, padding);
    const isNearPointer = boundsContainsPoint(bounds, mapPoint, padding);
    const overlapsMilitary = militaryBounds.some(military => boundsIntersect(bounds, military, padding));
    if (!isNearPointer && !overlapsMilitary) return;
    const id = stringValue(datum.id);
    const cellId = numberValue(datum.cellId);
    if (!id || cellId === null) return;
    candidates.push({
      kind: "burgIcon",
      extensionId: null,
      id,
      cellId,
      layerId: "fmg-webgl-burg-icons",
      index,
      x,
      y,
      coordinate: position
    });
  });
  return candidates;
}

function collectMarkerCandidates(
  viewContext: ViewContext,
  mapPoint: [number, number],
  x: number,
  y: number,
  padding: number
): WebglPickDetail[] {
  const candidates: WebglPickDetail[] = [];
  getLayerData(viewContext, "fmg-webgl-markers").forEach((datum, index) => {
    const position = getPoint(datum.position);
    if (!position) return;
    const size = numberValue(datum.size) ?? 0;
    const bounds: Bounds = {
      minX: position[0] - size / 2,
      minY: position[1] - size,
      maxX: position[0] + size / 2,
      maxY: position[1]
    };
    if (!boundsContainsPoint(bounds, mapPoint, padding)) return;
    const id = stringValue(datum.id);
    const cellId = numberValue(datum.cellId);
    if (!id || cellId === null) return;
    candidates.push({
      kind: "marker",
      extensionId: null,
      id,
      cellId,
      layerId: "fmg-webgl-markers",
      index,
      x,
      y,
      coordinate: position
    });
  });
  return candidates;
}

function collectCaravanCandidates(
  viewContext: ViewContext,
  mapPoint: [number, number],
  x: number,
  y: number,
  padding: number
): WebglPickDetail[] {
  const candidates: WebglPickDetail[] = [];
  getLayerData(viewContext, "fmg-webgl-extension-economy-trade-caravans").forEach((datum, index) => {
    const position = getPoint(datum.position);
    if (!position) return;
    const size = numberValue(datum.size) ?? 0;
    const bounds = getIconBounds(position, size, padding);
    if (!boundsContainsPoint(bounds, mapPoint, padding)) return;
    const id = stringValue(datum.id);
    if (!id) return;
    candidates.push({
      kind: "extension",
      extensionId: "economy",
      id,
      cellId: null,
      layerId: "fmg-webgl-extension-economy-trade-caravans",
      index,
      x,
      y,
      coordinate: position
    });
  });
  return candidates;
}

function getLayerData(viewContext: ViewContext, layerId: string): DeckDatum[] {
  const deck = viewContext.webglDeck as unknown as { props?: { layers?: DeckLayerLike[] } } | null;
  const layer = deck?.props?.layers?.find(candidate => candidate.id === layerId);
  const data = layer?.props?.data;
  return Array.isArray(data) ? data.filter(isRecord) : [];
}

function isRecord(value: unknown): value is DeckDatum {
  return value !== null && typeof value === "object";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPoint(value: unknown): [number, number] | null {
  return Array.isArray(value) &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
    ? [value[0], value[1]]
    : null;
}

function getPointList(value: unknown): Array<[number, number]> {
  return Array.isArray(value) ? value.map(getPoint).filter((point): point is [number, number] => point !== null) : [];
}

function getBounds(points: Array<[number, number]>): Bounds | null {
  if (!points.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function getIconBounds(position: [number, number], size: number, padding: number): Bounds {
  const half = Math.max(size / 2, padding);
  return {
    minX: position[0] - half,
    minY: position[1] - half,
    maxX: position[0] + half,
    maxY: position[1] + half
  };
}

function boundsContainsPoint(bounds: Bounds, [x, y]: [number, number], padding = 0): boolean {
  return (
    x >= bounds.minX - padding && x <= bounds.maxX + padding && y >= bounds.minY - padding && y <= bounds.maxY + padding
  );
}

function boundsIntersect(left: Bounds, right: Bounds, padding = 0): boolean {
  return !(
    left.maxX < right.minX - padding ||
    left.minX > right.maxX + padding ||
    left.maxY < right.minY - padding ||
    left.minY > right.maxY + padding
  );
}

function getBoundsCenter(bounds: Bounds): [number, number] {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}

function pickFromPointerEvent(event: PointerEvent, viewContext: ViewContext): PickingInfo | null {
  if (viewContext.renderMode !== "webglHybrid" || !viewContext.webglDeck || !viewContext.webglCanvas) return null;
  const rect = viewContext.webglCanvas.getBoundingClientRect();
  return viewContext.webglDeck.pickObject({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    radius: PICK_RADIUS
  });
}

function pickCandidatesFromPointerEvent(
  event: PointerEvent,
  viewContext: ViewContext
): WebglPickCandidatesDetail | null {
  if (viewContext.renderMode !== "webglHybrid" || !viewContext.webglDeck || !viewContext.webglCanvas) return null;
  const rect = viewContext.webglCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const infos = viewContext.webglDeck.pickMultipleObjects({
    x,
    y,
    radius: PICK_RADIUS,
    depth: PICK_CANDIDATE_DEPTH
  });
  const visualCandidates = toUniquePickDetails(infos);
  const semanticCandidates = collectSemanticPickDetails(viewContext, x, y, visualCandidates);
  const candidates = uniquePickDetails([...visualCandidates, ...semanticCandidates]);
  return {
    primary: candidates[0] ?? null,
    candidates,
    x,
    y,
    clientX: event.clientX,
    clientY: event.clientY
  };
}

function attachPickingBridge(viewContext: ViewContext): void {
  const svg = viewContext.svg.node();
  if (!svg || pickingEventTarget === svg) return;
  if (!pickingEventTarget) {
    // d3-zoom binds "mousedown.zoom" directly on the svg element (AT_TARGET, since pointerdown
    // for these gestures always targets the svg root itself, not a descendant): registering our
    // own suppressor there too would run in listener-registration order, i.e. after zoom's, which
    // is already attached during early init — too late to stop it. Registering on `document` with
    // `capture: true` instead guarantees our listener runs during the capturing phase, strictly
    // before the event reaches svg's AT_TARGET listeners, regardless of registration order.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("mousedown", handleMouseDownCapture, true);
  }
  if (pickingEventTarget) {
    pickingEventTarget.removeEventListener("pointermove", handlePointerMove);
    pickingEventTarget.removeEventListener("pointerup", handlePointerUp);
  }
  pickingEventTarget = svg;
  activePickingViewContext = viewContext;
  pickingEventTarget.addEventListener("pointermove", handlePointerMove);
  pickingEventTarget.addEventListener("pointerup", handlePointerUp);
}

function eventTargetsHybridSvgOverlay(event: Event): boolean {
  return event.target instanceof Element && isHybridSvgOverlayElement(event.target);
}

function handleMouseDownCapture(event: MouseEvent): void {
  if (!activeDrag) return;
  event.preventDefault();
  event.stopPropagation();
}

function canvasPoint(event: PointerEvent, viewContext: ViewContext): [number, number] | null {
  if (!viewContext.webglCanvas) return null;
  const rect = viewContext.webglCanvas.getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}

function dispatchDragEvent(
  type: "fmg:webgl-map-drag-start" | "fmg:webgl-map-drag" | "fmg:webgl-map-drag-end",
  drag: ActiveWebglDrag,
  coordinate: [number, number],
  event: PointerEvent
): void {
  document.dispatchEvent(
    new CustomEvent<WebglDragDetail>(type, {
      detail: {
        kind: drag.kind,
        id: drag.id,
        cellId: drag.cellId,
        coordinate,
        startCoordinate: drag.startCoordinate,
        clientX: event.clientX,
        clientY: event.clientY
      }
    })
  );
}

function handlePointerDown(event: PointerEvent): void {
  if (eventTargetsHybridSvgOverlay(event)) return;
  if (!activePickingViewContext || activeDrag || !hasWebglDragTarget()) return;
  // A single nearest pick (pickObject) is not enough here: at the drag target's own position
  // several overlapping layers (land/state/route/burgIcon/...) are usually picked first, so this
  // looks at every candidate at the pointer the same way the click pick-chooser does and drags
  // whichever one is both a draggable kind and the entity the caller currently has selected.
  const candidates = pickCandidatesFromPointerEvent(event, activePickingViewContext)?.candidates ?? [];
  const detail = candidates.find(item => isWebglDraggableKind(item.kind) && dragTargetPredicate(item));
  if (!detail || !isWebglDraggableKind(detail.kind)) return;

  const point = canvasPoint(event, activePickingViewContext);
  if (!point) return;
  const startCoordinate = screenToMapPoint(activePickingViewContext, point[0], point[1]);
  activeDrag = { kind: detail.kind, id: detail.id, cellId: detail.cellId, startCoordinate };
  // The compatibility mousedown for this same gesture fires right after this pointerdown;
  // handleMouseDownCapture (registered on "mousedown", capture phase) reads activeDrag and
  // suppresses it there, since that's the event type the pan/zoom behavior actually listens for.
  event.preventDefault();
  dispatchDragEvent("fmg:webgl-map-drag-start", activeDrag, startCoordinate, event);
}

function handlePointerMove(event: PointerEvent): void {
  if (!activePickingViewContext) return;

  if (activeDrag) {
    const point = canvasPoint(event, activePickingViewContext);
    if (!point) return;
    dispatchDragEvent(
      "fmg:webgl-map-drag",
      activeDrag,
      screenToMapPoint(activePickingViewContext, point[0], point[1]),
      event
    );
    return;
  }

  if (eventTargetsHybridSvgOverlay(event)) {
    if (lastHoverPickId !== null) {
      lastHoverPickId = null;
      document.dispatchEvent(new CustomEvent<WebglPickDetail | null>("fmg:webgl-map-hover", { detail: null }));
    }
    return;
  }

  const info = toPickDetail(pickFromPointerEvent(event, activePickingViewContext));
  const id = getPickedObjectId(info);
  if (id === lastHoverPickId) return;
  lastHoverPickId = id;
  document.dispatchEvent(new CustomEvent<WebglPickDetail | null>("fmg:webgl-map-hover", { detail: info }));
}

function handlePointerUp(event: PointerEvent): void {
  if (!activePickingViewContext) return;

  if (activeDrag) {
    const point = canvasPoint(event, activePickingViewContext);
    const coordinate = point
      ? screenToMapPoint(activePickingViewContext, point[0], point[1])
      : activeDrag.startCoordinate;
    dispatchDragEvent("fmg:webgl-map-drag-end", activeDrag, coordinate, event);
    activeDrag = null;
    return;
  }

  if (eventTargetsHybridSvgOverlay(event)) return;

  const detail = pickCandidatesFromPointerEvent(event, activePickingViewContext) ?? {
    primary: toPickDetail(pickFromPointerEvent(event, activePickingViewContext)),
    candidates: [],
    x: event.clientX,
    y: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY
  };
  const primary = detail.primary ?? null;
  document.dispatchEvent(new CustomEvent<WebglPickCandidatesDetail>("fmg:webgl-map-pick-candidates", { detail }));
  document.dispatchEvent(new CustomEvent<WebglPickDetail | null>("fmg:webgl-map-pick", { detail: primary }));
}

export const DeckGlRenderer = {
  ensureInitialized(viewContext: ViewContext): boolean {
    const canvas = viewContext.webglCanvas;
    if (!canvas) return false;

    sizeCanvas(canvas, viewContext);
    this.setModeClass(viewContext.renderMode === "webglHybrid");
    attachPickingBridge(viewContext);

    if (viewContext.webglDeck) return true;

    viewContext.webglDeck = new Deck<OrthographicView>({
      id: "fmg-webgl-deck",
      canvas,
      width: viewContext.svgWidth,
      height: viewContext.svgHeight,
      controller: false,
      views: new OrthographicView({ controller: false, flipY: true }),
      viewState: getOrthographicViewState(viewContext),
      layers: [],
      useDevicePixels: Math.min(window.devicePixelRatio || 1, 2),
      pickingRadius: 4,
      _pickable: true,
      onError: (error: Error) => {
        console.error("deck.gl initialization or rendering error:", error);
        if (viewContext.renderMode === "webglHybrid") {
          import("../../actions").then(({ setRenderMode }) => {
            setRenderMode("svg");
            // Optionally dispatch a notification or show a toast
          });
        }
      }
    });

    return true;
  },

  render(worldContext: Readonly<WorldContext>, viewContext: ViewContext, appServices: AppServices): boolean {
    if (viewContext.renderMode !== "webglHybrid") {
      this.setModeClass(false);
      return false;
    }

    if (!this.ensureInitialized(viewContext)) return false;
    if (deckLayersSuspended) return true;
    const runtimeView = worldRuntime.read();
    viewContext.webglDeck?.setProps({
      width: viewContext.svgWidth,
      height: viewContext.svgHeight,
      viewState: getOrthographicViewState(viewContext),
      layers: buildDeckLayers(worldContext, viewContext, appServices, {
        // Preview/test adapters may render another WorldContext. They keep the
        // content-hash fallback because the host runtime owns no revisions for it.
        revisionProjection: runtimeView.world === worldContext ? runtimeView : undefined
      })
    });
    return true;
  },

  syncViewState(viewContext: ViewContext): void {
    if (viewContext.renderMode !== "webglHybrid" || !viewContext.webglDeck) return;
    const canvas = viewContext.webglCanvas;
    if (!canvas) return;
    sizeCanvas(canvas, viewContext);
    viewContext.webglDeck.setProps({
      width: viewContext.svgWidth,
      height: viewContext.svgHeight,
      viewState: getOrthographicViewState(viewContext)
    });
  },

  /**
   * Keeps the Deck/WebGL context reusable while releasing all map layers for Satellite viewMesh.
   * The hybrid SVG policy intentionally remains enabled: canvas3d, not SVG, owns the visible map.
   */
  suspend(viewContext: ViewContext): boolean {
    if (viewContext.renderMode !== "webglHybrid") return false;
    deckLayersSuspended = true;
    viewContext.webglDeck?.setProps({ layers: [] });
    return true;
  },

  /** Rebuilds the normal hybrid layers after Satellite mode is disabled or 3D view is closed. */
  resume(worldContext: Readonly<WorldContext>, viewContext: ViewContext, appServices: AppServices): boolean {
    if (!deckLayersSuspended) return false;
    deckLayersSuspended = false;
    return this.render(worldContext, viewContext, appServices);
  },

  isSuspended(): boolean {
    return deckLayersSuspended;
  },

  clear(viewContext: ViewContext): void {
    deckLayersSuspended = false;
    viewContext.webglDeck?.setProps({ layers: [] });
    this.setModeClass(false);
  },

  finalize(viewContext: ViewContext): void {
    deckLayersSuspended = false;
    if (pickingEventTarget) {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("mousedown", handleMouseDownCapture, true);
      pickingEventTarget.removeEventListener("pointermove", handlePointerMove);
      pickingEventTarget.removeEventListener("pointerup", handlePointerUp);
      pickingEventTarget = null;
      activePickingViewContext = null;
    }
    activeDrag = null;
    viewContext.webglDeck?.finalize();
    viewContext.webglDeck = null;
    this.setModeClass(false);
  },

  setModeClass(enabled: boolean): void {
    applyHybridLayerPolicy(enabled);
    document.body.classList.toggle(BODY_HYBRID_CLASS, enabled);
  }
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    DeckGlRenderer.finalize(viewContext);
  });
}
