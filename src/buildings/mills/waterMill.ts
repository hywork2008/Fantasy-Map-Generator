import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Imagined medieval European grain mill; all dimensions are illustrative meters. */
export const WATER_MILL = {
  name: "Medieval European watermill",
  width: 18,
  depth: 12,
  height: 11,
  wheelRadius: 2.45,
  hubHeight: 2.65,
  note: "Imagined medieval European grain mill with a rubble-stone ground floor, timber-framed plaster upper storey, clay-tiled gable roof and wooden overshot wheel. A raised timber flume feeds the wheel from the left; the lower millrace carries water away. Static exterior study with illustrative dimensions, not a reconstruction of a particular site. Internal gearing, millstones, flowing water and wheel animation are omitted."
} as const;

export interface WaterMillMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createWaterMill(): WaterMillMeshes {
  const group = new THREE.Group();
  group.name = "medieval-watermill";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: number) => new THREE.MeshLambertMaterial({ color });
  const oak = material(0x654b33);
  const timber = material(0x483528);
  const freshWood = material(0x9c7b4d);
  const plaster = material(0xe2d5b6);
  const stone = [0x969080, 0xa69e8b, 0x898777, 0xb0a48e].map(material);
  const tiles = [0x8f4b35, 0xa45d40, 0x99513a, 0xb16c49].map(material);
  const shadow = material(0x252925);
  const iron = material(0x3b3b35);
  const water = material(0x548a90);
  const linen = material(0xc3ae7d);
  const materials = [oak, timber, freshWood, plaster, ...stone, ...tiles, shadow, iron, water, linen];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, parent = group) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
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
    mat = oak,
    parent = group
  ) {
    const mesh = add(name, cube, mat, parent);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, mat = timber, depth = width) {
    const mesh = add(name, cube, mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), depth);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }

  // The race runs beneath the wheel, outside the building's foundation.
  box("millrace-water", 0, 0.08, 4.2, 17.6, 0.08, 2.3, water);
  for (const z of [2.94, 5.46]) {
    box("race-retaining-wall", 0, 0.21, z, 17.8, 0.42, 0.22, stone[2]);
    for (let i = 0; i < 22; i++) box("race-coping", -8.5 + i * 0.81, 0.45, z, 0.78, 0.13, 0.34, stone[i % 4]);
  }
  box("foundation", 0, 0.25, -0.1, 8.3, 0.5, 5.9, stone[2]);
  box("stone-ground-floor", 0, 1.65, -0.1, 8, 2.4, 5.8, stone[0]);
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 11; col++) {
      const x = -3.68 + col * 0.72 + (row % 2) * 0.13;
      for (const z of [-3.04, 2.84])
        box("rubble-facing", x, 0.65 + row * 0.39, z, 0.65, 0.34, 0.09, stone[(row * 3 + col) % 4]);
    }
    for (const x of [-4.04, 4.04])
      for (let col = 0; col < 8; col++)
        box("side-rubble-facing", x, 0.65 + row * 0.39, -2.65 + col * 0.73, 0.09, 0.34, 0.67, stone[(row + col) % 4]);
  }
  box("plaster-upper-storey", 0, 4.4, -0.1, 8, 3.1, 5.8, plaster);
  for (const y of [2.9, 5.9]) {
    for (const z of [-3.08, 2.88]) box("storey-tie", 0, y, z, 8.25, 0.22, 0.18, timber);
    for (const x of [-4.08, 4.08]) box("side-storey-tie", x, y, -0.1, 0.18, 0.22, 6.05, timber);
  }
  for (const z of [-3.08, 2.88]) {
    for (const x of [-4, -2, 0, 2, 4]) box("upper-post", x, 4.4, z, 0.19, 3.1, 0.18, timber);
    for (const x of [-4, 2]) {
      beam("diagonal-brace", v(x + 0.1, 3.02, z), v(x + 1.9, 5.78, z), 0.15);
    }
  }
  for (const x of [-4.08, 4.08]) {
    for (const z of [-3, -0.1, 2.8]) box("side-upper-post", x, 4.4, z, 0.18, 3.1, 0.18, timber);
    beam("side-diagonal-brace", v(x, 3.05, -2.9), v(x, 5.75, -0.2), 0.15);
  }

  // The ridge runs along Z, so both gables remain readable beside the wheel.
  const shape = new THREE.Shape();
  shape.moveTo(-4, 5.95);
  shape.lineTo(4, 5.95);
  shape.lineTo(0, 9.5);
  shape.closePath();
  const gable = new THREE.ShapeGeometry(shape);
  for (const z of [-3.01, 2.81]) {
    const face = add("plaster-gable", gable, plaster);
    face.position.z = z;
    if (z < 0) face.rotation.y = Math.PI;
    box("gable-king-post", 0, 7.7, z + Math.sign(z) * 0.06, 0.2, 3.6, 0.18, timber);
    box("gable-tie", 0, 6.95, z + Math.sign(z) * 0.06, 5.8, 0.16, 0.18, timber);
    for (const side of [-1, 1]) beam("gable-brace", v(side * 3.7, 6, z), v(0, 9.35, z), 0.18);
  }
  const run = 4.45,
    rise = 3.85,
    angle = Math.atan2(rise, run);
  for (const side of [-1, 1]) {
    // Individual tiles form the roof surface and keep projected plans free of hidden backing faces.
    for (let row = 0; row < 12; row++) {
      const t = (row + 0.5) / 12;
      for (let col = 0; col < 17; col++) {
        const tile = box(
          "clay-roof-tile",
          side * t * run,
          9.75 - t * rise,
          -3.3 + col * 0.4,
          Math.hypot(run, rise) / 12,
          0.09,
          0.39,
          tiles[(row + col * 3) % 4]
        );
        tile.rotation.z = -side * angle;
      }
    }
    for (const z of [-3.6, 3.4]) beam("bargeboard", v(0, 9.75, z), v(side * 4.5, 5.85, z), 0.18, oak);
  }
  box("ridge-cap", 0, 9.78, -0.1, 0.22, 0.16, 7.05, tiles[2]);
  box("stone-chimney", -2.5, 8.25, -1.65, 0.8, 4.1, 0.85, stone[2]);
  box("chimney-cap", -2.5, 10.35, -1.65, 1.02, 0.18, 1.07, stone[1]);
  box("chimney-opening", -2.5, 10.45, -1.65, 0.65, 0.03, 0.7, shadow);

  function frontOpening(x: number, y: number, width: number, height: number, name: string) {
    box(`${name}-surround`, x, y, 2.98, width + 0.22, height + 0.22, 0.16, oak);
    box(`${name}-recess`, x, y, 3.08, width, height, 0.06, shadow);
  }
  frontOpening(-2.8, 1.48, 1.35, 2.05, "entrance");
  for (let i = 0; i < 6; i++) box("entrance-door-board", -3.35 + i * 0.22, 1.48, 3.13, 0.21, 2.02, 0.08, freshWood);
  for (const y of [0.85, 2.05]) box("door-strap-hinge", -2.9, y, 3.19, 0.95, 0.085, 0.05, iron);
  box("door-latch", -2.35, 1.48, 3.2, 0.12, 0.25, 0.06, iron);
  box("doorstep", -2.8, 0.3, 3.24, 1.65, 0.2, 0.58, stone[1]);
  // The entrance footbridge crosses the straight race at a right angle.
  for (let i = 0; i < 13; i++) box("entrance-bridge-plank", -2.8, 0.58, 3.1 + i * 0.24, 1.5, 0.14, 0.23, freshWood);
  for (const x of [-3.47, -2.13]) {
    box("entrance-bridge-stringer", x, 0.43, 4.54, 0.15, 0.22, 3.3, timber);
    box("entrance-bridge-handrail", x, 1.5, 4.54, 0.1, 0.12, 3.3, oak);
    for (const z of [3.1, 4.54, 5.98]) box("entrance-bridge-post", x, 1.05, z, 0.12, 1.1, 0.12, timber);
  }
  for (const x of [-1, 1]) {
    frontOpening(x, 4.55, 0.95, 1.3, "upper-window");
    box("window-mullion", x, 4.55, 3.13, 0.07, 1.3, 0.08, freshWood);
    box("window-transom", x, 4.55, 3.13, 0.95, 0.07, 0.08, freshWood);
    for (const side of [-1, 1]) {
      const shutter = box("open-window-shutter", x + side * 0.77, 4.55, 3.18, 0.48, 1.3, 0.08, oak);
      shutter.rotation.y = side * 0.3;
    }
  }
  frontOpening(0, 7.4, 1, 1.55, "loft-door");
  for (let i = 0; i < 5; i++) box("loft-door-board", -0.4 + i * 0.2, 7.4, 3.14, 0.19, 1.52, 0.08, oak);
  beam("hoist-jib", v(0, 8.5, 2.7), v(0, 8.5, 4.05), 0.18);
  beam("hoist-brace", v(0, 7.9, 2.85), v(0, 8.5, 3.8), 0.12);
  beam("hoist-rope", v(0, 8.4, 3.94), v(0, 6.7, 3.94), 0.035, freshWood);
  for (const x of [-4.16, 4.16]) {
    box("side-window-surround", x, 4.5, 1.25, 0.15, 1.4, 1.12, oak);
    box("side-window-recess", x + Math.sign(x) * 0.09, 4.5, 1.25, 0.05, 1.17, 0.9, shadow);
    box("side-window-mullion", x + Math.sign(x) * 0.13, 4.5, 1.25, 0.06, 1.17, 0.07, freshWood);
  }

  // Two open annular rims and radial spokes leave the wheel's center visible.
  const wheel = new THREE.Group();
  wheel.name = "waterwheel-assembly";
  wheel.position.set(1.3, WATER_MILL.hubHeight, 4.2);
  group.add(wheel);
  const rimShape = new THREE.Shape();
  rimShape.absarc(0, 0, WATER_MILL.wheelRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2.14, 0, Math.PI * 2, true);
  rimShape.holes.push(hole);
  const rimGeometry = new THREE.ExtrudeGeometry(rimShape, { depth: 0.14, bevelEnabled: false, curveSegments: 32 });
  for (const z of [-0.6, 0.46]) {
    const rim = add("wheel-rim", rimGeometry, timber, wheel);
    rim.position.z = z;
    for (let i = 0; i < 4; i++) {
      const spoke = box("wheel-spoke", 0, 0, z + 0.07, 0.17, 4.6, 0.16, oak, wheel);
      spoke.rotation.z = (i * Math.PI) / 4;
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI * 2) / 24;
    const bucket = new THREE.Group();
    bucket.name = "wheel-bucket";
    bucket.rotation.z = a;
    wheel.add(bucket);
    box("bucket-bottom", 0, 2.22, 0, 0.5, 0.09, 1.05, oak, bucket);
    box("bucket-lip", 0.22, 2.33, 0, 0.07, 0.3, 1.05, freshWood, bucket);
  }
  const axle = add("wheel-axle", cylinder, timber);
  axle.position.set(1.3, WATER_MILL.hubHeight, 3.9);
  axle.rotation.x = Math.PI / 2;
  axle.scale.set(0.23, 3.1, 0.23);
  for (const z of [3.55, 4.85]) {
    const hub = add("wheel-hub", cylinder, iron);
    hub.position.set(1.3, WATER_MILL.hubHeight, z);
    hub.rotation.x = Math.PI / 2;
    hub.scale.set(0.38, 0.18, 0.38);
  }
  box("outer-bearing-pier", 1.3, 1.25, 5.48, 0.8, 2.5, 0.65, stone[2]);
  box("outer-axle-bearing", 1.3, 2.6, 5.48, 0.6, 0.2, 0.55, oak);

  // An open flume ends just upstream of the crown, dropping onto the buckets.
  box("flume-bed", -3.8, 5.38, 4.2, 7.8, 0.16, 1.06, oak);
  for (const z of [3.62, 4.78]) box("flume-side", -3.8, 5.63, z, 7.8, 0.65, 0.14, freshWood);
  box("flume-water", -3.8, 5.57, 4.2, 7.8, 0.035, 1.02, water);
  for (const x of [-7.2, -4.8]) {
    for (const z of [3.58, 4.82]) {
      box("flume-support-post", x, 2.7, z, 0.22, 5.4, 0.22, timber);
      beam("flume-knee-brace", v(x, 4, z), v(x + 0.85, 5.28, z), 0.14);
    }
    box("flume-crossbeam", x, 5.22, 4.2, 0.25, 0.2, 1.7, timber);
  }
  box("sluice-gate", -6.4, 5.78, 4.2, 0.14, 0.78, 1.02, oak);
  for (const z of [3.57, 4.83]) box("sluice-gate-guide", -6.4, 6, z, 0.18, 1.2, 0.18, timber);
  box("sluice-lifting-bar", -6.4, 6.27, 4.2, 0.12, 1, 0.12, freshWood);
  box("sluice-handle", -6.4, 6.75, 4.2, 0.12, 0.1, 0.65, timber);

  // Small grain sacks establish the entrance's human scale.
  const sackGeometry = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 3; i++) {
    const sack = add("grain-sack", sackGeometry, linen);
    sack.position.set(-4.65 - (i % 2) * 0.65, 0.48, 1.6 - Math.floor(i / 2) * 0.7);
    sack.scale.set(0.36, 0.48, 0.31);
    box("sack-tie", sack.position.x, 0.91, sack.position.z, 0.19, 0.12, 0.16, freshWood);
  }

  const model = {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
    }
  };
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
