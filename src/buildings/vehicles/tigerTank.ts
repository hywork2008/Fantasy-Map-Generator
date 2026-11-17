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

export function createTigerTankModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "tiger-i-heavy-tank";
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
  const disc = new THREE.CylinderGeometry(1, 1, 1, 24);
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

  // Running gear: interleaved road wheels on alternating rows, sprocket forward, idler aft.
  for (const side of [-1, 1]) {
    const z = side * TRACK_Z;
    STATIONS.forEach((x, i) => {
      const offset = (i % 2 ? -0.17 : 0.17) * side;
      for (const row of [-0.11, 0.11]) wheel("road-wheel", x, WHEEL_Y, z + offset + row, WHEEL_RADIUS, 0.09, steel);
      wheel("road-wheel-hub", x, WHEEL_Y, z + offset, 0.11, 0.32, paintShade);
    });
    wheel("drive-sprocket", SPROCKET.x, SPROCKET.y, z, SPROCKET.r, 0.32, steel);
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      box(
        "sprocket-tooth",
        SPROCKET.x + Math.cos(a) * (SPROCKET.r + 0.03),
        SPROCKET.y + Math.sin(a) * (SPROCKET.r + 0.03),
        z,
        0.07,
        0.07,
        0.34,
        steel
      ).rotation.z = a;
    }
    wheel("idler", IDLER.x, IDLER.y, z, IDLER.r, 0.32, steel);
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
  rod("gun-barrel", v(TURRET.x + 1.12, GUN_Y, 0), v(MUZZLE_X - 0.42, GUN_Y, 0), 0.085);
  rod("muzzle-brake", v(MUZZLE_X - 0.42, GUN_Y, 0), v(MUZZLE_X, GUN_Y, 0), 0.14);
  box("muzzle-brake-baffle", MUZZLE_X - 0.21, GUN_Y, 0, 0.06, 0.2, 0.3, steel);
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

export function createTigerTank(): TigerTankMeshes {
  const model = createTigerTankModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
