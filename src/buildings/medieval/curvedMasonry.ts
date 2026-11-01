import * as THREE from "three";
import { HouseDetailKit } from "./houseDetailKit";
import type { ModelKit, Surface } from "./modelKit";
import { addParishMasonryWall } from "./parishChurchDetails";

type Vertex = { p: THREE.Vector3; n: THREE.Vector3 };
function clip(vertices: Vertex[], x: number, less: boolean) {
  const result: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const inside = (v: Vertex) => (less ? v.p.x <= x : v.p.x >= x);
    if (inside(a)) result.push(a);
    if (inside(a) !== inside(b)) {
      const t = (x - a.p.x) / (b.p.x - a.p.x);
      result.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t) });
    }
  }
  return result;
}

/** Subdivide before bending so aperture edges and wall silhouettes follow the same cylinder. */
function bend(geometry: THREE.BufferGeometry, radius: number, angle: number) {
  const position = geometry.getAttribute("position"),
    normal = geometry.getAttribute("normal"),
    positions: number[] = [],
    normals: number[] = [];
  const append = (v: Vertex) => {
    const t = angle + v.p.x / radius,
      r = radius + v.p.z,
      s = Math.sin(t),
      c = Math.cos(t);
    positions.push(r * s, v.p.y, r * c);
    const n = new THREE.Vector3(
      ((v.n.x * radius) / r) * c + v.n.z * s,
      v.n.y,
      ((-v.n.x * radius) / r) * s + v.n.z * c
    ).normalize();
    normals.push(...n.toArray());
  };
  for (let i = 0; i < position.count; i += 3) {
    const triangle = [0, 1, 2].map(j => ({
      p: new THREE.Vector3().fromBufferAttribute(position, i + j),
      n: new THREE.Vector3().fromBufferAttribute(normal, i + j)
    }));
    const lo = Math.min(...triangle.map(v => v.p.x)),
      hi = Math.max(...triangle.map(v => v.p.x)),
      step = 0.18;
    for (let x = Math.floor(lo / step) * step; x <= hi; x += step) {
      const polygon = clip(clip(triangle, x, false), x + step, true);
      for (let j = 1; j < polygon.length - 1; j++) {
        const a = polygon[0],
          b = polygon[j],
          c = polygon[j + 1];
        if (b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).lengthSq() < 1e-16) continue;
        append(a);
        append(b);
        append(c);
      }
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return result;
}

/** Reuse the same masonry, apertures, glazing and joints on a circular bay. */
export function addCurvedMasonryBay(
  k: ModelKit,
  radius: number,
  angle: number,
  span: number,
  top: number,
  openings: Parameters<typeof addParishMasonryWall>[6],
  base = 0
) {
  const kit = new HouseDetailKit("flat-masonry-bay");
  addParishMasonryWall(kit, 0, 0, radius * span, top, 0, openings, base);
  const source = kit.finish();
  const surfaces: Record<string, Surface> = {
    "arched-stone-wall": "stone",
    "masonry-bed-joint": "white",
    "staggered-stone-joint": "white",
    "dressed-arch-surround": "white",
    "recessed-lancet-glass": "water",
    "lancet-mullion": "white",
    "window-leaded-transom": "iron"
  };
  try {
    source.group.updateMatrixWorld(true);
    for (const mesh of source.pickables) {
      const surface = surfaces[mesh.name];
      if (!surface) throw new Error(`Unsupported curved masonry surface: ${mesh.name}`);
      const baked = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      try {
        baked.applyMatrix4(mesh.matrixWorld);
        k.add(`curved-${mesh.name}`, bend(baked, radius, angle), surface);
      } finally {
        baked.dispose();
      }
    }
  } finally {
    source.dispose();
  }
}
