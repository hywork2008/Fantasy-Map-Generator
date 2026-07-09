const WEBGL_MANAGED_SVG_LAYER_IDS = [
  "ocean",
  "landmass",
  "texture",
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
  "coastline"
] as const;

export const HYBRID_WEBGL_MANAGED_SVG_LAYER_IDS: ReadonlySet<string> = new Set(WEBGL_MANAGED_SVG_LAYER_IDS);

export const HYBRID_SVG_OVERLAY_LAYER_IDS = [
  "ice",
  "terrain",
  "coordinates",
  "compass",
  "scaleBar",
  "calendar",
  "ruler",
  "legend",
  "labels",
  "burgLabels",
  "burgIcons",
  "icons",
  "anchors",
  "armies",
  "markers",
  "emblems",
  "debug",
  "fogging"
] as const;

const WEBGL_MANAGED_CLASS = "fmg-webgl-managed-svg-layer";
const HYBRID_SVG_OVERLAY_CLASS = "fmg-webgl-svg-overlay-layer";

export function applyHybridLayerPolicy(root: ParentNode = document): void {
  for (const id of WEBGL_MANAGED_SVG_LAYER_IDS) {
    root.querySelector(`#${id}`)?.classList.add(WEBGL_MANAGED_CLASS);
  }

  for (const id of HYBRID_SVG_OVERLAY_LAYER_IDS) {
    root.querySelector(`#${id}`)?.classList.add(HYBRID_SVG_OVERLAY_CLASS);
  }
}
