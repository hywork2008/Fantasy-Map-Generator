import type { RoofMaterial, WallMaterial } from "../../city-editor/types/contracts/buildingMassing";

export const WALL_COLOR: Record<WallMaterial, readonly [number, number, number]> = {
  "timber-frame": [0.72, 0.55, 0.38],
  stone: [0.62, 0.6, 0.56],
  brick: [0.55, 0.28, 0.22],
  mudbrick: [0.76, 0.62, 0.4],
  wattle: [0.66, 0.56, 0.42],
  plaster: [0.9, 0.87, 0.8]
};

export const ROOF_COLOR: Record<RoofMaterial, readonly [number, number, number]> = {
  thatch: [0.55, 0.42, 0.22],
  tile: [0.64, 0.24, 0.2],
  slate: [0.32, 0.36, 0.4],
  shingle: [0.43, 0.34, 0.26],
  lead: [0.55, 0.58, 0.6],
  turf: [0.36, 0.45, 0.3]
};

/** Per-building shade. Geometry stays put. */
export function tinted(rgb: readonly [number, number, number], tint: number): [number, number, number] {
  const scale = 0.86 + 0.28 * tint;
  return [Math.min(1, rgb[0] * scale), Math.min(1, rgb[1] * scale), Math.min(1, rgb[2] * scale)];
}
