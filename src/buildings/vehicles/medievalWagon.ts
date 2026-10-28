import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Imagined medieval freight wagon, in meters; front faces positive X. */
export const MEDIEVAL_WAGON = {
  author: "Codex GPT-6.1 Sol",
  name: "Medieval European freight wagon",
  length: 6.4,
  width: 2.5,
  height: 2.2,
  note: "Imagined medieval European timber freight wagon with an empty plank bed, iron-bound spoked wheels, a front axle bolster, a driver's bench and twin wooden shafts. Shown parked with the front axle straight. No draft animals or harness are included. Illustrative dimensions; not a reconstruction of a specific historical wagon."
} as const;

export interface MedievalWagonMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

/** Reusable geometry without the BV projection cost. */
export function createMedievalWagonModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-wagon";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = [0x9b7447, 0x89613c, 0xaa8251, 0x956c40].map(color => new THREE.MeshLambertMaterial({ color }));
  const oak = wood[1];
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x59402c });
  const iron = new THREE.MeshLambertMaterial({ color: 0x393c3b });
  const materials = [...wood, darkWood, iron];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = oak) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = oak, round = false) {
    const mesh = add(name, round ? cylinder : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), width);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  function ring(inner: number, outer: number, depth: number) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  // Separate planks leave the load space open and make the floor readable from above.
  for (const z of [-0.53, 0.53]) box("chassis-rail", -0.55, 0.93, z, 3.3, 0.2, 0.16, darkWood);
  for (const x of [-1.85, -0.9, 0, 0.8]) box("floor-crossmember", x, 1.02, 0, 0.15, 0.15, 1.73, darkWood);
  for (let i = 0; i < 9; i++) box("floor-plank", -0.55, 1.13, -0.7 + i * 0.175, 3.15, 0.1, 0.168, wood[i % 4]);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      box("side-plank", -0.55, 1.28 + row * 0.18, side * 0.81, 3.2, 0.167, 0.065, wood[row]);
    }
    box("side-top-rail", -0.55, 1.98, side * 0.81, 3.34, 0.09, 0.11, darkWood);
    for (const x of [-2.08, -1.1, -0.1, 0.98]) {
      box("side-stake", x, 1.55, side * 0.875, 0.09, 1.05, 0.085, darkWood);
      for (const y of [1.2, 1.84]) {
        box("stake-strap", x, y, side * 0.927, 0.125, 0.06, 0.025, iron);
        beam("strap-rivet", v(x, y, side * 0.935), v(x, y, side * 0.957), 0.019, iron, true);
      }
    }
  }
  for (const x of [-2.1, 1]) {
    for (let row = 0; row < 4; row++)
      box("end-plank", x, 1.28 + row * 0.18, 0, 0.065, 0.167, 1.59, wood[(row + 1) % 4]);
    for (const z of [-0.6, 0.6]) box("end-iron-strap", x + (x < 0 ? -0.045 : 0.045), 1.56, z, 0.025, 0.77, 0.07, iron);
  }
  // Rear wheels are larger; the lower front wheels clear the body when turning.
  for (const [x, radius] of [
    [-1.55, 0.68],
    [0.6, 0.54]
  ]) {
    beam("axle", v(x, radius, -1.2), v(x, radius, 1.2), 0.095, darkWood, true);
    box("axle-bolster", x, radius + 0.13, 0, 0.25, 0.18, 1.83, darkWood);
    if (x > 0) {
      beam("steering-kingpin", v(x, radius, 0), v(x, 1.04, 0), 0.065, iron, true);
      box("front-bearing-block", x, 0.89, 0, 0.5, 0.16, 0.5, darkWood);
    }
    const felloe = ring(radius - 0.115, radius - 0.018, 0.14);
    const tire = ring(radius - 0.018, radius, 0.155);
    for (const side of [-1, 1]) {
      const z = side * 1.08;
      for (const [name, geometry, material] of [
        ["wheel-felloe", felloe, oak],
        ["wheel-iron-tire", tire, iron]
      ] as const)
        add(name, geometry, material).position.set(x, radius, z);
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        beam(
          "wheel-spoke",
          v(x, radius, z),
          v(x + Math.cos(angle) * (radius - 0.07), radius + Math.sin(angle) * (radius - 0.07), z),
          0.055,
          wood[i % 4]
        );
      }
      beam("wheel-hub", v(x, radius, z - 0.145), v(x, radius, z + 0.145), 0.115, oak, true);
      beam("hub-iron-cap", v(x, radius, side * 1.205), v(x, radius, side * 1.235), 0.085, iron, true);
      beam("axle-linchpin", v(x, radius - 0.1, side * 1.22), v(x, radius + 0.1, side * 1.22), 0.019, iron, true);
    }
  }
  // Shafts attach to the front running gear and leave room for a single draft animal.
  for (const side of [-1, 1]) {
    beam("draft-shaft", v(0.48, 0.72, side * 0.46), v(3.7, 0.88, side * 0.56), 0.085);
    box("shaft-iron-binding", 1.2, 0.756, side * 0.482, 0.12, 0.103, 0.103, iron);
    box("bench-support", 0.65, 1.58, side * 0.59, 0.12, 0.85, 0.13, darkWood);
  }
  for (let i = 0; i < 3; i++) box("driver-seat-plank", 0.48 + i * 0.15, 2.05, 0, 0.143, 0.09, 1.6, wood[i]);
  box("driver-footboard", 1.3, 1.16, 0, 0.43, 0.08, 1.38);
  for (const side of [-1, 1])
    beam("footboard-brace", v(0.85, 0.97, side * 0.57), v(1.46, 1.12, side * 0.57), 0.07, darkWood);

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createMedievalWagon(): MedievalWagonMeshes {
  const model = createMedievalWagonModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
