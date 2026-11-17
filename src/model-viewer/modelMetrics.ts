import type * as THREE from "three";

export interface ModelMetrics {
  meshes: number;
  triangles: number;
  vertices: number;
  geometries: number;
  materials: number;
}

/** Resident model complexity; shared buffers count once, triangles count per instance. */
export function collectModelMetrics(root: THREE.Object3D): ModelMetrics {
  let meshes = 0;
  let triangles = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const geometry = mesh.geometry;
    geometries.add(geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    const count = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
    const start = geometry.drawRange.start;
    const drawn = Math.max(0, Math.min(count - start, geometry.drawRange.count));
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    triangles += Math.floor(drawn / 3) * instances;
  });
  let vertices = 0;
  for (const geometry of geometries) vertices += geometry.getAttribute("position")?.count ?? 0;
  return { meshes, triangles, vertices, geometries: geometries.size, materials: materials.size };
}

export type ModelQuality = "low" | "high";
export interface MetricsRequest {
  modulePath: string;
  quality: ModelQuality;
}
export type MetricsResponse = { metrics: ModelMetrics } | { error: string };
