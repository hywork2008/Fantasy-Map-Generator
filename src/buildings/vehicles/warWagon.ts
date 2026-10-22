import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Illustrative late-medieval European defensive wagon, in meters; front faces positive X. */
export const WAR_WAGON = {
  name: "Medieval European war wagon",
  length: 7.6,
  width: 2.8,
  height: 3.05,
  note: "Imagined late-medieval European war wagon inspired by wagon-fort defenses: high timber walls with firing apertures, iron straps, an open fighting compartment, rear boarding doors and four iron-bound spoked wheels. Shown parked with a straight front axle and a wooden drawbar. No draft animals, crew or weapons are included. Illustrative dimensions; not a reconstruction of a specific historical wagon."
} as const;

export interface WarWagonMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createWarWagonModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-war-wagon";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = [0x8c663f, 0x9b7448, 0x805b37, 0xa17c4e].map(color => new THREE.MeshLambertMaterial({ color }));
  const oak = wood[0];
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x513b29 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x363c3d });
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

  for (const z of [-0.6, 0.6]) box("chassis-rail", 0, 1.02, z, 4.65, 0.22, 0.2, darkWood);
  for (const x of [-2, -1, 0, 1, 2]) box("floor-crossmember", x, 1.15, 0, 0.16, 0.17, 1.96, darkWood);
  for (let i = 0; i < 11; i++) box("floor-plank", 0, 1.28, -0.85 + i * 0.17, 4.4, 0.1, 0.164, wood[i % wood.length]);

  // Openings are actual gaps in the plank geometry, rather than painted black rectangles.
  const ports = [-1.5, -0.5, 0.5, 1.5];
  for (const side of [-1, 1]) {
    const z = side * 0.98;
    for (let row = 0; row < 9; row++) {
      const y = 1.425 + row * 0.17;
      const segments: [number, number][] = [];
      if (row === 5 || row === 6) {
        let start = -2.2;
        for (const x of ports) {
          segments.push([start, x - 0.14]);
          start = x + 0.14;
        }
        segments.push([start, 2.2]);
      } else segments.push([-2.2, 2.2]);
      for (const [a, b] of segments)
        box("defensive-side-plank", (a + b) / 2, y, z, b - a, 0.166, 0.11, wood[row % wood.length]);
    }
    for (const x of ports) {
      box("firing-sill", x, 2.18, z, 0.4, 0.07, 0.19, darkWood);
      for (const edge of [-1, 1]) box("port-jamb", x + edge * 0.17, 2.36, z, 0.06, 0.37, 0.14, darkWood);
    }
    box("wall-top-rail", 0, 2.96, z, 4.6, 0.1, 0.16, darkWood);
    for (const x of [-2.12, -1, 0, 1, 2.12]) {
      box("wall-stake", x, 2.1, side * 0.895, 0.11, 1.65, 0.1, darkWood);
      box("wall-iron-strap", x, 2.1, side * 1.047, 0.07, 1.57, 0.025, iron);
      for (const y of [1.42, 1.94, 2.56, 2.83])
        beam("strap-rivet", v(x, y, side * 1.06), v(x, y, side * 1.085), 0.024, iron, true);
    }
  }
  for (let row = 0; row < 9; row++) {
    const y = 1.425 + row * 0.17;
    box("front-plank", 2.2, y, 0, 0.11, 0.166, 1.87, wood[(row + 1) % wood.length]);
    for (const side of [-1, 1])
      box("rear-door-plank", -2.2, y, side * 0.465, 0.11, 0.166, 0.91, wood[(row + 2) % wood.length]);
  }
  for (const x of [-2.2, 2.2]) box("end-top-rail", x, 2.96, 0, 0.16, 0.1, 2.04, darkWood);
  for (const side of [-1, 1]) {
    for (const y of [1.62, 2.67]) {
      box("door-hinge-strap", -2.272, y, side * 0.53, 0.03, 0.065, 0.7, iron);
      beam("door-hinge-pin", v(-2.29, y - 0.07, side * 0.89), v(-2.29, y + 0.07, side * 0.89), 0.04, iron, true);
    }
    beam("boarding-step-brace", v(-2, 1.1, side * 0.6), v(-2.65, 0.67, side * 0.6), 0.08, darkWood);
    box("front-wall-strap", 2.272, 2.1, side * 0.65, 0.03, 1.55, 0.07, iron);
  }
  box("rear-door-latch", -2.29, 2.12, 0, 0.04, 0.075, 0.38, iron);
  box("boarding-step", -2.61, 0.69, 0, 0.36, 0.1, 1.4);

  for (const [x, radius] of [
    [-1.55, 0.7],
    [1.55, 0.6]
  ]) {
    beam("axle", v(x, radius, -1.35), v(x, radius, 1.35), 0.12, darkWood, true);
    box("axle-bolster", x, radius + 0.16, 0, 0.3, 0.22, 2.1, darkWood);
    if (x > 0) {
      beam("steering-kingpin", v(x, radius, 0), v(x, 1.14, 0), 0.08, iron, true);
      box("front-bearing-block", x, 0.99, 0, 0.55, 0.18, 0.6, darkWood);
    }
    const felloe = ring(radius - 0.12, radius - 0.02, 0.16);
    const tire = ring(radius - 0.02, radius, 0.18);
    for (const side of [-1, 1]) {
      const z = side * 1.22;
      add("wheel-felloe", felloe, oak).position.set(x, radius, z);
      add("wheel-iron-tire", tire, iron).position.set(x, radius, z);
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        beam(
          "wheel-spoke",
          v(x, radius, z),
          v(x + (radius - 0.07) * Math.cos(angle), radius + (radius - 0.07) * Math.sin(angle), z),
          0.065
        );
      }
      beam("wheel-hub", v(x, radius, z - 0.14), v(x, radius, z + 0.14), 0.14, darkWood, true);
      beam("hub-iron-cap", v(x, radius, side * 1.34), v(x, radius, side * 1.38), 0.1, iron, true);
      beam("axle-linchpin", v(x, radius - 0.1, side * 1.37), v(x, radius + 0.1, side * 1.37), 0.025, iron, true);
    }
  }
  // A drawbar remains attached to the front running gear; no animals or harness are modeled.
  beam("drawbar", v(1.55, 0.83, 0), v(4.6, 0.91, 0), 0.13);
  for (const side of [-1, 1]) beam("drawbar-brace", v(1.5, 0.83, side * 0.65), v(2.65, 0.86, 0), 0.09, darkWood);
  box("drawbar-iron-binding", 3.9, 0.892, 0, 0.1, 0.15, 0.15, iron);
  box("drawbar-end-fitting", 4.56, 0.91, 0, 0.16, 0.15, 0.15, iron);

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createWarWagon(): WarWagonMeshes {
  const model = createWarWagonModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
