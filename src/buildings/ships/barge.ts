import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** An illustrative unpowered wooden river cargo barge. */
export const BARGE = {
  name: "River barge",
  length: 21,
  beam: 6.4,
  height: 3.6,
  draft: 0.7,
  note: "Idealized shallow-draft wooden river carrier with a flat bottom, rising ends, open cargo deck, stern shelter and towing post. Moved by towing or poling; no engine or sailing rig. Dimensions are illustrative; interiors are omitted."
} as const;

// Bow faces +X; waterline is Y=0. Stations give X, half beam, deck and bottom height.
const STATIONS = [
  [-9.5, 1.8, 1.15, -0.05],
  [-7, 2.8, 0.95, -0.6],
  [-5, 3, 0.9, -0.7],
  [5, 3, 0.9, -0.7],
  [7.5, 2.7, 1, -0.5],
  [9.5, 1.7, 1.2, 0.05]
] as const;

export interface BargeMeshes extends CityStructureMeshes {
  plan: string;
  elevation: string;
}

export function createBarge(): BargeMeshes {
  const group = new THREE.Group();
  group.name = "barge";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = new THREE.MeshLambertMaterial({ color: 0x795436 });
  const bottom = new THREE.MeshLambertMaterial({ color: 0x352e25 });
  const deck = new THREE.MeshLambertMaterial({ color: 0xb69667 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x4a5946 });
  const cargo = new THREE.MeshLambertMaterial({ color: 0xa87b45 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x383b37 });
  const canvas = new THREE.MeshLambertMaterial({ color: 0xd3c5a1, side: THREE.DoubleSide });
  const rope = new THREE.MeshLambertMaterial({ color: 0x9b875f });
  const materials = [wood, bottom, deck, trim, cargo, iron, canvas, rope];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
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
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
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
  const rings = STATIONS.map(([x, beam, top, base]) => [
    [x, top, -beam],
    [x, base, -beam * 0.92],
    [x, base, beam * 0.92],
    [x, top, beam]
  ]);
  const sides: number[] = [],
    floor: number[] = [],
    decks: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < 3; j++) {
      const a = i * 4 + j,
        b = a + 4;
      (j === 1 ? floor : sides).push(a, b, a + 1, b, b + 1, a + 1);
    }
    const a = i * 2;
    decks.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  surface("hull-sides", rings.flat(2), sides, wood);
  surface("flat-bottom", rings.flat(2), floor, bottom);
  surface("stern", rings[0].flat(), [0, 1, 3, 1, 2, 3], wood);
  surface("bow", rings.at(-1)!.flat(), [0, 3, 1, 1, 3, 2], wood);
  surface(
    "cargo-deck",
    STATIONS.flatMap(([x, b, y]) => [x, y, -b, x, y, b]),
    decks,
    deck
  );
  for (const side of [-1, 1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const [x, b, y] = STATIONS[i],
        [nx, nb, ny] = STATIONS[i + 1];
      spar("gunwale", v(x, y + 0.2, side * b), v(nx, ny + 0.2, side * nb), 0.12, trim);
      spar("rubbing-strake", v(x, y - 0.4, side * b * 0.98), v(nx, ny - 0.4, side * nb * 0.98), 0.09, bottom);
    }
    box("cargo-coaming", 0, 1.13, side * 2.1, 10.6, 0.4, 0.14, trim);
    for (const x of [-7.8, 7.8]) {
      spar("bollard", v(x, 1.05, side * 1.3), v(x, 1.65, side * 1.3), 0.13);
      spar("bollard-crossbar", v(x - 0.3, 1.5, side * 1.3), v(x + 0.3, 1.5, side * 1.3), 0.07);
    }
    spar("stowed-pole", v(-4.5, 1.25, side * 2.65), v(5, 1.25, side * 2.65), 0.055);
  }
  for (const x of [-5.25, 5.25]) box("cargo-coaming", x, 1.13, 0, 0.14, 0.4, 4.2, trim);
  // Crates carry edge battens and diagonal braces on both visible sides.
  function crate(x: number, base: number, z: number, w: number, h: number, d: number) {
    box("cargo-crate", x, base + h / 2, z, w, h, d, cargo);
    for (const side of [-1, 1]) {
      for (const dx of [-w / 2 + 0.07, w / 2 - 0.07]) {
        box("crate-batten", x + dx, base + h / 2, z + side * (d / 2 + 0.02), 0.1, h, 0.05);
      }
      spar(
        "crate-brace",
        v(x - w / 2 + 0.1, base + 0.1, z + side * (d / 2 + 0.05)),
        v(x + w / 2 - 0.1, base + h - 0.1, z + side * (d / 2 + 0.05)),
        0.035
      );
      box("crate-batten", x, base + h + 0.03, z + side * d * 0.35, w, 0.06, 0.1);
    }
  }
  for (const x of [-3.8, -2.1]) {
    for (const z of [-0.95, 0.95]) crate(x, 0.91, z, 1.5, 1.15, 1.65);
  }
  crate(-3, 2.12, 0, 1.5, 1, 1.65);
  const barrelGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.38, 0),
      new THREE.Vector2(0.46, 0.25),
      new THREE.Vector2(0.49, 0.6),
      new THREE.Vector2(0.46, 0.95),
      new THREE.Vector2(0.38, 1.2),
      new THREE.Vector2(0, 1.2)
    ],
    12
  );
  const hoopGeometry = new THREE.TorusGeometry(1, 0.045, 4, 12);
  for (const x of [0, 1.2]) {
    for (const z of [-1.25, 0, 1.25]) {
      add("cargo-barrel", barrelGeometry, cargo).position.set(x, 0.91, z);
      for (const y of [0.2, 0.6, 1]) {
        const hoop = add("barrel-hoop", hoopGeometry, iron);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(x, 0.91 + y, z);
        hoop.scale.setScalar(y === 0.6 ? 0.5 : 0.45);
      }
    }
  }
  for (let layer = 0; layer < 3; layer++) {
    for (const z of [-0.8, -0.4, 0, 0.4, 0.8]) box("timber-cargo", 3.5, 1.03 + layer * 0.25, z, 2.7, 0.23, 0.36, cargo);
  }
  for (const x of [2.5, 4.5]) box("cargo-lashing", x, 1.69, 0, 0.07, 0.04, 2, rope);
  // A low aft shelter leaves a clear steering position behind it.
  box("stern-shelter", -6.6, 1.9, 0, 2, 1.9, 2.5, trim);
  box("shelter-roof", -6.6, 2.91, 0, 2.3, 0.16, 2.8, canvas);
  box("shelter-door", -5.58, 1.7, 0, 0.05, 1.45, 0.75, bottom);
  for (const side of [-1, 1]) box("shelter-window", -6.6, 2.15, side * 1.26, 0.6, 0.45, 0.04, bottom);
  box("rudder-blade", -9.9, 0, 0, 0.8, 1.2, 0.16, bottom);
  spar("rudder-stock", v(-9.7, -0.4), v(-9.7, 1.7), 0.11);
  spar("tiller", v(-9.7, 1.7), v(-8, 1.7, 0.5), 0.08);
  spar("towing-post", v(6.4, 1), v(6.4, 3.35), 0.15);
  spar("towing-crossbar", v(6.4, 3.05, -0.6), v(6.4, 3.05, 0.6), 0.09);
  for (const side of [-1, 1]) spar("towing-brace", v(6.4, 2.8), v(5.7, 1.1, side * 0.8), 0.075);
  for (let i = 0; i < 4; i++) {
    const coil = add("mooring-rope", new THREE.TorusGeometry(0.3 + i * 0.09, 0.035, 4, 20), rope);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(7.5, 1.1, 0);
  }
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
