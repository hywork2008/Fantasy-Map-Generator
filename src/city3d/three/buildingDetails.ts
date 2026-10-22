import * as THREE from "three";
import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import type { BuildingLot } from "../../city-editor/generators/buildingLots.types";
import type { Point } from "../../city-editor/types/primitives";
import { type FacadeDetailGeometry, facadeDetails } from "../core/facadeDetails";

export const BUILDING_DETAIL_BUDGET = {
  buildings: 50,
  triangles: 30000,
  enterPixels: 64,
  exitPixels: 48,
  cache: 100
} as const;

export function createTownBuildingDetails(lots: readonly BuildingLot[], foundationAt?: (ring: Point[]) => number) {
  const group = new THREE.Group();
  group.name = "ce-building-details";
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const descriptors = lots.flatMap((lot, index) => {
    const colors = buildingAppearanceColors(lot.appearance),
      massing = lot.massing;
    if (!colors || !massing || lot.landmark || lot.polygon.length < 3) return [];
    const elevation = foundationAt?.(lot.polygon) ?? 0;
    const x = lot.polygon.reduce((s, p) => s + p[0], 0) / lot.polygon.length;
    const z = -lot.polygon.reduce((s, p) => s + p[1], 0) / lot.polygon.length;
    const radius =
      Math.max(...lot.polygon.map(p => Math.hypot(p[0] - x, -p[1] - z))) +
      Math.min(1.2, massing.jettyMeters * (massing.storeys - 1));
    return [
      {
        index,
        lot,
        colors,
        elevation,
        sphere: new THREE.Sphere(
          new THREE.Vector3(x, elevation + massing.eaveHeightMeters / 2, z),
          Math.hypot(radius, massing.eaveHeightMeters / 2)
        )
      }
    ];
  });
  let mesh: THREE.Mesh | null = null;
  let selected = new Set<number>();
  let signature = "";
  const cache = new Map<number, FacadeDetailGeometry>();
  const world = new THREE.Matrix4(),
    projection = new THREE.Matrix4(),
    frustum = new THREE.Frustum();
  let lastHeight = -1;
  let disposed = false;
  const linear = (hex: string): [number, number, number] => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  const stats = { buildings: 0, triangles: 0, builds: 0, cached: 0 };
  return {
    group,
    stats,
    update(camera: THREE.PerspectiveCamera, height: number) {
      if (disposed || height <= 0) return;
      camera.updateMatrixWorld();
      if (world.equals(camera.matrixWorld) && projection.equals(camera.projectionMatrix) && height === lastHeight)
        return;
      world.copy(camera.matrixWorld);
      projection.copy(camera.projectionMatrix);
      lastHeight = height;
      frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
      const scale = (height * camera.zoom) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const candidates = descriptors
        .map(d => ({ descriptor: d, distance: camera.position.distanceTo(d.sphere.center) }))
        .filter(
          ({ descriptor: d, distance }) =>
            frustum.intersectsSphere(d.sphere) &&
            (d.sphere.radius * scale) / Math.max(1, distance) >=
              (selected.has(d.index) ? BUILDING_DETAIL_BUDGET.exitPixels : BUILDING_DETAIL_BUDGET.enterPixels)
        )
        .sort((a, b) => a.distance - b.distance || a.descriptor.index - b.descriptor.index)
        .slice(0, BUILDING_DETAIL_BUDGET.buildings);
      const parts: FacadeDetailGeometry[] = [],
        ids: number[] = [];
      let triangles = 0;
      for (const { descriptor: d } of candidates) {
        let geometry = cache.get(d.index);
        if (!geometry) {
          geometry = facadeDetails(
            d.lot.polygon,
            d.lot.massing!,
            {
              wall: linear(d.colors.wall),
              frame: d.colors.frame ? linear(d.colors.frame) : undefined,
              trim: linear("#71573E"),
              window: linear("#303B39")
            },
            d.elevation
          );
          cache.set(d.index, geometry);
        }
        const count = geometry.positions.length / 9;
        if (!count || triangles + count > BUILDING_DETAIL_BUDGET.triangles) continue;
        parts.push(geometry);
        ids.push(d.index);
        triangles += count;
      }
      selected = new Set(ids);
      for (const key of cache.keys()) {
        if (cache.size <= BUILDING_DETAIL_BUDGET.cache) break;
        if (!selected.has(key)) cache.delete(key);
      }
      stats.cached = cache.size;
      const nextSignature = [...ids].sort((a, b) => a - b).join(",");
      if (nextSignature === signature) return;
      signature = nextSignature;
      if (mesh) {
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh = null;
      }
      stats.buildings = ids.length;
      stats.triangles = triangles;
      stats.builds++;
      if (!parts.length) return;
      const geometry = new THREE.BufferGeometry();
      for (const attribute of ["positions", "normals", "colors"] as const) {
        const values = new Float32Array(parts.reduce((sum, part) => sum + part[attribute].length, 0));
        let offset = 0;
        for (const part of parts) {
          values.set(part[attribute], offset);
          offset += part[attribute].length;
        }
        geometry.setAttribute(
          { positions: "position", normals: "normal", colors: "color" }[attribute],
          new THREE.BufferAttribute(values, 3)
        );
      }
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = "near-facades";
      group.add(mesh);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh?.geometry.dispose();
      mesh = null;
      material.dispose();
      cache.clear();
      descriptors.length = 0;
      group.clear();
    }
  };
}
export type TownBuildingDetails = ReturnType<typeof createTownBuildingDetails>;
