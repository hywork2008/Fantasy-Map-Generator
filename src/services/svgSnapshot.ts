import { viewContext } from "../context/viewContext";
import { bindViewLayersFromSvg } from "../initViewLayers";
import { projectPresentationToSvg } from "../renderers/presentationProjection";
import { applyHybridLayerPolicy } from "../renderers/webgl/hybridLayerPolicy";
import { presentationData } from "../runtime/presentationData";
import { reassertFullscreen3dMapOwnership } from "../store/viewModeState";
import { paintSvgMapLayers } from "./svgPaintRegistry";

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
 *
 * Fullscreen 3D (viewMesh/viewGlobe) may call this for terrain textures. While the export
 * clone owns `id="map"`, any hide styles applied via getElementById stick to the clone and
 * are discarded on restore — `reassertFullscreen3dMapOwnership` re-locks the live root.
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
  // Preserve ownership styles across detach/reinsert. enter3dView locks the live node; the
  // temporary export clone must not inherit those as "already applied to #map".
  const liveVisibility = liveRoot.style.visibility;
  const livePointerEvents = liveRoot.style.pointerEvents;

  liveRoot.remove();

  const exportRoot = liveRoot.cloneNode(true) as SVGSVGElement;
  exportRoot.id = "map";
  exportRoot.setAttribute(OFFSCREEN_ATTR, "true");
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "-100000px";
  exportRoot.style.top = "0";
  // Keep visibility:visible (not hidden): paintSvgMapLayers → drawStateLabels measures
  // getBBox / getTotalLength / getComputedTextLength. Hidden SVG roots yield zero geometry and
  // produce empty/broken state labels in mesh/full-map exports. Off-screen left offset is enough
  // to avoid a visible flash; pointer-events:none blocks interaction.
  exportRoot.style.visibility = "visible";
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

    // Restore the pre-export ownership styles first, then reassert if 3D is still active
    // (covers the case where enter3dView's hide landed on the export clone mid-flight).
    liveRoot.style.visibility = liveVisibility;
    liveRoot.style.pointerEvents = livePointerEvents;

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

    reassertFullscreen3dMapOwnership(viewContext.webglCanvas);
  }
}

/**
 * @deprecated Prefer `withOffscreenSvgExport`. Kept as a thin alias so older
 * call sites that only need a snapshot callback keep compiling during cutover.
 */
export async function withSvgSnapshot<T>(createSnapshot: () => T | Promise<T>): Promise<T> {
  return withOffscreenSvgExport(() => createSnapshot());
}
