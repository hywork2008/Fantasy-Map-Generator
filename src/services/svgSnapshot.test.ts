import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./svgPaintRegistry", () => ({
  paintSvgMapLayers: vi.fn()
}));

vi.mock("../initViewLayers", () => ({
  bindViewLayersFromSvg: vi.fn()
}));

vi.mock("../renderers/presentationProjection", () => ({
  projectPresentationToSvg: vi.fn()
}));

vi.mock("../renderers/webgl/hybridLayerPolicy", () => ({
  applyHybridLayerPolicy: vi.fn()
}));

vi.mock("../runtime/presentationData", () => ({
  presentationData: { styles: {}, activeLayers: {}, layerOrder: [], overlays: {}, labels: {} }
}));

import { viewContext } from "../context/viewContext";
import { bindViewLayersFromSvg } from "../initViewLayers";
import { projectPresentationToSvg } from "../renderers/presentationProjection";
import { applyHybridLayerPolicy } from "../renderers/webgl/hybridLayerPolicy";
import { useViewModeState } from "../store/viewModeState";
import { paintSvgMapLayers } from "./svgPaintRegistry";
import { withOffscreenSvgExport } from "./svgSnapshot";

function installLiveMap(): SVGSVGElement {
  const live = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  live.id = "map";
  const viewbox = document.createElementNS("http://www.w3.org/2000/svg", "g");
  viewbox.id = "viewbox";
  live.appendChild(viewbox);
  document.body.appendChild(live);
  return live;
}

describe("withOffscreenSvgExport (P2-13)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    viewContext.renderMode = "webglHybrid";
    localStorage.setItem("fmg-render-mode", "webglHybrid");
    document.body.classList.add("fmg-webgl-hybrid");
    useViewModeState.getState().setActiveViewMode("viewStandard");
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    useViewModeState.getState().setActiveViewMode("viewStandard");
  });

  it("does not call setRenderMode or change the stored render-mode preference", async () => {
    installLiveMap();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await withOffscreenSvgExport(async root => {
      expect(root.getAttribute("data-fmg-offscreen-export")).toBe("true");
      expect(document.querySelectorAll("#map").length).toBe(1);
      return "ok";
    });

    expect(localStorage.getItem("fmg-render-mode")).toBe("webglHybrid");
    expect(viewContext.renderMode).toBe("webglHybrid");
    // Only the restore guard may touch storage; never setRenderMode's write of a new mode mid-export.
    const modeWrites = setItem.mock.calls.filter(([key, value]) => key === "fmg-render-mode" && value === "svg");
    expect(modeWrites).toEqual([]);
  });

  it("paints SVG + PresentationData into the offscreen root then restores live #map", async () => {
    const live = installLiveMap();
    let sawExportRoot = false;

    await withOffscreenSvgExport(root => {
      sawExportRoot = root !== live && root.getAttribute("data-fmg-offscreen-export") === "true";
      return undefined;
    });

    expect(sawExportRoot).toBe(true);
    expect(paintSvgMapLayers).toHaveBeenCalledOnce();
    expect(projectPresentationToSvg).toHaveBeenCalledOnce();
    expect(bindViewLayersFromSvg).toHaveBeenCalled();
    expect(applyHybridLayerPolicy).toHaveBeenCalled();
    expect(document.getElementById("map")).toBe(live);
    expect(live.isConnected).toBe(true);
    expect(document.querySelector(`[data-fmg-offscreen-export]`)).toBeNull();
    expect(viewContext.renderMode).toBe("webglHybrid");
    expect(document.body.classList.contains("fmg-webgl-hybrid")).toBe(true);
  });

  it("skips the offscreen rebuild when already in SVG mode", async () => {
    const live = installLiveMap();
    viewContext.renderMode = "svg";

    const result = await withOffscreenSvgExport(root => {
      expect(root).toBe(live);
      return 42;
    });

    expect(result).toBe(42);
    expect(paintSvgMapLayers).not.toHaveBeenCalled();
    expect(bindViewLayersFromSvg).not.toHaveBeenCalled();
  });

  it("restores live state when produce throws", async () => {
    const live = installLiveMap();

    await expect(
      withOffscreenSvgExport(() => {
        throw new Error("export failed");
      })
    ).rejects.toThrow("export failed");

    expect(document.getElementById("map")).toBe(live);
    expect(viewContext.renderMode).toBe("webglHybrid");
    expect(localStorage.getItem("fmg-render-mode")).toBe("webglHybrid");
  });

  it("re-locks the live #map after export when a fullscreen 3D view is active", async () => {
    const live = installLiveMap();
    live.style.visibility = "hidden";
    live.style.pointerEvents = "none";
    useViewModeState.getState().setActiveViewMode("viewMesh");

    // Simulate enter3dView mistakenly styling the export clone (the race under fix): while produce
    // runs, document.getElementById("map") is the clone — hide styles would stick to it only.
    await withOffscreenSvgExport(root => {
      root.style.visibility = "hidden";
      root.style.pointerEvents = "none";
      // Clobber live styles as if they were never applied to the live node.
      live.style.visibility = "visible";
      live.style.pointerEvents = "auto";
      return undefined;
    });

    expect(document.getElementById("map")).toBe(live);
    expect(live.style.visibility).toBe("hidden");
    expect(live.style.pointerEvents).toBe("none");
  });
});
