import type { BuildingMassing } from "../../city-editor/types/contracts/buildingMassing";
import type { Point } from "../../city-editor/types/primitives";
import { buildingSurfaces, type WallPanel } from "./massingGeometry";

type RGB = readonly [number, number, number];
export interface FacadeDetailColors {
  wall: RGB;
  frame?: RGB;
  trim: RGB;
  window: RGB;
}
export interface FacadeDetailGeometry {
  positions: number[];
  normals: number[];
  colors: number[];
}
export const MAX_FACADE_TRIANGLES = 1200;

/** Planar exterior details only: no interior, texture, opening or footprint changes. */
export function facadeDetails(
  polygon: Point[],
  massing: BuildingMassing,
  colors: FacadeDetailColors,
  elevation = 0
): FacadeDetailGeometry {
  const output: FacadeDetailGeometry = { positions: [], normals: [], colors: [] };
  const panels = buildingSurfaces(polygon, massing, { includeWallPanels: true })?.wallPanels ?? [];
  // Choose one usable entrance wall; frontage is unavailable at this rendering layer.
  const entrance = panels
    .filter(p => p.level === 0 && Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) >= 2.8)
    .sort((a, b) => Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]) - Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]))[0];
  for (const panel of panels) {
    const length = Math.hypot(panel.b[0] - panel.a[0], panel.b[1] - panel.a[1]);
    if (length < 1 || panel.height < 1.6) continue;
    const part = panelDetails(panel, length, massing, colors, elevation, panel === entrance);
    if ((output.positions.length + part.positions.length) / 9 > MAX_FACADE_TRIANGLES) continue;
    output.positions.push(...part.positions);
    output.normals.push(...part.normals);
    output.colors.push(...part.colors);
  }
  return output;
}

function panelDetails(
  panel: WallPanel,
  length: number,
  massing: BuildingMassing,
  colors: FacadeDetailColors,
  elevation: number,
  entrance: boolean
): FacadeDetailGeometry {
  const out: FacadeDetailGeometry = { positions: [], normals: [], colors: [] };
  const ux = (panel.b[0] - panel.a[0]) / length,
    uz = -(panel.b[1] - panel.a[1]) / length;
  const nx = -uz,
    nz = ux;
  const vertex = (s: number, y: number) => [
    panel.a[0] + s * ux + nx * 0.012,
    elevation + panel.base + y,
    -panel.a[1] + s * uz + nz * 0.012
  ];
  const quad = (points: number[][], color: RGB) => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      out.positions.push(...vertex(points[index][0], points[index][1]));
      out.normals.push(nx, 0, nz);
      out.colors.push(...color);
    }
  };
  const rect = (s0: number, y0: number, s1: number, y1: number, color: RGB) =>
    quad(
      [
        [s0, y0],
        [s1, y0],
        [s1, y1],
        [s0, y1]
      ],
      color
    );
  const h = panel.height,
    inset = 0.03;
  const bays = Math.max(1, Math.min(4, Math.floor(length / 3.2)));
  const bay = length / bays;
  const blend = (a: RGB, b: RGB, weight: number): RGB =>
    [0, 1, 2].map(i => a[i] * (1 - weight) + b[i] * weight) as [number, number, number];
  // Weathered timber should read as a structural member, not a black outline.
  const timber = colors.frame ? blend(colors.frame, colors.wall, 0.24) : undefined;
  // A narrow wall plate below the eave reads as shade even on masonry houses.
  const eave: RGB = timber ?? blend(colors.wall, colors.trim, 0.35);
  if (panel.level === massing.floors.length - 1) rect(inset, h - 0.16, length - inset, h - 0.04, eave);
  if (timber) {
    if (entrance) {
      rect(inset, 0.04, bay * 0.32 - 0.5, 0.2, timber);
      rect(bay * 0.32 + 0.5, 0.04, length - inset, 0.2, timber);
    } else rect(inset, 0.04, length - inset, 0.2, timber);
    if (panel.level < massing.floors.length - 1) rect(inset, h - 0.2, length - inset, h - 0.04, timber);
    for (let i = 0; i <= bays; i++) {
      const x = Math.max(inset, Math.min(length - 0.19, i * bay - 0.08));
      rect(x, 0.2, x + 0.16, h - 0.2, timber);
    }
  }
  const use = massing.floors[panel.level]?.use;
  const windows = use !== "storage" && use !== "stable";
  const trim = timber ?? blend(colors.wall, colors.trim, 0.25);
  const pane = blend(colors.window, colors.wall, 0.18);
  if (entrance) {
    const center = bay * 0.32;
    const doorTop = Math.min(2.05, h - 0.4);
    const door = blend(colors.trim, colors.wall, 0.28);
    rect(center - 0.43, 0.05, center + 0.43, doorTop, door);
    rect(center - 0.5, 0.05, center - 0.43, doorTop + 0.1, trim);
    rect(center + 0.43, 0.05, center + 0.5, doorTop + 0.1, trim);
    rect(center - 0.43, doorTop, center + 0.43, doorTop + 0.1, trim);
  }
  for (let i = 0; i < bays; i++) {
    const center = (i + (entrance && i === 0 ? 0.73 : 0.5)) * bay;
    const halfWidth = Math.min(0.28, bay * 0.12);
    const bottom = Math.max(1.05, h * 0.4),
      top = Math.min(h - 0.55, bottom + 0.9);
    if (windows && top > bottom + 0.45 && bay > 1.5) {
      // A trim ring avoids coplanar overlapping faces behind the window.
      rect(center - halfWidth, bottom, center - 0.02, top, pane);
      rect(center + 0.02, bottom, center + halfWidth, top, pane);
      rect(center - 0.02, bottom, center + 0.02, top, trim);
      rect(center - halfWidth - 0.06, bottom - 0.06, center - halfWidth, top + 0.06, trim);
      rect(center + halfWidth, bottom - 0.06, center + halfWidth + 0.06, top + 0.06, trim);
      rect(center - halfWidth - 0.1, bottom - 0.09, center + halfWidth + 0.1, bottom, trim);
      rect(center - halfWidth, top, center + halfWidth, top + 0.06, trim);
    }
  }
  return out;
}
