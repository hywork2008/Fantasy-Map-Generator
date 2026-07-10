export const WEBGL_MANAGED_SVG_LAYER_IDS = [
  "ocean",
  "landmass",
  "terrs",
  "lakes",
  "biomes",
  "population",
  "cells",
  "gridOverlay",
  "rivers",
  "relig",
  "cults",
  "regions",
  "provs",
  "zones",
  "borders",
  "routes",
  "temperature",
  "prec",
  "danger",
  "coastline",
  "ice",
  "emblems",
  "icons",
  "burgIcons",
  "anchors",
  "markers",
  "armies",
  "labels",
  "burgLabels"
] as const;

export const HYBRID_WEBGL_MANAGED_SVG_LAYER_IDS: ReadonlySet<string> = new Set(WEBGL_MANAGED_SVG_LAYER_IDS);

export const HYBRID_SVG_OVERLAY_LAYER_IDS = [
  "texture",
  "terrain",
  "coordinates",
  "compass",
  "scaleBar",
  "calendar",
  "ruler",
  "legend",
  "debug",
  "fogging"
] as const;

const WEBGL_MANAGED_CLASS = "fmg-webgl-managed-svg-layer";
const HYBRID_SVG_OVERLAY_CLASS = "fmg-webgl-svg-overlay-layer";

export function applyHybridLayerPolicy(enabled = true, root: ParentNode = document): void {
  for (const id of WEBGL_MANAGED_SVG_LAYER_IDS) {
    root.querySelector(`#${id}`)?.classList.toggle(WEBGL_MANAGED_CLASS, enabled);
  }

  for (const id of HYBRID_SVG_OVERLAY_LAYER_IDS) {
    root.querySelector(`#${id}`)?.classList.toggle(HYBRID_SVG_OVERLAY_CLASS, enabled);
  }
}
