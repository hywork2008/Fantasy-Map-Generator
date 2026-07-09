import { Deck, OrthographicView, type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import type { WebglPickDetail, WebglPickKind } from "../../types/webglPicking";
import { buildDeckLayers } from "./buildDeckLayers";
import { applyHybridLayerPolicy } from "./hybridLayerPolicy";

const BODY_HYBRID_CLASS = "fmg-webgl-hybrid";
let pickingEventTarget: SVGSVGElement | null = null;
let lastHoverPickId: string | null = null;
let activePickingViewContext: ViewContext | null = null;

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
    value === "cell" ||
    value === "grid" ||
    value === "border" ||
    value === "river" ||
    value === "route"
  );
}

function toPickDetail(info: PickingInfo | null): WebglPickDetail | null {
  const object = info?.object;
  if (!object || typeof object !== "object") return null;
  const record = object as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const kind = isWebglPickKind(record.kind) ? record.kind : null;
  if (!id || !kind || !info.layer?.id) return null;
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
    id,
    cellId,
    layerId: info.layer.id,
    index: info.index,
    x: info.x,
    y: info.y,
    coordinate
  };
}

function pickFromPointerEvent(event: PointerEvent, viewContext: ViewContext): PickingInfo | null {
  if (viewContext.renderMode !== "webglHybrid" || !viewContext.webglDeck || !viewContext.webglCanvas) return null;
  const rect = viewContext.webglCanvas.getBoundingClientRect();
  return viewContext.webglDeck.pickObject({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    radius: 4
  });
}

function attachPickingBridge(viewContext: ViewContext): void {
  const svg = viewContext.svg.node();
  if (!svg || pickingEventTarget === svg) return;
  if (pickingEventTarget) {
    pickingEventTarget.removeEventListener("pointermove", handlePointerMove);
    pickingEventTarget.removeEventListener("pointerup", handlePointerUp);
  }
  pickingEventTarget = svg;
  activePickingViewContext = viewContext;
  pickingEventTarget.addEventListener("pointermove", handlePointerMove);
  pickingEventTarget.addEventListener("pointerup", handlePointerUp);
}

function handlePointerMove(event: PointerEvent): void {
  if (!activePickingViewContext) return;
  const info = toPickDetail(pickFromPointerEvent(event, activePickingViewContext));
  const id = getPickedObjectId(info);
  if (id === lastHoverPickId) return;
  lastHoverPickId = id;
  document.dispatchEvent(new CustomEvent<WebglPickDetail | null>("fmg:webgl-map-hover", { detail: info }));
}

function handlePointerUp(event: PointerEvent): void {
  if (!activePickingViewContext) return;
  const info = toPickDetail(pickFromPointerEvent(event, activePickingViewContext));
  document.dispatchEvent(new CustomEvent<WebglPickDetail | null>("fmg:webgl-map-pick", { detail: info }));
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
      _pickable: true
    });

    return true;
  },

  render(worldContext: Readonly<WorldContext>, viewContext: ViewContext): boolean {
    if (viewContext.renderMode !== "webglHybrid") {
      this.setModeClass(false);
      return false;
    }

    if (!this.ensureInitialized(viewContext)) return false;
    viewContext.webglDeck?.setProps({
      width: viewContext.svgWidth,
      height: viewContext.svgHeight,
      viewState: getOrthographicViewState(viewContext),
      layers: buildDeckLayers(worldContext, viewContext)
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

  clear(viewContext: ViewContext): void {
    viewContext.webglDeck?.setProps({ layers: [] });
    this.setModeClass(false);
  },

  finalize(viewContext: ViewContext): void {
    if (pickingEventTarget) {
      pickingEventTarget.removeEventListener("pointermove", handlePointerMove);
      pickingEventTarget.removeEventListener("pointerup", handlePointerUp);
      pickingEventTarget = null;
      activePickingViewContext = null;
    }
    viewContext.webglDeck?.finalize();
    viewContext.webglDeck = null;
    this.setModeClass(false);
  },

  setModeClass(enabled: boolean): void {
    applyHybridLayerPolicy();
    document.body.classList.toggle(BODY_HYBRID_CLASS, enabled);
  }
};
