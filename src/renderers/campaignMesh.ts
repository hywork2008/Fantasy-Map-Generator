import { type CampaignWindowBox, campaignWindow } from "./campaignWindow";

/**
 * Overlay frame shared with route and label placement:
 * world x = mapX - graphWidth/2, world y = height, world z = mapY - graphHeight/2.
 * Map +y is south, which is world +z. The full-map PlaneGeometry is rotated and
 * mirrored in Z relative to this frame, so the campaign mesh is not rotated.
 *
 * Ground triangles are wound so the geometric normal is +Y (visible from above).
 * For a quad, a = (col, row), b = (col+1, row), c = (col, row+1), d = (col+1, row+1),
 * indices (a, c, d) and (a, d, b). Check: a=(0,h,0), c=(0,h,1), d=(1,h,1) → AC×AD = (0, 1, 0).
 */

/** Pack height below this is water. Matches the mesh renderer's sea level. */
export const CAMPAIGN_SEA_LEVEL = 20;

/** Do not resample finer than this, in kilometres. The grid has no ridges between samples. */
export const CAMPAIGN_MIN_STEP_KM = 2;

/** One mesh. A week of foot march stays under this on every supported scale. */
export const CAMPAIGN_MAX_SAMPLES_PER_SIDE = 200;

/** Lines sit just above the resampled surface, in the same units as terrain height. */
export const CAMPAIGN_LINE_LIFT = 0.75;

/** Contact outline sits above the other cell borders so the two do not z-fight. */
export const CAMPAIGN_FOCUS_LIFT = 0.9;

/** Regiment and burg tokens sit above the borders. */
export const CAMPAIGN_MARKER_LIFT = 1.5;

const NEUTRAL_LAND = "#b7a27a";
const BORDER_COLOR = "#2a241c";
const FOCUS_COLOR = "#e2b007";
const RIVER_COLOR = "#3d6fbf";
const ROUTE_COLOR = "#6b4f32";
const MARCH_COLOR = "#c23b22";
const BURG_COLOR = "#f2e2c4";
const REGIMENT_COLOR = "#8c2f2f";
const FLEET_COLOR = "#1d4e89";

/** Oblique distance from the contact, in cell-spacing units, before the height component. */
const CONTACT_DISTANCE_FACTOR = 1.6;
const CONTACT_HEIGHT_FACTOR = 0.75;
const MIN_DISTANCE_FACTOR = 0.15;
const MAX_DISTANCE_FACTOR = 1.5;

export interface CampaignFocus {
  /** Map-pixel contact. The camera frames this point. */
  x: number;
  y: number;
  /** Pack cell whose outline marks the contact. */
  cellId: number;
}

export interface CampaignCellInput {
  id: number;
  /** Centroid, map pixels. */
  x: number;
  y: number;
  /** Pack height. Below {@link CAMPAIGN_SEA_LEVEL} the vertex is water-coloured. */
  height: number;
  state: number;
  biomeColor?: string;
  /** Ordered ring in map pixels. Empty rings are skipped. */
  ring: ReadonlyArray<readonly [number, number]>;
}

export interface CampaignRegimentSource {
  x: number;
  y: number;
  cell: number;
  naval: boolean;
  path?: readonly number[];
  color?: string;
}

export interface CampaignRegimentInput {
  /** Continuous map position. This is the token, not the cell centroid. */
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  naval: boolean;
  path?: ReadonlyArray<readonly [number, number]>;
  color?: string;
}

export interface CampaignBurgInput {
  x: number;
  y: number;
  name?: string;
  color?: string;
}

export interface CampaignPathInput {
  points: ReadonlyArray<readonly number[]>;
}

export interface CampaignBuildInput {
  centerX: number;
  centerY: number;
  focusCellId: number;
  graphWidth: number;
  graphHeight: number;
  kmPerPx: number;
  /** Height-grid spacing in map pixels. The sample step is max(spacing/4, 2 km). */
  gridSpacingPx: number;
  /** Typical pack-cell spacing. Selects which outlines to draw and how close the camera starts. */
  packSpacingPx: number;
  footDays?: number;
  footKmPerDay?: number;
  heightAt: (x: number, y: number) => number;
  waterColor: string;
  neutralLandColor?: string;
  stateColors: ReadonlyMap<number, string>;
  cells: readonly CampaignCellInput[];
  rivers: readonly CampaignPathInput[];
  routes: readonly CampaignPathInput[];
  regiments: readonly CampaignRegimentInput[];
  burgs: readonly CampaignBurgInput[];
}

export interface CampaignGround {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
}

export interface CampaignPolyline {
  kind: "border" | "focus" | "river" | "route" | "march";
  /** Line-segment pairs (x, y, z, x, y, z, ...), already in the overlay frame. */
  positions: Float32Array;
  color: [number, number, number];
}

export interface CampaignMarker {
  kind: "regiment" | "fleet" | "burg";
  mapX: number;
  mapY: number;
  position: [number, number, number];
  color: [number, number, number];
  name?: string;
}

export interface CampaignCameraFrame {
  target: [number, number, number];
  /** South of and above the target: world +z is map south, world +y is up. */
  position: [number, number, number];
  minDistance: number;
  maxDistance: number;
}

export interface CampaignMeshBuild {
  window: CampaignWindowBox;
  stepPx: number;
  samplesX: number;
  samplesY: number;
  ground: CampaignGround;
  polylines: CampaignPolyline[];
  markers: CampaignMarker[];
  camera: CampaignCameraFrame;
}

/** Spacing of the height grid. The resample never goes finer than a quarter of this. */
export function campaignGridSpacingPx(graphWidth: number, graphHeight: number, cellsX: number, cellsY: number): number {
  const width = positive(graphWidth);
  const height = positive(graphHeight);
  const sx = cellsX > 1 ? width / (cellsX - 1) : width;
  const sy = cellsY > 1 ? height / (cellsY - 1) : height;
  const spacing = Math.min(sx, sy);
  return Number.isFinite(spacing) && spacing > 0 ? spacing : 0;
}

/** Sample spacing in map pixels: a quarter of the height grid, and never finer than 2 km. */
export function campaignSampleStepPx(gridSpacingPx: number, kmPerPx: number): number {
  const quarter = gridSpacingPx > 0 ? gridSpacingPx / 4 : 0;
  const twoKm = kmPerPx > 0 ? CAMPAIGN_MIN_STEP_KM / kmPerPx : 0;
  return Math.max(quarter, twoKm);
}

/** Samples along one side. The spacing is a minimum, so the count rounds down, then caps. */
export function campaignSampleCount(spanPx: number, stepPx: number): number {
  if (!(spanPx > 0) || !(stepPx > 0)) return 2;
  return Math.min(CAMPAIGN_MAX_SAMPLES_PER_SIDE, Math.max(2, Math.floor(spanPx / stepPx) + 1));
}

/**
 * Token position is the regiment's continuous point. The cell centroid is retained so a
 * caller can see the two are different; the mesh must not snap the token onto it.
 * March vertices are cell centroids in path order.
 */
export function campaignRegimentPlacements(
  regiments: readonly CampaignRegimentSource[],
  centroidAt: (cellId: number) => readonly [number, number] | undefined
): CampaignRegimentInput[] {
  const placed: CampaignRegimentInput[] = [];
  for (const regiment of regiments) {
    if (!Number.isFinite(regiment.x) || !Number.isFinite(regiment.y)) continue;
    const centroid = centroidAt(regiment.cell);
    const path: [number, number][] = [];
    for (const cellId of regiment.path ?? []) {
      const point = centroidAt(cellId);
      if (point && Number.isFinite(point[0]) && Number.isFinite(point[1])) path.push([point[0], point[1]]);
    }
    placed.push({
      x: regiment.x,
      y: regiment.y,
      cellX: centroid?.[0] ?? Number.NaN,
      cellY: centroid?.[1] ?? Number.NaN,
      naval: Boolean(regiment.naval),
      path,
      color: regiment.color
    });
  }
  return placed;
}

/**
 * Contact camera in the overlay frame. The initial view is one cell across, from the south,
 * and the distance limits let the orbit pull back across the whole week window.
 */
export function campaignContactCamera(input: {
  focusX: number;
  focusY: number;
  graphWidth: number;
  graphHeight: number;
  height: number;
  spacingPx: number;
  spanPx: number;
}): CampaignCameraFrame {
  const spacing = Math.max(input.spacingPx, 0.01);
  const height = Number.isFinite(input.height) ? input.height : 0;
  const target: [number, number, number] = [
    input.focusX - input.graphWidth / 2,
    height,
    input.focusY - input.graphHeight / 2
  ];
  const distance = spacing * CONTACT_DISTANCE_FACTOR;
  const position: [number, number, number] = [
    target[0],
    target[1] + distance * CONTACT_HEIGHT_FACTOR,
    target[2] + distance
  ];
  const orbit = Math.hypot(distance * CONTACT_HEIGHT_FACTOR, distance);
  const minDistance = Math.max(spacing * MIN_DISTANCE_FACTOR, 0.2);
  const maxDistance = Math.max(Math.max(input.spanPx, spacing) * MAX_DISTANCE_FACTOR, orbit * 1.05);
  return { target, position, minDistance, maxDistance };
}

export function buildCampaignMesh(input: CampaignBuildInput): CampaignMeshBuild {
  const graphWidth = positive(input.graphWidth);
  const graphHeight = positive(input.graphHeight);
  const centerX = clamp(input.centerX, 0, graphWidth);
  const centerY = clamp(input.centerY, 0, graphHeight);
  const box = campaignWindow({
    centerX,
    centerY,
    graphWidth,
    graphHeight,
    kmPerPx: input.kmPerPx,
    spacingPx: input.packSpacingPx,
    footDays: input.footDays,
    footKmPerDay: input.footKmPerDay
  });
  const stepPx = campaignSampleStepPx(input.gridSpacingPx, input.kmPerPx);
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const samplesX = campaignSampleCount(spanX, stepPx);
  const samplesY = campaignSampleCount(spanY, stepPx);
  const packSpacing = input.packSpacingPx > 0 ? input.packSpacingPx : input.gridSpacingPx;
  const ground = buildGround(input, box, samplesX, samplesY);
  assertGroundFacesUp(ground);

  return {
    window: box,
    stepPx,
    samplesX,
    samplesY,
    ground,
    polylines: buildPolylines(input, box, packSpacing),
    markers: buildMarkers(input, box),
    camera: campaignContactCamera({
      focusX: centerX,
      focusY: centerY,
      graphWidth,
      graphHeight,
      height: sampledHeight(input, centerX, centerY),
      spacingPx: packSpacing > 0 ? packSpacing : 1,
      spanPx: Math.max(spanX, spanY)
    })
  };
}

function buildGround(
  input: CampaignBuildInput,
  box: CampaignWindowBox,
  samplesX: number,
  samplesY: number
): CampaignGround {
  const vertexCount = samplesX * samplesY;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const stepX = samplesX > 1 ? spanX / (samplesX - 1) : 0;
  const stepY = samplesY > 1 ? spanY / (samplesY - 1) : 0;
  const lookup = new CellLookup(input.cells, input.packSpacingPx > 0 ? input.packSpacingPx : input.gridSpacingPx);
  const water = parseColor(input.waterColor, [0.27, 0.43, 0.67]);
  const neutral = parseColor(input.neutralLandColor ?? NEUTRAL_LAND, [0.72, 0.64, 0.48]);

  for (let row = 0; row < samplesY; row++) {
    const mapY = samplesY === 1 ? (box.minY + box.maxY) / 2 : box.minY + row * stepY;
    for (let col = 0; col < samplesX; col++) {
      const mapX = samplesX === 1 ? (box.minX + box.maxX) / 2 : box.minX + col * stepX;
      const index = row * samplesX + col;
      const world = worldPoint(input, mapX, mapY, 0);
      positions[index * 3] = world[0];
      positions[index * 3 + 1] = world[1];
      positions[index * 3 + 2] = world[2];
      const color = vertexColor(lookup.cellAt(mapX, mapY), input, water, neutral);
      colors[index * 3] = color[0];
      colors[index * 3 + 1] = color[1];
      colors[index * 3 + 2] = color[2];
    }
  }

  const quadCount = Math.max(0, samplesX - 1) * Math.max(0, samplesY - 1);
  const indices = new Uint32Array(quadCount * 6);
  let cursor = 0;
  for (let row = 0; row < samplesY - 1; row++) {
    for (let col = 0; col < samplesX - 1; col++) {
      const a = row * samplesX + col;
      const b = a + 1;
      const c = a + samplesX;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = d;
      indices[cursor++] = a;
      indices[cursor++] = d;
      indices[cursor++] = b;
    }
  }

  return { positions, colors, indices, vertexCount };
}

function assertGroundFacesUp(ground: CampaignGround): void {
  if (ground.indices.length < 3) return;
  const a = ground.indices[0] * 3;
  const c = ground.indices[1] * 3;
  const d = ground.indices[2] * 3;
  const positions = ground.positions;
  const acx = positions[c] - positions[a];
  const acz = positions[c + 2] - positions[a + 2];
  const adx = positions[d] - positions[a];
  const adz = positions[d + 2] - positions[a + 2];
  // Y component of AC × AD. A downward face is invisible from the contact camera.
  const normalY = acz * adx - acx * adz;
  if (normalY < 0) throw new Error("Campaign ground faces downward");
}

function buildPolylines(input: CampaignBuildInput, box: CampaignWindowBox, packSpacing: number): CampaignPolyline[] {
  const polylines: CampaignPolyline[] = [];
  const margin = Math.max(packSpacing, 0) * 1.5;
  const expanded = expandBox(box, margin);
  const border: number[] = [];
  const focus: number[] = [];

  for (const cell of input.cells) {
    if (cell.ring.length < 3) continue;
    const isFocus = cell.id === input.focusCellId;
    if (!isFocus && !insideBox(cell.x, cell.y, expanded)) continue;
    const target = isFocus ? focus : border;
    const lift = isFocus ? CAMPAIGN_FOCUS_LIFT : CAMPAIGN_LINE_LIFT;
    pushRing(input, cell.ring, lift, target);
  }
  pushPolyline(polylines, "border", border, BORDER_COLOR);
  pushPolyline(polylines, "focus", focus, FOCUS_COLOR);
  pushPolyline(polylines, "river", clipPaths(input, box, input.rivers, CAMPAIGN_LINE_LIFT), RIVER_COLOR);
  pushPolyline(polylines, "route", clipPaths(input, box, input.routes, CAMPAIGN_LINE_LIFT), ROUTE_COLOR);

  const marches: CampaignPathInput[] = [];
  for (const regiment of input.regiments) {
    if (!regiment.path || regiment.path.length === 0) continue;
    marches.push({ points: [[regiment.x, regiment.y], ...regiment.path] });
  }
  pushPolyline(polylines, "march", clipPaths(input, box, marches, CAMPAIGN_LINE_LIFT), MARCH_COLOR);
  return polylines;
}

function buildMarkers(input: CampaignBuildInput, box: CampaignWindowBox): CampaignMarker[] {
  const markers: CampaignMarker[] = [];
  for (const regiment of input.regiments) {
    if (!insideBox(regiment.x, regiment.y, box)) continue;
    markers.push({
      kind: regiment.naval ? "fleet" : "regiment",
      mapX: regiment.x,
      mapY: regiment.y,
      position: worldPoint(input, regiment.x, regiment.y, CAMPAIGN_MARKER_LIFT),
      color: parseColor(regiment.color ?? (regiment.naval ? FLEET_COLOR : REGIMENT_COLOR), [0.55, 0.18, 0.18])
    });
  }
  for (const burg of input.burgs) {
    if (!insideBox(burg.x, burg.y, box)) continue;
    const name = burg.name?.trim();
    markers.push({
      kind: "burg",
      mapX: burg.x,
      mapY: burg.y,
      position: worldPoint(input, burg.x, burg.y, CAMPAIGN_MARKER_LIFT),
      color: parseColor(burg.color ?? BURG_COLOR, [0.95, 0.89, 0.77]),
      name: name ? name : undefined
    });
  }
  return markers;
}

function vertexColor(
  cell: CampaignCellInput | undefined,
  input: CampaignBuildInput,
  water: [number, number, number],
  neutral: [number, number, number]
): [number, number, number] {
  if (!cell) return neutral;
  if (cell.height < CAMPAIGN_SEA_LEVEL) return water;
  if (cell.state > 0) {
    const stateColor = input.stateColors.get(cell.state);
    if (stateColor) return parseColor(stateColor, neutral);
  }
  if (cell.biomeColor) return parseColor(cell.biomeColor, neutral);
  return neutral;
}

class CellLookup {
  private readonly buckets = new Map<string, number[]>();
  private readonly bucketSize: number;

  constructor(
    private readonly cells: readonly CampaignCellInput[],
    spacingPx: number
  ) {
    this.bucketSize = Math.max(spacingPx, 1);
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      const key = this.key(cell.x, cell.y);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(index);
      else this.buckets.set(key, [index]);
    }
  }

  cellAt(x: number, y: number): CampaignCellInput | undefined {
    const col = Math.floor(x / this.bucketSize);
    const row = Math.floor(y / this.bucketSize);
    let nearest: CampaignCellInput | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bucket = this.buckets.get(`${col + dx}:${row + dy}`);
        if (!bucket) continue;
        for (const index of bucket) {
          const cell = this.cells[index];
          if (cell.ring.length >= 3 && pointInRing(x, y, cell.ring)) return cell;
          const distance = (cell.x - x) ** 2 + (cell.y - y) ** 2;
          if (distance < nearestDistance) {
            nearest = cell;
            nearestDistance = distance;
          }
        }
      }
    }
    return nearest;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.bucketSize)}:${Math.floor(y / this.bucketSize)}`;
  }
}

function pointInRing(x: number, y: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pushRing(
  input: CampaignBuildInput,
  ring: ReadonlyArray<readonly [number, number]>,
  lift: number,
  out: number[]
): void {
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) continue;
    pushSegment(out, worldPoint(input, a[0], a[1], lift), worldPoint(input, b[0], b[1], lift));
  }
}

function clipPaths(
  input: CampaignBuildInput,
  box: CampaignWindowBox,
  paths: readonly CampaignPathInput[],
  lift: number
): number[] {
  const out: number[] = [];
  for (const path of paths) {
    const points = path.points;
    for (let index = 1; index < points.length; index++) {
      const a = pair(points[index - 1]);
      const b = pair(points[index]);
      if (!a || !b) continue;
      const clipped = clipSegment(a, b, box);
      if (!clipped) continue;
      pushSegment(
        out,
        worldPoint(input, clipped[0][0], clipped[0][1], lift),
        worldPoint(input, clipped[1][0], clipped[1][1], lift)
      );
    }
  }
  return out;
}

function clipSegment(
  a: readonly [number, number],
  b: readonly [number, number],
  box: CampaignWindowBox
): [[number, number], [number, number]] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - box.minX, box.maxX - a[0], a[1] - box.minY, box.maxY - a[1]];
  for (let edge = 0; edge < 4; edge++) {
    if (p[edge] === 0) {
      if (q[edge] < 0) return null;
      continue;
    }
    const ratio = q[edge] / p[edge];
    if (p[edge] < 0) {
      if (ratio > t1) return null;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return null;
      if (ratio < t1) t1 = ratio;
    }
  }
  if (t0 > t1) return null;
  const start: [number, number] = [a[0] + t0 * dx, a[1] + t0 * dy];
  const end: [number, number] = [a[0] + t1 * dx, a[1] + t1 * dy];
  if (start[0] === end[0] && start[1] === end[1]) return null;
  return [start, end];
}

function pushPolyline(
  polylines: CampaignPolyline[],
  kind: CampaignPolyline["kind"],
  positions: number[],
  color: string
): void {
  if (positions.length < 6) return;
  polylines.push({
    kind,
    positions: Float32Array.from(positions),
    color: parseColor(color, [0, 0, 0])
  });
}

function pushSegment(out: number[], a: readonly [number, number, number], b: readonly [number, number, number]): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
}

function worldPoint(input: CampaignBuildInput, mapX: number, mapY: number, lift: number): [number, number, number] {
  return [mapX - input.graphWidth / 2, sampledHeight(input, mapX, mapY) + lift, mapY - input.graphHeight / 2];
}

function sampledHeight(input: CampaignBuildInput, mapX: number, mapY: number): number {
  const height = input.heightAt(mapX, mapY);
  return Number.isFinite(height) ? height : 0;
}

function expandBox(box: CampaignWindowBox, margin: number): CampaignWindowBox {
  return { ...box, minX: box.minX - margin, minY: box.minY - margin, maxX: box.maxX + margin, maxY: box.maxY + margin };
}

function insideBox(x: number, y: number, box: Pick<CampaignWindowBox, "minX" | "minY" | "maxX" | "maxY">): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

function pair(point: readonly number[] | undefined): [number, number] | null {
  if (!point || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  return [point[0], point[1]];
}

function parseColor(color: string, fallback: [number, number, number]): [number, number, number] {
  const hex = color.trim().replace(/^#/, "");
  const expanded = hex.length === 3 ? hex.replace(/./g, character => character + character) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return fallback;
  return [
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255
  ];
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, finite));
}
