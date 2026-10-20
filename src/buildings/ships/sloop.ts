import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** An illustrative small gaff-rigged sloop, not a reconstruction of a named vessel. */
export const SLOOP = {
  name: "Sloop",
  length: 15,
  beam: 4.4,
  height: 14,
  draft: 1.7,
  note: "Idealized small wooden coastal sailing vessel with one mast, a gaff mainsail and a jib. Overall length includes the bowsprit. Dimensions are illustrative; interiors are omitted."
} as const;

// Bow faces +X; waterline is Y=0. Stations give X, half beam and deck height.
const STATIONS = [
  [-5.8, 1.05, 1.75],
  [-4.5, 1.7, 1.5],
  [-2, 2.1, 1.3],
  [1, 2.05, 1.3],
  [3.5, 1.5, 1.5],
  [5.3, 0.65, 1.9],
  [6, 0.05, 2.2]
] as const;

export interface SloopMeshes extends CityStructureMeshes {
  plan: string;
  elevation: string;
}

export function createSloop(): SloopMeshes {
  const group = new THREE.Group();
  group.name = "sloop";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = new THREE.MeshLambertMaterial({ color: 0x805334 });
  const underwater = new THREE.MeshLambertMaterial({ color: 0x352b25 });
  const deck = new THREE.MeshLambertMaterial({ color: 0xc6a575 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x304f50 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x292b29 });
  const canvas = new THREE.MeshLambertMaterial({ color: 0xf1e5ca, side: THREE.DoubleSide });
  const rope = new THREE.LineBasicMaterial({ color: 0x5b5040 });
  const materials = [wood, underwater, deck, trim, dark, canvas, rope];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = wood) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function spar(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = wood) {
    const mesh = add(name, cylinder, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1), b.clone().sub(a).normalize());
    return mesh;
  }
  function surface(name: string, points: number[], indices: number[], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  const ropes: number[] = [];
  function line(a: THREE.Vector3, b: THREE.Vector3) {
    ropes.push(...a.toArray(), ...b.toArray());
  }
  const rings = STATIONS.map(([x, beam, sheer]) => [
    [x, sheer, -beam * 0.9],
    [x, 0.25, -beam],
    [x, -0.8, -beam * 0.65],
    [x, -1.25, -beam * 0.12],
    [x, -1.25, beam * 0.12],
    [x, -0.8, beam * 0.65],
    [x, 0.25, beam],
    [x, sheer, beam * 0.9]
  ]);
  const upper: number[] = [],
    lower: number[] = [],
    deckIndices: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < 7; j++) {
      const a = i * 8 + j,
        b = a + 8;
      (j === 0 || j === 6 ? upper : lower).push(a, b, a + 1, b, b + 1, a + 1);
    }
    const a = i * 2;
    deckIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  surface("hull-topsides", rings.flat(2), upper, wood);
  surface("hull-underwater", rings.flat(2), lower, underwater);
  surface("transom", rings[0].flat(), [0, 1, 7, 1, 6, 7, 1, 2, 6, 2, 5, 6, 2, 3, 5, 3, 4, 5], trim);
  surface("stem", rings.at(-1)!.flat(), [0, 7, 1, 1, 7, 6, 1, 6, 2, 2, 6, 5, 2, 5, 3, 3, 5, 4], wood);
  surface(
    "main-deck",
    STATIONS.flatMap(([x, b, y]) => [x, y, -b * 0.9, x, y, b * 0.9]),
    deckIndices,
    deck
  );
  box("keel", 0, -1.45, 0, 7, 0.5, 0.2, underwater);
  box("rudder-blade", -6.15, -0.35, 0, 0.55, 2.4, 0.18, underwater);
  spar("rudder-stock", v(-6.1, -0.9), v(-6.1, 2.05), 0.09);
  spar("tiller", v(-6.1, 2.05), v(-4.2, 2.05), 0.07);
  for (const side of [-1, 1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const [x, b, y] = STATIONS[i],
        [nx, nb, ny] = STATIONS[i + 1];
      spar("gunwale", v(x, y + 0.16, side * b * 0.9), v(nx, ny + 0.16, side * nb * 0.9), 0.1, trim);
      spar("hull-wale", v(x, 0.3, side * b), v(nx, 0.3, side * nb), 0.06, deck);
    }
  }
  box("cabin", -1.9, 1.8, 0, 2.9, 1, 1.9, wood);
  box("cabin-roof", -1.9, 2.34, 0, 3.1, 0.16, 2.1, deck);
  for (const side of [-1, 1]) {
    for (const x of [-2.7, -1.3]) box("cabin-window", x, 1.98, side * 0.96, 0.42, 0.3, 0.04, dark);
    spar("mooring-cleat", v(3.5, 1.7, side * 0.8), v(4, 1.7, side * 0.8), 0.065);
  }
  box("companionway", -3.36, 1.77, 0, 0.06, 0.7, 0.65, dark);
  box("fore-hatch", 3.1, 1.6, 0, 1, 0.18, 0.95, trim);
  spar("mast", v(0.8, 1.3), v(0.8, 13.8), 0.14);
  spar("bowsprit", v(4, 1.8), v(8.4, 3.3), 0.11);
  spar("boom", v(0.7, 3.15), v(-5.3, 3.15, 0.55), 0.09);
  spar("gaff", v(0.7, 10.4), v(-3.7, 12.25, 0.4), 0.075);
  // Subdivided cloth keeps the sail edges attached to the spars while adding belly.
  function cloth(name: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
    const points: number[] = [],
      indices: number[] = [];
    const steps = 10;
    for (let row = 0; row <= steps; row++) {
      const t = row / steps;
      for (let col = 0; col <= steps; col++) {
        const u = col / steps;
        const p = a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), t);
        p.z += 0.65 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t);
        points.push(...p.toArray());
      }
    }
    for (let row = 0; row < steps; row++) {
      for (let col = 0; col < steps; col++) {
        const i = row * (steps + 1) + col;
        if (row > 0 || !a.equals(b)) indices.push(i, i + 1, i + steps + 1);
        indices.push(i + 1, i + steps + 2, i + steps + 1);
      }
    }
    surface(name, points, indices, canvas);
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a]
    ])
      line(start, end);
  }
  cloth("gaff-mainsail", v(0.65, 10.35), v(-3.65, 12.15, 0.4), v(-5.15, 3.25, 0.55), v(0.65, 3.25));
  // The repeated head collapses the upper edge into a triangular jib.
  cloth("jib", v(0.9, 12.8), v(0.9, 12.8), v(2.2, 3.1, 0.35), v(8.05, 3.25));
  line(v(0.8, 13.7), v(8.4, 3.3));
  line(v(8.4, 3.3), v(5.5, 0));
  line(v(0.8, 13.7), v(-5.5, 1.9));
  line(v(0.8, 13.5), v(-3.7, 12.25, 0.4));
  line(v(-5.2, 3.15, 0.55), v(-4.4, 1.65));
  for (const side of [-1, 1]) {
    for (const x of [-0.6, 0.2]) line(v(0.8, 10.5), v(x, 1.5, side * 1.8));
    line(v(2.2, 3.1, 0.35), v(-0.3, 1.6, side * 1.7));
  }
  const rigging = new THREE.BufferGeometry();
  rigging.setAttribute("position", new THREE.Float32BufferAttribute(ropes, 3));
  geometries.add(rigging);
  const lines = new THREE.LineSegments(rigging, rope);
  lines.name = "rigging";
  group.add(lines);
  const model = {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
  return { ...model, plan: meshProjection(model, "top"), elevation: meshProjection(model, "side") };
}
