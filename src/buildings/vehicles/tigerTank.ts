import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

/** German Tiger I heavy tank (Panzerkampfwagen VI Ausf. E), in meters; the gun faces positive X. */
export const TIGER_I = {
  author: "Claude Opus 5.5" as Author,
  name: "Tiger I heavy tank",
  /** Overall length with the gun forward; the hull alone is 6.316 m. */
  length: 8.45,
  hullLength: 6.316,
  /** Over the combat tracks. */
  width: 3.705,
  height: 3.0,
  highNote:
    "High tier: individual 130 mm track links with grousers wrapped over the sprocket, road-wheel tops and idler; rubber-tyred dished road wheels with bolted hub caps; twin toothed sprocket rings and a spoked idler; forward side-plate extensions with towing shackles, headlights, an armored driver's visor block, the ball-mount collar, tow cables, tools, engine-deck fan covers and grilles, exhaust guards and a jack; a tapered gun barrel with a slotted double-baffle muzzle brake, binocular-sight and coaxial machine-gun ports in the mantlet, pistol ports, an escape hatch, lifting eyes, a roof ventilator and three-tube smoke dischargers.",
  note: "Schematic exterior of the German Tiger I heavy tank (Panzerkampfwagen VI Ausf. E, 1942–1945): a slab-sided welded hull with fenders over 725 mm combat tracks, interleaved road wheels on eight torsion-bar stations a side, a front drive sprocket and rear idler, a horseshoe-shaped turret with the 8.8 cm KwK 36 L/56 gun and double-baffle muzzle brake, a commander's cupola and a hull machine-gun ball mount. Plain dark-yellow finish without markings. Overall dimensions follow the published figures; armor thickness, hatches, tools, track links and interior are simplified or omitted. Static model: the turret and gun do not traverse."
} as const;

export interface TigerTankMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

const HULL_REAR = -TIGER_I.hullLength / 2,
  HULL_FRONT = TIGER_I.hullLength / 2;
const TRACK_WIDTH = 0.725;
/** Track centerline, from the width over the tracks. */
const TRACK_Z = TIGER_I.width / 2 - TRACK_WIDTH / 2;
const TRACK_THICKNESS = 0.09;
const WHEEL_RADIUS = 0.4;
const WHEEL_Y = WHEEL_RADIUS + TRACK_THICKNESS;
/** Eight road-wheel stations; neighbours sit on alternate inner and outer rows to interleave. */
const STATIONS = Array.from({ length: 8 }, (_, i) => -2.1 + i * 0.6);
const SPROCKET = { x: 2.62, y: 0.86, r: 0.42 };
const IDLER = { x: -2.7, y: 0.8, r: 0.36 };
const DECK_Y = 1.88;
const TURRET = { x: 0.15, base: DECK_Y, height: 0.86 };
const GUN_Y = TURRET.base + 0.47;
const MUZZLE_X = HULL_REAR + TIGER_I.length;
/** Track link pitch of the 725 mm combat track. */
const LINK_PITCH = 0.13;

export type TigerQuality = "low" | "high";

/**
 * Centerline of one track loop in the XY plane, counterclockwise: along the ground, up over the sprocket,
 * back over the road-wheel tops, round the idler and down to the ground again.
 */
function trackLoop(): THREE.Vector2[] {
  const c = TRACK_THICKNESS / 2;
  const arc = (x: number, y: number, r: number, from: number, to: number) =>
    Array.from({ length: 10 }, (_, i) => {
      const a = from + ((to - from) * i) / 9;
      return new THREE.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r);
    });
  const top = WHEEL_Y + WHEEL_RADIUS + c;
  return [
    new THREE.Vector2(STATIONS[0], c),
    new THREE.Vector2(STATIONS.at(-1)!, c),
    ...arc(SPROCKET.x, SPROCKET.y, SPROCKET.r + c, -1.75, Math.PI / 2),
    new THREE.Vector2(STATIONS.at(-1)!, top),
    new THREE.Vector2(STATIONS[0], top),
    ...arc(IDLER.x, IDLER.y, IDLER.r + c, Math.PI / 2, Math.PI + 1.2),
    new THREE.Vector2(STATIONS[0], c)
  ];
}

export function createTigerTankModel(quality: TigerQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `tiger-i-heavy-tank-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const paint = new THREE.MeshLambertMaterial({ color: 0xb7a46b });
  const paintShade = new THREE.MeshLambertMaterial({ color: 0xa3915c });
  const steel = new THREE.MeshLambertMaterial({ color: 0x4a4c48 });
  const track = new THREE.MeshLambertMaterial({ color: 0x3a3833 });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x252423 });
  const vision = new THREE.MeshLambertMaterial({ color: 0x1d1f1f });
  const materials = [paint, paintShade, steel, track, rubber, vision];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, high ? 32 : 24);
  const eye = new THREE.TorusGeometry(1, 0.28, 6, 12);
  geometries.add(eye);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
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
    material: THREE.Material = paint
  ) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  /** Cylinder from a to b. */
  function rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material = steel) {
    const mesh = add(name, disc, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** A wheel lying in the XY plane, centred on z. */
  const wheel = (
    name: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    width: number,
    material: THREE.Material
  ) => rod(name, v(x, y, z - width / 2), v(x, y, z + width / 2), radius, material);
  /** A track run as a slab between two points in the XY plane. */
  function run(a: THREE.Vector2, b: THREE.Vector2, z: number) {
    const mesh = add("track-run", cube, track);
    const along = b.clone().sub(a);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
    mesh.scale.set(along.length(), TRACK_THICKNESS, TRACK_WIDTH);
    mesh.rotation.z = Math.atan2(along.y, along.x);
    return mesh;
  }

  // Lower hull between the tracks, and the superstructure that overhangs them as fenders.
  box("lower-hull", 0, 0.98, 0, HULL_FRONT - HULL_REAR - 0.3, 0.9, 2 * (TRACK_Z - TRACK_WIDTH / 2) - 0.04, paintShade);
  box("superstructure", -0.05, 1.66, 0, HULL_FRONT - HULL_REAR - 0.35, 0.44, TIGER_I.width - 0.12);
  // Near-vertical front plate (driver's plate) and the lower glacis below it.
  box("front-plate", HULL_FRONT - 0.32, 1.47, 0, 0.12, 0.82, TIGER_I.width - 0.22);
  const glacis = box("lower-glacis", HULL_FRONT - 0.36, 0.9, 0, 0.12, 0.62, 2 * (TRACK_Z - TRACK_WIDTH / 2) - 0.04);
  glacis.rotation.z = -0.55;
  box("rear-plate", HULL_REAR + 0.16, 1.2, 0, 0.1, 0.9, 2 * (TRACK_Z - TRACK_WIDTH / 2) - 0.04, paintShade);
  for (const side of [-1, 1]) {
    box("fender", 0, 1.9, side * (TIGER_I.width / 2 - 0.3), HULL_FRONT - HULL_REAR, 0.04, 0.58, paintShade);
    rod("exhaust-pipe", v(HULL_REAR + 0.1, 1.05, side * 0.55), v(HULL_REAR + 0.1, 1.6, side * 0.55), 0.09);
  }
  box("driver-visor", HULL_FRONT - 0.25, 1.62, -0.75, 0.04, 0.12, 0.42, vision);
  rod("hull-mg-ball", v(HULL_FRONT - 0.32, 1.6, 0.8), v(HULL_FRONT - 0.18, 1.6, 0.8), 0.13, paintShade);
  rod("hull-mg-barrel", v(HULL_FRONT - 0.18, 1.6, 0.8), v(HULL_FRONT + 0.12, 1.6, 0.8), 0.03);
  box("engine-deck-grille", HULL_REAR + 1.0, DECK_Y + 0.01, 0, 1.4, 0.03, 1.6, steel);
  for (const z of [-0.75, 0.75]) box("front-hatch", HULL_FRONT - 1.0, DECK_Y + 0.02, z, 0.55, 0.05, 0.55, paintShade);
  if (high) {
    const ring = (
      name: string,
      x: number,
      y: number,
      z: number,
      r: number,
      material: THREE.Material,
      facing: "x" | "y" | "z"
    ) => {
      const mesh = add(name, eye, material);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(r);
      if (facing === "x") mesh.rotation.y = Math.PI / 2;
      if (facing === "y") mesh.rotation.x = Math.PI / 2;
      return mesh;
    };
    for (const side of [-1, 1]) {
      // The side plates run forward past the front plate and carry the towing shackles.
      box("side-plate-extension", HULL_FRONT - 0.2, 1.22, side * 1.02, 0.4, 0.56, 0.08, paintShade);
      ring("towing-shackle", HULL_FRONT - 0.08, 1.02, side * 1.02, 0.09, steel, "z");
      rod("headlight", v(HULL_FRONT - 0.34, 1.98, side * 1.3), v(HULL_FRONT - 0.18, 1.98, side * 1.3), 0.08, steel);
      box("headlight-lens", HULL_FRONT - 0.175, 1.98, side * 1.3, 0.01, 0.1, 0.1, vision);
      // Tow cable along the superstructure side, with its eyes clipped at each end.
      const cableZ = side * (TIGER_I.width / 2 - 0.035);
      rod("tow-cable", v(HULL_REAR + 0.5, 1.62, cableZ), v(HULL_FRONT - 0.6, 1.62, cableZ), 0.022, steel);
      for (const x of [HULL_REAR + 0.45, HULL_FRONT - 0.55]) ring("tow-cable-eye", x, 1.62, cableZ, 0.06, steel, "z");
      // Sheet-metal exhaust guards over the vertical mufflers.
      box("exhaust-guard", HULL_REAR + 0.1, 1.72, side * 0.55, 0.18, 0.28, 0.24, paintShade);
      // Engine-deck fan covers and the radiator grilles above the side compartments.
      rod(
        "fan-cover",
        v(HULL_REAR + 1.15, DECK_Y, side * 0.45),
        v(HULL_REAR + 1.15, DECK_Y + 0.05, side * 0.45),
        0.32,
        paintShade
      );
      for (let i = 0; i < 6; i++)
        box("radiator-grille-bar", HULL_REAR + 0.55 + i * 0.22, DECK_Y + 0.03, side * 1.3, 0.04, 0.03, 0.7, steel);
    }
    box("driver-visor-block", HULL_FRONT - 0.24, 1.62, -0.75, 0.06, 0.24, 0.6, paintShade);
    box("driver-visor-slit", HULL_FRONT - 0.205, 1.64, -0.75, 0.01, 0.05, 0.36, vision);
    ring("mg-ball-collar", HULL_FRONT - 0.255, 1.6, 0.8, 0.16, paintShade, "x");
    box("engine-access-hatch", HULL_REAR + 1.15, DECK_Y + 0.03, 0, 0.7, 0.04, 0.6, paintShade);
    // Tools on the front deck and the jack on the rear plate.
    box("shovel-blade", HULL_FRONT - 0.65, DECK_Y + 0.03, 0, 0.3, 0.02, 0.24, steel);
    rod(
      "shovel-handle",
      v(HULL_FRONT - 0.8, DECK_Y + 0.04, 0),
      v(HULL_FRONT - 1.6, DECK_Y + 0.04, 0),
      0.02,
      paintShade
    );
    rod(
      "axe-haft",
      v(HULL_FRONT - 0.55, DECK_Y + 0.04, 0.3),
      v(HULL_FRONT - 1.4, DECK_Y + 0.04, 0.3),
      0.02,
      paintShade
    );
    box("axe-head", HULL_FRONT - 0.55, DECK_Y + 0.04, 0.36, 0.06, 0.03, 0.14, steel);
    rod("rear-jack", v(HULL_REAR + 0.23, 1.25, -0.2), v(HULL_REAR + 0.23, 1.25, 0.25), 0.07, steel);
  }

  // Running gear: interleaved road wheels on alternating rows, sprocket forward, idler aft.
  for (const side of [-1, 1]) {
    const z = side * TRACK_Z;
    STATIONS.forEach((x, i) => {
      const offset = (i % 2 ? -0.17 : 0.17) * side;
      for (const row of [-0.11, 0.11]) {
        if (!high) {
          wheel("road-wheel", x, WHEEL_Y, z + offset + row, WHEEL_RADIUS, 0.09, steel);
          continue;
        }
        // A steel dish inside a solid rubber tyre.
        wheel("road-wheel", x, WHEEL_Y, z + offset + row, WHEEL_RADIUS, 0.09, rubber);
        wheel("road-wheel-dish", x, WHEEL_Y, z + offset + row, WHEEL_RADIUS - 0.06, 0.095, steel);
      }
      wheel("road-wheel-hub", x, WHEEL_Y, z + offset, 0.11, 0.32, paintShade);
      if (high && offset * side > 0) {
        const face = z + offset + side * 0.16;
        wheel("hub-cap", x, WHEEL_Y, face, 0.13, 0.03, paintShade);
        for (let b = 0; b < 8; b++) {
          const a = (b * Math.PI) / 4;
          wheel("hub-bolt", x + Math.cos(a) * 0.2, WHEEL_Y + Math.sin(a) * 0.2, face - side * 0.01, 0.018, 0.02, steel);
        }
      }
    });
    wheel("drive-sprocket", SPROCKET.x, SPROCKET.y, z, SPROCKET.r, high ? 0.2 : 0.32, steel);
    // Low: one row of teeth across the hub. High: two toothed rings that engage the link ends.
    for (const ringZ of high ? [-0.12, 0.12] : [0])
      for (let i = 0; i < (high ? 18 : 9); i++) {
        const a = (i * Math.PI * 2) / (high ? 18 : 9);
        box(
          "sprocket-tooth",
          SPROCKET.x + Math.cos(a) * (SPROCKET.r + 0.025),
          SPROCKET.y + Math.sin(a) * (SPROCKET.r + 0.025),
          z + ringZ,
          high ? 0.05 : 0.07,
          0.05,
          high ? 0.08 : 0.34,
          steel
        ).rotation.z = a;
      }
    if (high) {
      wheel("sprocket-ring", SPROCKET.x, SPROCKET.y, z - 0.12, SPROCKET.r, 0.08, steel);
      wheel("sprocket-ring", SPROCKET.x, SPROCKET.y, z + 0.12, SPROCKET.r, 0.08, steel);
      wheel("final-drive-cover", SPROCKET.x, SPROCKET.y, z - side * 0.2, 0.22, 0.08, paintShade);
    }
    wheel("idler", IDLER.x, IDLER.y, z, high ? IDLER.r - 0.04 : IDLER.r, 0.32, steel);
    if (high) {
      for (const rimZ of [-0.13, 0.13]) wheel("idler-rim", IDLER.x, IDLER.y, z + rimZ, IDLER.r, 0.06, steel);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        box(
          "idler-spoke",
          IDLER.x + Math.cos(a) * 0.17,
          IDLER.y + Math.sin(a) * 0.17,
          z + side * 0.165,
          0.26,
          0.05,
          0.02,
          paintShade
        ).rotation.z = a;
      }
    }
    if (high) {
      // Individual links at the 130 mm pitch, each with a grouser on its outer face.
      const loop = trackLoop();
      let carry = 0;
      for (let i = 1; i < loop.length; i++) {
        const a = loop[i - 1],
          b = loop[i];
        const along = b.clone().sub(a),
          length = along.length();
        if (!length) continue;
        const t = along.clone().divideScalar(length),
          n = new THREE.Vector2(t.y, -t.x);
        for (let d = carry; d < length; d += LINK_PITCH) {
          const p = a.clone().addScaledVector(t, d);
          const angle = Math.atan2(t.y, t.x);
          const body = p.clone().addScaledVector(n, -0.015);
          box("track-link", body.x, body.y, z, LINK_PITCH - 0.012, 0.06, TRACK_WIDTH, track).rotation.z = angle;
          const grouser = p.clone().addScaledVector(n, 0.03);
          box("track-grouser", grouser.x, grouser.y, z, 0.035, 0.03, TRACK_WIDTH - 0.04, track).rotation.z = angle;
          carry = d + LINK_PITCH - length;
        }
      }
    } else {
      // The track wraps the bottom of the road wheels, the sprocket and idler, and returns over the wheels.
      const groundY = TRACK_THICKNESS / 2;
      const topY = WHEEL_Y + WHEEL_RADIUS + TRACK_THICKNESS / 2;
      const first = STATIONS[0],
        last = STATIONS.at(-1)!;
      run(new THREE.Vector2(first, groundY), new THREE.Vector2(last, groundY), z);
      run(new THREE.Vector2(last, groundY), new THREE.Vector2(SPROCKET.x + 0.1, SPROCKET.y - SPROCKET.r + 0.05), z);
      run(
        new THREE.Vector2(SPROCKET.x + SPROCKET.r, SPROCKET.y),
        new THREE.Vector2(SPROCKET.x, SPROCKET.y + SPROCKET.r + 0.04),
        z
      );
      run(new THREE.Vector2(SPROCKET.x, SPROCKET.y + SPROCKET.r + 0.04), new THREE.Vector2(IDLER.x, topY), z);
      run(new THREE.Vector2(IDLER.x, topY), new THREE.Vector2(IDLER.x - IDLER.r - 0.04, IDLER.y), z);
      run(new THREE.Vector2(IDLER.x - IDLER.r - 0.04, IDLER.y), new THREE.Vector2(first, groundY), z);
    }
  }

  // Turret: a rounded horseshoe wall around a flat roof, with the gun mantlet on the flat front.
  const turretShape = new THREE.Shape();
  turretShape.moveTo(0.95, -1.05);
  turretShape.lineTo(0.95, 1.05);
  turretShape.absarc(-0.35, 0, 1.05, Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25, false);
  turretShape.lineTo(-0.35 + 1.05 * Math.cos(-Math.PI / 2 + 0.25), -1.05);
  turretShape.closePath();
  const turretGeometry = new THREE.ExtrudeGeometry(turretShape, {
    depth: TURRET.height,
    bevelEnabled: false,
    curveSegments: 20
  });
  turretGeometry.rotateX(-Math.PI / 2);
  const turret = add("turret", turretGeometry, paint);
  turret.position.set(TURRET.x, TURRET.base, 0);
  rod("turret-ring-collar", v(TURRET.x - 0.2, DECK_Y - 0.02, 0), v(TURRET.x - 0.2, DECK_Y + 0.06, 0), 1.0, paintShade);
  box("gun-mantlet", TURRET.x + 1.03, GUN_Y, 0, 0.22, 0.72, 1.45, paintShade);
  if (high) {
    // The barrel steps down from its thicker breech end; the brake has two slotted chambers.
    rod("gun-barrel", v(TURRET.x + 1.12, GUN_Y, 0), v(TURRET.x + 2.4, GUN_Y, 0), 0.1);
    rod("gun-barrel", v(TURRET.x + 2.4, GUN_Y, 0), v(MUZZLE_X - 0.42, GUN_Y, 0), 0.08);
    rod("barrel-step", v(TURRET.x + 2.36, GUN_Y, 0), v(TURRET.x + 2.44, GUN_Y, 0), 0.105);
    rod("muzzle-brake", v(MUZZLE_X - 0.42, GUN_Y, 0), v(MUZZLE_X, GUN_Y, 0), 0.14);
    for (const x of [MUZZLE_X - 0.3, MUZZLE_X - 0.12])
      for (const side of [-1, 1]) box("muzzle-brake-slot", x, GUN_Y, side * 0.125, 0.1, 0.16, 0.04, vision);
    box("sight-aperture", TURRET.x + 1.145, GUN_Y + 0.14, 0.32, 0.01, 0.07, 0.07, vision);
    box("sight-aperture", TURRET.x + 1.145, GUN_Y + 0.14, 0.44, 0.01, 0.07, 0.07, vision);
    rod(
      "coaxial-mg-port",
      v(TURRET.x + 1.12, GUN_Y + 0.05, -0.36),
      v(TURRET.x + 1.16, GUN_Y + 0.05, -0.36),
      0.04,
      vision
    );
    for (const y of [GUN_Y - 0.3, GUN_Y + 0.3])
      for (const zz of [-0.62, -0.31, 0.31, 0.62])
        rod("mantlet-bolt", v(TURRET.x + 1.14, y, zz), v(TURRET.x + 1.16, y, zz), 0.02, steel);
  } else {
    rod("gun-barrel", v(TURRET.x + 1.12, GUN_Y, 0), v(MUZZLE_X - 0.42, GUN_Y, 0), 0.085);
    rod("muzzle-brake", v(MUZZLE_X - 0.42, GUN_Y, 0), v(MUZZLE_X, GUN_Y, 0), 0.14);
    box("muzzle-brake-baffle", MUZZLE_X - 0.21, GUN_Y, 0, 0.06, 0.2, 0.3, steel);
  }
  box("gunner-sight", TURRET.x + 1.15, GUN_Y + 0.1, 0.38, 0.06, 0.08, 0.1, vision);
  // Commander's cupola at the rear left of the roof, with vision blocks round its wall.
  const cupola = { x: TURRET.x - 0.75, z: -0.55, y: TURRET.base + TURRET.height };
  rod(
    "commander-cupola",
    v(cupola.x, cupola.y, cupola.z),
    v(cupola.x, TIGER_I.height - 0.04, cupola.z),
    0.33,
    paintShade
  );
  rod("cupola-hatch", v(cupola.x, TIGER_I.height - 0.04, cupola.z), v(cupola.x, TIGER_I.height, cupola.z), 0.3, paint);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    box(
      "cupola-vision-block",
      cupola.x + Math.cos(a) * 0.33,
      cupola.y + 0.12,
      cupola.z + Math.sin(a) * 0.33,
      0.04,
      0.07,
      0.12,
      vision
    ).rotation.y = -a;
  }
  box("loader-hatch", TURRET.x + 0.1, cupola.y + 0.02, 0.5, 0.5, 0.04, 0.45, paintShade);
  if (high) {
    // Three-tube smoke dischargers on each front corner, angled forward and up.
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const base = v(TURRET.x + 0.82, TURRET.base + 0.62 + i * 0.07, side * (0.97 - i * 0.05));
        rod("smoke-discharger", base, base.clone().add(v(0.15, 0.1, side * 0.04)), 0.035, steel);
      }
    // Pistol ports on both flanks, an escape hatch on the right rear and three lifting eyes on the roof.
    for (const side of [-1, 1])
      rod(
        "pistol-port",
        v(TURRET.x - 0.55, TURRET.base + 0.45, side * 1.0),
        v(TURRET.x - 0.55, TURRET.base + 0.45, side * 1.05),
        0.06,
        paintShade
      );
    const hatch = box("escape-hatch", TURRET.x - 1.05, TURRET.base + 0.45, 0.72, 0.05, 0.5, 0.45, paintShade);
    hatch.rotation.y = -0.85;
    for (const [x, zz] of [
      [TURRET.x + 0.6, 0.75],
      [TURRET.x + 0.6, -0.75],
      [TURRET.x - 1.1, 0]
    ]) {
      const ringMesh = add("lifting-eye", eye, steel);
      ringMesh.position.set(x, TURRET.base + TURRET.height + 0.05, zz);
      ringMesh.scale.setScalar(0.05);
    }
    rod(
      "roof-ventilator",
      v(TURRET.x + 0.4, TURRET.base + TURRET.height, 0),
      v(TURRET.x + 0.4, TURRET.base + TURRET.height + 0.07, 0),
      0.12,
      paintShade
    );
    box("cupola-hatch-hinge", cupola.x - 0.3, TIGER_I.height - 0.03, cupola.z, 0.06, 0.05, 0.16, steel);
    box("stowage-bin-lid", TURRET.x - 1.55, TURRET.base + 0.68, 0, 0.36, 0.03, 1.34, paint);
  } else
    for (const side of [-1, 1])
      box("smoke-discharger", TURRET.x + 0.85, TURRET.base + 0.75, side * 0.95, 0.1, 0.1, 0.12, steel);
  box("turret-stowage-bin", TURRET.x - 1.55, TURRET.base + 0.42, 0, 0.32, 0.5, 1.3, paintShade);

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createTigerTank(quality: TigerQuality = "low"): TigerTankMeshes {
  const model = createTigerTankModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
