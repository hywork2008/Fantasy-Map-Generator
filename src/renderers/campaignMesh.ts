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
  /** Full river width per point in map pixels (FMG river banks). Lines ignore it. */
  widths?: readonly number[];
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
  /** `stepKm` is the local ground spacing, so a multi-level DEM can pick its level per vertex. */
  heightAt: (x: number, y: number, stepKm?: number) => number;
  /** Ground step in km from a finer height source (real DEM). Overrides the grid-based step. */
  sampleStepKm?: number;
  /** Darken vertex colors by a fixed north-west light. The ground material is unlit. */
  hillshade?: boolean;
  /**
   * Finer squares around the centre (half-width and step in km), finest wins. The ground stays one
   * tensor grid: columns and rows inside a ring use its step, so no T-junction seams appear.
   */
  rings?: readonly CampaignRing[];
  /**
   * Real coastline. When given, it decides water and land colours instead of the cell height,
   * and a DEM-land vertex in a sea cell takes the colour of the nearest land cell.
   */
  waterAt?: (x: number, y: number) => boolean;
  /** Where a burg or army is drawn. A real-DEM window moves tokens off the sea onto the coast. */
  displayPoint?: (x: number, y: number, naval: boolean) => readonly [number, number];
  /**
   * Multiplies the line, outline and token lifts. The lifts are tuned for the cell-height mesh
   * (about 40 m at the default scale); a true-scale DEM window shrinks them back to tens of metres.
   */
  liftScale?: number;
  /**
   * Splits lines into pieces this long (map pixels) and lifts each joint off the ground, so a
   * border or river follows the terrain instead of cutting a chord through or over a hill.
   */
  drapeStepPx?: number;
  /** Per-side cap for a real-DEM ground. The grid bilinear keeps CAMPAIGN_MAX_SAMPLES_PER_SIDE. */
  maxSamplesPerSide?: number;
  waterColor: string;
  neutralLandColor?: string;
  stateColors: ReadonlyMap<number, string>;
  cells: readonly CampaignCellInput[];
  rivers: readonly CampaignPathInput[];
  routes: readonly CampaignPathInput[];
  regiments: readonly CampaignRegimentInput[];
  burgs: readonly CampaignBurgInput[];
}

export interface CampaignRing {
  halfKm: number;
  stepKm: number;
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
export function campaignSampleCount(
  spanPx: number,
  stepPx: number,
  maxPerSide = CAMPAIGN_MAX_SAMPLES_PER_SIDE
): number {
  if (!(spanPx > 0) || !(stepPx > 0)) return 2;
  return Math.min(maxPerSide, Math.max(2, Math.floor(spanPx / stepPx) + 1));
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
  const stepPx =
    input.sampleStepKm && input.sampleStepKm > 0 && input.kmPerPx > 0
      ? input.sampleStepKm / input.kmPerPx
      : campaignSampleStepPx(input.gridSpacingPx, input.kmPerPx);
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const maxPerSide = input.maxSamplesPerSide ?? CAMPAIGN_MAX_SAMPLES_PER_SIDE;
  const ringsPx = (input.rings ?? [])
    .filter(ring => ring.halfKm > 0 && ring.stepKm > 0 && input.kmPerPx > 0)
    .map(ring => ({ halfPx: ring.halfKm / input.kmPerPx, stepPx: ring.stepKm / input.kmPerPx }));
  const xs = campaignAxis(box.minX, box.maxX, centerX, stepPx, ringsPx, maxPerSide);
  const ys = campaignAxis(box.minY, box.maxY, centerY, stepPx, ringsPx, maxPerSide);
  const samplesX = xs.length;
  const samplesY = ys.length;
  const packSpacing = input.packSpacingPx > 0 ? input.packSpacingPx : input.gridSpacingPx;
  const ground = buildGround(input, xs, ys);
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

function buildGround(input: CampaignBuildInput, xs: readonly number[], ys: readonly number[]): CampaignGround {
  const samplesX = xs.length;
  const samplesY = ys.length;
  const vertexCount = samplesX * samplesY;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const lookup = new CellLookup(input.cells, input.packSpacingPx > 0 ? input.packSpacingPx : input.gridSpacingPx);
  const water = parseColor(input.waterColor, [0.27, 0.43, 0.67]);
  const neutral = parseColor(input.neutralLandColor ?? NEUTRAL_LAND, [0.72, 0.64, 0.48]);
  const localStep = (axis: readonly number[], i: number) =>
    axis.length > 1 ? axis[Math.min(axis.length - 1, i + 1)] - axis[Math.max(0, i - 1)] : 0;

  for (let row = 0; row < samplesY; row++) {
    const mapY = ys[row];
    const stepY = localStep(ys, row) / (row > 0 && row < samplesY - 1 ? 2 : 1);
    for (let col = 0; col < samplesX; col++) {
      const mapX = xs[col];
      const stepX = localStep(xs, col) / (col > 0 && col < samplesX - 1 ? 2 : 1);
      const stepKm = Math.max(stepX, stepY) * input.kmPerPx;
      const index = row * samplesX + col;
      const height = input.heightAt(mapX, mapY, stepKm > 0 ? stepKm : undefined);
      positions[index * 3] = mapX - input.graphWidth / 2;
      positions[index * 3 + 1] = Number.isFinite(height) ? height : 0;
      positions[index * 3 + 2] = mapY - input.graphHeight / 2;
      const color = input.waterAt
        ? coastColor(input.waterAt(mapX, mapY), lookup, mapX, mapY, input, water, neutral)
        : vertexColor(lookup.cellAt(mapX, mapY), input, water, neutral);
      colors[index * 3] = color[0];
      colors[index * 3 + 1] = color[1];
      colors[index * 3 + 2] = color[2];
    }
  }

  if (input.hillshade) applyHillshade(positions, colors, samplesX, samplesY);

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

/** Lambert term from a light in the north-west, 45° up, on the sampled height grid. */
export function applyHillshade(
  positions: Float32Array,
  colors: Float32Array,
  samplesX: number,
  samplesY: number
): void {
  if (samplesX < 2 || samplesY < 2) return;
  const light = [-Math.SQRT1_2 * Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2 * Math.SQRT1_2];
  const at = (col: number, row: number) => {
    const c = Math.min(samplesX - 1, Math.max(0, col));
    const r = Math.min(samplesY - 1, Math.max(0, row));
    return (r * samplesX + c) * 3;
  };
  const shade = new Float32Array(samplesX * samplesY);
  for (let row = 0; row < samplesY; row++) {
    for (let col = 0; col < samplesX; col++) {
      const l = at(col - 1, row);
      const r = at(col + 1, row);
      const u = at(col, row - 1);
      const d = at(col, row + 1);
      const dx = positions[r] - positions[l];
      const dz = positions[d + 2] - positions[u + 2];
      const dhx = positions[r + 1] - positions[l + 1];
      const dhz = positions[d + 1] - positions[u + 1];
      // Normal of the surface y = h(x, z): (-dh/dx, 1, -dh/dz).
      const nx = dx !== 0 ? -dhx / dx : 0;
      const nz = dz !== 0 ? -dhz / dz : 0;
      const length = Math.hypot(nx, 1, nz);
      const lambert = (nx * light[0] + light[1] + nz * light[2]) / length;
      shade[row * samplesX + col] = 0.45 + (0.55 * Math.max(0, lambert)) / light[1];
    }
  }
  for (let i = 0; i < shade.length; i++) {
    const k = Math.min(1.15, shade[i]);
    colors[i * 3] = Math.min(1, colors[i * 3] * k);
    colors[i * 3 + 1] = Math.min(1, colors[i * 3 + 1] * k);
    colors[i * 3 + 2] = Math.min(1, colors[i * 3 + 2] * k);
  }
}

/**
 * Sample coordinates along one axis of the window. Without rings this is the uniform
 * `campaignSampleCount` spacing. With rings, each stretch uses the finest ring covering it.
 */
export function campaignAxis(
  min: number,
  max: number,
  center: number,
  outerStepPx: number,
  rings: readonly { halfPx: number; stepPx: number }[],
  maxCount = CAMPAIGN_MAX_SAMPLES_PER_SIDE
): number[] {
  const span = max - min;
  if (!(span > 0)) return [(min + max) / 2];
  if (!rings.length) {
    const count = campaignSampleCount(span, outerStepPx, maxCount);
    return Array.from({ length: count }, (_, i) => (count === 1 ? (min + max) / 2 : min + (i * span) / (count - 1)));
  }
  // Breakpoints where the step changes, then a uniform fill of each stretch.
  const cuts = new Set<number>([min, max]);
  for (const ring of rings) {
    for (const edge of [center - ring.halfPx, center + ring.halfPx]) if (edge > min && edge < max) cuts.add(edge);
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const stepAt = (x: number) =>
    rings.reduce(
      (step, ring) => (Math.abs(x - center) <= ring.halfPx ? Math.min(step, ring.stepPx) : step),
      outerStepPx
    );
  const out: number[] = [min];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const step = stepAt((a + b) / 2);
    const n = Math.max(1, Math.round((b - a) / Math.max(step, 1e-9)));
    for (let k = 1; k <= n; k++) out.push(a + ((b - a) * k) / n);
  }
  if (out.length <= maxCount) return out;
  // Over the cap: thin evenly, keeping both ends.
  return Array.from({ length: maxCount }, (_, i) => out[Math.round((i * (out.length - 1)) / (maxCount - 1))]);
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
  const shown = (x: number, y: number, naval: boolean) => input.displayPoint?.(x, y, naval) ?? [x, y];
  for (const regiment of input.regiments) {
    if (!insideBox(regiment.x, regiment.y, box)) continue;
    const [x, y] = shown(regiment.x, regiment.y, regiment.naval);
    markers.push({
      kind: regiment.naval ? "fleet" : "regiment",
      mapX: regiment.x,
      mapY: regiment.y,
      position: worldPoint(input, x, y, CAMPAIGN_MARKER_LIFT * (input.liftScale ?? 1)),
      color: parseColor(regiment.color ?? (regiment.naval ? FLEET_COLOR : REGIMENT_COLOR), [0.55, 0.18, 0.18])
    });
  }
  for (const burg of input.burgs) {
    if (!insideBox(burg.x, burg.y, box)) continue;
    const name = burg.name?.trim();
    const [x, y] = shown(burg.x, burg.y, false);
    markers.push({
      kind: "burg",
      mapX: burg.x,
      mapY: burg.y,
      position: worldPoint(input, x, y, CAMPAIGN_MARKER_LIFT * (input.liftScale ?? 1)),
      color: parseColor(burg.color ?? BURG_COLOR, [0.95, 0.89, 0.77]),
      name: name ? name : undefined
    });
  }
  return markers;
}

function coastColor(
  isWater: boolean,
  lookup: CellLookup,
  x: number,
  y: number,
  input: CampaignBuildInput,
  water: [number, number, number],
  neutral: [number, number, number]
): [number, number, number] {
  if (isWater) return water;
  const cell = lookup.cellAt(x, y);
  if (cell && cell.height >= CAMPAIGN_SEA_LEVEL) return vertexColor(cell, input, water, neutral);
  return vertexColor(lookup.landCellNear(x, y), input, water, neutral);
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

  /** Nearest land cell centre within two buckets. */
  landCellNear(x: number, y: number): CampaignCellInput | undefined {
    const col = Math.floor(x / this.bucketSize);
    const row = Math.floor(y / this.bucketSize);
    let nearest: CampaignCellInput | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (const index of this.buckets.get(`${col + dx}:${row + dy}`) ?? []) {
          const cell = this.cells[index];
          if (cell.height < CAMPAIGN_SEA_LEVEL) continue;
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
    pushDraped(input, out, a, b, lift);
  }
}

/** One map-space segment as world segments, split every `drapeStepPx` so it follows the ground. */
function pushDraped(
  input: CampaignBuildInput,
  out: number[],
  a: readonly [number, number] | readonly number[],
  b: readonly [number, number] | readonly number[],
  lift: number
): void {
  const scaled = lift * (input.liftScale ?? 1);
  const step = input.drapeStepPx ?? 0;
  const n = step > 0 ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)) : 1;
  let previous = worldPoint(input, a[0], a[1], scaled);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const next = worldPoint(input, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, scaled);
    pushSegment(out, previous, next);
    previous = next;
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
      pushDraped(input, out, clipped[0], clipped[1], lift);
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
