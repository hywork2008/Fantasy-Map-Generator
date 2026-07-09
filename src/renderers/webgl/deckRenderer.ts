import { Deck, OrthographicView, type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { buildDeckLayers } from "./buildDeckLayers";

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
  canvas.style.width = `${viewContext.svgWidth}px`;
  canvas.style.height = `${viewContext.svgHeight}px`;
}

function getPickedObjectId(info: PickingInfo | null): string | null {
  const object = info?.object;
  if (!object || typeof object !== "object") return null;
  const record = object as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : null;
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
  const info = pickFromPointerEvent(event, activePickingViewContext);
  const id = getPickedObjectId(info);
  if (id === lastHoverPickId) return;
  lastHoverPickId = id;
  document.dispatchEvent(new CustomEvent<PickingInfo | null>("fmg:webgl-map-hover", { detail: info }));
}

function handlePointerUp(event: PointerEvent): void {
  if (!activePickingViewContext) return;
  const info = pickFromPointerEvent(event, activePickingViewContext);
  document.dispatchEvent(new CustomEvent<PickingInfo | null>("fmg:webgl-map-pick", { detail: info }));
}

export const DeckGlRenderer = {
  ensureInitialized(viewContext: ViewContext): boolean {
    const canvas = viewContext.webglCanvas;
    if (!canvas) return false;

    sizeCanvas(canvas, viewContext);
    document.body.classList.toggle(BODY_HYBRID_CLASS, viewContext.renderMode === "webglHybrid");
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
    document.body.classList.toggle(BODY_HYBRID_CLASS, enabled);
  }
};
