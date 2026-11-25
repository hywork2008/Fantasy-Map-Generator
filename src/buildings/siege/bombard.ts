import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type BombardQuality = "low" | "high";

/** Mons Meg (Mons, 1449): 4.06 m overall, a 2.80 m barrel of 25 staves, 0.51 m (20 in) bore, about 6.6 t. */
const GUN = { length: 4.06, barrel: 2.8, bore: 0.51, staves: 25, mass: 6600 };
const CHAMBER = GUN.length - GUN.barrel;
/** Wrought iron, kg/m³. */
const IRON = 7750;
/** The chamber's bore and outside diameter are not published; proportioned from photographs. */
const CHAMBER_BORE = 0.25;
const CHAMBER_OUTER = 0.62;
/** The barrel's outside diameter follows from the recorded mass once the chamber is accounted for. */
const BARREL_OUTER = (() => {
  const chamberVolume = Math.PI * ((CHAMBER_OUTER / 2) ** 2 - (CHAMBER_BORE / 2) ** 2) * CHAMBER;
  const barrelVolume = GUN.mass / IRON - chamberVolume;
  return 2 * Math.sqrt(barrelVolume / (Math.PI * GUN.barrel) + (GUN.bore / 2) ** 2);
})();
/** Granite, kg/m³; a ball to fit the bore weighs about the recorded 175 kg. */
const GRANITE = 2650;
const BALL_RADIUS = GUN.bore / 2 - 0.006;
const AXIS_Y = 1.05;
/** A slight elevation, set with wedges under the breech. */
const ELEVATION = (3 * Math.PI) / 180;
const BREECH_X = -GUN.length / 2;
const MUZZLE_X = GUN.length / 2;

/**
 * A great wrought-iron bombard laid in a siege emplacement, after Mons Meg, in meters: ground at y = 0, muzzle toward
 * positive X. The gun lies in a timber bed (Lade) against a recoil block, behind a pivoting plank shield shown raised
 * for firing.
 */
export const BOMBARD = {
  author: "Claude Opus 5.5" as Author,
  name: "Great bombard in a siege emplacement",
  gunLength: GUN.length,
  barrelLength: GUN.barrel,
  bore: GUN.bore,
  staves: GUN.staves,
  barrelOuter: BARREL_OUTER,
  chamberOuter: CHAMBER_OUTER,
  ballRadius: BALL_RADIUS,
  ballMass: GRANITE * (4 / 3) * Math.PI * BALL_RADIUS ** 3,
  axisY: AXIS_Y,
  elevation: ELEVATION,
  note: "Schematic great bombard of the 15th century in its siege emplacement. The gun follows Mons Meg, tested at Mons for Philip the Good of Burgundy in 1449 and made by his gunmaker Jehan Cambier: 4.06 m overall, a 2.80 m barrel of 25 longitudinal wrought-iron staves held by shrunk-on hoops, a separately forged powder chamber screwed into the breech, a 20-in (510 mm) bore and about 6.6 t, firing granite balls of about 175 kg. The barrel's outside diameter is worked out from that mass; the chamber's diameter and bore are proportioned. Such guns were too heavy for wheeled carriages in the field: they were hauled on ox wagons, craned onto a bed of beams (Lade) laid on the ground, wedged against timbers that took the recoil and had to be renewed after shots, raised with wedges, and fired from behind a pivoting plank shield lifted only to shoot. A great bombard fired one to seven shots a day at ranges under about 500 m. Mons Meg itself first lay on a plain box, gained wheels in 1497 and now sits on a 1934 replica of a carriage of about 1500. The layout of the bed, recoil block and shield is interpreted from these descriptions.",
  highNote:
    "High tier: the individual hoops along the barrel and chamber, the 25 stave joints at the muzzle, the sockets for the turning bars round the chamber, iron straps and rope lashings holding the gun in its bed, the elevation wedges, the plank joints, iron hinges and prop of the shield, the driven stakes behind the recoil block, a stack of spare balls and the rammer and powder ladle."
} as const;

export interface BombardMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createBombardModel(quality: BombardQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `bombard-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wroughtIron = new THREE.MeshLambertMaterial({ color: 0x3c3a37 });
  const hoopIron = new THREE.MeshLambertMaterial({ color: 0x2c2b29 });
  const oak = new THREE.MeshLambertMaterial({ color: 0x6f5034 });
  const darkOak = new THREE.MeshLambertMaterial({ color: 0x4f3826 });
  const plank = new THREE.MeshLambertMaterial({ color: 0x8a6a46, side: THREE.DoubleSide });
  const hemp = new THREE.MeshLambertMaterial({ color: 0xb59f70 });
  const granite = new THREE.MeshLambertMaterial({ color: 0x9c968b, flatShading: true });
  const materials = [wroughtIron, hoopIron, oak, darkOak, plank, hemp, granite];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, high ? 12 : 8);
  const ball = new THREE.IcosahedronGeometry(1, high ? 2 : 1);
  geometries.add(cube).add(rod).add(ball);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const Y = v(0, 1, 0);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = group) {
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
    material: THREE.Material = oak,
    parent: THREE.Object3D = group
  ) {
    const mesh = add(name, cube, material, parent);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function member(
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    size: number,
    material: THREE.Material = oak,
    round = false
  ) {
    const mesh = add(name, round ? rod : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(size, a.distanceTo(b), size);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }

  // The gun: barrel and chamber turned about its own axis, laid along X with a slight elevation.
  const gun = new THREE.Group();
  gun.name = "gun";
  gun.position.set(0, AXIS_Y, 0);
  gun.rotation.z = ELEVATION;
  group.add(gun);
  const R = BARREL_OUTER / 2,
    rc = CHAMBER_OUTER / 2,
    rb = GUN.bore / 2;
  const joint = BREECH_X + CHAMBER;
  const profile = [
    new THREE.Vector2(0, BREECH_X),
    new THREE.Vector2(rc - 0.03, BREECH_X),
    new THREE.Vector2(rc, BREECH_X + 0.04),
    new THREE.Vector2(rc, joint),
    new THREE.Vector2(R, joint),
    new THREE.Vector2(R, MUZZLE_X),
    new THREE.Vector2(rb, MUZZLE_X),
    new THREE.Vector2(rb, joint + 0.08),
    new THREE.Vector2(CHAMBER_BORE / 2, joint + 0.02),
    new THREE.Vector2(0, joint + 0.02)
  ];
  const body = new THREE.LatheGeometry(profile, high ? 32 : 16);
  // Lathe turns about Y; lay it along X.
  body.rotateZ(-Math.PI / 2);
  add("barrel-and-chamber", body, wroughtIron, gun);
  const hoop = (x: number, radius: number, width: number) => {
    const mesh = add("hoop", rod, hoopIron, gun);
    mesh.position.set(x, 0, 0);
    mesh.rotation.z = Math.PI / 2;
    mesh.scale.set(radius, width, radius);
  };
  if (high) {
    for (let x = joint + 0.06; x < MUZZLE_X - 0.05; x += 0.1) hoop(x, R + 0.012, 0.08);
    for (let x = BREECH_X + 0.1; x < joint - 0.05; x += 0.12) hoop(x, rc + 0.01, 0.09);
    // Stave joints at the muzzle face.
    for (let i = 0; i < GUN.staves; i++) {
      const a = (i / GUN.staves) * Math.PI * 2;
      const seam = box("stave-joint", MUZZLE_X + 0.002, 0, 0, 0.004, R - rb, 0.008, hoopIron, gun);
      seam.position.set(MUZZLE_X + 0.002, Math.cos(a) * (rb + R) * 0.5, Math.sin(a) * (rb + R) * 0.5);
      seam.rotation.x = -a;
    }
    // Sockets for the bars that turned the chamber home.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const socket = box(
        "turning-socket",
        BREECH_X + 0.35,
        Math.cos(a) * rc,
        Math.sin(a) * rc,
        0.12,
        0.03,
        0.08,
        darkOak,
        gun
      );
      socket.rotation.x = -a;
    }
  } else {
    for (const x of [joint + 0.1, (joint + MUZZLE_X) / 2, MUZZLE_X - 0.12]) hoop(x, R + 0.012, 0.16);
    hoop(BREECH_X + 0.25, rc + 0.01, 0.16);
  }

  // The bed (Lade): two long beams on sleepers, with saddles under the gun.
  const bed = { z: 0.36, size: 0.34 };
  for (const x of [-1.9, 0, 1.9]) box("sleeper", x, 0.11, 0, 0.3, 0.22, 1.5, darkOak);
  // The bed stops short of the breech so the recoil block bears on the gun alone.
  const bedAft = BREECH_X - 0.05,
    bedFore = MUZZLE_X + 0.27;
  for (const z of [-bed.z, bed.z])
    box("bed-beam", (bedAft + bedFore) / 2, 0.22 + bed.size / 2, z, bedFore - bedAft, bed.size, bed.size, oak);
  const bedTop = 0.22 + bed.size;
  const axisAt = (x: number) => AXIS_Y + x * Math.tan(ELEVATION);
  for (const x of [-1.2, 0.5, 1.6]) {
    const r = x < joint ? rc : R;
    const height = axisAt(x) - r - bedTop + 0.02;
    box("saddle", x, bedTop + height / 2, 0, 0.3, height, 2 * bed.z + bed.size, oak);
  }
  // Elevation wedges under the breech.
  const wedgeTop = axisAt(BREECH_X + 0.3) - rc;
  box("elevation-wedge", BREECH_X + 0.3, (bedTop + wedgeTop) / 2, 0, 0.36, wedgeTop - bedTop, 0.5, darkOak);

  // Recoil block: beams stacked across behind the breech, against posts and raking shores.
  const blockX = BREECH_X - 0.25;
  for (let k = 0; k < 3; k++) box("recoil-beam", blockX, 0.2 + k * 0.32, 0, 0.3, 0.3, 1.9, darkOak);
  for (const z of [-0.75, 0.75]) {
    box("recoil-post", blockX - 0.3, 0.6, z, 0.3, 1.2, 0.3, oak);
    member("recoil-shore", v(blockX - 0.4, 1.05, z), v(blockX - 1.6, 0.05, z), 0.24);
    if (high) {
      member("stake", v(blockX - 1.75, -0.02, z), v(blockX - 1.75, 0.55, z), 0.09, darkOak, true);
      member("stake", v(blockX - 0.55, -0.02, z), v(blockX - 0.55, 0.45, z), 0.09, darkOak, true);
    }
  }

  // Pivoting plank shield before the muzzle, raised for the shot.
  const shield = { x: MUZZLE_X + 0.9, post: 3.2, z: 1.45, width: 2.6, height: 2.5, raised: (68 * Math.PI) / 180 };
  for (const z of [-shield.z, shield.z]) {
    box("shield-post", shield.x, shield.post / 2, z, 0.26, shield.post, 0.26, oak);
    member("shield-post-brace", v(shield.x - 0.05, 1.6, z), v(shield.x - 1.1, 0.05, z * 1.35), 0.16);
  }
  const pivotY = shield.post - 0.2;
  member("shield-axle", v(shield.x, pivotY, -shield.z - 0.2), v(shield.x, pivotY, shield.z + 0.2), 0.08, oak, true);
  const leaf = new THREE.Group();
  leaf.name = "shield-leaf";
  leaf.position.set(shield.x, pivotY, 0);
  // Hangs down from the axle; raising swings the foot out toward the target.
  leaf.rotation.z = shield.raised;
  group.add(leaf);
  const planks = high ? 6 : 1;
  for (let i = 0; i < planks; i++) {
    const w = (shield.width - 0.12) / planks;
    box(
      "shield-plank",
      0.08,
      -shield.height / 2,
      -shield.width / 2 + 0.06 + w * (i + 0.5),
      0.1,
      shield.height,
      w - (high ? 0.01 : 0),
      plank,
      leaf
    );
  }
  for (const y of [-0.4, -shield.height + 0.4])
    box("shield-batten", 0, y, 0, 0.08, 0.16, shield.width - 0.1, oak, leaf);

  // A ball ready to load.
  const shot = add("stone-ball", ball, granite);
  shot.position.set(MUZZLE_X + 0.15, BALL_RADIUS, 1.25);
  shot.scale.setScalar(BALL_RADIUS);

  if (high) {
    for (const x of [-1.2, 0.5, 1.6]) {
      const r = x < joint ? rc : R;
      for (const z of [-1, 1])
        member(
          "lashing",
          v(x, axisAt(x) + r * 0.95, z * 0.05),
          v(x, bedTop - 0.02, z * (bed.z + bed.size / 2)),
          0.02,
          hemp,
          true
        );
      member(
        "bed-strap",
        v(x - 0.18, bedTop + 0.01, -bed.z - 0.2),
        v(x - 0.18, bedTop + 0.01, bed.z + 0.2),
        0.02,
        hoopIron,
        true
      );
    }
    for (const [dx, dz] of [
      [1.6, -1.0],
      [2.15, -1.0],
      [1.87, -0.55]
    ]) {
      const spare = add("spare-ball", ball, granite);
      spare.position.set(MUZZLE_X + dx, BALL_RADIUS, dz);
      spare.scale.setScalar(BALL_RADIUS);
    }
    member("rammer", v(BREECH_X, 0.08, 1.15), v(MUZZLE_X - 0.3, 0.08, 1.15), 0.04, oak, true);
    member("powder-ladle", v(BREECH_X + 0.2, 0.08, -1.1), v(MUZZLE_X - 0.6, 0.08, -1.1), 0.035, oak, true);
    for (const z of [-shield.width / 2 + 0.2, shield.width / 2 - 0.2])
      box("shield-hinge", 0.02, -0.12, z, 0.14, 0.3, 0.06, hoopIron, leaf);
    const propFoot = v(shield.x + 2.1, 0.02, 0);
    const propTop = new THREE.Vector3(0.1, -shield.height + 0.3, 0).applyEuler(leaf.rotation).add(leaf.position);
    member("shield-prop", propFoot, propTop, 0.07, oak, true);
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

export function createBombard(quality: BombardQuality = "low"): BombardMeshes {
  const model = createBombardModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
