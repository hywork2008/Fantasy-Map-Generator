import * as THREE from "three";
import type { ModelKit, Surface } from "./modelKit";

type Point = [number, number, number];
interface RoofCut {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Remove a vertical rectangular opening from kit-owned roof parts, retaining the outer fragments. */
export function cutRoofRectangle(
  k: ModelKit,
  parts: readonly THREE.Mesh[],
  rect: RoofCut,
  surface: (mesh: THREE.Mesh) => Surface = () => "tile"
) {
  const clip = (polygon: Point[], axis: 0 | 2, limit: number, keepLess: boolean): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const inside = (p: Point) => (keepLess ? p[axis] <= limit : p[axis] >= limit);
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const t = (limit - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
      }
    }
    return out;
  };
  k.group.updateMatrixWorld(true);
  for (const mesh of parts) {
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (bounds.max.x < rect.minX || bounds.min.x > rect.maxX || bounds.max.z < rect.minZ || bounds.min.z > rect.maxZ)
      continue;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const source = geometry.getAttribute("position"),
      positions: number[] = [];
    for (let i = 0; i < source.count; i += 3) {
      const triangle: Point[] = [0, 1, 2].map(j => [source.getX(i + j), source.getY(i + j), source.getZ(i + j)]);
      const middle = clip(clip(triangle, 0, rect.minX, false), 0, rect.maxX, true);
      for (const polygon of [
        clip(triangle, 0, rect.minX, true),
        clip(triangle, 0, rect.maxX, false),
        clip(middle, 2, rect.minZ, true),
        clip(middle, 2, rect.maxZ, false)
      ])
        for (let j = 1; j < polygon.length - 1; j++) positions.push(...polygon[0], ...polygon[j], ...polygon[j + 1]);
    }
    geometry.dispose();
    k.group.remove(mesh);
    k.pickables.splice(k.pickables.indexOf(mesh), 1);
    if (positions.length) {
      const cut = new THREE.BufferGeometry();
      cut.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      cut.computeVertexNormals();
      k.add(mesh.name, cut, surface(mesh));
    }
  }
}
