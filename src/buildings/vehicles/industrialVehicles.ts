import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

export interface TransportModel extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

/** Reusable untextured primitives. Coordinates and display envelopes are in meters. */
function modelKit(name: string) {
  const group = new THREE.Group();
  group.name = name;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<number, THREE.MeshLambertMaterial>();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  function add(name: string, geometry: THREE.BufferGeometry, color: number) {
    geometries.add(geometry);
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color, flatShading: true });
      materials.set(color, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = add(name, cube, color);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: number[], b: number[], radius: number, color: number) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const mesh = add(name, cylinder, color);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    mesh.scale.set(radius, start.distanceTo(end), radius);
    return mesh;
  }
  function finish(): TransportModel {
    const model = {
      group,
      pickables,
      dispose() {
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials.values()) material.dispose();
      }
    };
    return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
  }
  return { add, box, beam, finish };
}

export const HOT_AIR_BALLOON = {
  author: "Codex GPT-6.1 Sol",
  name: "Hot air balloon",
  length: 10,
  width: 10,
  height: 15,
  note: "Low-poly fantasy balloon with alternating fabric gores, an open throat, suspension ropes, burner and open wicker basket. Displayed at basket ground level; illustrative dimensions, not a historical reconstruction."
} as const;

export function createHotAirBalloon(): TransportModel {
  const kit = modelKit("hot-air-balloon");
  // Separate single-material gores also keep the generated orthographic drawings colored.
  const profile = [
    [0.7, 4.2],
    [2.7, 5.6],
    [4.4, 8],
    [5, 10.2],
    [4.4, 12.5],
    [2.8, 14.2],
    [0, 15]
  ];
  for (let i = 0; i < 12; i++) {
    const gore = kit.add(
      "fabric-gore",
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        1,
        (i * Math.PI) / 6,
        Math.PI / 6
      ),
      i % 2 ? 0xe8c785 : 0xb94d38
    );
    // Fabric has an open lower throat with visible inside faces.
    (gore.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  }
  kit.box("basket-floor", 0, 0.12, 0, 1.8, 0.24, 1.4, 0x79502e);
  for (let row = 0; row < 5; row++) {
    const y = 0.34 + row * 0.18;
    const color = row % 2 ? 0xa97a41 : 0xbc9256;
    for (const side of [-1, 1]) {
      kit.box("basket-weave", 0, y, side * 0.66, 1.8, 0.17, 0.08, color);
      kit.box("basket-weave", side * 0.86, y, 0, 0.08, 0.17, 1.4, color);
    }
  }
  for (const x of [-0.84, 0.84])
    for (const z of [-0.64, 0.64]) {
      kit.beam("basket-upright", [x, 0.2, z], [x, 2.7, z], 0.055, 0x61442c);
      kit.beam("suspension-rope", [x, 2.7, z], [x * 1.4, 4.55, z * 1.4], 0.035, 0xd5bd88);
    }
  kit.box("burner-frame", 0, 2.65, 0, 1.8, 0.12, 1.4, 0x3b3b37);
  kit.beam("burner", [0, 2.7, 0], [0, 3.1, 0], 0.23, 0x705b3d);
  kit.add("burner-flame", new THREE.ConeGeometry(0.14, 0.6, 5), 0xf2ad38).position.set(0, 3.4, 0);
  return kit.finish();
}

export const AIRSHIP = {
  author: "Codex GPT-6.1 Sol",
  name: "Airship",
  length: 30,
  width: 9,
  height: 10.5,
  note: "Compact low-poly fantasy dirigible with a faceted gas envelope, four tail fins, suspended cabin, twin propellers and rigging. Resting height is measured from the gondola underside; no flight simulation or historical replica is implied."
} as const;

export function createAirship(): TransportModel {
  const kit = modelKit("airship");
  const hull = kit.add("gas-envelope", new THREE.SphereGeometry(1, 12, 8), 0xd5c7a2);
  hull.scale.set(15, 3.7, 3.7);
  hull.position.y = 6.7;
  // Thin circumferential bands follow the faceted envelope cross sections.
  for (const x of [-9, -4.5, 0, 4.5, 9]) {
    const r = 3.7 * Math.sqrt(1 - (x / 15) ** 2);
    const band = kit.add("envelope-band", new THREE.TorusGeometry(r + 0.015, 0.035, 3, 12), 0x8d7753);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, 6.7, 0);
  }
  kit.box("gondola-floor", 0, 0.2, 0, 6, 0.4, 1.8, 0x564633);
  kit.box("gondola-cabin", 0, 1.05, 0, 5.6, 1.3, 1.65, 0x996d40);
  kit.box("gondola-roof", 0, 1.8, 0, 6, 0.2, 1.9, 0x4b5350);
  for (const side of [-1, 1]) {
    for (const x of [-1.8, -0.6, 0.6, 1.8]) kit.box("cabin-window", x, 1.24, side * 0.835, 0.8, 0.6, 0.035, 0x719a9b);
    for (const x of [-2.3, 2.3])
      kit.beam("suspension-cable", [x, 1.85, side * 0.8], [x * 1.8, 4.2, side * 2.2], 0.045, 0x605a4e);
    kit.beam("engine-outrigger", [0, 0.6, side * 0.8], [0, 0.6, side * 2.8], 0.12, 0x494b45);
    kit.beam("engine-pod", [-0.8, 0.7, side * 2.8], [0.6, 0.7, side * 2.8], 0.32, 0x4b5350);
    kit.beam("propeller-shaft", [0.6, 0.7, side * 2.8], [1, 0.7, side * 2.8], 0.1, 0xb19a64);
    const prop = kit.box("propeller", 1, 0.7, side * 2.8, 0.12, 0.18, 2.3, 0x644a31);
    prop.rotation.x = side * 0.45;
  }
  // A tapered prism forms each fin rather than a rectangular plate.
  const fin = new THREE.Shape();
  fin.moveTo(-14, 0);
  fin.lineTo(-12.5, 4.5);
  fin.lineTo(-9, 1.8);
  fin.lineTo(-8, 0);
  fin.closePath();
  for (let i = 0; i < 4; i++) {
    const mesh = kit.add(
      "tail-fin",
      new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false }),
      i % 2 ? 0x9d4837 : 0xbaa77c
    );
    mesh.position.set(0, 6, 0);
    mesh.rotation.x = (i * Math.PI) / 2;
  }
  return kit.finish();
}

export const STEAM_LOCOMOTIVE = {
  author: "Codex GPT-6.1 Sol",
  name: "Steam locomotive",
  length: 17,
  width: 3.6,
  height: 4.8,
  note: "Low-poly fantasy steam engine with a horizontal boiler, chimney, open cab, three coupled driving axles, leading wheels and coal tender. Static connecting rods and a short display track are included; not a specific historical locomotive."
} as const;

export function createSteamLocomotive(): TransportModel {
  const kit = modelKit("steam-locomotive");
  const iron = 0x303b3b,
    red = 0x8f362b,
    brass = 0xb79a50;
  for (let x = -8; x <= 8; x++) kit.box("track-sleeper", x, 0.08, 0, 0.22, 0.16, 3.2, 0x65513d);
  for (const side of [-1, 1]) kit.box("rail", 0, 0.24, side * 0.9, 17, 0.16, 0.12, 0x6c706b);
  kit.box("engine-frame", 2, 1.15, 0, 9.8, 0.3, 2.25, red);
  kit.beam("boiler", [-0.7, 2.55, 0], [5.2, 2.55, 0], 1, iron);
  kit.beam("smokebox-door", [5.2, 2.55, 0], [5.36, 2.55, 0], 0.87, 0x202928);
  kit.beam("door-handle", [5.4, 2.25, 0], [5.4, 2.85, 0], 0.045, brass);
  for (const x of [0, 2.4, 4.6]) {
    const band = kit.add("boiler-band", new THREE.TorusGeometry(1.015, 0.045, 3, 10), brass);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, 2.55, 0);
  }
  kit.beam("chimney", [4.3, 3.3, 0], [4.3, 4.5, 0], 0.27, iron);
  kit.beam("chimney-rim", [4.3, 4.45, 0], [4.3, 4.65, 0], 0.4, iron);
  kit.beam("steam-dome", [1.2, 3.35, 0], [1.2, 4, 0], 0.37, brass);
  kit.box("cab-floor", -1.7, 1.55, 0, 2.4, 0.2, 2.5, iron);
  for (const side of [-1, 1]) {
    kit.box("cab-lower-wall", -1.7, 2.05, side * 1.17, 2.2, 0.8, 0.12, 0x355d4e);
    for (const x of [-2.75, -0.65]) kit.box("cab-pillar", x, 3.1, side * 1.17, 0.14, 2.1, 0.14, 0x355d4e);
    kit.box("cab-window-header", -1.7, 4.05, side * 1.17, 2.2, 0.22, 0.14, 0x355d4e);
  }
  kit.box("cab-roof", -1.7, 4.3, 0, 2.7, 0.22, 2.8, iron);
  kit.box("firebox", -0.9, 2.2, 0, 0.9, 1.1, 1.4, iron);
  kit.box("firebox-door", -1.38, 2.2, 0, 0.05, 0.5, 0.6, 0x171e1e);
  kit.box("tender-frame", -5.5, 1.15, 0, 4.6, 0.3, 2.3, red);
  kit.box("tender-floor", -5.5, 1.55, 0, 4.2, 0.3, 2.3, iron);
  for (const side of [-1, 1]) {
    kit.box("tender-side", -5.5, 2.1, side * 1.1, 4.2, 1.1, 0.14, 0x355d4e);
    kit.box("tender-end", -5.5 + side * 2.03, 2.1, 0, 0.14, 1.1, 2.2, 0x355d4e);
  }
  for (let i = 0; i < 10; i++) {
    const coal = kit.add("coal", new THREE.IcosahedronGeometry(0.48, 0), 0x242928);
    coal.position.set(-6.9 + (i % 5) * 0.7, 2.35, i < 5 ? -0.43 : 0.43);
    coal.scale.y = 0.6;
  }
  kit.beam("tender-coupling", [-3.4, 1.1, 0], [-2.7, 1.1, 0], 0.12, iron);
  for (const x of [-6.8, -4.3, 0, 1.8, 3.6, 5.6]) {
    const driving = x >= 0 && x <= 3.6;
    const radius = driving ? 0.8 : 0.48;
    const y = 0.32 + radius;
    kit.beam("axle", [x, y, -1.1], [x, y, 1.1], 0.12, iron);
    for (const side of [-1, 1]) {
      kit.beam("wheel-tread", [x, y, side * 0.82], [x, y, side * 1.02], radius, 0x555b57);
      kit.beam("wheel-face", [x, y, side * 1.02], [x, y, side * 1.08], radius * 0.83, red);
      if (driving)
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          kit.beam(
            "wheel-spoke",
            [x, y, side * 1.12],
            [x + Math.cos(a) * 0.61, y + Math.sin(a) * 0.61, side * 1.12],
            0.045,
            brass
          );
        }
    }
  }
  for (const side of [-1, 1]) {
    kit.beam("coupling-rod", [0, 0.92, side * 1.23], [3.6, 0.92, side * 1.23], 0.085, 0xb5b1a0);
    kit.beam("piston-rod", [3.6, 0.92, side * 1.3], [5.1, 1.3, side * 1.3], 0.07, 0xb5b1a0);
    kit.box("cylinder", 5, 1.3, side * 1.15, 1, 0.55, 0.5, iron);
    kit.box("buffer", 6.9, 1.2, side * 0.8, 0.25, 0.4, 0.5, iron);
  }
  kit.box("front-buffer-beam", 6.6, 1.15, 0, 0.25, 0.4, 2.5, red);
  kit.beam("headlamp", [5.8, 1.75, 0], [6.15, 1.75, 0], 0.24, brass);
  kit.beam("headlamp-lens", [6.15, 1.75, 0], [6.18, 1.75, 0], 0.19, 0xf6dda0);
  return kit.finish();
}
