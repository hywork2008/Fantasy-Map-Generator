import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../city3d/three/structureMeshes";

/** Bake kit parts into material buckets; the returned model owns all of its resources. */
export function compactModel(source: CityStructureMeshes): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = source.group.name;
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const pickables: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  try {
    source.group.updateMatrixWorld(true);
    for (const mesh of source.pickables) {
      if (Array.isArray(mesh.material)) throw new Error("Compact models require one material per part");
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.deleteAttribute("uv");
      geometry.applyMatrix4(mesh.matrixWorld);
      const bucket = buckets.get(mesh.material) ?? [];
      bucket.push(geometry);
      buckets.set(mesh.material, bucket);
    }
    for (const [material, parts] of buckets) {
      const geometry = mergeGeometries(parts);
      if (!geometry) throw new Error("Incompatible model attributes");
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.name = `${group.name}-${pickables.length}`;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      pickables.push(mesh);
    }
  } catch (error) {
    for (const mesh of pickables) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    throw error;
  } finally {
    for (const parts of buckets.values()) for (const part of parts) part.dispose();
    source.dispose();
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  };
}
