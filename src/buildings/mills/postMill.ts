import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";
import { WINDMILL_SAIL_RADIUS_METERS } from "./millDimensions";

/** Imagined medieval European timber post mill. Dimensions are illustrative, in meters. */
export const POST_MILL = {
  author: "Codex GPT-6.1 Sol",
  name: "Medieval post mill",
  width: 14,
  depth: 13,
  height: 15,
  hubHeight: 8.1,
  sailRadius: WINDMILL_SAIL_RADIUS_METERS.post,
  note: "Schematic medieval European post mill: a timber-clad milling house on a braced central post, a shingled gable roof, four lattice sails with canvas, an external access stair and a tailpole for turning the body into the wind. Static exterior study; internal gearing and millstones are omitted. Dimensions are illustrative, not a reconstruction of a particular mill."
} as const;

export interface PostMillMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createPostMill(): PostMillMeshes {
  const group = new THREE.Group();
  group.name = "medieval-post-mill";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const oak = new THREE.MeshLambertMaterial({ color: 0x715237 });
  const paleWood = new THREE.MeshLambertMaterial({ color: 0xb18a56 });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x4c3c2e });
  const boards = [0x96744f, 0x8e6c49, 0xa17d55].map(color => new THREE.MeshLambertMaterial({ color }));
  const shingles = [0x655d4b, 0x736953, 0x7b7058].map(color => new THREE.MeshLambertMaterial({ color }));
  const iron = new THREE.MeshLambertMaterial({ color: 0x343a37 });
  const recess = new THREE.MeshLambertMaterial({ color: 0x282b27 });
  const linen = new THREE.MeshLambertMaterial({ color: 0xeee1be, side: THREE.DoubleSide });
  const stone = new THREE.MeshLambertMaterial({ color: 0x9d9787, flatShading: true });
  const materials = [oak, paleWood, darkWood, ...boards, ...shingles, iron, recess, linen, stone];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent = group) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material = oak,
    parent = group
  ) {
    const mesh = add(name, cube, material, parent);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, w: number, d = w, material = oak, round = false) {
    const mesh = add(name, round ? cylinder : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(w, a.distanceTo(b), d);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }

  // The open trestle carries the house on a central post, rather than a masonry tower.
  for (const x of [-2.25, 2.25])
    for (const z of [-2.25, 2.25]) {
      box("stone-footing", x, 0.2, z, 0.95, 0.4, 0.95, stone);
    }
  for (const z of [-2.25, 2.25]) box("trestle-sill", 0, 0.58, z, 5.2, 0.36, 0.42, darkWood);
  for (const x of [-2.25, 2.25]) box("trestle-cross-sill", x, 0.82, 0, 0.42, 0.36, 5.2, darkWood);
  box("central-post", 0, 3.5, 0, 0.85, 5.8, 0.85, darkWood);
  for (const x of [-2.25, 2.25])
    for (const z of [-2.25, 2.25]) {
      beam("post-brace", v(x, 1, z), v(0, 4.9, 0), 0.3);
    }
  box("rotating-bolster", 0, 4.1, 0, 3.7, 0.5, 0.65, darkWood);
  box("house-floor", 0, 4.35, 0, 4.1, 0.3, 4.8, darkWood);
  box("mill-house", 0, 6.85, 0, 3.8, 4.8, 4.6, oak);
  // Separate, slightly varied boards retain a readable timber texture at BV scale.
  for (let i = 0; i < 19; i++) {
    const y = 4.55 + i * 0.25;
    for (const side of [-1, 1]) {
      box("front-back-cladding", 0, y, side * 2.32, 3.82, 0.235, 0.08, boards[i % boards.length]);
      box("side-cladding", side * 1.93, y, 0, 0.08, 0.235, 4.66, boards[(i + 1) % boards.length]);
    }
  }
  for (const x of [-1.96, 1.96])
    for (const z of [-2.36, 2.36]) box("corner-post", x, 6.85, z, 0.16, 4.95, 0.16, paleWood);
  for (const y of [4.6, 9.15]) box("front-frame-tie", 0, y, 2.39, 4.05, 0.2, 0.16, darkWood);

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-2.08, 9.25);
  gableShape.lineTo(2.08, 9.25);
  gableShape.lineTo(0, 11.15);
  gableShape.closePath();
  const gableGeometry = new THREE.ShapeGeometry(gableShape);
  for (const side of [-1, 1]) {
    const gable = add("gable", gableGeometry, boards[1]);
    gable.position.z = side * 2.36;
    if (side < 0) gable.rotation.y = Math.PI;
  }
  const roofAngle = Math.atan2(2.05, 2.25),
    tileLength = Math.hypot(2.05, 2.25) / 10;
  // Contiguous shingles form the roof surface, without overlapping large hidden faces.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 10; row++) {
      const t = (row + 0.5) / 10;
      for (let col = 0; col < 12; col++) {
        const tile = box(
          "wood-shingle",
          side * t * 2.25,
          11.25 - t * 2.05,
          -2.42 + col * 0.44,
          tileLength,
          0.1,
          0.44,
          shingles[(row + col) % shingles.length]
        );
        tile.rotation.z = -side * roofAngle;
      }
    }
  }
  box("ridge-cap", 0, 11.23, 0, 0.18, 0.18, 5.4, darkWood);
  for (const z of [-2.65, 2.65])
    for (const side of [-1, 1]) beam("bargeboard", v(0, 11.28, z), v(side * 2.26, 9.22, z), 0.15, 0.12, paleWood);

  // Small shuttered windows and a rear door with an external stair.
  for (const side of [-1, 1]) {
    box("window-frame", side * 2, 7, -0.4, 0.14, 1.05, 0.95, paleWood);
    box("window-opening", side * 2.08, 7, -0.4, 0.06, 0.8, 0.7, recess);
    box("window-mullion", side * 2.13, 7, -0.4, 0.07, 0.85, 0.07, darkWood);
    const shutter = box("open-shutter", side * 2.25, 7, -1.1, 0.07, 0.95, 0.62, boards[0]);
    shutter.rotation.y = side * 0.5;
  }
  box("rear-door-surround", 0, 5.5, -2.41, 1.4, 2.2, 0.12, darkWood);
  for (let i = 0; i < 5; i++) box("door-board", -0.48 + i * 0.24, 5.5, -2.5, 0.23, 1.95, 0.1, boards[1]);
  for (const y of [4.9, 6.1]) box("door-hinge", -0.15, y, -2.57, 0.85, 0.09, 0.06, iron);
  box("door-latch", 0.4, 5.5, -2.59, 0.12, 0.25, 0.08, iron);
  box("rear-landing", 0, 4.35, -3.08, 1.8, 0.22, 1.4, darkWood);
  for (const side of [-1, 1]) {
    beam("stair-stringer", v(side * 0.75, 0.25, -6.6), v(side * 0.75, 4.35, -3.6), 0.18, 0.25, darkWood);
    beam("stair-handrail", v(side * 0.84, 1.3, -6.6), v(side * 0.84, 5.35, -3.6), 0.09, 0.09, paleWood);
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      beam(
        "stair-rail-post",
        v(side * 0.84, 0.4 + 4 * t, -6.6 + 3 * t),
        v(side * 0.84, 1.3 + 4 * t, -6.6 + 3 * t),
        0.09
      );
    }
  }
  for (let i = 0; i < 13; i++) {
    const t = (i + 1) / 13;
    box("stair-tread", 0, 0.25 + t * 4.1, -6.6 + t * 3, 1.5, 0.13, 0.32, paleWood);
  }
  // An offset tailpole leaves the access stair clear and reaches toward a turning handle.
  beam("tailpole", v(1.65, 4.45, -1.6), v(2.1, 0.75, -7.4), 0.22, 0.22, darkWood);
  beam("tailpole-handle", v(1.5, 0.75, -7.4), v(2.7, 0.75, -7.4), 0.12, 0.12, paleWood);

  beam("windshaft", v(0, POST_MILL.hubHeight, 1.9), v(0, POST_MILL.hubHeight, 3.65), 0.22, 0.22, darkWood, true);
  const rotor = new THREE.Group();
  rotor.name = "sail-assembly";
  rotor.position.set(0, POST_MILL.hubHeight, 3.3);
  group.add(rotor);
  for (let i = 0; i < 4; i++) {
    const wing = new THREE.Group();
    wing.name = `sail-${i + 1}`;
    wing.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
    rotor.add(wing);
    box("sail-stock", 0, 3.15, 0, 0.17, POST_MILL.sailRadius, 0.22, darkWood, wing);
    const lattice = new THREE.Group();
    lattice.rotation.y = -0.15;
    wing.add(lattice);
    for (const x of [0.08, 0.72, 1.38]) box("sail-longitudinal", x, 4.12, 0, 0.065, 4.16, 0.07, paleWood, lattice);
    const canvas = add("canvas-sail", new THREE.PlaneGeometry(1.22, 3.65, 1, 1), linen, lattice);
    canvas.position.set(0.73, 4.08, -0.045);
    for (let j = 0; j <= 10; j++) {
      box("sail-crossbar", 0.73, 2.04 + j * 0.416, 0.035, 1.45, 0.065, 0.08, paleWood, lattice);
    }
    for (const y of [0.5, 1.6, 3.2]) box("stock-binding", 0, y, 0, 0.23, 0.12, 0.27, iron, wing);
  }
  const hub = add("rotor-hub", cylinder, darkWood);
  hub.position.set(0, POST_MILL.hubHeight, 3.4);
  hub.rotation.x = Math.PI / 2;
  hub.scale.set(0.38, 0.72, 0.38);
  const cap = add("hub-cap", cylinder, iron);
  cap.position.set(0, POST_MILL.hubHeight, 3.8);
  cap.rotation.x = Math.PI / 2;
  cap.scale.set(0.24, 0.12, 0.24);
  const model = {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
