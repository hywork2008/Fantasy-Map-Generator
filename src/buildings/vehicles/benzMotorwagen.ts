import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

/** The Benz Patent-Motorwagen Nr. 1 standing on its three wheels, in meters; the front wheel faces positive X. */
export const BENZ_MOTORWAGEN = {
  author: "Claude Opus 5.5" as Author,
  name: "Benz Patent-Motorwagen (1886)",
  /** Front of the front tyre to the back of the flywheel. */
  length: 2.7,
  /** Across the rear hub caps. */
  width: 1.4,
  /** To the top of the steering tiller. */
  height: 1.45,
  wheelbase: 1.45,
  /** Outer radii of the solid rubber tyres; proportioned from photographs of the original. */
  frontWheelRadius: 0.37,
  rearWheelRadius: 0.56,
  /** Rear wheel centre planes either side of the centre line. */
  rearTrack: 1.24,
  highNote:
    "High tier: tangent wire spokes laced from both hub flanges; the hollow steel-tube frame with its cross tubes and the elliptic springs over the rear axle; the slatted wooden footboard; the upholstered bench with its backrest; the horizontal single cylinder with its finned head, the evaporative water jacket and the tank above it, the vertical crankshaft, the surface carburettor and the exposed valve gear rod; the quarter-turn belt from the crankshaft pulley to the fast and loose pulleys on the countershaft, the differential between them and the band brake beside them; the chain sprockets and both chains to the rear wheels; the rack and pinion from the tiller to the front fork; the brake and belt-shift lever beside the seat.",
  note: "Schematic exterior of the Benz Patent-Motorwagen Nr. 1 built by Carl Benz in Mannheim (Germany) in 1885 and patented on 29 January 1886 (DRP 37435), generally regarded as the first practical automobile; Bertha Benz's drive from Mannheim to Pforzheim in 1888 (in a later Model III) made it known. A tricycle of bent steel tubing: a single front wheel in a fork steered through a rack and pinion from a vertical tiller, a bench seat for two over the countershaft, and behind it a horizontal 954 cc single-cylinder four-stroke engine of about 2/3 hp with a vertical crankshaft and a large horizontal flywheel, cooled by evaporation from a water jacket. A flat belt drives a countershaft with a differential, and a chain runs to each rear wheel; there is no reverse. Length, width, height and wheelbase follow the published figures; wheel diameters, track, seat, engine and drive positions are proportioned from photographs and drawings of the original and its replicas. The driver, the lamps and the fuel lines are omitted. Static model: the wheels, belt and chains do not turn."
} as const;

export interface BenzMotorwagenMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export type BenzMotorwagenQuality = "low" | "high";

const FRONT_R = BENZ_MOTORWAGEN.frontWheelRadius;
const REAR_R = BENZ_MOTORWAGEN.rearWheelRadius;
const FRONT_X = BENZ_MOTORWAGEN.length / 2 - FRONT_R;
const REAR_X = FRONT_X - BENZ_MOTORWAGEN.wheelbase;
const REAR_Z = BENZ_MOTORWAGEN.rearTrack / 2;
const HUB_CAP = BENZ_MOTORWAGEN.width / 2 - REAR_Z;
const TYRE = 0.022;
/** Side rails of the frame and their height. */
const RAIL = { z: 0.38, y: 0.68, front: 0.5, back: -1.2 };
const HEAD = { x: FRONT_X, bottom: 0.48, top: 0.74 };
const COUNTERSHAFT = { x: -0.05, y: 0.58, sprocketZ: REAR_Z - 0.09 };
const FLYWHEEL = { r: 0.33, y: 0.52, t: 0.05 };
const FLYWHEEL_X = -BENZ_MOTORWAGEN.length / 2 + FLYWHEEL.r;
const CYLINDER = { y: 0.86, front: -0.5, back: -0.92, r: 0.085 };
const TILLER = { x: 0.32, z: 0.3, grip: 0.16 };
const SEAT = { x: -0.12, depth: 0.46, half: 0.42, y: 0.82 };

export function createBenzMotorwagenModel(quality: BenzMotorwagenQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `benz-motorwagen-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const rubber = new THREE.MeshLambertMaterial({ color: 0x2a2826 });
  const tube = new THREE.MeshLambertMaterial({ color: 0x2f3337 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x7c8084 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xb08d47 });
  const copper = new THREE.MeshLambertMaterial({ color: 0x9a6b3e });
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a33 });
  const leather = new THREE.MeshLambertMaterial({ color: 0x3e2a1f });
  const belt = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const chain = new THREE.MeshLambertMaterial({ color: 0x1f1e1d });
  const materials = [rubber, tube, steel, brass, copper, wood, leather, belt, chain];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, high ? 24 : 12);
  const thin = new THREE.CylinderGeometry(1, 1, 1, 6);
  geometries.add(cube).add(disc).add(thin);
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
  function box(name: string, centre: THREE.Vector3, w: number, h: number, d: number, material: THREE.Material) {
    const mesh = add(name, cube, material);
    mesh.position.copy(centre);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  /** Cylinder from a to b. */
  function rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = tube, geometry = disc) {
    const mesh = add(name, geometry, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }
  /** A tube through a polyline. */
  const pipe = (name: string, points: THREE.Vector3[], radius: number, material = tube) => {
    for (let i = 0; i + 1 < points.length; i++) rod(name, points[i], points[i + 1], radius, material);
  };
  /** A wheel turning about Z: solid tyre, steel rim, hub and wire spokes. */
  function wheel(prefix: string, centre: THREE.Vector3, outer: number, hubHalf: number, spokes: number) {
    const tyre = add(
      `${prefix}-tyre`,
      new THREE.TorusGeometry(outer - TYRE, TYRE, high ? 10 : 6, high ? 48 : 24),
      rubber
    );
    tyre.position.copy(centre);
    const rimR = outer - 2 * TYRE - 0.006;
    const rim = add(`${prefix}-rim`, new THREE.TorusGeometry(rimR, 0.01, 6, high ? 48 : 24), steel);
    rim.position.copy(centre);
    rod(`${prefix}-hub`, centre.clone().add(v(0, 0, -hubHalf)), centre.clone().add(v(0, 0, hubHalf)), 0.04, steel);
    const count = high ? spokes : 8;
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / count;
      const flange = high ? (i % 2 ? 1 : -1) * Math.min(hubHalf, 0.05) : 0;
      // Tangent lacing on the high tier: each spoke leaves the hub ahead of its rim point.
      const lead = high ? (i % 4 < 2 ? 0.5 : -0.5) : 0;
      const hubPoint = centre.clone().add(v(0.035 * Math.cos(a + lead), 0.035 * Math.sin(a + lead), flange));
      const rimPoint = centre.clone().add(v(rimR * Math.cos(a), rimR * Math.sin(a), 0));
      rod("spoke", hubPoint, rimPoint, high ? 0.0035 : 0.007, steel, thin);
    }
  }

  // Wheels: a small front wheel in a fork, two large rear wheels on a dead axle.
  const front = v(FRONT_X, FRONT_R, 0);
  wheel("front", front, FRONT_R, 0.06, 24);
  for (const side of [-1, 1]) {
    const centre = v(REAR_X, REAR_R, side * REAR_Z);
    wheel("rear", centre, REAR_R, 0.06, 32);
    rod("hub-cap", centre.clone().add(v(0, 0, side * 0.06)), v(REAR_X, REAR_R, side * (REAR_Z + HUB_CAP)), 0.03, brass);
  }
  rod("rear-axle", v(REAR_X, REAR_R, -REAR_Z + 0.06), v(REAR_X, REAR_R, REAR_Z - 0.06), 0.02, steel);
  for (const side of [-1, 1])
    rod("front-fork", v(FRONT_X, FRONT_R, side * 0.07), v(FRONT_X, HEAD.bottom, side * 0.04), 0.012);
  rod("fork-crown", v(FRONT_X, HEAD.bottom, -0.05), v(FRONT_X, HEAD.bottom, 0.05), 0.016);
  rod("head-tube", v(HEAD.x, HEAD.bottom, 0), v(HEAD.x, HEAD.top, 0), 0.022);

  // Frame: two tubes sweep back from the head tube into the side rails, closed by cross tubes.
  for (const side of [-1, 1]) {
    const z = side * RAIL.z;
    const sweep: THREE.Vector3[] = [];
    const steps = high ? 6 : 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s = Math.sin((t * Math.PI) / 2);
      sweep.push(v(HEAD.x + t * (RAIL.front - HEAD.x), 0.62 + t * (RAIL.y - 0.62), z * s));
    }
    pipe("frame-tube", sweep, 0.016);
    rod("frame-rail", v(RAIL.front, RAIL.y, z), v(RAIL.back, RAIL.y, z), 0.016);
    // The rear axle hangs below the rails, on elliptic springs on the high tier.
    if (high) {
      const spring: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (2 * Math.PI * i) / 8;
        spring.push(v(REAR_X + 0.2 * Math.cos(a), (RAIL.y + REAR_R) / 2 + 0.05 * Math.sin(a), z));
      }
      pipe("rear-spring", spring, 0.008, steel);
    } else rod("axle-bracket", v(REAR_X, RAIL.y, z), v(REAR_X, REAR_R, z), 0.015);
  }
  for (const x of [RAIL.front, COUNTERSHAFT.x + 0.2, REAR_X - 0.3, RAIL.back])
    rod("frame-cross-tube", v(x, RAIL.y, -RAIL.z), v(x, RAIL.y, RAIL.z), 0.014);

  // Footboard and the bench.
  const foot = { from: 0.2, to: RAIL.front + 0.1 };
  if (high)
    for (let x = foot.from; x < foot.to; x += 0.075)
      box("footboard", v(x + 0.03, RAIL.y + 0.026, 0), 0.06, 0.02, 2 * RAIL.z + 0.06, wood);
  else
    box(
      "footboard",
      v((foot.from + foot.to) / 2, RAIL.y + 0.026, 0),
      foot.to - foot.from,
      0.02,
      2 * RAIL.z + 0.06,
      wood
    );
  box("seat-box", v(SEAT.x, (RAIL.y + SEAT.y) / 2 + 0.008, 0), SEAT.depth, SEAT.y - RAIL.y, 2 * SEAT.half, wood);
  box("seat-cushion", v(SEAT.x, SEAT.y + 0.04, 0), SEAT.depth - 0.02, 0.08, 2 * SEAT.half - 0.02, leather);
  const backX = SEAT.x - SEAT.depth / 2 + 0.03;
  box("seat-back", v(backX - 0.02, SEAT.y + 0.24, 0), 0.05, 0.32, 2 * SEAT.half - 0.02, leather);
  if (high)
    for (const side of [-1, 1]) {
      const z = side * (SEAT.half - 0.02);
      pipe(
        "seat-rail",
        [
          v(SEAT.x + SEAT.depth / 2 - 0.05, SEAT.y + 0.1, z),
          v(backX - 0.05, SEAT.y + 0.12, z),
          v(backX - 0.05, SEAT.y + 0.4, z)
        ],
        0.01
      );
    }

  // Steering: a vertical tiller with a forward grip, linked to the fork by a rack and pinion.
  const tillerTop = BENZ_MOTORWAGEN.height - 0.012;
  rod("tiller", v(TILLER.x, RAIL.y + 0.04, TILLER.z), v(TILLER.x, tillerTop, TILLER.z), 0.013);
  rod(
    "tiller-handle",
    v(TILLER.x - 0.02, tillerTop, TILLER.z),
    v(TILLER.x + TILLER.grip, tillerTop, TILLER.z),
    0.012,
    wood
  );
  rod("steering-rod", v(TILLER.x, RAIL.y + 0.06, TILLER.z), v(HEAD.x - 0.04, HEAD.top - 0.04, 0.06), 0.009, steel);
  if (high) {
    box("steering-rack", v(HEAD.x - 0.06, HEAD.top - 0.04, 0.03), 0.04, 0.03, 0.14, brass);
    rod("steering-pinion", v(HEAD.x, HEAD.top - 0.06, 0), v(HEAD.x, HEAD.top - 0.02, 0), 0.035, brass);
    rod("steering-bracket", v(TILLER.x, RAIL.y + 0.04, TILLER.z), v(TILLER.x, RAIL.y, RAIL.z), 0.01);
  }

  // Engine behind the seat: a horizontal cylinder, vertical crankshaft and the horizontal flywheel below.
  const crankX = FLYWHEEL_X;
  rod(
    "flywheel",
    v(FLYWHEEL_X, FLYWHEEL.y - FLYWHEEL.t / 2, 0),
    v(FLYWHEEL_X, FLYWHEEL.y + FLYWHEEL.t / 2, 0),
    FLYWHEEL.r,
    steel
  );
  rod("crankshaft", v(crankX, FLYWHEEL.y - 0.05, 0), v(crankX, CYLINDER.y + 0.08, 0), 0.025, steel);
  for (const z of [-RAIL.z, RAIL.z])
    rod("engine-bearer", v(crankX + 0.12, RAIL.y, z), v(crankX + 0.12, RAIL.y, 0), 0.014);
  if (high) {
    rod("engine-cylinder", v(CYLINDER.front, CYLINDER.y, 0), v(CYLINDER.back, CYLINDER.y, 0), CYLINDER.r, steel);
    for (let x = CYLINDER.front + 0.02; x > CYLINDER.front - 0.1; x -= 0.025)
      rod("cylinder-fin", v(x - 0.006, CYLINDER.y, 0), v(x + 0.006, CYLINDER.y, 0), CYLINDER.r + 0.025, steel);
    box("water-jacket", v((CYLINDER.front + CYLINDER.back) / 2 - 0.04, CYLINDER.y + 0.03, 0), 0.3, 0.16, 0.2, copper);
    rod(
      "water-tank",
      v(CYLINDER.front + 0.02, CYLINDER.y + 0.17, 0),
      v(CYLINDER.back, CYLINDER.y + 0.17, 0),
      0.07,
      copper
    );
    box("crankcase", v(crankX + 0.02, CYLINDER.y, 0), 0.2, 0.2, 0.2, steel);
    box("carburettor", v(CYLINDER.front + 0.02, RAIL.y + 0.12, -0.25), 0.16, 0.2, 0.14, brass);
    rod("valve-rod", v(crankX + 0.1, CYLINDER.y - 0.08, 0.1), v(CYLINDER.front, CYLINDER.y - 0.06, 0.1), 0.006, steel);
    rod(
      "exhaust",
      v(CYLINDER.front - 0.08, CYLINDER.y - 0.06, -0.07),
      v(CYLINDER.front - 0.08, RAIL.y - 0.1, -0.12),
      0.015
    );
  } else {
    box("engine", v((CYLINDER.front + crankX) / 2, CYLINDER.y, 0), crankX - CYLINDER.front, 0.2, 0.2, steel);
    box(
      "water-tank",
      v((CYLINDER.front + CYLINDER.back) / 2, CYLINDER.y + 0.17, 0),
      CYLINDER.front - CYLINDER.back,
      0.12,
      0.14,
      copper
    );
  }

  // Countershaft under the seat with its belt pulleys, and the chains to the rear wheels.
  const cs = COUNTERSHAFT;
  rod("countershaft", v(cs.x, cs.y, -cs.sprocketZ - 0.02), v(cs.x, cs.y, cs.sprocketZ + 0.02), 0.016, steel);
  const pulleyZ = 0.16;
  for (const side of [-1, 1]) {
    const z = side * cs.sprocketZ;
    rod("sprocket", v(cs.x, cs.y, z - 0.01), v(cs.x, cs.y, z + 0.01), 0.06, steel);
    const wheelZ = side * (REAR_Z - 0.07);
    rod("sprocket", v(REAR_X, REAR_R, wheelZ - 0.01), v(REAR_X, REAR_R, wheelZ + 0.01), 0.13, steel);
    if (high)
      for (const run of [1, -1])
        rod("chain", v(cs.x, cs.y + run * 0.06, z), v(REAR_X, REAR_R + run * 0.13, wheelZ), 0.007, chain, thin);
  }
  rod("belt-pulley", v(cs.x, cs.y, pulleyZ - 0.05), v(cs.x, cs.y, pulleyZ + 0.05), 0.12, steel);
  if (high) {
    rod("belt-pulley", v(cs.x, cs.y, pulleyZ + 0.06), v(cs.x, cs.y, pulleyZ + 0.16), 0.12, steel);
    rod("differential", v(cs.x, cs.y, -0.06), v(cs.x, cs.y, 0.06), 0.07, brass);
    rod("brake-band", v(cs.x, cs.y, -pulleyZ - 0.03), v(cs.x, cs.y, -pulleyZ + 0.03), 0.09, leather);
    // Quarter-turn belt from the crankshaft pulley over the flywheel to the countershaft.
    const crankPulley = v(crankX, FLYWHEEL.y + 0.09, 0);
    rod("crank-pulley", crankPulley.clone().add(v(0, -0.04, 0)), crankPulley.clone().add(v(0, 0.04, 0)), 0.09, steel);
    for (const run of [1, -1]) {
      const from = crankPulley.clone().add(v(0, 0, run * 0.09));
      const to = v(cs.x, cs.y + run * 0.12, pulleyZ);
      const strip = rod("belt", from, to, 0.012, belt, thin);
      strip.scale.x = 0.03;
    }
    rod(
      "brake-lever",
      v(SEAT.x + 0.1, RAIL.y, RAIL.z + 0.04),
      v(SEAT.x + 0.2, SEAT.y + 0.32, RAIL.z + 0.06),
      0.01,
      steel
    );
    rod(
      "lever-knob",
      v(SEAT.x + 0.2, SEAT.y + 0.3, RAIL.z + 0.06),
      v(SEAT.x + 0.2, SEAT.y + 0.36, RAIL.z + 0.06),
      0.018,
      wood
    );
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

export function createBenzMotorwagen(quality: BenzMotorwagenQuality = "low"): BenzMotorwagenMeshes {
  const model = createBenzMotorwagenModel(quality);
  return {
    ...model,
    elevation: meshProjection(model, "side"),
    plan: meshProjection(model, "top")
  };
}
