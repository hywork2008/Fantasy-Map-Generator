/**
 * Quadtree tile selection for the Japan 3D terrain (docs/plan/japan-terrain-tiles.md).
 *
 * Tiles are squares in map pixels. Level 0 covers the map with `cols × rows` tiles of
 * `rootSizePx`; each level halves the side. Selection is pure: the caller supplies culling
 * (`include`), data availability (`canSplit`) and the camera as plain numbers.
 */

export interface TileKey {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export interface TileBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface TilePyramid {
  readonly width: number;
  readonly height: number;
  readonly rootSizePx: number;
  readonly cols: number;
  readonly rows: number;
  readonly maxZoom: number;
  /** Grid points per tile side, edge row shared with the neighbour. */
  readonly samples: number;
}

export interface TilePyramidInput {
  width: number;
  height: number;
  rootSizePx: number;
  maxZoom: number;
  samples?: number;
}

export const DEFAULT_TILE_SAMPLES = 65;
export const DEFAULT_MAX_SCREEN_ERROR_PX = 2;
export const DEFAULT_MAX_TILES = 256;

export function tilePyramid(input: TilePyramidInput): TilePyramid {
  const { width, height, rootSizePx, maxZoom } = input;
  if (!(rootSizePx > 0) || !(width > 0) || !(height > 0)) throw new Error("tilePyramid: sizes must be positive");
  return {
    width,
    height,
    rootSizePx,
    cols: Math.ceil(width / rootSizePx),
    rows: Math.ceil(height / rootSizePx),
    maxZoom: Math.max(0, Math.floor(maxZoom)),
    samples: Math.max(2, Math.floor(input.samples ?? DEFAULT_TILE_SAMPLES))
  };
}

export const tileId = (key: TileKey): string => `${key.z}/${key.x}/${key.y}`;

export function tileSizePx(pyramid: TilePyramid, z: number): number {
  return pyramid.rootSizePx / 2 ** z;
}

/** Grid spacing of a level: the geometric error used for selection. */
export function tileSpacingPx(pyramid: TilePyramid, z: number): number {
  return tileSizePx(pyramid, z) / (pyramid.samples - 1);
}

export function tileBounds(pyramid: TilePyramid, key: TileKey): TileBounds {
  const size = tileSizePx(pyramid, key.z);
  return { minX: key.x * size, minY: key.y * size, maxX: (key.x + 1) * size, maxY: (key.y + 1) * size };
}

export function rootTiles(pyramid: TilePyramid): TileKey[] {
  const out: TileKey[] = [];
  for (let y = 0; y < pyramid.rows; y++) for (let x = 0; x < pyramid.cols; x++) out.push({ z: 0, x, y });
  return out;
}

export function childTiles(key: TileKey): TileKey[] {
  const z = key.z + 1;
  const x = key.x * 2;
  const y = key.y * 2;
  return [
    { z, x, y },
    { z, x: x + 1, y },
    { z, x, y: y + 1 },
    { z, x: x + 1, y: y + 1 }
  ];
}

export function parentTile(key: TileKey): TileKey | undefined {
  return key.z > 0 ? { z: key.z - 1, x: key.x >> 1, y: key.y >> 1 } : undefined;
}

export function isAncestor(ancestor: TileKey, key: TileKey): boolean {
  if (ancestor.z >= key.z) return false;
  const shift = key.z - ancestor.z;
  return key.x >> shift === ancestor.x && key.y >> shift === ancestor.y;
}

/** Pixels on screen per world unit at distance 1 for a perspective camera. */
export function projectionFactor(viewportHeightPx: number, fovDeg: number): number {
  return viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

export interface TileView {
  /** Camera position in map pixels; `elevation` is the height above the y=0 plane in the same units. */
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly projection: number;
}

export interface SelectTilesOptions {
  view: TileView;
  maxScreenErrorPx?: number;
  maxTiles?: number;
  /** False drops the tile and its subtree: frustum, chosen prefectures, sea-only tiles. */
  include?: (key: TileKey, bounds: TileBounds) => boolean;
  /** False keeps the tile as a leaf (finer data not installed). Defaults to `z < maxZoom`. */
  canSplit?: (key: TileKey) => boolean;
  /** Height range of the tile in the camera's units, for the distance. Defaults to [0, 0]. */
  heightRange?: (key: TileKey) => readonly [number, number];
}

export interface SelectedTile {
  readonly key: TileKey;
  readonly bounds: TileBounds;
  readonly distance: number;
  readonly screenErrorPx: number;
}

function distanceToBox(view: TileView, b: TileBounds, range: readonly [number, number]): number {
  const dx = Math.max(b.minX - view.x, 0, view.x - b.maxX);
  const dz = Math.max(b.minY - view.y, 0, view.y - b.maxY);
  const dy = Math.max(range[0] - view.elevation, 0, view.elevation - range[1]);
  return Math.hypot(dx, dy, dz);
}

/** Max-heap on screen error. */
class ErrorHeap {
  private readonly items: SelectedTile[] = [];
  get size() {
    return this.items.length;
  }
  push(item: SelectedTile) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].screenErrorPx >= a[i].screenErrorPx) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): SelectedTile | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].screenErrorPx > a[m].screenErrorPx) m = l;
        if (r < a.length && a[r].screenErrorPx > a[m].screenErrorPx) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Leaves that cover the included area without overlap. Splits the tile with the largest
 * screen error first while it exceeds the threshold and the tile budget allows.
 */
export function selectTiles(pyramid: TilePyramid, options: SelectTilesOptions): SelectedTile[] {
  const { view } = options;
  const maxError = options.maxScreenErrorPx ?? DEFAULT_MAX_SCREEN_ERROR_PX;
  const maxTiles = Math.max(1, options.maxTiles ?? DEFAULT_MAX_TILES);
  const include = options.include ?? (() => true);
  const canSplit = options.canSplit ?? ((key: TileKey) => key.z < pyramid.maxZoom);
  const heightRange = options.heightRange ?? (() => [0, 0] as const);

  const measure = (key: TileKey): SelectedTile | undefined => {
    const bounds = tileBounds(pyramid, key);
    if (!include(key, bounds)) return undefined;
    const distance = Math.max(distanceToBox(view, bounds, heightRange(key)), 1e-9);
    return { key, bounds, distance, screenErrorPx: (tileSpacingPx(pyramid, key.z) * view.projection) / distance };
  };

  const done: SelectedTile[] = [];
  const open = new ErrorHeap();
  for (const key of rootTiles(pyramid)) {
    const tile = measure(key);
    if (tile) open.push(tile);
  }
  let count = open.size;
  while (open.size) {
    const tile = open.pop() as SelectedTile;
    if (tile.screenErrorPx <= maxError) {
      // Every tile still open has an error no larger than this one.
      done.push(tile);
      while (open.size) done.push(open.pop() as SelectedTile);
      break;
    }
    if (tile.key.z >= pyramid.maxZoom || !canSplit(tile.key)) {
      done.push(tile);
      continue;
    }
    const children = childTiles(tile.key)
      .map(measure)
      .filter((child): child is SelectedTile => child !== undefined);
    if (!children.length || count - 1 + children.length > maxTiles) {
      done.push(tile);
      continue;
    }
    count += children.length - 1;
    for (const child of children) open.push(child);
  }
  return done;
}

/**
 * Tiles to draw this frame: a selected tile that is not ready is replaced by its nearest
 * ready ancestor. A drawn ancestor hides its drawn descendants so nothing overlaps.
 */
export function resolveDrawable(selected: readonly TileKey[], isReady: (key: TileKey) => boolean): TileKey[] {
  const chosen = new Map<string, TileKey>();
  for (const key of selected) {
    let k: TileKey | undefined = key;
    while (k && !isReady(k)) k = parentTile(k);
    if (k) chosen.set(tileId(k), k);
  }
  const keys = [...chosen.values()];
  return keys.filter(key => {
    for (let p = parentTile(key); p; p = parentTile(p)) if (chosen.has(tileId(p))) return false;
    return true;
  });
}
