import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Illustrative timber minecart on a short narrow-gauge display track. Units are meters. */
export const MINECART = {
  author: "Codex GPT-6.1 Sol",
  name: "Timber mining cart",
  length: 3,
  width: 1.4,
  height: 1.5,
  note: "Imagined hand-pushed mining cart with an open, outward-sloping plank body, iron straps, four flanged iron wheels, axle bearings and end handles. Shown empty on a short iron track with timber sleepers. Dimensions include the display track; this is a generic fantasy mining prop, not a dated historical reconstruction."
} as const;

export interface MinecartMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createMinecartModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "timber-minecart";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const woods = [0x88633e, 0x9b754a, 0x7d5938, 0xa17b4e].map(color => new THREE.MeshLambertMaterial({ color }));
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x503c2a });
  const iron = new THREE.MeshLambertMaterial({ color: 0x414443 });
  const wornIron = new THREE.MeshLambertMaterial({ color: 0x6a6b63 });
  const rust = new THREE.MeshLambertMaterial({ color: 0x6c4c35 });
  const materials = [...woods, darkWood, iron, wornIron, rust];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = woods[0]) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = iron, round = false) {
    const mesh = add(name, round ? cylinder : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(v(0, 1), b.clone().sub(a).normalize());
    mesh.scale.set(width, a.distanceTo(b), width);
    return mesh;
  }

  // Track head supports the wheel treads; the larger flanges run inside the rails.
  for (const x of [-1.3, -0.65, 0, 0.65, 1.3]) {
    box("track-sleeper", x, 0.04, 0, 0.16, 0.08, 1.4, darkWood);
    for (const side of [-1, 1]) {
      box("rail-chair", x, 0.09, side * 0.46, 0.14, 0.02, 0.15, rust);
      for (const dz of [-0.06, 0.06]) box("rail-spike", x, 0.106, side * 0.46 + dz, 0.025, 0.025, 0.025, iron);
    }
  }
  for (const side of [-1, 1]) {
    box("rail-foot", 0, 0.105, side * 0.46, 3, 0.03, 0.095, iron);
    box("rail-web", 0, 0.145, side * 0.46, 3, 0.05, 0.025, iron);
    box("rail-head", 0, 0.18, side * 0.46, 3, 0.02, 0.065, wornIron);
    box("chassis-runner", 0, 0.59, side * 0.29, 1.68, 0.16, 0.12, darkWood);
  }
  for (const x of [-0.55, 0.55]) {
    beam("axle", v(x, 0.4, -0.57), v(x, 0.4, 0.57), 0.055, iron, true);
    box("axle-bolster", x, 0.53, 0, 0.15, 0.12, 0.82, darkWood);
    for (const side of [-1, 1]) {
      beam("wheel-tread", v(x, 0.4, side * 0.425), v(x, 0.4, side * 0.505), 0.21, wornIron, true);
      beam("wheel-flange", v(x, 0.4, side * 0.397), v(x, 0.4, side * 0.418), 0.24, iron, true);
      beam("wheel-hub", v(x, 0.4, side * 0.5), v(x, 0.4, side * 0.565), 0.072, iron, true);
      box("axle-bearing", x, 0.455, side * 0.31, 0.13, 0.18, 0.12, iron);
      beam("axle-pin", v(x, 0.34, side * 0.575), v(x, 0.46, side * 0.575), 0.012, rust, true);
    }
  }
  for (let i = 0; i < 7; i++) box("floor-plank", 0, 0.71, -0.3 + i * 0.1, 1.48, 0.08, 0.097, woods[i % 4]);

  const slope = 0.22;
  const lean = Math.atan(slope);
  // Overlapping plank ends close the corners while leaving the top completely open.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const y = 0.82 + row * 0.16;
      const spread = (y - 0.75) * slope;
      const plank = box("side-plank", 0, y, side * (0.37 + spread), 1.57 + spread * 2, 0.158, 0.055, woods[row]);
      plank.rotation.x = side * lean;
      const end = box("end-plank", side * (0.77 + spread), y, 0, 0.055, 0.158, 0.76 + spread * 2, woods[(row + 1) % 4]);
      end.rotation.z = -side * lean;
    }
    const sidePoint = (x: number, y: number) => v(x, y, side * (0.41 + (y - 0.75) * slope));
    for (const x of [-0.62, 0.62]) {
      beam("side-iron-strap", sidePoint(x, 0.73), sidePoint(x, 1.43), 0.045);
      for (const y of [0.82, 1.13, 1.38]) {
        const p = sidePoint(x, y);
        beam("strap-rivet", p, p.clone().add(v(0, 0, side * 0.027)), 0.015, rust, true);
      }
    }
    const topSpread = (1.43 - 0.75) * slope;
    box("side-rim", 0, 1.43, side * (0.37 + topSpread), 1.68 + topSpread * 2, 0.055, 0.075, darkWood);
    box("end-rim", side * (0.77 + topSpread), 1.43, 0, 0.075, 0.055, 0.82 + topSpread * 2, darkWood);
    for (const z of [-0.23, 0.23]) {
      beam("end-iron-strap", v(side * 0.825, 0.75, z), v(side * 0.975, 1.43, z), 0.04);
      beam("handle-bracket", v(side * 0.9, 1.1, z), v(side * 1.08, 1.1, z), 0.025);
    }
    beam("push-handle", v(side * 1.08, 1.1, -0.25), v(side * 1.08, 1.1, 0.25), 0.032, darkWood, true);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createMinecart(): MinecartMeshes {
  const model = createMinecartModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
