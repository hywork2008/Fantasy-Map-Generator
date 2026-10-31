import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../city3d/three/structureMeshes";
import type { ModelPartRange } from "./modelParts";

/** Bake kit parts into material buckets; the returned model owns all of its resources. */
export function compactModel(
  source: CityStructureMeshes,
  options: { mergeEquivalentMaterials?: boolean } = {}
): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = source.group.name;
  const buckets = new Map<
    THREE.Material | string,
    { material: THREE.Material; parts: THREE.BufferGeometry[]; ranges: ModelPartRange[]; count: number }
  >();
  const pickables: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  try {
    source.group.updateMatrixWorld(true);
    for (const mesh of source.pickables) {
      if (Array.isArray(mesh.material)) throw new Error("Compact models require one material per part");
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.deleteAttribute("uv");
      geometry.applyMatrix4(mesh.matrixWorld);
      let key: THREE.Material | string = mesh.material;
      // Opt-in pooling is restricted to plain Lambert materials with no custom shader hooks.
      if (
        options.mergeEquivalentMaterials &&
        Object.getPrototypeOf(mesh.material) === THREE.MeshLambertMaterial.prototype &&
        mesh.material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile &&
        mesh.material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey
      ) {
        const { uuid, ...properties } = mesh.material.toJSON();
        key = JSON.stringify(properties);
      }
      const bucket = buckets.get(key) ?? { material: mesh.material, parts: [], ranges: [], count: 0 };
      const count = geometry.getAttribute("position").count;
      if (mesh.userData.modelPartRanges) {
        for (const range of mesh.userData.modelPartRanges as ModelPartRange[])
          bucket.ranges.push({ ...range, start: range.start + bucket.count });
      } else if (mesh.userData.modelPartId)
        bucket.ranges.push({ partId: mesh.userData.modelPartId, start: bucket.count, count });
      bucket.count += count;
      bucket.parts.push(geometry);
      buckets.set(key, bucket);
    }
    for (const { material, parts, ranges } of buckets.values()) {
      const geometry = mergeGeometries(parts);
      if (!geometry) throw new Error("Incompatible model attributes");
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.name = `${group.name}-${pickables.length}`;
      if (ranges.length) mesh.userData.modelPartRanges = ranges;
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
    for (const { parts } of buckets.values()) for (const part of parts) part.dispose();
    source.dispose();
  }
  if (source.group.userData.modelParts)
    group.userData.modelParts = source.group.userData.modelParts.map((part: object) => ({ ...part }));
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
