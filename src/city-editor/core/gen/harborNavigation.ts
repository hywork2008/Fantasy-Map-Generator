import { facePoints } from "../mesh";
import type { CityDocument, Point } from "../types";
import { waterPolygons } from "../waterGeometry";

/** Sea berths need room to swing a hull and a channel out to open water. A
 * deck that merely lies inside a water cell can still sit at the head of a
 * cove where no ship could turn or leave. */
export const SEA_BERTH_TURNING_RADIUS = 20;
export const SEA_CHANNEL_HALF_WIDTH = 9;
/** An enclosed lake counts as open water once its navigable area is this large. */
const OPEN_LAKE_AREA = 40000;

export interface HarborWaterField {
  /** Distance (m) from the point to the nearest dry land; 0 on land. */
  clearance(p: Point): number;
  /** True when a hull at `p` can reach open water through a channel at least
   * `2 * halfWidth` wide, i.e. along water whose clearance never drops below it. */
  navigable(p: Point, halfWidth: number): boolean;
}

function fillPolygon(
  grid: Uint8Array,
  size: number,
  origin: number,
  cell: number,
  polygon: Point[],
  value: number
): void {
  if (polygon.length < 3) return;
  let minY = Infinity,
    maxY = -Infinity;
  for (const p of polygon) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const r0 = Math.max(0, Math.ceil((minY - origin) / cell - 0.5));
  const r1 = Math.min(size - 1, Math.floor((maxY - origin) / cell - 0.5));
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const y = origin + (r + 0.5) * cell;
    xs.length = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j],
        b = polygon[i];
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - origin) / cell - 0.5));
      const c1 = Math.min(size - 1, Math.floor((xs[k + 1] - origin) / cell - 0.5));
      for (let c = c0; c <= c1; c++) grid[r * size + c] = value;
    }
  }
}

const FAR = 1e20;

/** Felzenszwalb's 1-D squared distance transform, in place along a stride. */
function edt1d(
  f: Float64Array,
  offset: number,
  stride: number,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array
) {
  const at = (q: number) => f[offset + q * stride];
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (at(q) + q * q - (at(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (at(q) + q * q - (at(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + at(v[k]);
  }
  for (let q = 0; q < n; q++) f[offset + q * stride] = d[q];
}

export function harborWaterField(document: CityDocument): HarborWaterField {
  const extent = document.frame.extentMeters;
  const cell = Math.max(2, extent / 700);
  const size = Math.ceil(extent / cell);
  const origin = -extent / 2;
  // Without regional water the terrain beyond the mesh is unknown; let it
  // continue as water, as it does beyond the frame.
  const wet = new Uint8Array(size * size).fill(document.regionalWaterAreas?.length ? 0 : 1);
  const faces = Object.values(document.mesh.faces);
  for (const face of faces)
    if (face.properties.water === "land") fillPolygon(wet, size, origin, cell, facePoints(document.mesh, face), 0);
  for (const face of faces)
    if (face.properties.water !== "land") fillPolygon(wet, size, origin, cell, facePoints(document.mesh, face), 1);
  for (const polygon of waterPolygons(document)) fillPolygon(wet, size, origin, cell, polygon, 1);

  const dist = new Float64Array(size * size);
  for (let i = 0; i < dist.length; i++) dist[i] = wet[i] ? FAR : 0;
  const d = new Float64Array(size),
    v = new Int32Array(size),
    z = new Float64Array(size + 1);
  for (let c = 0; c < size; c++) edt1d(dist, c, size, size, d, v, z);
  for (let r = 0; r < size; r++) edt1d(dist, r * size, 1, size, d, v, z);
  const clearanceGrid = new Float32Array(size * size);
  // Beyond the frame the water simply continues, so an all-water grid stays open.
  for (let i = 0; i < dist.length; i++) clearanceGrid[i] = dist[i] >= FAR / 2 ? extent : Math.sqrt(dist[i]) * cell;

  const index = (p: Point): number => {
    const c = Math.floor((p[0] - origin) / cell),
      r = Math.floor((p[1] - origin) / cell);
    return c < 0 || r < 0 || c >= size || r >= size ? -1 : r * size + c;
  };
  const open = new Map<number, Uint8Array>();
  const openMask = (halfWidth: number): Uint8Array => {
    const key = Math.round(halfWidth * 10);
    const hit = open.get(key);
    if (hit) return hit;
    // 0 = unvisited, 1 = open, 2 = enclosed
    const mask = new Uint8Array(size * size);
    const stack: number[] = [];
    for (let start = 0; start < mask.length; start++) {
      if (mask[start] || clearanceGrid[start] < halfWidth) continue;
      const members: number[] = [];
      let touchesFrame = false;
      mask[start] = 3;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!;
        members.push(i);
        const r = Math.floor(i / size),
          c = i - r * size;
        if (r === 0 || c === 0 || r === size - 1 || c === size - 1) touchesFrame = true;
        for (const j of [
          c > 0 ? i - 1 : -1,
          c < size - 1 ? i + 1 : -1,
          r > 0 ? i - size : -1,
          r < size - 1 ? i + size : -1
        ])
          if (j >= 0 && !mask[j] && clearanceGrid[j] >= halfWidth) {
            mask[j] = 3;
            stack.push(j);
          }
      }
      const state = touchesFrame || members.length * cell * cell >= OPEN_LAKE_AREA ? 1 : 2;
      for (const i of members) mask[i] = state;
    }
    open.set(key, mask);
    return mask;
  };
  const field: HarborWaterField = {
    clearance: p => {
      const i = index(p);
      return i < 0 ? extent : clearanceGrid[i];
    },
    navigable: (p, halfWidth) => {
      const i = index(p);
      return i < 0 || openMask(halfWidth)[i] === 1;
    }
  };
  return field;
}

/** A sea pier's head must have swinging room and a channel to open water. */
export function seaBerthIsNavigable(field: HarborWaterField, head: Point): boolean {
  return field.clearance(head) >= SEA_BERTH_TURNING_RADIUS && field.navigable(head, SEA_CHANNEL_HALF_WIDTH);
}
