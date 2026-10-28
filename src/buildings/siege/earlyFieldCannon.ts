import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Illustrative European land artillery, circa 1500. Meters; muzzle faces positive X. */
export const EARLY_FIELD_CANNON = {
  author: "Codex GPT-6.1 Sol",
  name: "Early European field cannon",
  length: 4.4,
  width: 2.2,
  height: 1.85,
  note: "Imagined late-15th / early-16th-century muzzle-loading bronze field gun on a two-wheeled oak carriage. Large spoked wheels, iron fittings, trunnion bearings, a ground-resting trail and a wooden elevation quoin distinguish its land carriage. Illustrative dimensions, not a reconstruction of a specific surviving gun; shown at rest without crew or firing animation."
} as const;

export interface EarlyFieldCannonMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createEarlyFieldCannonModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "early-european-field-cannon";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const oak = new THREE.MeshLambertMaterial({ color: 0x89613c });
  const endGrain = new THREE.MeshLambertMaterial({ color: 0xa77e4e });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x543b28 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x353a3b });
  const bronze = new THREE.MeshLambertMaterial({ color: 0x857044 });
  const bore = new THREE.MeshLambertMaterial({ color: 0x242522 });
  const materials = [oak, endGrain, darkWood, iron, bronze, bore];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent = group) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
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
    mesh.quaternion.setFromUnitVectors(v(0, 1), b.clone().sub(a).normalize());
    mesh.scale.set(width, a.distanceTo(b), width);
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

  const axleX = 0.4,
    axleY = 0.73;
  const felloe = ring(0.59, 0.705, 0.13);
  const tire = ring(0.705, 0.73, 0.15);
  beam("axle", v(axleX, axleY, -1.06), v(axleX, axleY, 1.06), 0.12, iron, true);
  box("axle-bolster", axleX, 0.85, 0, 0.32, 0.22, 1.72, darkWood);
  for (const side of [-1, 1]) {
    const z = side * 0.94;
    add("wheel-felloe", felloe, oak).position.set(axleX, axleY, z);
    add("wheel-iron-tire", tire, iron).position.set(axleX, axleY, z);
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      beam(
        "wheel-spoke",
        v(axleX, axleY, z),
        v(axleX + 0.64 * Math.cos(angle), axleY + 0.64 * Math.sin(angle), z),
        0.055,
        endGrain
      );
    }
    beam("wheel-hub", v(axleX, axleY, z - 0.14), v(axleX, axleY, z + 0.14), 0.15, darkWood, true);
    beam("hub-band", v(axleX, axleY, z + side * 0.07), v(axleX, axleY, z + side * 0.12), 0.16, iron, true);
    beam("axle-linchpin", v(axleX, axleY - 0.1, side * 1.065), v(axleX, axleY + 0.1, side * 1.065), 0.02, iron, true);

    // Deep cheeks carry the trunnions and taper down into a single ground-resting trail.
    const cheek = new THREE.Shape();
    cheek.moveTo(-2.25, 0.03);
    cheek.lineTo(-2.25, 0.22);
    cheek.lineTo(-0.65, 1.1);
    cheek.lineTo(-0.45, 1.37);
    cheek.lineTo(0.82, 1.37);
    cheek.lineTo(0.94, 0.92);
    cheek.lineTo(-0.5, 0.78);
    cheek.closePath();
    const cheekGeometry = new THREE.ExtrudeGeometry(cheek, { depth: 0.16, bevelEnabled: false });
    cheekGeometry.translate(0, 0, -0.08);
    add("carriage-cheek", cheekGeometry, oak).position.z = side * 0.38;
    for (const x of [-0.45, 0.55]) {
      box("cheek-strap", x, 1.08, side * 0.468, 0.09, 0.52, 0.025, iron);
      for (const y of [0.91, 1.25]) {
        beam("strap-bolt", v(x, y, side * 0.47), v(x, y, side * 0.495), 0.035, iron, true);
      }
    }
    box("trunnion-cap", 0.25, 1.4, side * 0.38, 0.29, 0.065, 0.22, iron);
  }
  for (const x of [-0.65, 0.65]) box("carriage-transom", x, 0.98, 0, 0.19, 0.18, 0.7, darkWood);
  box("trail-heel", -2.12, 0.08, 0, 0.38, 0.16, 0.92, darkWood);
  box("trail-shoe", -2.14, 0.025, 0, 0.36, 0.05, 0.95, iron);
  beam("trail-handspike", v(-1.84, 0.3, -0.7), v(-1.84, 0.3, 0.7), 0.055, darkWood, true);

  // A wedge supports the breech; no later screw-elevation mechanism.
  const wedge = new THREE.Shape();
  wedge.moveTo(-0.91, 1.07);
  wedge.lineTo(-0.39, 1.07);
  wedge.lineTo(-0.39, 1.18);
  wedge.lineTo(-0.91, 1.28);
  wedge.closePath();
  const wedgeGeometry = new THREE.ExtrudeGeometry(wedge, { depth: 0.3, bevelEnabled: false });
  wedgeGeometry.translate(0, 0, -0.15);
  add("elevation-quoin", wedgeGeometry, endGrain);
  beam("quoin-handle", v(-0.87, 1.18, 0), v(-1.12, 1.18, 0), 0.04, darkWood, true);

  const barrel = new THREE.Group();
  barrel.position.set(0.25, 1.36, 0);
  barrel.rotation.z = (5 * Math.PI) / 180;
  group.add(barrel);
  // Lathed closed breech, tapered tube, muzzle lip and recessed inner bore, all on one axis.
  const profile = [
    [0, -1.02],
    [0.15, -1.02],
    [0.23, -0.94],
    [0.25, -0.82],
    [0.24, -0.72],
    [0.235, -0.25],
    [0.2, 0.15],
    [0.17, 1.25],
    [0.205, 1.31],
    [0.205, 1.45],
    [0.11, 1.45],
    [0.11, 0.94],
    [0, 0.94]
  ].map(([r, x]) => new THREE.Vector2(r, x));
  const tube = add("bronze-barrel", new THREE.LatheGeometry(profile, 32), bronze, barrel);
  tube.rotation.z = -Math.PI / 2;
  const boreEnd = add("recessed-bore", new THREE.CircleGeometry(0.109, 24), bore, barrel);
  boreEnd.rotation.y = Math.PI / 2;
  boreEnd.position.x = 0.945;
  for (const [x, radius] of [
    [-0.78, 0.247],
    [-0.29, 0.24],
    [0.1, 0.207],
    [1.27, 0.183]
  ]) {
    const band = add("barrel-moulding", new THREE.TorusGeometry(radius, 0.018, 6, 32), bronze, barrel);
    band.rotation.y = Math.PI / 2;
    band.position.x = x;
  }
  const cascabel = add("cascabel", new THREE.SphereGeometry(0.09, 12, 8), bronze, barrel);
  cascabel.position.x = -1.1;
  const trunnions = add("trunnions", cylinder, bronze, barrel);
  trunnions.rotation.x = Math.PI / 2;
  trunnions.scale.set(0.085, 1.02, 0.085);
  const vent = add("touch-hole", new THREE.CircleGeometry(0.018, 10), bore, barrel);
  vent.rotation.x = -Math.PI / 2;
  vent.position.set(-0.75, 0.252, 0);

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createEarlyFieldCannon(): EarlyFieldCannonMeshes {
  const model = createEarlyFieldCannonModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
