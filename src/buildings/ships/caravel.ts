import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** An illustrative two-masted lateen-rigged caravel. */
export const CARAVEL = {
  author: "Codex GPT-6.1 Sol",
  name: "Caravel",
  length: 29,
  beam: 7.5,
  height: 21,
  draft: 1.8,
  note: "Idealized wooden caravel with two lateen-rigged masts, a low forecastle and raised aft deck. Dimensions are illustrative; interiors are omitted."
} as const;

// Bow faces +X; waterline is Y=0. Stations give X, half beam and deck height.
const STATIONS = [
  [-12, 1.8, 3.1],
  [-9, 3.1, 2.7],
  [-5, 3.75, 2.4],
  [3, 3.75, 2.4],
  [8, 2.7, 2.8],
  [12, 0.1, 3.7]
] as const;

export interface CaravelMeshes extends CityStructureMeshes {
  plan: string;
  elevation: string;
}

export function createCaravel(): CaravelMeshes {
  const group = new THREE.Group();
  group.name = "caravel";
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
    [x, 0.3, -beam],
    [x, -1, -beam * 0.65],
    [x, -1.8, -beam * 0.12],
    [x, -1.8, beam * 0.12],
    [x, -1, beam * 0.65],
    [x, 0.3, beam],
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
  for (const side of [-1, 1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const [x, b, y] = STATIONS[i],
        [nx, nb, ny] = STATIONS[i + 1];
      spar("gunwale", v(x, y + 0.2, side * b * 0.9), v(nx, ny + 0.2, side * nb * 0.9), 0.14, trim);
    }
  }
  box("aft-cabin", -8.5, 3.5, 0, 4.5, 1.8, 4.8, wood);
  box("aft-deck", -8.5, 4.46, 0, 4.8, 0.15, 5, deck);
  for (const side of [-1, 1]) {
    spar("aft-rail", v(-10.8, 5.1, side * 2.4), v(-6.2, 5.1, side * 2.4), 0.07, trim);
    for (const x of [-10.5, -9, -7.5, -6.3])
      spar("rail-post", v(x, 4.5, side * 2.4), v(x, 5.1, side * 2.4), 0.055, trim);
    for (const x of [-9.5, -7.5]) box("cabin-window", x, 3.6, side * 2.42, 0.5, 0.5, 0.05, dark);
  }
  box("cargo-hatch", 2, 2.6, 0, 2.5, 0.35, 2, trim);
  spar("bowsprit", v(9, 3.3), v(15.5, 5.8), 0.14);
  box("rudder-blade", -12.5, 0.1, 0, 0.6, 3.2, 0.2, underwater);
  spar("rudder-stock", v(-12.4, -1), v(-12.4, 3.6), 0.13);
  spar("tiller", v(-12.4, 3.6), v(-10, 3.6), 0.08);
  for (const mast of [
    { x: 2.5, top: 20.5, foot: 4, reach: 9 },
    { x: -6, top: 16, foot: 5.3, reach: 6 }
  ]) {
    spar("mast", v(mast.x, 2.4), v(mast.x, mast.top), 0.18);
    const a = v(mast.x - mast.reach * 0.55, mast.top - 0.4);
    const b = v(mast.x + mast.reach * 0.6, mast.foot + 1);
    const c = v(mast.x - mast.reach * 0.75, mast.foot, 0.7);
    spar("lateen-yard", a, b, 0.09);
    const center = a.clone().add(b).add(c).divideScalar(3);
    center.z += 0.8;
    surface(
      "lateen-sail",
      [...a.toArray(), ...b.toArray(), ...c.toArray(), ...center.toArray()],
      [0, 1, 3, 1, 2, 3, 2, 0, 3],
      canvas
    );
    line(a, c);
    line(b, c);
    line(c, v(mast.x - 2, 3, 2));
    for (const side of [-1, 1]) {
      for (const dx of [-1.5, 0]) line(v(mast.x, mast.top * 0.8), v(mast.x + dx, 3, side * 2.8));
    }
  }
  line(v(2.5, 20), v(15.5, 5.8));
  line(v(-6, 15.8), v(-11, 4.5));
  const rigging = new THREE.BufferGeometry();
  rigging.setAttribute("position", new THREE.Float32BufferAttribute(ropes, 3));
  geometries.add(rigging);
  group.add(new THREE.LineSegments(rigging, rope));
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
