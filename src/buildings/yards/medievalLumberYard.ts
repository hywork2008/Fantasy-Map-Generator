import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

export const MEDIEVAL_LUMBER_YARD = {
  author: "Codex GPT-6.1 Sol",
  name: "Medieval European lumber yard",
  width: 18,
  depth: 14,
  height: 5.3,
  note: "Imagined medieval European timber yard with bark-covered logs, sticker-separated boards, hewn beams, an open timber drying shed, trestles and hand tools. Illustrative dimensions; not a reconstruction of a specific historical site."
} as const;

/** Meter-scale reusable assembly; positive Z faces the open loading entrance. */
export function createMedievalLumberYardModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-lumber-yard";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const palette = [
    0xa88150, 0xb69260, 0x987044, 0xc09b69, 0x785538, 0x514332, 0x404341, 0x8e7d60, 0x89714e, 0x917957, 0x957d59,
    0x8e7451
  ];
  const materials = palette.map(color => new THREE.MeshLambertMaterial({ color }));
  const [oak, , , endGrain, frame, bark, iron, earth] = materials;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const disk = new THREE.CylinderGeometry(1, 1, 1, 16);
  const grainRing = new THREE.TorusGeometry(1, 0.018, 3, 16);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = frame) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = frame) {
    const mesh = add(name, cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), width);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  function log(x: number, y: number, z: number, length: number, radius: number) {
    const mesh = add("bark-log", cylinder, bark);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, length, radius);
    for (const side of [-1, 1]) {
      const end = add("log-cut-end", disk, endGrain);
      end.rotation.z = Math.PI / 2;
      end.position.set(x + side * (length / 2 + 0.006), y, z);
      end.scale.set(radius * 0.92, 0.012, radius * 0.92);
      for (const fraction of [0.35, 0.66]) {
        const ring = add("log-growth-ring", grainRing, oak);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(x + side * (length / 2 + 0.014), y, z);
        ring.scale.setScalar(radius * fraction);
      }
    }
  }

  box("yard-earth", 0, 0.04, 0, 18, 0.08, 14, earth);
  // The front remains open for loading; low rails define the other three sides.
  for (const x of [-8.55, 8.55]) {
    for (const z of [-6.5, -3.3, 0, 3.3, 6.5]) box("fence-post", x, 0.78, z, 0.19, 1.4, 0.19);
    for (const y of [0.56, 1.12]) box("fence-rail", x, y, 0, 0.1, 0.13, 13.15);
  }
  for (const x of [-8.55, -4.3, 0, 4.3, 8.55]) box("fence-post", x, 0.78, -6.5, 0.19, 1.4, 0.19);
  for (const y of [0.56, 1.12]) box("fence-rail", 0, y, -6.5, 17.1, 0.13, 0.1);

  // Three braced bays, with an open front and a ventilated rear plank screen.
  for (const x of [-6.8, -2.3, 2.3, 6.8]) {
    for (const z of [-5.7, -1.9]) {
      box("post-stone", x, 0.23, z, 0.46, 0.3, 0.46, earth);
      box("shed-post", x, 1.98, z, 0.24, 3.2, 0.24);
      for (const direction of [-1, 1]) {
        if (Math.abs(x + direction * 0.8) < 7) beam("knee-brace", v(x, 2.65, z), v(x + direction * 0.8, 3.48, z), 0.13);
      }
    }
    beam("tie-beam", v(x, 3.52, -5.85), v(x, 3.52, -1.75), 0.22);
    beam("king-post", v(x, 3.52, -3.8), v(x, 4.95, -3.8), 0.15);
    for (const z of [-6.15, -1.45]) beam("rafter", v(x, 4.95, -3.8), v(x, 3.4, z), 0.16);
  }
  for (const z of [-5.7, -1.9]) box("wall-plate", 0, 3.53, z, 14.05, 0.23, 0.24);
  box("ridge-beam", 0, 4.95, -3.8, 14.3, 0.18, 0.18);
  for (let i = 0; i < 44; i++)
    box("rear-screen-board", -6.85 + i * 0.318, 1.72, -5.81, 0.26, 2.9, 0.065, materials[i % 4]);
  // Individual overlapping wooden roof boards make the roof legible without textures.
  const slope = Math.atan2(1.55, 2.35);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row++) {
      const run = 0.24 + row * 0.48;
      for (let col = 0; col < 30; col++) {
        const board = box(
          "roof-board",
          -7.1 + col * 0.49,
          5.03 - (run * 1.55) / 2.35 + (4 - row) * 0.012,
          -3.8 + side * run,
          0.478,
          0.055,
          0.68,
          materials[8 + ((col * 13 + row * 7 + col * row) % 4)]
        );
        board.rotation.x = side * slope;
      }
    }
  }

  // Sleeper-supported roundwood in a stable triangular pile, clear of the central aisle.
  for (const x of [-5.9, -2.4]) box("log-sleeper", x, 0.2, 3.0, 0.25, 0.24, 3.6);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5 - row; col++) {
      log(-4.15 + (col % 2) * 0.08, 0.65 + row * 0.56, 1.65 + row * 0.33 + col * 0.66, 5.7 - (col % 3) * 0.18, 0.325);
    }
  }
  for (const z of [1.35, 4.65]) {
    for (const x of [-5.9, -2.4]) box("log-retaining-stake", x, 0.66, z, 0.12, 0.9, 0.12);
  }
  function boardStack(cx: number, cz: number, rows: number, length: number) {
    for (const x of [cx - length * 0.36, cx + length * 0.36]) box("timber-sleeper", x, 0.2, cz, 0.25, 0.24, 2.25);
    for (let row = 0; row < rows; row++) {
      const y = 0.38 + row * 0.23;
      for (let col = 0; col < 5; col++)
        box("stacked-board", cx, y, cz - 0.84 + col * 0.42, length, 0.15, 0.37, materials[(row + col) % 4]);
      for (const x of [cx - length * 0.36, cx, cx + length * 0.36])
        box("drying-sticker", x, y + 0.115, cz, 0.075, 0.08, 2.15);
    }
  }
  boardStack(4.5, 3.5, 6, 4.8);
  boardStack(-4.5, -3.85, 7, 3.6);
  boardStack(0, -3.85, 5, 3.5);
  for (const x of [3.3, 5.7]) box("beam-sleeper", x, 0.2, -3.85, 0.25, 0.24, 2.1);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++)
      box("hewn-beam", 4.5, 0.49 + row * 0.34, -4.6 + col * 0.48, 3.65, 0.34, 0.36, materials[(row + col) % 4]);
  }
  // A hand-work area sits beside the unobstructed entrance at positive Z.
  for (const x of [1.35, 3.55]) {
    for (const z of [-0.5, 0.5]) beam("trestle-leg", v(x, 0.08, z), v(x, 1.14, 0), 0.12);
    box("trestle-top", x, 1.12, 0, 0.22, 0.16, 1.25);
    box("trestle-stretcher", x, 0.45, 0, 0.12, 0.1, 0.8);
  }
  box("workpiece", 2.45, 1.29, 0, 3.0, 0.18, 0.42, oak);
  for (const x of [1.8, 2.9]) box("frame-saw-upright", x, 1.68, 0.12, 0.065, 0.72, 0.065);
  box("frame-saw-stretcher", 2.35, 1.78, 0.12, 1.16, 0.06, 0.06);
  box("frame-saw-blade", 2.35, 1.38, 0.12, 1.1, 0.055, 0.014, iron);
  box("frame-saw-tension-cord", 2.35, 1.99, 0.12, 1.1, 0.018, 0.018, endGrain);
  const stump = add("chopping-block", cylinder, bark);
  stump.position.set(6.8, 0.43, 0.2);
  stump.scale.set(0.45, 0.7, 0.45);
  const stumpTop = add("chopping-block-end", disk, endGrain);
  stumpTop.position.set(6.8, 0.785, 0.2);
  stumpTop.scale.set(0.42, 0.02, 0.42);
  beam("axe-handle", v(6.8, 0.9, 0.2), v(7.32, 1.65, 0.2), 0.045, oak);
  const axe = box("axe-head", 6.79, 0.94, 0.2, 0.3, 0.2, 0.055, iron);
  axe.rotation.z = -0.55;
  for (let i = 0; i < 7; i++) {
    const offcut = box(
      "timber-offcut",
      5.9 + (i % 3) * 0.35,
      0.17 + Math.floor(i / 3) * 0.13,
      -0.9,
      0.55,
      0.13,
      0.22,
      materials[i % 4]
    );
    offcut.rotation.y = i * 0.7;
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

export function createMedievalLumberYard(): CityStructureMeshes & { elevation: string; plan: string } {
  const model = createMedievalLumberYardModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
