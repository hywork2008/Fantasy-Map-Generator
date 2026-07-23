import { viewContext } from "../context/viewContext";
import { paintSvgMapLayers } from "../controllers/layers";
import { bindViewLayersFromSvg } from "../initViewLayers";
import { projectPresentationToSvg } from "../renderers/presentationProjection";
import { applyHybridLayerPolicy } from "../renderers/webgl/hybridLayerPolicy";
import { presentationData } from "../runtime/presentationData";

const BODY_HYBRID_CLASS = "fmg-webgl-hybrid";
const OFFSCREEN_ATTR = "data-fmg-offscreen-export";

/**
 * Build a full-map SVG from canonical world state + PresentationData without
 * switching the user-facing `renderMode`, writing localStorage, or clearing the
 * live deck.gl instance (P2-13).
 *
 * The live `#map` is detached only while the export root owns document IDs so
 * renderers that call `getElementById` resolve against the offscreen tree. The
 * hybrid WebGL canvas sibling stays mounted and visible.
 */
export async function withOffscreenSvgExport<T>(produce: (exportRoot: SVGSVGElement) => T | Promise<T>): Promise<T> {
  const liveRoot = document.getElementById("map");
  if (!(liveRoot instanceof SVGSVGElement)) {
    throw new Error("Map SVG root #map is not found");
  }

  // SVG mode already has a complete live SVG tree — no offscreen rebuild needed.
  if (viewContext.renderMode !== "webglHybrid") {
    return produce(liveRoot);
  }

  const previousMode = viewContext.renderMode;
  const liveParent = liveRoot.parentNode;
  const liveNext = liveRoot.nextSibling;
  const storedRenderMode = localStorage.getItem("fmg-render-mode");

  liveRoot.remove();

  const exportRoot = liveRoot.cloneNode(true) as SVGSVGElement;
  exportRoot.id = "map";
  exportRoot.setAttribute(OFFSCREEN_ATTR, "true");
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "-100000px";
  exportRoot.style.top = "0";
  exportRoot.style.visibility = "hidden";
  exportRoot.style.pointerEvents = "none";
  document.body.appendChild(exportRoot);

  try {
    bindViewLayersFromSvg(exportRoot, { updateWebglCanvas: false, dispatchReinit: false });
    applyHybridLayerPolicy(false, exportRoot);
    document.body.classList.remove(BODY_HYBRID_CLASS);

    // Silent SVG paint path — do not call setRenderMode (localStorage / UI event).
    viewContext.renderMode = "svg";
    paintSvgMapLayers();
    projectPresentationToSvg(exportRoot, presentationData);

    return await produce(exportRoot);
  } finally {
    viewContext.renderMode = previousMode;
    exportRoot.remove();

    if (liveParent) {
      liveParent.insertBefore(liveRoot, liveNext);
    } else {
      document.body.appendChild(liveRoot);
    }

    bindViewLayersFromSvg(liveRoot, { updateWebglCanvas: false, dispatchReinit: false });
    applyHybridLayerPolicy(previousMode === "webglHybrid");
    document.body.classList.toggle(BODY_HYBRID_CLASS, previousMode === "webglHybrid");

    // Guard against any accidental localStorage writes during paint.
    if (storedRenderMode !== null) {
      localStorage.setItem("fmg-render-mode", storedRenderMode);
    } else {
      localStorage.removeItem("fmg-render-mode");
    }
  }
}

/**
 * @deprecated Prefer `withOffscreenSvgExport`. Kept as a thin alias so older
 * call sites that only need a snapshot callback keep compiling during cutover.
 */
export async function withSvgSnapshot<T>(createSnapshot: () => T | Promise<T>): Promise<T> {
  return withOffscreenSvgExport(() => createSnapshot());
}
