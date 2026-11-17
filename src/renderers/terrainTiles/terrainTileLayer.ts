/**
 * Quadtree terrain tiles in the three.js scene (docs/plan/japan-terrain-tiles.md, T2).
 * Main-thread build for now: a few meshes per frame, the rest on the next animation frame.
 * Tiles leave the GPU (`geometry.dispose()`) once unused for `DISPOSE_AFTER_MS`.
 */
import * as THREE from "three";
import { loadEarthRasterBytes } from "../../generators/earthRegionHeightmap";
import { buildTileMesh, TILE_WATER_COLOR as WATER } from "./tileMesh";
import {
  parentTile,
  projectionFactor,
  resolveDrawable,
  type SelectedTile,
  selectTiles,
  type TileKey,
  type TilePyramid,
  tileBounds,
  tileId,
  tilePyramid
} from "./tileTree";

export const JAPAN_TILE_DIR = "./heightmaps/earth/japan-tiles/";
const DISPOSE_AFTER_MS = 2000;
const BUILDS_PER_FRAME = 12;
/** Levels up to this size load in one request (z0–z2); larger ones load per tile. */
const WHOLE_LEVEL_BYTES = 2_000_000;
const MAX_RANGE_REQUESTS = 8;
/** Ranged tile heights kept in memory (about 5,600 tiles of 67×67). */
const MAX_TILE_DATA_BYTES = 48_000_000;
/** Height scale 50. Hillshade is baked at this exaggeration; others only scale the group. */
const REFERENCE_EXAGGERATION = 3;

interface TileIndexLevel {
  z: number;
  sizeKm: number;
  spacingKm: number;
  file: string;
  bytes: number;
  /** [x, y, byteOffset, minM, maxM, prefectureIndexes, split] */
  tiles: [number, number, number, number, number, number[], number?][];
}

export interface TileIndex {
  version: number;
  region: { west: number; east: number; south: number; north: number };
  frame: { kmPerDegLon: number; kmPerDegLat: number; widthKm: number; heightKm: number };
  rootKm: number;
  cols: number;
  rows: number;
  samples: number;
  /** Extra stored samples per side (version 2). */
  border?: number;
  unitMeters: number;
  nodata: number;
  prefectures: string[];
  /** Prefecture index per `cellKm` cell of the frame (Uint8, 255 = none). */
  prefectureMask?: { file: string; width: number; height: number; cellKm: number } | null;
  /** Lake outlines (lakes.json), drawn as water. Heights inside are already flat at the surface. */
  lakes?: { file: string; count: number };
  levels: TileIndexLevel[];
}

interface TileEntry {
  offset: number;
  minM: number;
  maxM: number;
  prefectures: number[];
  /** False when finer data is missing under part of the tile. */
  split: boolean;
}

interface LiveTile {
  mesh: THREE.Mesh;
  lastUsed: number;
  vertices: number;
  bytes: number;
  /** Tile extent in map pixels. */
  boundsPx: PixelBounds;
}

interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Reshapes land heights inside `bounds` (map pixels). `at` takes and returns meters. */
export interface TileHeightModifier {
  key: string;
  bounds: PixelBounds;
  at(mapX: number, mapY: number, meters: number): number;
}

/** Lake outline in frame km (x east, y south from the north-west corner). */
interface TileLake {
  name: string | null;
  surfaceM: number;
  /** [minX, minY, maxX, maxY] km. */
  box: [number, number, number, number];
  rings: [number, number][][];
}

/** Even-odd point in polygon over all rings (holes included). */
function insideLake(lake: TileLake, x: number, y: number): boolean {
  const [x0, y0, x1, y1] = lake.box;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  let inside = false;
  for (const ring of lake.rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

const insideBounds = (b: PixelBounds, x: number, y: number) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

export interface TerrainTileParams {
  graphWidth: number;
  graphHeight: number;
  /** World units per meter at the current exaggeration. */
  worldYPerMeter: number;
  /** Current exaggeration; meshes are built at REFERENCE_EXAGGERATION and scaled. */
  exaggeration: number;
  maxScreenErrorPx: number;
  maxTiles: number;
  maxZoom: number;
  wireframe?: boolean;
  /** Map pixel of the war focus; with `farKm` > 0, tiles farther than that stop at `farZoom`. */
  focus?: { x: number; y: number } | null;
  farKm?: number;
  farZoom?: number;
  /** ISO 3166-2 codes to show; others are dimmed and tiles touching none are not drawn. Empty = all. */
  prefectures?: readonly string[];
  /** Optional map colouring (e.g. state colours) blended over the land. `key` changes rebuild tiles. */
  mapColor?: { key: string; at: (mapX: number, mapY: number) => readonly [number, number, number] | null } | null;
}

/** Share of the map colour over the terrain colour. */
const MAP_COLOR_MIX = 0.55;
/** Brightness of land outside the chosen prefectures. */
const OUTSIDE_PREFECTURE_DIM = 0.35;

export function tileDistanceKm(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  x: number,
  y: number
): number {
  const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
  const dy = Math.max(bounds.minY - y, 0, y - bounds.maxY);
  return Math.hypot(dx, dy);
}

export interface TerrainTileStats {
  selected: number;
  drawn: number;
  drawnVertices: number;
  liveMeshes: number;
  liveGeometryMB: number;
  /** Whole levels plus ranged tiles in memory. */
  loadedLevelMB: number;
  /** Tiles fetched by Range so far, and how many are cached now. */
  rangedTiles: number;
  cachedTiles: number;
  levels: number[];
  pendingBuilds: number;
  lastUpdateMs: number;
  maxUpdateMs: number;
  byZoom: Record<number, number>;
}

export class TerrainTileLayer {
  readonly group = new THREE.Group();
  private index: TileIndex | null = null;
  private pyramid: TilePyramid | null = null;
  private entries = new Map<string, TileEntry>();
  private levelData = new Map<number, Int16Array>();
  private levelLoading = new Map<number, Promise<void>>();
  private live = new Map<string, LiveTile>();
  private material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private meshKey = "";
  private frame = 0;
  private lastArgs: { camera: THREE.PerspectiveCamera; viewportHeight: number; params: TerrainTileParams } | null =
    null;
  private disposed = false;
  private prefectureMask: Uint8Array | null = null;
  private lakes: TileLake[] = [];
  private tileData = new Map<string, Int16Array>();
  private tileLoading = new Map<string, Promise<void>>();
  private failed = new Set<string>();
  private failedLevels = new Set<number>();
  private isFailed = (key: TileKey) => this.failed.has(tileId(key)) || this.failedLevels.has(key.z);
  private tileDataBytes = 0;
  private rangedTiles = 0;
  private rangeUnsupported = false;
  private version = 0;
  private heightModifier: TileHeightModifier | null = null;
  private chosen = new Set<number>();
  private sea: THREE.Mesh | undefined;
  private stats: TerrainTileStats = {
    selected: 0,
    drawn: 0,
    drawnVertices: 0,
    liveMeshes: 0,
    liveGeometryMB: 0,
    loadedLevelMB: 0,
    rangedTiles: 0,
    cachedTiles: 0,
    levels: [],
    pendingBuilds: 0,
    lastUpdateMs: 0,
    maxUpdateMs: 0,
    byZoom: {}
  };
  readonly ready: Promise<boolean>;

  constructor(
    private readonly onChange: () => void,
    dir = JAPAN_TILE_DIR
  ) {
    this.group.name = "terrain-tiles";
    this.dir = dir;
    this.ready = this.loadIndex(dir);
  }

  private dir = JAPAN_TILE_DIR;

  /** Directory of the tile pyramid this layer reads. */
  get directory(): string {
    return this.dir;
  }

  private async loadIndex(dir: string): Promise<boolean> {
    this.dir = dir;
    try {
      const index = JSON.parse(new TextDecoder().decode(await loadEarthRasterBytes(`${dir}index.json`))) as TileIndex;
      // Levels finer than the distributed ones, when baked locally (Git-ignored).
      try {
        const local = JSON.parse(new TextDecoder().decode(await loadEarthRasterBytes(`${dir}index.local.json`))) as {
          levels?: TileIndexLevel[];
        };
        for (const level of local.levels ?? []) if (level.z === index.levels.length) index.levels.push(level);
      } catch {
        // Not installed.
      }
      this.index = index;
      this.pyramid = tilePyramid({
        width: index.frame.widthKm,
        height: index.frame.heightKm,
        rootSizePx: index.rootKm,
        maxZoom: index.levels.length - 1,
        samples: index.samples
      });
      const mask = index.prefectureMask;
      if (mask)
        try {
          this.prefectureMask = await loadEarthRasterBytes(`${dir}${mask.file}`);
        } catch {
          this.prefectureMask = null;
        }
      if (index.lakes)
        try {
          const json = JSON.parse(
            new TextDecoder().decode(await loadEarthRasterBytes(`${dir}${index.lakes.file}`))
          ) as {
            lakes?: TileLake[];
          };
          this.lakes = json.lakes ?? [];
        } catch {
          this.lakes = [];
        }
      for (const level of index.levels)
        for (const [x, y, offset, minM, maxM, prefectures, split] of level.tiles)
          this.entries.set(tileId({ z: level.z, x, y }), { offset, minM, maxM, prefectures, split: split !== 0 });
      return true;
    } catch {
      return false;
    }
  }

  private loadLevel(z: number): void {
    const index = this.index;
    if (!index || this.levelData.has(z) || this.levelLoading.has(z) || this.failedLevels.has(z)) return;
    const level = index.levels[z];
    if (!level) return;
    const promise = loadEarthRasterBytes(`${this.dir}${level.file}`)
      .then(bytes => {
        const copy = new Int16Array(bytes.byteLength / 2);
        copy.set(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
        this.levelData.set(z, copy);
        this.version++;
      })
      .catch(() => {
        this.failedLevels.add(z);
      })
      .finally(() => {
        this.levelLoading.delete(z);
        if (!this.disposed) this.requestUpdate();
      });
    this.levelLoading.set(z, promise);
  }

  /** Heights of one tile, from a whole level or a ranged read; undefined until loaded. */
  private dataFor(key: TileKey): Int16Array | undefined {
    const index = this.index;
    const entry = this.entries.get(tileId(key));
    if (!index || !entry) return undefined;
    const stored = index.samples + 2 * (index.border ?? 0);
    const level = this.levelData.get(key.z);
    if (level) return level.subarray(entry.offset / 2, entry.offset / 2 + stored * stored);
    const id = tileId(key);
    const data = this.tileData.get(id);
    if (data) {
      // Refresh the LRU order.
      this.tileData.delete(id);
      this.tileData.set(id, data);
    }
    return data;
  }

  /** Small levels load whole; large ones tile by tile with HTTP Range (whole file if Range is ignored). */
  private requestData(key: TileKey): void {
    const index = this.index;
    const level = index?.levels[key.z];
    if (!index || !level) return;
    if (level.bytes <= WHOLE_LEVEL_BYTES || this.rangeUnsupported) {
      this.loadLevel(key.z);
      return;
    }
    const id = tileId(key);
    const entry = this.entries.get(id);
    if (!entry || this.tileData.has(id) || this.tileLoading.has(id) || this.levelLoading.has(key.z)) return;
    if (this.failed.has(id)) return;
    if (this.tileLoading.size >= MAX_RANGE_REQUESTS) return;
    const stored = index.samples + 2 * (index.border ?? 0);
    const length = stored * stored * 2;
    const promise = fetch(`${this.dir}${level.file}`, {
      headers: { Range: `bytes=${entry.offset}-${entry.offset + length - 1}` }
    })
      .then(async response => {
        if (!response.ok) {
          this.failed.add(id);
          return;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (response.status !== 206 || bytes.byteLength !== length) {
          // The server sent the whole file: keep it as the level and stop asking for ranges.
          this.rangeUnsupported = true;
          if (bytes.byteLength === level.bytes) {
            const all = new Int16Array(bytes.byteLength / 2);
            all.set(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
            this.levelData.set(key.z, all);
            this.version++;
          }
          return;
        }
        const data = new Int16Array(stored * stored);
        data.set(new Int16Array(bytes.buffer, bytes.byteOffset, stored * stored));
        this.tileData.set(id, data);
        this.version++;
        this.tileDataBytes += data.byteLength;
        this.rangedTiles++;
        this.evictTileData();
      })
      .catch(() => {
        this.failed.add(id);
      })
      .finally(() => {
        this.tileLoading.delete(id);
        if (!this.disposed) this.requestUpdate();
      });
    this.tileLoading.set(id, promise);
  }

  /** Tiles of these levels that cover a map-pixel rectangle (only tiles in the index). */
  private keysCovering(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    levels: readonly number[],
    graphWidth: number,
    graphHeight: number
  ): TileKey[] {
    const index = this.index;
    if (!index) return [];
    const kx = index.frame.widthKm / graphWidth;
    const ky = index.frame.heightKm / graphHeight;
    const keys: TileKey[] = [];
    for (const z of levels) {
      const level = index.levels[z];
      if (!level) continue;
      const x0 = Math.floor((bounds.minX * kx) / level.sizeKm);
      const x1 = Math.floor((bounds.maxX * kx) / level.sizeKm);
      const y0 = Math.floor((bounds.minY * ky) / level.sizeKm);
      const y1 = Math.floor((bounds.maxY * ky) / level.sizeKm);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) if (this.entries.has(tileId({ z, x, y }))) keys.push({ z, x, y });
    }
    return keys;
  }

  /** Tiles over a rectangle not in memory yet (failed reads excluded). */
  pendingArea(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    levels: readonly number[],
    graphWidth: number,
    graphHeight: number
  ): number {
    return this.keysCovering(bounds, levels, graphWidth, graphHeight).filter(
      key => !this.peekData(key) && !this.isFailed(key)
    ).length;
  }

  /** Loads every tile of these levels over a rectangle. Resolves true when it loaded anything. */
  async ensureArea(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    levels: readonly number[],
    graphWidth: number,
    graphHeight: number
  ): Promise<boolean> {
    await this.ready;
    const keys = this.keysCovering(bounds, levels, graphWidth, graphHeight);
    let loaded = false;
    for (;;) {
      const missing = keys.filter(key => !this.peekData(key) && !this.isFailed(key));
      if (!missing.length || this.disposed) break;
      for (const key of missing) this.requestData(key);
      const waits = [...this.tileLoading.values(), ...this.levelLoading.values()];
      if (!waits.length) break;
      await Promise.race(waits);
      loaded = true;
    }
    return loaded;
  }

  /** Level steps in meters by z (grid spacing). */
  get levelStepsMeters(): number[] {
    return this.index?.levels.map(level => level.spacingKm * 1000) ?? [];
  }

  /**
   * Raw DEM meters (negative at sea) at a map pixel from level `z` when its tile is in memory;
   * null when not loaded, outside the index, or no data.
   */
  rawMetersAt(mapX: number, mapY: number, z: number, graphWidth: number, graphHeight: number): number | null {
    const index = this.index;
    const level = index?.levels[z];
    if (!index || !level) return null;
    const xKm = (mapX / graphWidth) * index.frame.widthKm;
    const yKm = (mapY / graphHeight) * index.frame.heightKm;
    const key = { z, x: Math.floor(xKm / level.sizeKm), y: Math.floor(yKm / level.sizeKm) };
    const data = this.peekData(key);
    if (!data) return null;
    const border = index.border ?? 0;
    const stored = index.samples + 2 * border;
    const fx = (xKm - key.x * level.sizeKm) / level.spacingKm + border;
    const fy = (yKm - key.y * level.sizeKm) / level.spacingKm + border;
    const x0 = Math.min(stored - 2, Math.max(0, Math.floor(fx)));
    const y0 = Math.min(stored - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0));
    const ty = Math.min(1, Math.max(0, fy - y0));
    let sum = 0;
    let weight = 0;
    for (const [i, j, w] of [
      [0, 0, (1 - tx) * (1 - ty)],
      [1, 0, tx * (1 - ty)],
      [0, 1, (1 - tx) * ty],
      [1, 1, tx * ty]
    ] as const) {
      const raw = data[(y0 + j) * stored + x0 + i];
      if (raw === index.nodata || w === 0) continue;
      sum += raw * index.unitMeters * w;
      weight += w;
    }
    return weight > 0.25 ? sum / weight : null;
  }

  /** Drops the least recently used ranged tiles that have no mesh. */
  private evictTileData(): void {
    for (const [id, data] of this.tileData) {
      if (this.tileDataBytes <= MAX_TILE_DATA_BYTES) break;
      if (this.live.has(id)) continue;
      this.tileData.delete(id);
      this.tileDataBytes -= data.byteLength;
    }
  }

  /**
   * Meters at a map pixel from the finest tile whose heights are in memory (no request), as the
   * tiles draw it (sea at 0). Null where nothing is loaded. Lines and markers sit on this.
   */
  metersAt(mapX: number, mapY: number, graphWidth: number, graphHeight: number): number | null {
    const index = this.index;
    if (!index) return null;
    const xKm = (mapX / graphWidth) * index.frame.widthKm;
    const yKm = (mapY / graphHeight) * index.frame.heightKm;
    const border = index.border ?? 0;
    const stored = index.samples + 2 * border;
    for (let z = index.levels.length - 1; z >= 0; z--) {
      const level = index.levels[z];
      const key = { z, x: Math.floor(xKm / level.sizeKm), y: Math.floor(yKm / level.sizeKm) };
      const data = this.peekData(key);
      if (!data) continue;
      const fx = (xKm - key.x * level.sizeKm) / level.spacingKm + border;
      const fy = (yKm - key.y * level.sizeKm) / level.spacingKm + border;
      const x0 = Math.min(stored - 2, Math.max(0, Math.floor(fx)));
      const y0 = Math.min(stored - 2, Math.max(0, Math.floor(fy)));
      const tx = Math.min(1, Math.max(0, fx - x0));
      const ty = Math.min(1, Math.max(0, fy - y0));
      const at = (i: number, j: number) => {
        const raw = data[(y0 + j) * stored + x0 + i];
        return raw === index.nodata ? 0 : Math.max(0, raw * index.unitMeters);
      };
      const top = at(0, 0) * (1 - tx) + at(1, 0) * tx;
      const bottom = at(0, 1) * (1 - tx) + at(1, 1) * tx;
      const meters = top * (1 - ty) + bottom * ty;
      const modifier = this.heightModifier;
      if (!modifier || meters <= 0.5 || !insideBounds(modifier.bounds, mapX, mapY)) return meters;
      if (this.lakes.some(lake => insideLake(lake, xKm, yKm))) return meters;
      return Math.max(0.5, modifier.at(mapX, mapY, meters));
    }
    return null;
  }

  /**
   * Reshapes land heights inside `bounds` (map pixels), e.g. valleys along FMG rivers
   * (docs/plan/fmg-cell-valleys.md). A new `key` rebuilds the tiles it touches; null clears it.
   */
  setHeightModifier(modifier: TileHeightModifier | null): void {
    const previous = this.heightModifier;
    if ((previous?.key ?? null) === (modifier?.key ?? null)) return;
    this.heightModifier = modifier;
    for (const [id, tile] of [...this.live]) {
      const box = tile.boundsPx;
      const touches = (m: TileHeightModifier | null) =>
        Boolean(
          m &&
            box.maxX >= m.bounds.minX &&
            box.minX <= m.bounds.maxX &&
            box.maxY >= m.bounds.minY &&
            box.minY <= m.bounds.maxY
        );
      if (touches(previous) || touches(modifier)) this.disposeTile(id);
    }
    this.version++;
    this.requestUpdate();
  }

  /** Bumps when new heights arrive, so line heights can be refreshed once loading settles. */
  get dataVersion(): number {
    return this.version;
  }

  private peekData(key: TileKey): Int16Array | undefined {
    const index = this.index;
    const entry = this.entries.get(tileId(key));
    if (!index || !entry) return undefined;
    const stored = index.samples + 2 * (index.border ?? 0);
    const level = this.levelData.get(key.z);
    if (level) return level.subarray(entry.offset / 2, entry.offset / 2 + stored * stored);
    return this.tileData.get(tileId(key));
  }

  isLoaded(): boolean {
    return this.index !== null;
  }

  getStats(): TerrainTileStats {
    return { ...this.stats, byZoom: { ...this.stats.byZoom }, levels: [...this.stats.levels] };
  }

  /** Re-select for the camera. Call on every camera change; it schedules its own follow-ups. */
  update(camera: THREE.PerspectiveCamera, viewportHeight: number, params: TerrainTileParams): void {
    this.lastArgs = { camera, viewportHeight, params };
    const index = this.index;
    const pyramid = this.pyramid;
    if (!index || !pyramid || this.disposed) return;
    const t0 = performance.now();
    const now = t0;
    const sx = params.graphWidth / index.frame.widthKm;
    const sz = params.graphHeight / index.frame.heightKm;
    const exaggeration = params.exaggeration > 0 ? params.exaggeration : REFERENCE_EXAGGERATION;
    const buildYPerMeter = (params.worldYPerMeter / exaggeration) * REFERENCE_EXAGGERATION;
    this.group.scale.y = exaggeration / REFERENCE_EXAGGERATION;
    const chosen = new Set<number>();
    for (const code of params.prefectures ?? []) {
      const i = index.prefectures.indexOf(code);
      if (i >= 0) chosen.add(i);
    }
    const key = [
      params.graphWidth,
      params.graphHeight,
      buildYPerMeter.toPrecision(6),
      params.wireframe ? 1 : 0,
      [...chosen].join(","),
      params.mapColor?.key ?? ""
    ].join("|");
    this.chosen = chosen;
    // A partial display shows only the chosen land; a full sea plane would read as "all ocean".
    if (this.sea) this.sea.visible = chosen.size === 0;
    if (key !== this.meshKey) {
      this.disposeMeshes();
      this.meshKey = key;
      this.material.wireframe = Boolean(params.wireframe);
      this.placeSea(params, buildYPerMeter);
      if (this.sea) this.sea.visible = chosen.size === 0;
    }

    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    const box = new THREE.Box3();
    const halfW = params.graphWidth / 2;
    const halfH = params.graphHeight / 2;
    const maxZoom = Math.min(params.maxZoom, index.levels.length - 1);
    const focusKm = params.focus ? { x: params.focus.x / sx, y: params.focus.y / sz } : null;
    const selected: SelectedTile[] = selectTiles(pyramid, {
      view: {
        x: (camera.position.x + halfW) / sx,
        y: (camera.position.z + halfH) / sz,
        elevation: camera.position.y / sx,
        projection: projectionFactor(viewportHeight, camera.fov)
      },
      maxScreenErrorPx: params.maxScreenErrorPx,
      maxTiles: params.maxTiles,
      include: (k, b) => {
        const entry = this.entries.get(tileId(k));
        if (!entry) return false;
        if (chosen.size && !entry.prefectures.some(p => chosen.has(p))) return false;
        box.min.set(b.minX * sx - halfW, Math.max(0, entry.minM) * params.worldYPerMeter, b.minY * sz - halfH);
        box.max.set(b.maxX * sx - halfW, Math.max(0, entry.maxM) * params.worldYPerMeter, b.maxY * sz - halfH);
        return frustum.intersectsBox(box);
      },
      canSplit: k => {
        if (k.z >= maxZoom || this.entries.get(tileId(k))?.split === false) return false;
        if (!focusKm || !(params.farKm && params.farKm > 0) || k.z < (params.farZoom ?? 1)) return true;
        return tileDistanceKm(tileBounds(pyramid, k), focusKm.x, focusKm.y) <= params.farKm;
      },
      heightRange: k => {
        const entry = this.entries.get(tileId(k));
        return entry
          ? [
              (Math.max(0, entry.minM) * params.worldYPerMeter) / sx,
              (Math.max(0, entry.maxM) * params.worldYPerMeter) / sx
            ]
          : [0, 0];
      }
    });

    // Build what is wanted, nearest first, within the per-frame budget.
    let builds = 0;
    let pending = 0;
    const wanted = [...selected].sort((a, b) => a.distance - b.distance);
    for (const tile of wanted) {
      const id = tileId(tile.key);
      if (this.live.has(id)) continue;
      if (!this.dataFor(tile.key)) {
        this.requestData(tile.key);
        pending++;
        continue;
      }
      if (builds >= BUILDS_PER_FRAME) {
        pending++;
        continue;
      }
      if (this.buildTile(tile.key, sx, sz, params)) builds++;
    }
    // A tile still loading or queued is drawn as its nearest ancestor; build that ancestor now
    // (they are few and shared) so there is always ground under the camera.
    for (const tile of wanted) {
      if (this.live.has(tileId(tile.key))) continue;
      for (let k = parentTile(tile.key); k; k = parentTile(k)) {
        if (this.live.has(tileId(k))) break;
        if (!this.dataFor(k)) {
          this.requestData(k);
          continue;
        }
        if (this.buildTile(k, sx, sz, params)) break;
      }
    }
    const drawable = resolveDrawable(
      selected.map(t => t.key),
      k => this.live.has(tileId(k))
    );
    const drawnIds = new Set(drawable.map(tileId));
    let drawnVertices = 0;
    const byZoom: Record<number, number> = {};
    for (const [id, tile] of this.live) {
      const visible = drawnIds.has(id);
      tile.mesh.visible = visible;
      if (visible) {
        tile.lastUsed = now;
        drawnVertices += tile.vertices;
        const z = Number(id.split("/")[0]);
        byZoom[z] = (byZoom[z] ?? 0) + 1;
      } else if (now - tile.lastUsed > DISPOSE_AFTER_MS) this.disposeTile(id);
    }
    let liveBytes = 0;
    for (const tile of this.live.values()) liveBytes += tile.bytes;
    let levelBytes = 0;
    for (const data of this.levelData.values()) levelBytes += data.byteLength;
    const ms = performance.now() - t0;
    this.stats = {
      selected: selected.length,
      drawn: drawable.length,
      drawnVertices,
      liveMeshes: this.live.size,
      liveGeometryMB: +(liveBytes / 1e6).toFixed(2),
      loadedLevelMB: +((levelBytes + this.tileDataBytes) / 1e6).toFixed(2),
      rangedTiles: this.rangedTiles,
      cachedTiles: this.tileData.size,
      levels: [...this.levelData.keys()].sort(),
      pendingBuilds: pending,
      lastUpdateMs: +ms.toFixed(1),
      maxUpdateMs: Math.max(this.stats.maxUpdateMs, +ms.toFixed(1)),
      byZoom
    };
    if (pending > 0 || this.live.size > drawable.length) this.requestUpdate();
  }

  resetStats(): void {
    this.stats.maxUpdateMs = 0;
  }

  /** Sea-only tiles are not baked; one plane just under sea level fills them. */
  private placeSea(params: TerrainTileParams, buildYPerMeter: number): void {
    if (!this.sea) {
      this.sea = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(WATER[0], WATER[1], WATER[2]),
          // Far views: keep the plane behind the tiles' own sea despite depth precision.
          polygonOffset: true,
          polygonOffsetFactor: 4,
          polygonOffsetUnits: 4
        })
      );
      this.sea.name = "terrain-tiles-sea";
      this.group.add(this.sea);
    }
    this.sea.scale.set(params.graphWidth, 1, params.graphHeight);
    this.sea.position.set(0, -20 * buildYPerMeter, 0);
  }

  private requestUpdate(): void {
    if (this.frame || typeof requestAnimationFrame === "undefined") return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const args = this.lastArgs;
      if (!args || this.disposed) return;
      this.update(args.camera, args.viewportHeight, args.params);
      this.onChange();
    });
  }

  private buildTile(key: TileKey, sx: number, sz: number, params: TerrainTileParams): boolean {
    const index = this.index;
    const entry = this.entries.get(tileId(key));
    const tileData = this.dataFor(key);
    if (!index || !entry || !tileData) return false;
    const n = index.samples;
    const level = index.levels[key.z];
    const sizeKm = level.sizeKm;
    const border = index.border ?? 0;
    const arrays = buildTileMesh({
      data: tileData,
      samples: n,
      border,
      unitMeters: index.unitMeters,
      nodata: index.nodata,
      originX: key.x * sizeKm * sx - params.graphWidth / 2,
      originZ: key.y * sizeKm * sz - params.graphHeight / 2,
      stepX: level.spacingKm * sx,
      stepZ: level.spacingKm * sz,
      worldYPerMeter:
        (params.worldYPerMeter / (params.exaggeration || REFERENCE_EXAGGERATION)) * REFERENCE_EXAGGERATION,
      // Deeper than the largest step between levels on steep ground.
      adjustColor: this.colorAdjuster(params, sx, sz, key),
      adjustMeters: this.metersAdjuster(params, key, sx, sz),
      skirtMeters: Math.max(50, (entry.maxM - Math.max(0, entry.minM)) * 0.25)
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(arrays.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(arrays.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = `terrain-tile-${tileId(key)}`;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    this.live.set(tileId(key), {
      mesh,
      lastUsed: performance.now(),
      vertices: arrays.vertexCount,
      boundsPx: {
        minX: key.x * sizeKm * sx,
        minY: key.y * sizeKm * sz,
        maxX: (key.x + 1) * sizeKm * sx,
        maxY: (key.y + 1) * sizeKm * sz
      },
      bytes: arrays.positions.byteLength + arrays.colors.byteLength + arrays.indices.byteLength
    });
    return true;
  }

  /** Lakes over a tile, with one sample of margin for the shading border. */
  private lakesNear(key: TileKey): TileLake[] {
    const level = this.index?.levels[key.z];
    if (!level || !this.lakes.length) return [];
    const margin = level.spacingKm;
    return this.lakes.filter(lake => {
      const [x0, y0, x1, y1] = lake.box;
      return (
        x1 >= key.x * level.sizeKm - margin &&
        x0 <= (key.x + 1) * level.sizeKm + margin &&
        y1 >= key.y * level.sizeKm - margin &&
        y0 <= (key.y + 1) * level.sizeKm + margin
      );
    });
  }

  private metersAdjuster(params: TerrainTileParams, key: TileKey, sx: number, sz: number) {
    const modifier = this.heightModifier;
    const level = this.index?.levels[key.z];
    if (!modifier || !level) return undefined;
    const box = {
      minX: key.x * level.sizeKm * sx,
      minY: key.y * level.sizeKm * sz,
      maxX: (key.x + 1) * level.sizeKm * sx,
      maxY: (key.y + 1) * level.sizeKm * sz
    };
    const b = modifier.bounds;
    if (box.maxX < b.minX || box.minX > b.maxX || box.maxY < b.minY || box.minY > b.maxY) return undefined;
    const halfW = params.graphWidth / 2;
    const halfH = params.graphHeight / 2;
    // Lakes keep their flat surface: valleys are not carved under them.
    const lakes = this.lakesNear(key);
    return (x: number, z: number, meters: number) => {
      const mapX = x + halfW;
      const mapY = z + halfH;
      if (!insideBounds(b, mapX, mapY)) return meters;
      if (lakes.length && lakes.some(lake => insideLake(lake, mapX / sx, mapY / sz))) return meters;
      return modifier.at(mapX, mapY, meters);
    };
  }

  private colorAdjuster(params: TerrainTileParams, sx: number, sz: number, key: TileKey) {
    const mask = this.prefectureMask;
    const info = this.index?.prefectureMask;
    const chosen = this.chosen;
    const mapColor = params.mapColor;
    const lakes = this.lakesNear(key);
    if (!mapColor && !(chosen.size && mask && info) && !lakes.length) return undefined;
    const halfW = params.graphWidth / 2;
    const halfH = params.graphHeight / 2;
    return (x: number, z: number, land: boolean, colors: Float32Array, o: number) => {
      const mapX = x + halfW;
      const mapY = z + halfH;
      if (land && lakes.length && lakes.some(lake => insideLake(lake, mapX / sx, mapY / sz))) {
        colors[o] = WATER[0];
        colors[o + 1] = WATER[1];
        colors[o + 2] = WATER[2];
        land = false;
      }
      if (land && mapColor) {
        const c = mapColor.at(mapX, mapY);
        if (c) for (let i = 0; i < 3; i++) colors[o + i] = colors[o + i] * (1 - MAP_COLOR_MIX) + c[i] * MAP_COLOR_MIX;
      }
      if (chosen.size && mask && info) {
        const cx = Math.floor(mapX / sx / info.cellKm);
        const cy = Math.floor(mapY / sz / info.cellKm);
        const p = cx >= 0 && cy >= 0 && cx < info.width && cy < info.height ? mask[cy * info.width + cx] : 255;
        if (!chosen.has(p)) for (let i = 0; i < 3; i++) colors[o + i] *= OUTSIDE_PREFECTURE_DIM;
      }
    };
  }

  private disposeTile(id: string): void {
    const tile = this.live.get(id);
    if (!tile) return;
    tile.mesh.geometry.dispose();
    this.group.remove(tile.mesh);
    this.live.delete(id);
  }

  private disposeMeshes(): void {
    for (const id of [...this.live.keys()]) this.disposeTile(id);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.disposeMeshes();
    this.material.dispose();
    if (this.sea) {
      this.sea.geometry.dispose();
      (this.sea.material as THREE.Material).dispose();
      this.sea = undefined;
    }
    this.group.removeFromParent();
    this.levelData.clear();
    this.tileData.clear();
    this.failed.clear();
    this.tileDataBytes = 0;
  }
}
