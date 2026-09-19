// Regular hexagonal tiling for the City Editor's starting mesh.
//
// Orientation is flat-top: each interior cell is a regular hexagon with two
// horizontal edges (top and bottom). Cells that straddle the square window
// are clipped to it, matching how the Voronoi grids fill the frame.

import { clipPolygonToRect, polygonArea, polygonCentroid, polygonTouchesRectEdge, type Rect } from "./geom";
import type { Cell, Point } from "./types";

/** Side length (= circumradius) of a regular hexagon, metres. */
export const DEFAULT_HEX_SIZE_METERS = 50;
export const HEX_SIZE_MIN_METERS = 20;
export const HEX_SIZE_MAX_METERS = 150;

const SQRT3 = Math.sqrt(3);
/** Cube/axial neighbor steps for a flat-top hex grid. */
const HEX_DIRS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1]
];

/** Drop rim slivers smaller than this fraction of a full hex. */
const SLIVER_AREA_FRACTION = 0.015;

export function buildHexGrid(extentMeters: number, hexSizeMeters: number): Cell[] {
  const size = Number.isFinite(hexSizeMeters) && hexSizeMeters > 0 ? hexSizeMeters : DEFAULT_HEX_SIZE_METERS;
  const half = extentMeters / 2;
  const win: Rect = { minX: -half, minY: -half, maxX: half, maxY: half };
  const fullArea = ((3 * SQRT3) / 2) * size * size;
  const minArea = fullArea * SLIVER_AREA_FRACTION;

  const colPitch = 1.5 * size;
  const rowPitch = SQRT3 * size;
  const halfW = size;
  const halfH = (SQRT3 / 2) * size;

  type Pending = { q: number; r: number; site: Point; polygon: Point[] };
  const pending: Pending[] = [];

  const qMin = Math.floor((-half - halfW) / colPitch) - 1;
  const qMax = Math.ceil((half + halfW) / colPitch) + 1;
  for (let q = qMin; q <= qMax; q++) {
    const rMin = Math.floor((-half - halfH) / rowPitch - q / 2) - 1;
    const rMax = Math.ceil((half + halfH) / rowPitch - q / 2) + 1;
    for (let r = rMin; r <= rMax; r++) {
      const cx = colPitch * q;
      const cy = rowPitch * (r + q / 2);
      if (cx + halfW < win.minX || cx - halfW > win.maxX || cy + halfH < win.minY || cy - halfH > win.maxY) {
        continue;
      }
      let polygon = clipPolygonToRect(hexVertices(cx, cy, size), win);
      if (polygon.length < 3) continue;
      const area = polygonArea(polygon);
      if (Math.abs(area) < minArea) continue;
      if (area < 0) polygon = polygon.slice().reverse();
      pending.push({ q, r, site: [cx, cy], polygon });
    }
  }

  const idByKey = new Map<string, number>();
  for (let i = 0; i < pending.length; i++) idByKey.set(`${pending[i].q},${pending[i].r}`, i);

  return pending.map((cell, i): Cell => {
    const neighbors: number[] = [];
    for (const [dq, dr] of HEX_DIRS) {
      const id = idByKey.get(`${cell.q + dq},${cell.r + dr}`);
      if (id !== undefined) neighbors.push(id);
    }
    return {
      id: i,
      site: cell.site,
      polygon: cell.polygon,
      centroid: polygonCentroid(cell.polygon),
      neighbors,
      onBorder: polygonTouchesRectEdge(cell.polygon, win)
    };
  });
}

/** Flat-top regular hexagon, counter-clockwise from the east vertex. The
 * 60°/120° pair and the 240°/300° pair are the two horizontal edges. */
function hexVertices(cx: number, cy: number, size: number): Point[] {
  const h = (SQRT3 / 2) * size;
  return [
    [cx + size, cy],
    [cx + size / 2, cy + h],
    [cx - size / 2, cy + h],
    [cx - size, cy],
    [cx - size / 2, cy - h],
    [cx + size / 2, cy - h]
  ];
}
