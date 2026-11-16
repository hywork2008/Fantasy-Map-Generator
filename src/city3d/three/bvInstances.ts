import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "./structureMeshes";

export interface BvDefinition {
  id: string;
  /** Opt-in content identity: equal keys must describe identical geometry and materials. */
  cacheKey?: string;
  /** Adopted BV variant id, listed among the scene's model authors. */
  variant?: string;
  create(): CityStructureMeshes;
  /** Transfers an opaque, non-indexed position/normal/color geometry to the prototype cache. */
  createGeometry?(): THREE.BufferGeometry;
  /** Bake the model mirrored across its local x axis, with its triangles' winding kept outward. */
  mirrorX?: boolean;
}

/** Mirror a baked, non-indexed geometry across x: positions and normals flip, and each triangle's second and third
 * vertices swap so its faces still wind outward. */
function mirrorGeometry(geometry: THREE.BufferGeometry): void {
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  for (const attribute of Object.values(geometry.attributes) as THREE.BufferAttribute[]) {
    const size = attribute.itemSize,
      array = attribute.array;
    for (let v = 0; v + 2 < attribute.count; v += 3)
      for (let c = 0; c < size; c++) {
        const a = (v + 1) * size + c,
          b = (v + 2) * size + c,
          t = array[a];
        array[a] = array[b];
        array[b] = t;
      }
    attribute.needsUpdate = true;
  }
}
interface Prototype {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
  bounds: THREE.Box3;
  references: number;
}

/** Bake opaque, solid-color BV parts once. Source factories retain ownership of their resources. */
function bake(definition: BvDefinition): Prototype | undefined {
  if (definition.createGeometry) {
    const geometry = definition.createGeometry();
    if (definition.mirrorX) mirrorGeometry(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return {
      geometry,
      material: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      bounds: geometry.boundingBox!.clone(),
      references: 0
    };
  }
  const model = definition.create();
  const parts: THREE.BufferGeometry[] = [];
  try {
    model.group.updateMatrixWorld(true);
    let supported = true;
    model.group.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.MeshLambertMaterial;
      if (
        Array.isArray(material) ||
        !material.color ||
        material.map ||
        material.transparent ||
        material.opacity !== 1
      ) {
        supported = false;
        return;
      }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      parts.push(geometry);
      geometry.applyMatrix4(object.matrixWorld);
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      const count = geometry.getAttribute("position").count;
      const existing = material.vertexColors ? geometry.getAttribute("color") : undefined;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = material.color.r * (existing?.getX(i) ?? 1);
        colors[i * 3 + 1] = material.color.g * (existing?.getY(i) ?? 1);
        colors[i * 3 + 2] = material.color.b * (existing?.getZ(i) ?? 1);
      }
      for (const name of Object.keys(geometry.attributes))
        if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.clearGroups();
    });
    if (!supported || !parts.length) return;
    const geometry = mergeGeometries(parts);
    if (!geometry) return;
    if (definition.mirrorX) mirrorGeometry(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return {
      geometry,
      material: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      bounds: geometry.boundingBox!.clone(),
      references: 0
    };
  } finally {
    for (const part of parts) part.dispose();
    model.dispose();
  }
}

/** Explicit view-scoped cache. A prototype lives until its last instance layer releases it. */
export function createBvPrototypeCache() {
  const entries = new Map<BvDefinition | string, Prototype>();
  return {
    get size() {
      return entries.size;
    },
    acquire(definition: BvDefinition) {
      const key = definition.cacheKey ?? definition;
      let prototype = entries.get(key);
      if (!prototype) {
        prototype = bake(definition);
        if (!prototype) return;
        entries.set(key, prototype);
      }
      prototype.references++;
      const owned = prototype;
      let released = false;
      return {
        geometry: prototype.geometry,
        material: prototype.material,
        bounds: prototype.bounds,
        release() {
          if (released) return;
          released = true;
          if (--owned.references === 0) {
            entries.delete(key);
            owned.geometry.dispose();
            owned.material.dispose();
          }
        }
      };
    }
  };
}
export type BvPrototypeCache = ReturnType<typeof createBvPrototypeCache>;

export interface BvPlacement {
  id: string;
  definition: BvDefinition;
  matrix: THREE.Matrix4;
}

/** Owned copy of exactly the picked instance, in world coordinates; caller must dispose it. */
export function bvInstanceGeometry(
  hit: Pick<THREE.Intersection, "object" | "instanceId">
): THREE.BufferGeometry | undefined {
  const mesh = hit.object;
  const index = hit.instanceId;
  if (
    !(mesh instanceof THREE.InstancedMesh) ||
    index === undefined ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= mesh.count
  )
    return;
  mesh.updateWorldMatrix(true, false);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  matrix.premultiply(mesh.matrixWorld);
  const geometry = mesh.geometry.clone().applyMatrix4(matrix);
  geometry.computeBoundingBox();
  return geometry;
}

/** One draw call per BV definition, with instance IDs mapped back to CE IDs. */
export function createBvInstances<T extends BvPlacement>(sites: readonly T[], cache = createBvPrototypeCache()) {
  const group = new THREE.Group();
  group.name = "ce-bv-instances";
  const pickables: THREE.InstancedMesh[] = [];
  const batches = new Map<BvDefinition | string, { definition: BvDefinition; sites: T[] }>();
  const lookup = new Map<THREE.Object3D, T[]>();
  const originals = new Map<THREE.InstancedMesh, T[]>();
  const leases: Array<{ release(): void }> = [];
  const accepted: T[] = [];
  for (const site of sites) {
    const key = site.definition.cacheKey ?? site.definition;
    const batch = batches.get(key) ?? { definition: site.definition, sites: [] };
    batch.sites.push(site);
    batches.set(key, batch);
  }
  for (const { definition, sites: batch } of batches.values()) {
    const prototype = cache.acquire(definition);
    if (!prototype) continue;
    leases.push(prototype);
    const mesh = new THREE.InstancedMesh(prototype.geometry, prototype.material, batch.length);
    mesh.name = `${definition.id}-instances`;
    if (definition.variant) mesh.userData.modelVariants = [definition.variant];
    batch.forEach((site, index) => {
      mesh.setMatrixAt(index, site.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    pickables.push(mesh);
    lookup.set(mesh, batch);
    originals.set(mesh, batch);
    accepted.push(...batch);
  }
  let disposed = false;
  return {
    group,
    pickables,
    accepted,
    /** Compact visible instances without rebaking prototypes. Picking follows the compacted indices. */
    setVisible(predicate: (site: T) => boolean): boolean {
      let changed = false;
      for (const [mesh, all] of originals) {
        const visible = all.filter(predicate);
        const previous = lookup.get(mesh)!;
        if (previous.length === visible.length && previous.every((site, i) => site === visible[i])) continue;
        changed = true;
        lookup.set(mesh, visible);
        mesh.count = visible.length;
        mesh.visible = visible.length > 0;
        visible.forEach((site, i) => {
          mesh.setMatrixAt(i, site.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (visible.length) {
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
        }
      }
      return changed;
    },
    resolve(hit: Pick<THREE.Intersection, "object" | "instanceId">): T | undefined {
      return hit.instanceId === undefined ? undefined : lookup.get(hit.object)?.[hit.instanceId];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of pickables) mesh.dispose();
      for (const lease of leases) lease.release();
      lookup.clear();
      originals.clear();
      group.clear();
    }
  };
}
