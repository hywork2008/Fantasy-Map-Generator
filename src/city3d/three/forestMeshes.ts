import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TreeSpecies } from "../../buildings/landscape/trees";
import { forestContains } from "../../city-editor/generators/forestGeometry";
import { bounds, intersectConvex, PlotIndex, plotArea } from "../../city-editor/generators/parcelGeometry";
import { landscapeTreeSpecies } from "../../city-editor/renderers/landscapeTreeSpecies";
import type { ForestPlan, ForestRegion } from "../../city-editor/types/contracts/forest";
import type { CityDocument, Point } from "../../city-editor/types/document";
import type { CityTerrain } from "../../city-editor/types/terrain";
import { growthHash } from "../../utils/urbanMorphology";
import { createForestTreeDetails, type ForestTreeSite } from "./forestTreeDetails";

export type Forest3dQuality = "light" | "standard" | "high";
export const FOREST_3D_BUDGET = {
  light: { trees: 2000, triangles: 100000, calls: 64, shadowTriangles: 0 },
  standard: { trees: 8000, triangles: 300000, calls: 128, shadowTriangles: 50000 },
  high: { trees: 20000, triangles: 800000, calls: 256, shadowTriangles: 150000 }
} as const;
const FAR_CHUNK = 256,
  TREE_CHUNK = 128,
  BASE_LIMIT = 60000,
  CACHE_LIMIT = 24;
const CONIFERS = new Set<TreeSpecies>([
  "norway_spruce",
  "western_red_cedar",
  "silver_fir",
  "canary_pine",
  "mediterranean_cypress",
  "oriental_evergreen",
  "sacred_yew"
]);
type LOD = "far" | "middle" | "near";
type Parts = { positions: number[]; colors: number[] };
interface Chunk {
  id: string;
  box: THREE.Box3;
  far: THREE.Mesh;
  floor: THREE.Mesh;
  mode: LOD;
}
interface TreeLayer {
  group: THREE.Group;
  trees: number;
  triangles: number;
  calls: number;
  meshes: THREE.InstancedMesh[];
}
export interface Forest3dStats {
  quality: Forest3dQuality;
  areaM2: number;
  chunks: number;
  visibleChunks: number;
  nearChunks: number;
  middleChunks: number;
  trees: number;
  triangles: number;
  calls: number;
  shadowTriangles: number;
  cachedLayers: number;
  globalFallback: boolean;
  detailedTrees: number;
  detailedTriangles: number;
  detailedSpecies: TreeSpecies[];
  builds: number;
}

function random(key: string): number {
  let n = Number.parseInt(growthHash(key), 16);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
}
function noise(x: number, y: number, seed: string): number {
  const gx = Math.floor(x / 24),
    gy = Math.floor(y / 24),
    u = x / 24 - gx,
    v = y / 24 - gy;
  const s = u * u * (3 - 2 * u),
    t = v * v * (3 - 2 * v);
  const a = random(`${seed}:canopy:${gx},${gy}`),
    b = random(`${seed}:canopy:${gx + 1},${gy}`);
  const c = random(`${seed}:canopy:${gx},${gy + 1}`),
    d = random(`${seed}:canopy:${gx + 1},${gy + 1}`);
  return (a + (b - a) * s) * (1 - t) + (c + (d - c) * s) * t;
}
const count = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute("position").count) / 3;
const parts = (): Parts => ({ positions: [], colors: [] });
function geometry(p: Parts): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p.positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(p.colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
function vertex(p: Parts, point: Point, height: number, color: THREE.Color, shade = 1) {
  p.positions.push(point[0], height, -point[1]);
  p.colors.push(color.r * shade, color.g * shade, color.b * shade);
}
function distance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

/** Meter-scale, opaque prototypes: one vertex-colored material for trunk and foliage. */
function treeGeometry(conifer: boolean, detailed: boolean): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.23, 3.5, detailed ? 6 : 4);
  trunk.translate(0, 1.75, 0);
  const crown = conifer
    ? new THREE.ConeGeometry(1, 7, detailed ? 8 : 5)
    : new THREE.IcosahedronGeometry(1, detailed ? 1 : 0);
  if (!conifer) crown.scale(1, 3.5, 1);
  crown.translate(0, 6.5, 0);
  const bake = (source: THREE.BufferGeometry, color: string) => {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    g.deleteAttribute("uv");
    const c = new THREE.Color(color),
      rgb = [];
    for (let i = 0; i < g.getAttribute("position").count; i++) rgb.push(c.r, c.g, c.b);
    g.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    return g;
  };
  const a = bake(trunk, "#655139"),
    b = bake(crown, conifer ? "#476c4a" : "#5c7d45");
  const merged = mergeGeometries([a, b])!;
  a.dispose();
  b.dispose();
  return merged;
}

/** A region is clipped before tessellation, so no floor, crown or side spans its holes. */
export function createTownForest(
  document: CityDocument,
  plan: ForestPlan,
  terrain?: Pick<CityTerrain, "heightAt" | "relief">,
  initialQuality: Forest3dQuality = "standard",
  simplify = true
) {
  const group = new THREE.Group();
  group.name = "ce-forest";
  const details = createForestTreeDetails(group);
  const seed = document.generationSeed ?? document.fabric?.seed ?? document.format;
  const heightAt = terrain?.heightAt ?? (() => 0);
  const density = document.forestSettings?.density ?? "standard";
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  const smoothMaterial = material.clone();
  smoothMaterial.flatShading = false;
  const floorColor = new THREE.Color(density === "sparse" ? "#85966a" : "#60734b");
  const crownColor = new THREE.Color(density === "dense" ? "#4e7147" : "#66854f");
  const canopyAt = (p: Point) => {
    const reach = 12;
    const nearest = boundary
      .query([p[0] - reach, p[1] - reach, p[0] + reach, p[1] + reach])
      .reduce((n, edge) => Math.min(n, distance(p, edge.a, edge.b)), reach);
    const t = Math.min(1, nearest / 10),
      blend = t * t * (3 - 2 * t);
    return heightAt(p) + 1.5 + noise(p[0], p[1], seed) + blend * 3.5;
  };
  const owned = new Set<THREE.BufferGeometry>();
  const makeMesh = (g: THREE.BufferGeometry, name: string) => {
    owned.add(g);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.ceForest = true;
    group.add(mesh);
    return mesh;
  };
  const boundary = new PlotIndex<{ a: Point; b: Point }>(64);
  for (const region of plan.regions)
    for (const ring of [region.outer, ...region.holes])
      for (let i = 0; i < ring.length; i++) {
        const edge = { a: ring[i], b: ring[(i + 1) % ring.length] };
        boundary.add(edge, bounds([edge.a, edge.b]));
      }
  const regionIndex = new PlotIndex<ForestRegion>(128);
  for (const region of plan.regions) regionIndex.add(region, region.bounds);
  const fits = (p: Point, radius: number) =>
    regionIndex.query([p[0], p[1], p[0], p[1]]).some(region => forestContains(region, p)) &&
    !boundary
      .query([p[0] - radius, p[1] - radius, p[0] + radius, p[1] + radius])
      .some(edge => distance(p, edge.a, edge.b) < radius + 0.1);
  const crownShape = new THREE.IcosahedronGeometry(1, 0);
  const crownPositions = crownShape.getAttribute("position");
  const source: Point[][] = [];
  for (const region of plan.regions) {
    const outer = region.outer.map(p => new THREE.Vector2(...p)),
      holes = region.holes.map(r => r.map(p => new THREE.Vector2(...p)));
    const points = [...outer, ...holes.flat()];
    for (const triangle of THREE.ShapeUtils.triangulateShape(outer, holes)) {
      const ring = triangle.map(i => points[i].toArray() as Point);
      if (
        (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]) <
        0
      )
        ring.reverse();
      source.push(ring);
    }
  }
  let spacing = 16;
  let data = new Map<string, { far: Parts; floor: Parts; baseVertices?: number }>();
  for (let pass = 0; pass < 10; pass++, spacing *= 2) {
    data = new Map();
    const cell = Math.min(spacing, FAR_CHUNK);
    const cells = new Set<string>();
    for (const triangle of source) {
      const b = bounds(triangle);
      for (let x = Math.floor(b[0] / cell); x <= Math.floor(b[2] / cell); x++)
        for (let y = Math.floor(b[1] / cell); y <= Math.floor(b[3] / cell); y++) {
          const polygon = intersectConvex(triangle, [
            [x * cell, y * cell],
            [(x + 1) * cell, y * cell],
            [(x + 1) * cell, (y + 1) * cell],
            [x * cell, (y + 1) * cell]
          ]);
          if (polygon.length < 3 || plotArea(polygon) < 0.001) continue;
          cells.add(`${x},${y}`);
          const key = `${Math.floor(((x + 0.5) * cell) / FAR_CHUNK)},${Math.floor(((y + 0.5) * cell) / FAR_CHUNK)}`;
          let item = data.get(key);
          if (!item) {
            item = { far: parts(), floor: parts() };
            data.set(key, item);
          }
          for (let i = 1; i + 1 < polygon.length; i++) {
            const tri = [polygon[0], polygon[i], polygon[i + 1]];
            if (
              Math.abs(
                (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0])
              ) < 1e-7
            )
              continue;
            for (const p of tri) vertex(item.floor, p, heightAt(p) + 0.035, floorColor);
            for (const p of tri) vertex(item.far, p, canopyAt(p), crownColor, 0.85 + noise(p[0], p[1], seed) * 0.25);
          }
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
              q = polygon[(i + 1) % polygon.length];
            if (Math.hypot(a[0] - q[0], a[1] - q[1]) < 1e-5) continue;
            if (
              !boundary
                .query(bounds([a, q]))
                .some(edge => distance(a, edge.a, edge.b) < 1e-4 && distance(q, edge.a, edge.b) < 1e-4)
            )
              continue;
            for (const [p, top] of [
              [a, false],
              [q, false],
              [a, true],
              [q, false],
              [q, true],
              [a, true]
            ] as [Point, boolean][])
              vertex(item.far, p, top ? canopyAt(p) : heightAt(p) + 0.035, crownColor, 0.78);
          }
        }
    }
    for (const d of data.values()) d.baseVertices = (d.floor.positions.length + d.far.positions.length) / 3;
    const cap = (p: Point, radius: number) => {
      if (!fits(p, radius)) return;
      const d = data.get(`${Math.floor(p[0] / FAR_CHUNK)},${Math.floor(p[1] / FAR_CHUNK)}`);
      if (!d) return;
      const shade = 0.8 + random(`${seed}:clump:${p}`) * 0.3;
      for (let i = 0; i < crownPositions.count; i++) {
        const q: Point = [p[0] + crownPositions.getX(i) * radius, p[1] - crownPositions.getZ(i) * radius];
        vertex(d.far, q, heightAt(q) + 6.5 + crownPositions.getY(i) * 5, crownColor, shade);
      }
    };
    for (const id of cells) {
      const [x, y] = id.split(",").map(Number);
      cap(
        [
          (x + 0.3 + random(`${seed}:${id}:clump-x`) * 0.4) * cell,
          (y + 0.3 + random(`${seed}:${id}:clump-y`) * 0.4) * cell
        ],
        Math.min(24, cell * 0.6)
      );
    }
    for (const region of plan.regions)
      for (const ring of [region.outer, ...region.holes])
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length],
            len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const count = Math.floor(len / (spacing * 0.75));
          for (let j = 0; j < count; j++) {
            const t = (j + 0.5) / count;
            cap(
              [
                a[0] + (b[0] - a[0]) * t - ((b[1] - a[1]) / len) * 4.2,
                a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / len) * 4.2
              ],
              3.5
            );
          }
        }
    const triangles = [...data.values()].reduce(
      (n, d) => n + (d.floor.positions.length + d.far.positions.length) / 9,
      0
    );
    if (triangles <= BASE_LIMIT) break;
    if (cell === FAR_CHUNK) {
      crownShape.dispose();
      material.dispose();
      smoothMaterial.dispose();
      throw new RangeError("Forest boundary exceeds the minimum 3D geometry budget");
    }
  }
  crownShape.dispose();
  const chunks: Chunk[] = [];
  for (const [id, d] of data) {
    const far = makeMesh(
      geometry({ positions: [...d.floor.positions, ...d.far.positions], colors: [...d.floor.colors, ...d.far.colors] }),
      `forest-canopy-${id}`
    );
    const floor = makeMesh(geometry(d.floor), `forest-floor-${id}`);
    far.geometry.userData.forestBaseVertices = d.baseVertices;
    floor.visible = false;
    const box = far.geometry.boundingBox!.clone();
    box.max.y += 8;
    chunks.push({ id, far, floor, box, mode: "far" });
  }
  const fallbackGeometry = chunks.length
    ? mergeGeometries(chunks.map(chunk => chunk.far.geometry))!
    : geometry(parts());
  const fallback = makeMesh(fallbackGeometry, "forest-overview");
  fallback.visible = false;
  const bounds3d = new THREE.Box3();
  for (const c of chunks) bounds3d.union(c.box);
  const prototypes = new Map<string, THREE.BufferGeometry>();
  const cache = new Map<string, TreeLayer>();
  const costs = new Map<string, Pick<TreeLayer, "trees" | "triangles" | "calls">>();
  let quality = simplify ? (FOREST_3D_BUDGET[initialQuality] ? initialQuality : "standard") : "high";
  let disposed = false,
    signature = "",
    shadowSignature = "";
  const stats: Forest3dStats = {
    quality,
    areaM2: plan.areaM2,
    chunks: chunks.length,
    visibleChunks: 0,
    nearChunks: 0,
    middleChunks: 0,
    trees: 0,
    triangles: 0,
    calls: 0,
    shadowTriangles: 0,
    cachedLayers: 0,
    globalFallback: false,
    detailedTrees: 0,
    detailedTriangles: 0,
    detailedSpecies: [],
    builds: 0
  };
  const getLayer = (chunk: Chunk, lod: "middle" | "near"): TreeLayer => {
    const key = `${chunk.id}:${lod}`,
      hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const root = new THREE.Group();
    root.name = `forest-trees-${key}`;
    group.add(root);
    const [cx, cy] = chunk.id.split(",").map(Number);
    const batches = new Map<
      string,
      { id: string; point: Point; radius: number; size: number; species: TreeSpecies }[]
    >();
    const chance = density === "sparse" ? 0.5 : density === "dense" ? 1 : 0.8;
    for (let gx = cx * 32; gx < (cx + 1) * 32; gx++)
      for (let gy = cy * 32; gy < (cy + 1) * 32; gy++) {
        const id = `${gx},${gy}`;
        if (random(`${seed}:tree:${id}:density`) > chance) continue;
        const p: Point = [
          (gx + 0.2 + random(`${seed}:tree:${id}:x`) * 0.6) * 8,
          (gy + 0.2 + random(`${seed}:tree:${id}:y`) * 0.6) * 8
        ];
        const radius = 2.7 + random(`${seed}:tree:${id}:radius`) * 1.3;
        const nearby = regionIndex.query([p[0], p[1], p[0], p[1]]);
        const region = nearby.find(r => forestContains(r, p));
        if (!region) continue;
        // A complete crown disk must fit, including at concave openings and water banks.
        if (
          boundary
            .query([p[0] - radius, p[1] - radius, p[0] + radius, p[1] + radius])
            .some(e => distance(p, e.a, e.b) < radius + 0.1)
        )
          continue;
        const species = landscapeTreeSpecies("garden_parkland", document, p);
        const needle =
          species === "silver_birch"
            ? false
            : CONIFERS.has(species) || /conifer|taiga/i.test(document.biome?.key ?? "");
        const batch = `${Math.floor(p[0] / TREE_CHUNK)},${Math.floor(p[1] / TREE_CHUNK)}:${needle ? "needle" : "leaf"}`;
        const list = batches.get(batch) ?? [];
        list.push({ id, species, point: p, radius, size: 0.8 + random(`${seed}:tree:${id}:size`) * 0.4 });
        batches.set(batch, list);
      }
    const meshes: THREE.InstancedMesh[] = [];
    let trees = 0,
      triangles = 0;
    for (const [batch, sites] of batches) {
      const protoKey = `${batch.endsWith("needle")}:${lod}`;
      let proto = prototypes.get(protoKey);
      if (!proto) {
        proto = treeGeometry(batch.endsWith("needle"), lod === "near");
        prototypes.set(protoKey, proto);
        owned.add(proto);
      }
      const mesh = new THREE.InstancedMesh(proto, material, sites.length);
      mesh.name = `forest-${lod}-${batch}`;
      const matrix = new THREE.Matrix4();
      sites.forEach((site, i) => {
        matrix.compose(
          new THREE.Vector3(site.point[0], heightAt(site.point), -site.point[1]),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            random(`${seed}:${site.point}:angle`) * Math.PI * 2
          ),
          new THREE.Vector3(site.radius, site.size, site.radius)
        );
        mesh.setMatrixAt(i, matrix);
      });
      mesh.userData.forestSites = sites.map((site, index) => ({ ...site, mesh, index }));
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.userData.ceForest = true;
      root.add(mesh);
      meshes.push(mesh);
      trees += sites.length;
      triangles += count(proto) * sites.length;
    }
    const layer = { group: root, trees, triangles, calls: meshes.length, meshes };
    cache.set(key, layer);
    costs.set(key, { trees, triangles, calls: meshes.length });
    stats.builds++;
    return layer;
  };
  const frustum = new THREE.Frustum(),
    matrix = new THREE.Matrix4();
  return {
    group,
    stats,
    bounds: bounds3d,
    setQuality(next: Forest3dQuality) {
      const normalized = simplify ? (FOREST_3D_BUDGET[next] ? next : "standard") : "high";
      if (quality === normalized) return false;
      quality = normalized;
      signature = "";
      return true;
    },
    update(camera: THREE.PerspectiveCamera, viewportHeight: number): boolean {
      if (disposed || viewportHeight <= 0) return false;
      camera.updateMatrixWorld(true);
      const nextSignature = `${quality}:${viewportHeight}:${camera.matrixWorld.elements}:${camera.projectionMatrix.elements}`;
      if (nextSignature === signature) return false;
      signature = nextSignature;
      details.reset();
      const budget = simplify
        ? FOREST_3D_BUDGET[quality]
        : {
            trees: Infinity,
            triangles: Infinity,
            calls: Infinity,
            shadowTriangles: Infinity
          };
      const cacheLimit = simplify ? CACHE_LIMIT : Infinity;
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const scale = (viewportHeight * camera.zoom) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visible = chunks
        .filter(c => frustum.intersectsBox(c.box))
        .map(chunk => ({ chunk, distance: camera.position.distanceTo(chunk.box.getCenter(new THREE.Vector3())) }))
        .sort((a, b) => a.distance - b.distance || a.chunk.id.localeCompare(b.chunk.id));
      for (const c of chunks) {
        c.far.visible = false;
        c.floor.visible = false;
      }
      for (const layer of cache.values()) {
        layer.group.visible = false;
        for (const mesh of layer.meshes) mesh.castShadow = false;
      }
      fallback.visible = false;
      Object.assign(stats, {
        quality,
        visibleChunks: visible.length,
        nearChunks: 0,
        middleChunks: 0,
        trees: 0,
        triangles: 0,
        calls: 0,
        shadowTriangles: 0,
        globalFallback: false,
        detailedTrees: 0,
        detailedTriangles: 0,
        detailedSpecies: []
      });
      const detailSites: ForestTreeSite[] = [];
      const triangleLimit = !simplify ? Infinity : quality === "high" ? 320000 : budget.triangles;
      const shadowLimit = !simplify ? 0 : quality === "high" ? 60000 : budget.shadowTriangles;
      const used = new Set<string>(),
        casters: string[] = [];
      if (visible.length > budget.calls) {
        fallback.visible = true;
        stats.globalFallback = true;
        stats.calls = 1;
        stats.triangles = count(fallback.geometry);
        for (const chunk of chunks) chunk.mode = "far";
      } else {
        stats.calls = visible.length;
        stats.triangles = visible.reduce((n, c) => n + count(c.chunk.far.geometry), 0);
        for (const { chunk, distance: dist } of visible) {
          const pixels = (8 * scale) / Math.max(1, dist);
          const previous = chunk.mode;
          const target: LOD = !simplify
            ? "near"
            : pixels >= (previous === "near" ? 34 : 44)
              ? "near"
              : pixels >= (previous !== "far" ? 18 : 24)
                ? "middle"
                : "far";
          const modes: LOD[] =
            target === "near" ? ["near", "middle", "far"] : target === "middle" ? ["middle", "far"] : ["far"];
          chunk.mode = "far";
          for (const mode of modes) {
            if (mode === "far") {
              chunk.far.visible = true;
              break;
            }
            if (used.size >= cacheLimit) continue;
            const cost = costs.get(`${chunk.id}:${mode}`);
            if (
              cost &&
              (stats.trees + cost.trees > budget.trees ||
                stats.calls + cost.calls > budget.calls ||
                stats.triangles - count(chunk.far.geometry) + count(chunk.floor.geometry) + cost.triangles >
                  triangleLimit)
            )
              continue;
            const layer = getLayer(chunk, mode);
            const triangles =
              stats.triangles - count(chunk.far.geometry) + count(chunk.floor.geometry) + layer.triangles;
            const calls = stats.calls - 1 + 1 + layer.calls;
            if (
              stats.trees + layer.trees > budget.trees ||
              triangles > triangleLimit ||
              calls > budget.calls ||
              !layer.trees
            )
              continue;
            stats.triangles = triangles;
            stats.calls = calls;
            stats.trees += layer.trees;
            if (mode === "near") stats.nearChunks++;
            else stats.middleChunks++;
            layer.group.visible = true;
            for (const mesh of layer.meshes)
              mesh.material = quality === "high" && mode === "near" ? smoothMaterial : material;
            chunk.floor.visible = true;
            chunk.mode = mode;
            used.add(`${chunk.id}:${mode}`);
            if (quality === "high" && mode === "near")
              for (const mesh of layer.meshes) detailSites.push(...(mesh.userData.forestSites as ForestTreeSite[]));
            if (mode === "near")
              for (const mesh of layer.meshes) {
                const cost = count(mesh.geometry) * mesh.count;
                if (stats.shadowTriangles + cost <= shadowLimit) {
                  mesh.castShadow = true;
                  stats.shadowTriangles += cost;
                  casters.push(mesh.name);
                }
              }
            break;
          }
        }
      }
      for (const [key, layer] of cache) {
        if (cache.size <= cacheLimit) break;
        if (used.has(key)) continue;
        for (const mesh of layer.meshes) mesh.dispose();
        layer.group.removeFromParent();
        cache.delete(key);
      }
      if (quality === "high") {
        const result = details.update(
          camera,
          viewportHeight,
          detailSites,
          {
            triangles: Math.max(0, budget.triangles - stats.triangles),
            calls: Math.max(0, budget.calls - stats.calls),
            shadowTriangles: Math.max(0, budget.shadowTriangles - stats.shadowTriangles)
          },
          simplify
        );
        stats.triangles += result.triangles;
        stats.calls += result.calls;
        stats.shadowTriangles += result.shadowTriangles;
        stats.detailedTrees = result.trees;
        stats.detailedTriangles = result.triangles;
        stats.detailedSpecies = result.species;
        casters.push(result.shadowKey);
      }
      stats.cachedLayers = cache.size;
      const nextShadow = casters.sort().join("|");
      const shadowChanged = nextShadow !== shadowSignature;
      shadowSignature = nextShadow;
      return shadowChanged;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      details.dispose();
      for (const layer of cache.values()) for (const mesh of layer.meshes) mesh.dispose();
      cache.clear();
      for (const g of owned) g.dispose();
      owned.clear();
      material.dispose();
      smoothMaterial.dispose();
      group.removeFromParent();
      group.clear();
    }
  };
}
export type TownForest = ReturnType<typeof createTownForest>;
