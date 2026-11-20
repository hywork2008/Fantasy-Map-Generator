import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type TractionTrebuchetQuality = "low" | "high";

const FOOT = 0.3048;
const INCH = 0.0254;
/** Tarver's full-scale reconstruction (1989–92): beam 16 ft divided six to one, uprights 12 ft, base struts 12 and 16 ft. */
const BEAM = { length: 16 * FOOT, ratio: 6, butt: 0.26, tip: 0.13 };
const LONG_ARM = (BEAM.length * BEAM.ratio) / (BEAM.ratio + 1);
const SHORT_ARM = BEAM.length / (BEAM.ratio + 1);
const UPRIGHT = { height: 12 * FOOT, z: 0.42, size: 0.22 };
const SILL = { long: 16 * FOOT, cross: 12 * FOOT, size: 0.2 };
const AXLE_Y = UPRIGHT.height - 0.16;
/** At rest the slightly heavier long arm lies back toward the ground. */
const REST = (52 * Math.PI) / 180;
const SLING = 41 * INCH;
const HOOK = 5 * INCH;
const RINGS = 8;

/**
 * A man-powered traction trebuchet (mangonel, perrière) of the "Frankish" kind, in meters: the ground at y = 0 and the
 * shot thrown toward positive X, shown at rest with the long arm down and the pulling ropes laid out in front.
 */
export const TRACTION_TREBUCHET = {
  author: "Claude Opus 5.5" as Author,
  name: "Traction trebuchet (mangonel)",
  beamLength: BEAM.length,
  longArm: LONG_ARM,
  shortArm: SHORT_ARM,
  uprightHeight: UPRIGHT.height,
  sills: [SILL.long, SILL.cross] as const,
  axleY: AXLE_Y,
  /** Angle of the beam below the horizontal at rest. */
  restAngle: REST,
  beamButtThickness: BEAM.butt,
  crossSillX: 1.9,
  slingLength: SLING,
  ropes: RINGS,
  note: "Schematic man-powered traction trebuchet, the rotating-beam engine of Byzantine, Avar, Frankish and Islamic sieges from the late 6th century (Thessalonica, 586 or 597) until counterweight engines displaced it as the main siege engine in the late 12th century; it stayed in use beside them, as at Acre in 1291. A crew pulls ropes on the short end of a pivoted beam and a sling on the long end throws the stone. Dimensions follow W. T. S. Tarver's full-scale reconstruction of a 'Frankish' machine after al-Tarsusi's 12th-century treatise and European manuscripts (Technology and Culture 36, 1995): a 16-ft (4.88 m) beam divided six to one by the axle, with a triangular frame on the butt end and a heavy butt block carrying eight rings for the pulling ropes, 12-ft (3.66 m) uprights, base struts of 12 and 16 ft, a 41-in (1.04 m) sling and a straight 5-in iron hook. With twelve to twenty pullers it threw 2.5–4.7 kg stones some 80–105 m, at most 145 m with 3.1 kg, a little over four shots a minute; al-Tarsusi gives 80–120 m. How the base struts, braces and uprights join is interpreted, as is the rest pose. The crew is omitted.",
  highNote:
    "High tier: rope windings on the beam at the brace crossing and toward the tip, iron bands on the butt block, the axle bushings and wedges in the upright heads, pegs at the brace joints, eight separate pulling ropes with knots for grip, the iron ring of the sling over the hook, and a few spare stones."
} as const;

export interface TractionTrebuchetMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createTractionTrebuchetModel(quality: TractionTrebuchetQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `traction-trebuchet-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const timber = new THREE.MeshLambertMaterial({ color: 0x86603d });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x5a3e29 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x353a3a });
  const hemp = new THREE.MeshLambertMaterial({ color: 0xbfa877 });
  const leather = new THREE.MeshLambertMaterial({ color: 0x51321f, side: THREE.DoubleSide });
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a958a, flatShading: true });
  const materials = [timber, darkWood, iron, hemp, leather, stone];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, high ? 10 : 6);
  const taper = new THREE.CylinderGeometry(BEAM.tip / BEAM.butt, 1, 1, high ? 10 : 6);
  const ball = new THREE.IcosahedronGeometry(1, high ? 1 : 0);
  geometries.add(cube).add(rod).add(taper).add(ball);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const Y = v(0, 1, 0);
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
  /** A square timber or round rod between two points. */
  function member(name: string, a: THREE.Vector3, b: THREE.Vector3, size: number, material = timber, round = false) {
    const mesh = add(name, round ? rod : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(size, a.distanceTo(b), size);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }
  const cord = (name: string, a: THREE.Vector3, b: THREE.Vector3, r = 0.014) => member(name, a, b, r, hemp, true);

  // Base: two long sills under the uprights and two cross sills laid over them.
  for (const z of [-UPRIGHT.z, UPRIGHT.z])
    box("long-sill", 0, SILL.size / 2, z, SILL.long, SILL.size, SILL.size, darkWood);
  for (const x of [-TRACTION_TREBUCHET.crossSillX, TRACTION_TREBUCHET.crossSillX])
    box("cross-sill", x, SILL.size * 1.5, 0, SILL.size, SILL.size, SILL.cross, darkWood);
  // Uprights with fore-and-aft and side braces.
  for (const z of [-UPRIGHT.z, UPRIGHT.z]) {
    box(
      "upright",
      0,
      SILL.size + (UPRIGHT.height - SILL.size) / 2,
      z,
      UPRIGHT.size,
      UPRIGHT.height - SILL.size,
      UPRIGHT.size
    );
    for (const x of [-1, 1]) {
      member("fore-aft-brace", v(0.05 * x, 2.3, z), v(x * (SILL.long / 2 - 0.25), SILL.size, z), 0.14);
      member("side-brace", v(0, 2.1, z), v(x * 1.9, SILL.size * 2, Math.sign(z) * (SILL.cross / 2 - 0.15)), 0.12);
    }
  }
  const pivot = v(0, AXLE_Y, 0);
  member("axle", v(0, AXLE_Y, -UPRIGHT.z - 0.2), v(0, AXLE_Y, UPRIGHT.z + 0.2), 0.08, iron, true);

  // The beam, at rest: long arm back and down, short arm forward and up.
  const toTip = v(-Math.cos(REST), -Math.sin(REST), 0);
  const toButt = toTip.clone().negate();
  const tip = pivot.clone().addScaledVector(toTip, LONG_ARM);
  const butt = pivot.clone().addScaledVector(toButt, SHORT_ARM);
  // Tapered from the butt to the tip.
  const beam = add("beam", taper, timber);
  beam.position.copy(butt).add(tip).multiplyScalar(0.5);
  beam.scale.set(BEAM.butt / 2, BEAM.length, BEAM.butt / 2);
  // The narrow end of the taper (+Y) points to the tip.
  beam.quaternion.setFromUnitVectors(Y, toTip);
  // Heavy butt block carrying the rope rings.
  const block = box("butt-block", 0, 0, 0, 0.36, 0.55, 0.36, darkWood);
  block.position.copy(butt).addScaledVector(toTip, 0.18);
  block.quaternion.setFromUnitVectors(Y, toButt);
  // Triangular frame on the butt end: two braces meet below the beam.
  const down = v(Math.sin(REST), -Math.cos(REST), 0);
  const apex = pivot.clone().addScaledVector(toButt, 0.15).addScaledVector(down, 0.95);
  member("triangle-brace", butt.clone().addScaledVector(toTip, 0.05), apex, 0.1);
  member("triangle-brace", pivot.clone().addScaledVector(toTip, 1.1), apex, 0.1);
  // Iron hook at the tip, set 40 degrees off the beam, and the sling laid back under the machine.
  const hookDir = toTip.clone().applyAxisAngle(v(0, 0, 1), (-40 * Math.PI) / 180);
  const hookEnd = tip.clone().addScaledVector(hookDir, HOOK);
  member("hook", tip, hookEnd, 0.012, iron, true);
  const pouch = v(tip.x + 0.95, 0.08, 0);
  const stoneRadius = 0.066;
  for (const dz of [-0.06, 0.06])
    cord("sling-cord", tip.clone().add(v(0, 0, dz * 0.3)), pouch.clone().add(v(-0.1, 0, dz)), 0.008);
  const pouchMesh = box("sling-pouch", pouch.x, pouch.y - 0.03, 0, 0.26, 0.02, 0.18, leather);
  pouchMesh.rotation.z = 0.05;
  const shot = add("stone", ball, stone);
  shot.position.set(pouch.x, pouch.y + stoneRadius - 0.02, 0);
  shot.scale.setScalar(stoneRadius);

  // Pulling ropes from the rings, laid out forward for the crew.
  const ropes = high ? RINGS : 4;
  for (let i = 0; i < ropes; i++) {
    const u = i / (ropes - 1);
    const ring = block.position.clone().add(v(0, -0.2, (u - 0.5) * 0.3));
    const hand = v(1.4 + 0.25 * Math.abs(u - 0.5), 1, (u - 0.5) * 1.8);
    const end = v(2.6 + 0.4 * Math.abs(u - 0.5), 0.02, (u - 0.5) * 2.2);
    cord("pull-rope", ring, hand, 0.016);
    cord("pull-rope", hand, end, 0.016);
    if (high) {
      const ringMesh = add("rope-ring", new THREE.TorusGeometry(0.05, 0.012, 4, 10), iron);
      ringMesh.position.copy(ring);
      for (const t of [0.3, 0.6]) {
        const knot = add("grip-knot", ball, hemp);
        knot.position.copy(hand.clone().lerp(end, t));
        knot.scale.setScalar(0.03);
      }
    }
  }

  if (high) {
    for (const s of [0.95, 1.15, 2.6, 2.8, 3.6, 3.8]) {
      const wind = add("rope-winding", new THREE.TorusGeometry(0.1 - s * 0.01, 0.014, 4, 10), hemp);
      wind.position.copy(pivot).addScaledVector(toTip, s);
      wind.quaternion.setFromUnitVectors(v(0, 0, 1), toTip);
    }
    for (const s of [0.02, 0.32]) {
      const band = box("butt-band", 0, 0, 0, 0.38, 0.03, 0.38, iron);
      band.position.copy(butt).addScaledVector(toTip, s);
      band.quaternion.setFromUnitVectors(Y, toButt);
    }
    for (const z of [-UPRIGHT.z, UPRIGHT.z]) {
      member("axle-bushing", v(0, AXLE_Y, z - 0.13), v(0, AXLE_Y, z + 0.13), 0.12, darkWood, true);
      box("upright-wedge", 0.13, AXLE_Y + 0.1, z, 0.05, 0.14, 0.12, darkWood);
      for (const x of [-1, 1])
        member("brace-peg", v(0.05 * x, 2.3, z - 0.1), v(0.05 * x, 2.3, z + 0.1), 0.02, darkWood, true);
    }
    const slingRing = add("sling-ring", new THREE.TorusGeometry(0.035, 0.008, 4, 10), iron);
    slingRing.position.copy(hookEnd);
    for (const [x, z] of [
      [1.0, -1.2],
      [1.15, -1.05],
      [1.05, -0.95]
    ]) {
      const spare = add("spare-stone", ball, stone);
      spare.position.set(x, stoneRadius, z);
      spare.scale.setScalar(stoneRadius);
    }
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

export function createTractionTrebuchet(quality: TractionTrebuchetQuality = "low"): TractionTrebuchetMeshes {
  const model = createTractionTrebuchetModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
