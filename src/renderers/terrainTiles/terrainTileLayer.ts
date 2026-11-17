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
  tileId,
  tilePyramid
} from "./tileTree";

export const JAPAN_TILE_DIR = "./heightmaps/earth/japan-tiles/";
const DISPOSE_AFTER_MS = 2000;
const BUILDS_PER_FRAME = 12;
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
}

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
}

export interface TerrainTileStats {
  selected: number;
  drawn: number;
  drawnVertices: number;
  liveMeshes: number;
  liveGeometryMB: number;
  loadedLevelMB: number;
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
  private sea: THREE.Mesh | undefined;
  private stats: TerrainTileStats = {
    selected: 0,
    drawn: 0,
    drawnVertices: 0,
    liveMeshes: 0,
    liveGeometryMB: 0,
    loadedLevelMB: 0,
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
    this.ready = this.loadIndex(dir);
  }

  private dir = JAPAN_TILE_DIR;

  private async loadIndex(dir: string): Promise<boolean> {
    this.dir = dir;
    try {
      const index = JSON.parse(new TextDecoder().decode(await loadEarthRasterBytes(`${dir}index.json`))) as TileIndex;
      this.index = index;
      this.pyramid = tilePyramid({
        width: index.frame.widthKm,
        height: index.frame.heightKm,
        rootSizePx: index.rootKm,
        maxZoom: index.levels.length - 1,
        samples: index.samples
      });
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
    if (!index || this.levelData.has(z) || this.levelLoading.has(z)) return;
    const level = index.levels[z];
    if (!level) return;
    const promise = loadEarthRasterBytes(`${this.dir}${level.file}`)
      .then(bytes => {
        const copy = new Int16Array(bytes.byteLength / 2);
        copy.set(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
        this.levelData.set(z, copy);
      })
      .catch(() => undefined)
      .finally(() => {
        this.levelLoading.delete(z);
        if (!this.disposed) this.requestUpdate();
      });
    this.levelLoading.set(z, promise);
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
    const key = `${params.graphWidth}|${params.graphHeight}|${buildYPerMeter.toPrecision(6)}|${params.wireframe ? 1 : 0}`;
    if (key !== this.meshKey) {
      this.disposeMeshes();
      this.meshKey = key;
      this.material.wireframe = Boolean(params.wireframe);
      this.placeSea(params, buildYPerMeter);
    }

    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    const box = new THREE.Box3();
    const halfW = params.graphWidth / 2;
    const halfH = params.graphHeight / 2;
    const maxZoom = Math.min(params.maxZoom, index.levels.length - 1);
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
        box.min.set(b.minX * sx - halfW, Math.max(0, entry.minM) * params.worldYPerMeter, b.minY * sz - halfH);
        box.max.set(b.maxX * sx - halfW, Math.max(0, entry.maxM) * params.worldYPerMeter, b.maxY * sz - halfH);
        return frustum.intersectsBox(box);
      },
      canSplit: k => k.z < maxZoom && this.entries.get(tileId(k))?.split !== false,
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
      if (!this.levelData.has(tile.key.z)) {
        this.loadLevel(tile.key.z);
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
        if (!this.levelData.has(k.z)) {
          this.loadLevel(k.z);
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
      loadedLevelMB: +(levelBytes / 1e6).toFixed(2),
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
    const data = this.levelData.get(key.z);
    if (!index || !entry || !data) return false;
    const n = index.samples;
    const level = index.levels[key.z];
    const sizeKm = level.sizeKm;
    const border = index.border ?? 0;
    const stored = n + 2 * border;
    const tileData = data.subarray(entry.offset / 2, entry.offset / 2 + stored * stored);
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
      bytes: arrays.positions.byteLength + arrays.colors.byteLength + arrays.indices.byteLength
    });
    return true;
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
  }
}
