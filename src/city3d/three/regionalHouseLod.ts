import * as THREE from "three";
import type { ModelQuality } from "../../buildings/modelQuality";
import type { BuildingFrontageResolver } from "../../city-editor/generators/buildingFrontage";
import type { BuildingLot } from "../../city-editor/generators/buildingLots.types";
import type { Point } from "../../city-editor/types/primitives";
import { type BvPrototypeCache, createBvInstances } from "./bvInstances";
import { createCityMassing } from "./cityMeshes";
import { type RegionalHouseSite, regionalHouseSite } from "./regionalHouseMeshes";

export const REGIONAL_HOUSE_LOD_BUDGET = {
  buildings: 64,
  triangles: 500000,
  calls: 64,
  cached: 96,
  cachedTriangles: 1000000,
  buildsPerFrame: 2,
  enterPixels: 80,
  exitPixels: 60
} as const;
export interface RegionalHouseLodStats {
  buildings: number;
  triangles: number;
  calls: number;
  cached: number;
  cachedTriangles: number;
  builds: number;
  pending: boolean;
}
type Foundation = ((ring: Point[]) => number) | undefined;
type Layer = ReturnType<typeof createBvInstances<NonNullable<ReturnType<typeof regionalHouseSite>>>>;
interface Entry {
  layer: Layer;
  key: string;
  triangles: number;
  used: boolean;
}

/** All lots keep exact massing; only large visible houses acquire detailed BV geometry. */
export function createTownRegionalHouseLod(
  lots: readonly BuildingLot[],
  cache: BvPrototypeCache,
  foundation: Foundation,
  quality: ModelQuality,
  frontage?: BuildingFrontageResolver,
  simplify = true
) {
  const group = new THREE.Group();
  group.name = "ce-regional-houses";
  const massing = createCityMassing(lots, foundation);
  group.add(massing.group);
  let resolver = frontage;
  const elevations = lots.map(lot => (lot.massing ? (foundation?.(lot.polygon) ?? 0) : 0));
  const sourceKey = JSON.stringify([lots, quality, elevations]);
  const descriptors: { lot: BuildingLot; index: number; sphere: THREE.Sphere; site?: RegionalHouseSite | null }[] =
    lots.flatMap((lot, index) => {
      if (!lot.massing || !lot.appearance || lot.landmark || lot.appearance.profileId === "legacy") return [];
      const x = lot.polygon.reduce((n, p) => n + p[0], 0) / lot.polygon.length;
      const z = -lot.polygon.reduce((n, p) => n + p[1], 0) / lot.polygon.length;
      const height = lot.massing.eaveHeightMeters;
      const radius = Math.hypot(Math.max(...lot.polygon.map(p => Math.hypot(p[0] - x, -p[1] - z))) + 1.2, height / 2);
      return [
        {
          lot,
          index,
          sphere: new THREE.Sphere(
            new THREE.Vector3(x, elevations[index] + lot.massing.baseElevationMeters + height / 2, z),
            radius
          )
        }
      ];
    });
  const entries = new Map<number, Entry>();
  const costs = new Map<number, { key: string; triangles: number }>();
  let selected = new Set<number>(),
    signature = "",
    cameraKey = "",
    disposed = false;
  const frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4();
  const stats: RegionalHouseLodStats = {
    buildings: 0,
    triangles: 0,
    calls: 0,
    cached: 0,
    cachedTriangles: 0,
    builds: 0,
    pending: false
  };
  const free = (id: number, entry: Entry) => {
    entry.layer.group.removeFromParent();
    entry.layer.dispose();
    entries.delete(id);
  };
  return {
    group,
    massing,
    stats,
    get replaced(): ReadonlySet<number> {
      return selected;
    },
    get pickables() {
      return [...entries.values()].filter(e => e.used).flatMap(e => e.layer.pickables);
    },
    refresh(
      next: readonly BuildingLot[],
      nextFoundation: Foundation,
      nextQuality: ModelQuality,
      nextFrontage?: BuildingFrontageResolver
    ) {
      const heights = next.map(lot => (lot.massing ? (nextFoundation?.(lot.polygon) ?? 0) : 0));
      if (JSON.stringify([next, nextQuality, heights]) !== sourceKey) return false;
      for (const d of descriptors) {
        d.lot = next[d.index];
        d.site = undefined;
      }
      resolver = nextFrontage;
      cameraKey = "";
      return true;
    },
    resolve(hit: Pick<THREE.Intersection, "object" | "instanceId">) {
      for (const entry of entries.values())
        if (entry.used) {
          const site = entry.layer.resolve(hit);
          if (site) return site;
        }
    },
    update(camera: THREE.PerspectiveCamera, viewportHeight: number) {
      if (disposed || viewportHeight <= 0) return false;
      camera.updateMatrixWorld(true);
      const nextKey = `${viewportHeight}:${camera.matrixWorld.elements}:${camera.projectionMatrix.elements}`;
      if (cameraKey === nextKey && !stats.pending) return false;
      cameraKey = nextKey;
      const budget = simplify
        ? REGIONAL_HOUSE_LOD_BUDGET
        : {
            ...REGIONAL_HOUSE_LOD_BUDGET,
            buildings: Infinity,
            triangles: Infinity,
            cached: Infinity,
            cachedTriangles: Infinity,
            enterPixels: 0,
            exitPixels: 0
          };
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const scale = (viewportHeight * camera.zoom) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const candidates = descriptors
        .map(d => ({ d, distance: camera.position.distanceTo(d.sphere.center) }))
        .filter(
          ({ d, distance }) =>
            frustum.intersectsSphere(d.sphere) &&
            (d.sphere.radius * scale) / Math.max(1, distance) >=
              (selected.has(d.index) ? budget.exitPixels : budget.enterPixels)
        )
        .sort((a, b) => a.distance - b.distance || a.d.index - b.d.index)
        .slice(0, budget.buildings);
      for (const entry of entries.values()) {
        entry.used = false;
        entry.layer.group.visible = false;
      }
      let triangles = 0,
        builds = 0,
        pending = false,
        detailChanged = false;
      const ids = new Set<number>();
      for (const { d } of candidates) {
        if (ids.size >= budget.buildings) break;
        if (d.site === undefined)
          d.site = regionalHouseSite(d.lot, d.index, elevations[d.index], quality, resolver) ?? null;
        const site = d.site;
        if (!site) continue;
        const key = JSON.stringify([site.definition.cacheKey ?? site.definition.id, site.matrix.elements]);
        let entry = entries.get(d.index);
        if (entry && entry.key !== key) {
          detailChanged = true;
          free(d.index, entry);
          entry = undefined;
        }
        const cost = costs.get(d.index);
        if (cost?.key === key && (!cost.triangles || triangles + cost.triangles > budget.triangles)) continue;
        if (!entry) {
          if (builds >= budget.buildsPerFrame) {
            pending = true;
            continue;
          }
          const layer = createBvInstances([site], cache);
          detailChanged = true;
          builds++;
          stats.builds++;
          const cost = layer.pickables.reduce(
            (n, m) => n + ((m.geometry.index?.count ?? m.geometry.getAttribute("position").count) / 3) * m.count,
            0
          );
          costs.set(d.index, { key, triangles: cost });
          if (!cost || cost > budget.triangles) {
            layer.dispose();
            continue;
          }
          entry = { layer, key, triangles: cost, used: false };
          entries.set(d.index, entry);
          group.add(layer.group);
          for (const mesh of layer.pickables) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        }
        if (triangles + entry.triangles > budget.triangles) continue;
        entries.delete(d.index);
        entries.set(d.index, entry);
        ids.add(d.index);
        triangles += entry.triangles;
        entry.used = true;
        entry.layer.group.visible = true;
      }
      let cachedTriangles = [...entries.values()].reduce((n, e) => n + e.triangles, 0);
      for (const [id, entry] of entries) {
        if (entries.size <= budget.cached && cachedTriangles <= budget.cachedTriangles) break;
        if (entry.used) continue;
        cachedTriangles -= entry.triangles;
        free(id, entry);
      }
      const nextSignature = [...ids].sort((a, b) => a - b).join(",");
      const changed = nextSignature !== signature;
      selected = ids;
      if (changed) {
        signature = nextSignature;
        massing.setExcluded!(ids);
      }
      Object.assign(stats, {
        buildings: ids.size,
        triangles,
        calls: ids.size,
        cached: entries.size,
        cachedTriangles,
        pending
      });
      return changed || detailChanged;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [id, entry] of entries) free(id, entry);
      costs.clear();
      massing.dispose();
      group.removeFromParent();
      group.clear();
    }
  };
}
export type TownRegionalHouseLod = ReturnType<typeof createTownRegionalHouseLod>;
