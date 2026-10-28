import * as THREE from "three";
import { createLandscapeTree, type TreeSpecies } from "../../buildings/landscape/trees";
import type { Point } from "../../city-editor/types/document";
import { type BvDefinition, createBvPrototypeCache } from "./bvInstances";

export const FOREST_TREE_DETAIL_LIMIT = { trees: 16, species: 4, enterPixels: 60, exitPixels: 48 } as const;
export interface ForestTreeSite {
  id: string;
  point: Point;
  radius: number;
  size: number;
  species: TreeSpecies;
  mesh: THREE.InstancedMesh;
  index: number;
}
type Lease = NonNullable<ReturnType<ReturnType<typeof createBvPrototypeCache>["acquire"]>>;
interface Model {
  lease: Lease;
  triangles: number;
  meshes: [THREE.InstancedMesh, THREE.InstancedMesh];
}
interface Budget {
  triangles: number;
  calls: number;
  shadowTriangles: number;
}

/** Detailed BV silhouettes replace the same stable forest candidates, never add a second tree. */
export function createForestTreeDetails(parent: THREE.Group) {
  const group = new THREE.Group();
  group.name = "forest-bv-trees";
  parent.add(group);
  const cache = createBvPrototypeCache();
  const models = new Map<TreeSpecies, Model>();
  let hidden: { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }[] = [];
  let selected = new Set<string>();
  let disposed = false;
  const frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4();
  let capacity = FOREST_TREE_DETAIL_LIMIT.trees as number;
  const getModel = (species: TreeSpecies, simplify: boolean): Model | undefined => {
    const hit = models.get(species);
    if (hit) return hit;
    if (simplify && models.size >= FOREST_TREE_DETAIL_LIMIT.species) return;
    const definition: BvDefinition = { id: `forest-tree:${species}`, create: () => createLandscapeTree(species) };
    const lease = cache.acquire(definition);
    if (!lease) return;
    const geometry = lease.geometry,
      positions = geometry.getAttribute("position");
    let radius = 0;
    for (let i = 0; i < positions.count; i++)
      radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
    const height = lease.bounds.max.y - lease.bounds.min.y;
    if (radius <= 0 || height <= 0) {
      lease.release();
      return;
    }
    // Fit the existing candidate envelope: a unit crown radius, ten metres tall, roots at y=0.
    geometry.translate(0, -lease.bounds.min.y, 0);
    geometry.scale(1 / radius, 10 / height, 1 / radius);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    lease.bounds.copy(geometry.boundingBox!);
    const triangles = (geometry.index?.count ?? positions.count) / 3;
    const mesh = (shadow: boolean) => {
      const m = new THREE.InstancedMesh(geometry, lease.material, capacity);
      m.count = 0;
      m.visible = false;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.name = `forest-bv-${species}-${shadow ? "shadow" : "plain"}`;
      m.userData.ceForest = true;
      m.userData.forestSpecies = species;
      group.add(m);
      return m;
    };
    const model: Model = { lease, triangles, meshes: [mesh(true), mesh(false)] };
    models.set(species, model);
    return model;
  };
  return {
    reset() {
      for (const saved of hidden) {
        saved.mesh.setMatrixAt(saved.index, saved.matrix);
        saved.mesh.instanceMatrix.needsUpdate = true;
      }
      hidden = [];
      for (const model of models.values())
        for (const mesh of model.meshes) {
          mesh.visible = false;
          mesh.count = 0;
        }
    },
    update(
      camera: THREE.PerspectiveCamera,
      viewportHeight: number,
      sites: readonly ForestTreeSite[],
      budget: Budget,
      simplify = true
    ) {
      const stats = {
        trees: 0,
        triangles: 0,
        calls: 0,
        shadowTriangles: 0,
        species: [] as TreeSpecies[],
        shadowKey: ""
      };
      if (disposed) return stats;
      if (!simplify && sites.length > capacity) {
        capacity = sites.length;
        for (const model of models.values()) {
          model.meshes = model.meshes.map(old => {
            const mesh = new THREE.InstancedMesh(old.geometry, old.material, capacity);
            mesh.name = old.name;
            mesh.userData = { ...old.userData };
            mesh.castShadow = old.castShadow;
            mesh.receiveShadow = true;
            mesh.count = 0;
            mesh.visible = false;
            old.removeFromParent();
            old.dispose();
            group.add(mesh);
            return mesh;
          }) as Model["meshes"];
        }
      }
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const scale = (viewportHeight * camera.zoom) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const point = new THREE.Vector3();
      const candidates = sites
        .map(site => {
          const matrix = new THREE.Matrix4();
          site.mesh.getMatrixAt(site.index, matrix);
          point.set(matrix.elements[12], matrix.elements[13] + 7 * site.size, matrix.elements[14]);
          const projected = point.clone().project(camera);
          const margin = selected.has(site.id) ? 1.05 : 0.9;
          const onScreen =
            Math.abs(projected.x) <= margin && Math.abs(projected.y) <= margin && projected.z >= -1 && projected.z <= 1;
          const distance = camera.position.distanceTo(point);
          return {
            site,
            matrix,
            distance,
            onScreen,
            rank: distance * (selected.has(site.id) ? 0.9 : 1) * (1 + 0.15 * (projected.x ** 2 + projected.y ** 2)),
            visible: frustum.intersectsSphere(new THREE.Sphere(point.clone(), Math.hypot(site.radius, 5 * site.size)))
          };
        })
        .filter(
          ({ site, distance, visible }) =>
            visible &&
            (!simplify ||
              (10 * site.size * scale) / Math.max(1, distance) >=
                (selected.has(site.id) ? FOREST_TREE_DETAIL_LIMIT.exitPixels : FOREST_TREE_DETAIL_LIMIT.enterPixels))
        )
        .sort(
          (a, b) => Number(b.onScreen) - Number(a.onScreen) || a.rank - b.rank || a.site.id.localeCompare(b.site.id)
        );
      const next = new Set<string>(),
        usedSpecies = new Set<TreeSpecies>(),
        shadows: string[] = [];
      for (const { site, matrix } of candidates) {
        if (simplify && stats.trees >= FOREST_TREE_DETAIL_LIMIT.trees) break;
        const model = getModel(site.species, simplify);
        if (!model || stats.triangles + model.triangles > budget.triangles) continue;
        const shadow = stats.shadowTriangles + model.triangles <= budget.shadowTriangles;
        const mesh = model.meshes[shadow ? 0 : 1];
        if (!mesh.count && stats.calls >= budget.calls) continue;
        if (!mesh.count) {
          mesh.visible = true;
          stats.calls++;
        }
        mesh.setMatrixAt(mesh.count++, matrix);
        mesh.instanceMatrix.needsUpdate = true;
        const zero = matrix.clone().scale(new THREE.Vector3(0, 0, 0));
        site.mesh.setMatrixAt(site.index, zero);
        site.mesh.instanceMatrix.needsUpdate = true;
        hidden.push({ mesh: site.mesh, index: site.index, matrix });
        next.add(site.id);
        usedSpecies.add(site.species);
        stats.trees++;
        stats.triangles += model.triangles;
        if (shadow) {
          stats.shadowTriangles += model.triangles;
          shadows.push(site.id);
        }
      }
      selected = next;
      for (const model of models.values())
        for (const mesh of model.meshes)
          if (mesh.count) {
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
          }
      // Keep detailed instances after base layers so tooling sees their original transforms, rather than masks.
      group.removeFromParent();
      parent.add(group);
      stats.species = [...usedSpecies];
      stats.shadowKey = shadows.join("|");
      return stats;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hidden = [];
      for (const model of models.values()) {
        for (const mesh of model.meshes) mesh.dispose();
        model.lease.release();
      }
      models.clear();
      selected.clear();
      group.removeFromParent();
      group.clear();
    }
  };
}
