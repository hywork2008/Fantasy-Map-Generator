import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Imagined covered medieval ram, in meters; the striking head faces positive X. */
export const BATTERING_RAM = {
  name: "Medieval European battering ram",
  length: 7.4,
  width: 3,
  height: 3.7,
  note: "Illustrative medieval European covered ram: a suspended oak log with a blunt iron striking head, hand grips, a braced four-wheeled timber chassis and a hide-covered pitched roof. Shown at rest without crew or animation. Dimensions are illustrative, not a reconstruction of a specific surviving engine."
} as const;

export interface BatteringRamMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

/** Reusable scene geometry; projections are generated only for the viewer. */
export function createBatteringRamModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-battering-ram";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const timber = new THREE.MeshLambertMaterial({ color: 0x89613b });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x513b29 });
  const logWood = new THREE.MeshLambertMaterial({ color: 0xa6804d });
  const iron = new THREE.MeshLambertMaterial({ color: 0x3c4142 });
  const rope = new THREE.MeshLambertMaterial({ color: 0xc4ac78 });
  const hides = [0x968064, 0xa38e70, 0x8b765c, 0xb09a79].map(color => new THREE.MeshLambertMaterial({ color }));
  const materials = [timber, darkWood, logWood, iron, rope, ...hides];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  // Small roof faces keep the depth-sorted orthographic drawings from painting decking over hides.
  const roofDeck = new THREE.BoxGeometry(1, 1, 1, 28, 1, 12);
  const hidePanel = new THREE.BoxGeometry(1, 1, 1, 4, 1, 4);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = timber) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = timber, round = false) {
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
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  // Four wheels support an open chassis; there is no floor obstructing the crew's footing.
  const felloe = ring(0.34, 0.46, 0.16);
  const tire = ring(0.46, 0.48, 0.18);
  for (const x of [-1.95, 1.95]) {
    beam("axle", v(x, 0.48, -1.44), v(x, 0.48, 1.44), 0.12, darkWood, true);
    box("axle-bolster", x, 0.68, 0, 0.26, 0.22, 2.2, darkWood);
    for (const side of [-1, 1]) {
      const z = side * 1.3;
      add("wheel-felloe", felloe, timber).position.set(x, 0.48, z);
      add("wheel-iron-tire", tire, iron).position.set(x, 0.48, z);
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        beam("wheel-spoke", v(x, 0.48, z), v(x + 0.4 * Math.cos(angle), 0.48 + 0.4 * Math.sin(angle), z), 0.06);
      }
      beam("wheel-hub", v(x, 0.48, z - 0.13), v(x, 0.48, z + 0.13), 0.13, darkWood, true);
      beam("axle-linchpin", v(x, 0.39, side * 1.44), v(x, 0.57, side * 1.44), 0.025, iron, true);
    }
  }
  for (const side of [-1, 1]) {
    const z = side * 0.94;
    box("chassis-rail", 0, 0.86, z, 5.3, 0.25, 0.23, darkWood);
    box("eaves-beam", 0, 2.82, z, 5.5, 0.18, 0.18);
    for (const x of [-1.65, 1.65]) {
      box("frame-post", x, 1.85, z, 0.19, 2.08, 0.19);
      box("post-iron-strap", x, 1.02, z, 0.215, 0.1, 0.215, iron);
      beam("longitudinal-brace", v(x, 2.7, z), v(x + (x < 0 ? 0.85 : -0.85), 0.97, z), 0.11);
      beam("roof-rafter", v(x, 2.85, side * 1.25), v(x, 3.55, 0), 0.12);
    }
  }
  for (const x of [-1.65, 1.65]) {
    box("roof-tie", x, 2.87, 0, 0.18, 0.18, 2.05);
    box("king-post", x, 3.2, 0, 0.12, 0.7, 0.12);
  }
  box("ridge-beam", 0, 3.5, 0, 5.55, 0.15, 0.15);

  // The ram hangs below the transverse ties, with room to swing along the open central bay.
  beam("ram-log", v(-3.1, 1.65, 0), v(3.35, 1.65, 0), 0.21, logWood, true);
  for (const x of [-1.65, 1.65]) {
    beam("suspension-collar", v(x - 0.065, 1.65, 0), v(x + 0.065, 1.65, 0), 0.23, iron, true);
    for (const side of [-1, 1]) {
      beam("suspension-rope", v(x, 2.9, side * 0.19), v(x, 1.55, side * 0.19), 0.035, rope, true);
      beam("suspension-cradle", v(x, 1.55, side * 0.19), v(x, 1.41, 0), 0.035, rope, true);
    }
  }
  for (const x of [-2.65, 2.55, 2.9])
    beam("log-iron-band", v(x - 0.045, 1.65, 0), v(x + 0.045, 1.65, 0), 0.22, iron, true);
  beam("iron-head-socket", v(3.05, 1.65, 0), v(3.55, 1.65, 0), 0.25, iron, true);
  box("striking-head", 3.64, 1.65, 0, 0.22, 0.54, 0.48, iron);
  for (const x of [-2.25, -0.8, 0, 0.8, 2.25]) {
    beam("crew-handle", v(x, 1.65, -0.64), v(x, 1.65, 0.64), 0.055, darkWood, true);
    for (const side of [-1, 1])
      beam("handle-grip", v(x - 0.13, 1.65, side * 0.61), v(x + 0.13, 1.65, side * 0.61), 0.065, timber, true);
  }

  // Separate hide panels and timber battens make the protective pitched roof legible from above.
  const slope = Math.atan2(0.7, 1.25);
  const roofDepth = Math.hypot(1.25, 0.7);
  for (const side of [-1, 1]) {
    const rotation = side * slope;
    const roofPoint = (x: number, t: number, lift = 0) => v(x, 3.55 - 0.7 * t + lift, side * 1.25 * t);
    const decking = box("roof-deck", 0, 3.2, side * 0.625, 5.6, 0.065, roofDepth, darkWood);
    decking.geometry = roofDeck;
    geometries.add(roofDeck);
    decking.rotation.x = rotation;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row < 3; row++) {
        const p = roofPoint(-2.4 + col * 0.8, (row + 0.5) / 3, 0.055);
        const panel = box(
          "roof-hide-panel",
          p.x,
          p.y,
          p.z,
          0.79,
          0.035,
          roofDepth / 3 - 0.012,
          hides[(col + row) % hides.length]
        );
        panel.geometry = hidePanel;
        geometries.add(hidePanel);
        panel.rotation.x = rotation;
      }
    }
    for (const x of [-2.75, -1.65, 0, 1.65, 2.75]) {
      beam("roof-batten", roofPoint(x, 0, 0.09), roofPoint(x, 1, 0.09), 0.045, timber);
      for (const t of [0.12, 0.5, 0.9]) {
        const p = roofPoint(x, t, 0.12);
        beam("roof-peg", p, p.clone().add(v(0, 0.025, 0)), 0.025, iron, true);
      }
    }
  }
  box("ridge-cap", 0, 3.64, 0, 5.65, 0.08, 0.15, darkWood);

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createBatteringRam(): BatteringRamMeshes {
  const model = createBatteringRamModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
