import { rn } from "./numberUtils";

/**
 * At max zoom (scale=20), reduce screen size of labels/icons/emblems to 50% of unscaled size.
 * Derived from: (base / scale^e) * scale = base * scale^(1-e), want scale^(1-e)=10 at scale=20 → e=log(2)/log(20)
 *
 * Shared by the SVG zoom handler (src/main.ts) and the WebGL label style extractor
 * (src/renderers/webgl/webglStyleExtractors.ts) so both renderers dampen label/icon size
 * identically as the map zooms.
 */
export const ZOOM_SIZE_EXP = Math.log(2) / Math.log(20);

/** Zoom-dampened local size for burg-level labels, icons, and emblems at the given map zoom `scale`. */
export function dampenBurgLabelSize(baseSize: number, scale: number): number {
  return rn(Math.max(baseSize / scale ** ZOOM_SIZE_EXP, 0.1), 2);
}

/** Zoom-dampened local size for state/country-level labels at the given map zoom `scale`. */
export function dampenStateLabelSize(baseSize: number, scale: number): number {
  return Math.max(rn((baseSize + baseSize / scale) / 2, 2), 1);
}
