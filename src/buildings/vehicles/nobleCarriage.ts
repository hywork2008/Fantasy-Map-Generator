import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";
import { createMedievalWagonModel } from "./medievalWagon";

/** Imagined covered traveling wagon for a late-medieval noble household; meters, front at +X. */
export const NOBLE_CARRIAGE = {
  author: "Codex GPT-6.1 Sol",
  name: "Medieval European noble carriage",
  length: 6.4,
  width: 2.6,
  height: 3.5,
  note: "Imagined late-medieval noble's covered traveling wagon, with a painted timber body, textile barrel canopy, tied curtains, facing cushioned benches and gilded heraldic decoration. Open windows have no glass. The timber undercarriage has no modern coach springs. Shown parked with straight front wheels and twin shafts; no draft animals or harness. Illustrative dimensions, not a reconstruction of a particular historical carriage."
} as const;

export interface NobleCarriageMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createNobleCarriageModel(): CityStructureMeshes {
  const base = createMedievalWagonModel();
  const { group, pickables } = base;
  group.name = "medieval-european-noble-carriage";
  // Retain the existing wagon's running gear while replacing its freight body.
  const freightParts = /^(side-plank|side-top-rail|side-stake|stake-strap|strap-rivet|end-plank|end-iron-strap)$/;
  for (let i = pickables.length - 1; i >= 0; i--) {
    const mesh = pickables[i];
    if (freightParts.test(mesh.name)) {
      group.remove(mesh);
      pickables.splice(i, 1);
    } else if (/^(driver-|bench-support|footboard-brace)/.test(mesh.name)) {
      mesh.position.x += 0.85;
    }
  }
  const geometries = new Set<THREE.BufferGeometry>();
  const paintedWood = new THREE.MeshLambertMaterial({ color: 0x263f62 });
  const walnut = new THREE.MeshLambertMaterial({ color: 0x563b2a });
  const gold = new THREE.MeshLambertMaterial({ color: 0xc6a052 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x762c3e, side: THREE.DoubleSide });
  const cushion = new THREE.MeshLambertMaterial({ color: 0x963f51 });
  const lining = new THREE.MeshLambertMaterial({ color: 0xd1b78b, side: THREE.DoubleSide });
  const materials = [paintedWood, walnut, gold, cloth, cushion, lining];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = walnut) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  const canopyPoint = (x: number, t: number, inset = 0) =>
    new THREE.Vector3(x, 2.67 + (0.66 - inset) * Math.sin(t), (0.96 - inset) * Math.cos(t));
  // Extend the chassis beneath the relocated driver's bench and footboard.
  box("driver-platform", 1.4, 1.14, 0, 1.35, 0.08, 1.35);
  for (const side of [-1, 1]) box("driver-platform-bearer", 1.35, 1.03, side * 0.53, 1.6, 0.16, 0.13);
  // Separate outer cloth and lining retain a visible hollow passenger compartment.
  function canopy(inset: number) {
    const positions: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = canopyPoint(-2.22, (i * Math.PI) / 24, inset);
      const b = canopyPoint(0.94, (i * Math.PI) / 24, inset);
      const c = canopyPoint(0.94, ((i + 1) * Math.PI) / 24, inset);
      const d = canopyPoint(-2.22, ((i + 1) * Math.PI) / 24, inset);
      for (const p of [a, b, c, a, c, d]) positions.push(p.x, p.y, p.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  add("textile-canopy", canopy(0), cloth);
  add("canopy-lining", canopy(0.025), lining);
  for (const x of [-2.16, -1.35, -0.5, 0.35, 0.88]) {
    const points = Array.from({ length: 25 }, (_, i) => canopyPoint(x, (i * Math.PI) / 24, 0.04));
    add("canopy-rib", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.025, 6, false), walnut);
  }
  for (const side of [-1, 1]) {
    const z = side * 0.82;
    box("painted-side-panel", -0.63, 1.5, z, 3.1, 0.64, 0.09, paintedWood);
    for (const y of [1.22, 1.79, 2.66]) box("gilded-side-molding", -0.63, y, side * 0.88, 3.2, 0.055, 0.07, gold);
    for (const x of [-2.13, -1.21, -0.02, 0.87]) {
      box("window-post", x, 2.21, z, 0.075, 0.96, 0.11);
      box("post-capital", x, 2.59, z, 0.13, 0.09, 0.15, gold);
    }
    // Gathered curtains leave genuine openings; narrow folds catch the light.
    for (const x of [-2.02, -1.32, 0.09, 0.76]) {
      for (let fold = 0; fold < 4; fold++) {
        box(
          "gathered-curtain",
          x + (fold - 1.5) * 0.028,
          2.23,
          side * (0.85 + (fold % 2) * 0.025),
          0.032,
          0.81,
          0.045,
          cloth
        );
      }
      box("curtain-tie", x, 2.17, side * 0.9, 0.14, 0.035, 0.04, gold);
    }
    // A closed low door below the central opening and two boarding steps.
    for (const x of [-0.98, -0.25]) box("door-stile", x, 1.49, side * 0.89, 0.035, 0.55, 0.035, gold);
    for (const y of [1.31, 1.64]) box("door-hinge", -0.98, y, side * 0.92, 0.12, 0.055, 0.03, gold);
    box("door-latch", -0.33, 1.71, side * 0.94, 0.12, 0.025, 0.035, gold);
    for (const [y, stepZ] of [
      [0.51, 1.08],
      [0.83, 0.98]
    ]) {
      box("boarding-step", -0.58, y, side * stepZ, 0.54, 0.07, 0.31);
      box("step-edge", -0.58, y + 0.025, side * (stepZ + 0.15), 0.54, 0.035, 0.025, gold);
    }
    for (const x of [-0.8, -0.36]) box("step-hanger", x, 0.83, side * 0.99, 0.045, 0.7, 0.055);
    for (let i = 0; i < 20; i++) {
      box("canopy-fringe", -2.14 + i * 0.159, 2.6, side * 0.96, 0.08, 0.13, 0.025, gold);
    }
    // A fictional plain shield and raised lozenge avoid borrowing a real family's arms.
    const shield = new THREE.Shape();
    shield.moveTo(-0.16, 0.16);
    shield.lineTo(0.16, 0.16);
    shield.lineTo(0.14, -0.04);
    shield.lineTo(0, -0.19);
    shield.lineTo(-0.14, -0.04);
    shield.closePath();
    const badge = add(
      "heraldic-shield",
      new THREE.ExtrudeGeometry(shield, { depth: 0.022, bevelEnabled: false }),
      gold
    );
    badge.position.set(-0.63, 1.49, side * 0.89);
    if (side < 0) badge.rotation.y = Math.PI;
    const lozenge = box("heraldic-lozenge", -0.63, 1.5, side * 0.923, 0.1, 0.13, 0.02, cloth);
    lozenge.rotation.z = Math.PI / 4;
  }
  for (const x of [-2.15, 0.89]) {
    box("painted-end-panel", x, 1.6, 0, 0.09, 0.86, 1.68, paintedWood);
    box("end-top-rail", x, 2.66, 0, 0.11, 0.075, 1.78, gold);
    // End drapes close the upper bay, while the side openings reveal the seats.
    for (let fold = 0; fold < 16; fold++)
      box("end-drape", x, 2.35, -0.75 + fold * 0.1, 0.045 + (fold % 2) * 0.035, 0.57, 0.105, cloth);
  }
  for (const x of [-1.7, 0.42]) {
    box("passenger-bench-base", x, 1.37, 0, 0.57, 0.38, 1.44);
    box("passenger-seat-cushion", x, 1.61, 0, 0.62, 0.13, 1.44, cushion);
    const backX = x + (x < 0 ? -0.28 : 0.28);
    box("passenger-backrest", backX, 1.93, 0, 0.13, 0.62, 1.44, cushion);
    for (const z of [-0.69, 0.69]) box("passenger-armrest", x, 1.87, z, 0.63, 0.07, 0.075, gold);
  }
  return {
    group,
    pickables,
    dispose() {
      base.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createNobleCarriage(): NobleCarriageMeshes {
  const model = createNobleCarriageModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
