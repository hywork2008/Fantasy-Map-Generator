import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

/**
 * Gerald R. Ford-class nuclear aircraft carrier (lead ship CVN-78), in meters. The waterline is y = 0, the bow
 * faces positive X and the starboard side, which carries the island, is positive Z.
 */
export const FORD_CARRIER = {
  author: "Claude Opus 5.5" as Author,
  name: "Gerald R. Ford-class aircraft carrier",
  length: 337,
  /** Over the flight deck and elevators. */
  beam: 78,
  waterlineBeam: 41,
  draft: 12,
  /** Keel to mast top. */
  height: 76,
  flightDeckHeight: 19.5,
  highNote:
    "High tier: flight-deck markings — the 9° angled landing area with its edge and centre lines, four electromagnetic (EMALS) catapult tracks with jet-blast deflectors raised, three arresting wires, the bow and taxi lines; elevator outlines; a stepped island with bridge and primary-flight-control windows, the three-face Dual Band Radar (AN/SPY-3 and AN/SPY-4) arrays, a mast with yards and antenna domes; hangar-bay openings below the elevators; anchor hawsepipes; boot-topping; two Mk 29 ESSM and two Mk 49 RAM launchers and three Phalanx CIWS on the sponsons; four five-bladed propellers on shafts and struts and two rudders.",
  note: "Schematic exterior of the Gerald R. Ford-class supercarrier (United States Navy, lead ship USS Gerald R. Ford, CVN-78, in service from 2017): a flared hull with a bulbous bow, a flight deck with a 9° angled landing area overhanging to port, a smaller island set well aft on the starboard edge, three aircraft elevators (two to starboard ahead of the island, one to port aft) and four EMALS catapults, two at the bow and two in the waist. Two A1B reactors drive four shafts. Haze-grey topsides, dark non-skid deck and red underwater hull, without hull numbers or aircraft. Length, flight-deck and waterline beam, draft and height follow the published figures; island, elevator, catapult and weapon positions are proportioned from photographs and general-arrangement drawings. Interior, aircraft, boats and small fittings are omitted. Static model."
} as const;

export interface FordCarrierMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export type FordCarrierQuality = "low" | "high";

const BOW_X = FORD_CARRIER.length / 2,
  STERN_X = -FORD_CARRIER.length / 2;
const DECK_Y = FORD_CARRIER.flightDeckHeight;
const DECK_THICKNESS = 3;
/** Top of the hull proper; the flight deck and sponsons stand on it. */
const HULL_TOP = 17;
const KEEL_Y = -FORD_CARRIER.draft;
const MAST_TOP = FORD_CARRIER.height - FORD_CARRIER.draft;
const ANGLE = (9 * Math.PI) / 180;

/** Flight-deck edges as [x, z] from stern to bow; the port edge carries the angled-deck sponson. */
const STARBOARD_EDGE: readonly [number, number][] = [
  [STERN_X, 20],
  [-150, 23],
  [-100, 24],
  [60, 24],
  [130, 22],
  [160, 15],
  [BOW_X, 9]
];
const PORT_EDGE: readonly [number, number][] = [
  [STERN_X, -20],
  [-160, -27],
  [-120, -40],
  [-60, -44],
  [20, -44],
  [55, -32],
  [100, -24],
  [150, -19],
  [BOW_X, -9]
];
/** Hull stations: x, keel height, waterline half-beam, half-width at the hull top. */
const HULL: readonly [number, number, number, number][] = [
  [-166, 1, 13, 18],
  [-155, -1.5, 17, 19.5],
  [-140, -5, 19, 20.5],
  [-120, -10, 20.5, 21],
  [-100, KEEL_Y, 20.5, 21],
  [100, KEEL_Y, 20.5, 21],
  [125, KEEL_Y, 17, 20],
  [145, -11, 11, 18],
  [158, -8, 5, 14],
  [164, -2, 1.5, 9],
  [167.5, 8, 0.4, 3]
];
/** Elevators: centre x, and the inner and outer z of the platform. */
const ELEVATORS = [
  { x: 48, z0: 22, z1: 34 },
  { x: 20, z0: 22, z1: 34 },
  { x: -105, z0: -30, z1: -44 }
];
const ELEVATOR_LENGTH = 21;
const ISLAND = { x0: -52, x1: -26, z0: 14, z1: 23 };

function along(table: readonly (readonly number[])[], x: number): number[] {
  if (x <= table[0][0]) return [...table[0]];
  for (let i = 1; i < table.length; i++)
    if (x <= table[i][0]) {
      const a = table[i - 1],
        b = table[i],
        t = (x - a[0]) / (b[0] - a[0]);
      return a.map((v, k) => v + (b[k] - v) * t);
    }
  return [...table.at(-1)!];
}
const starboardEdge = (x: number) => along(STARBOARD_EDGE, x)[1];
const portEdge = (x: number) => along(PORT_EDGE, x)[1];
const hullAt = (x: number) => {
  const [, keel, waterline, top] = along(HULL, x);
  return { keel, waterline, top };
};
/** Hull half-width at height y: near-vertical below the waterline, flaring above it. */
function hullHalfWidth(x: number, y: number): number {
  const { waterline, top } = hullAt(x);
  if (y <= 0) return waterline;
  const t = Math.min(1, y / HULL_TOP);
  return waterline + (top - waterline) * (0.35 * t + 0.65 * t * t);
}

/**
 * A closed surface through rings of equal point count with end caps. Each face is turned to look away from the
 * axis between the centroids of its two rings.
 */
function loft(rings: readonly THREE.Vector3[][]): THREE.BufferGeometry {
  const n = rings[0].length;
  const points = rings.flat();
  const centroid = (ring: THREE.Vector3[]) =>
    ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(ring.length);
  const centroids = rings.map(centroid);
  const first = points.length;
  points.push(centroids[0], centroids.at(-1)!);
  const index: number[] = [];
  function face(a: number, b: number, c: number, inside: THREE.Vector3) {
    const pa = points[a],
      pb = points[b],
      pc = points[c];
    const normal = pb.clone().sub(pa).cross(pc.clone().sub(pa));
    const outward = pa.clone().add(pb).add(pc).divideScalar(3).sub(inside);
    if (normal.dot(outward) < 0) index.push(a, c, b);
    else index.push(a, b, c);
  }
  for (let r = 0; r + 1 < rings.length; r++) {
    const inside = centroids[r]
      .clone()
      .add(centroids[r + 1])
      .multiplyScalar(0.5);
    for (let j = 0; j < n; j++) {
      const a = r * n + j,
        b = r * n + ((j + 1) % n),
        c = (r + 1) * n + ((j + 1) % n),
        d = (r + 1) * n + j;
      face(a, b, c, inside);
      face(a, c, d, inside);
    }
  }
  const last = (rings.length - 1) * n;
  for (let j = 0; j < n; j++) {
    face(first, j, (j + 1) % n, centroids[1]);
    face(first + 1, last + j, last + ((j + 1) % n), centroids.at(-2)!);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Stations from `from` to `to` at `step`, always including the hull table breaks between them. */
function stations(from: number, to: number, step: number): number[] {
  const xs = new Set<number>([from, to]);
  for (let x = from; x < to; x += step) xs.add(+x.toFixed(3));
  for (const [x] of HULL) if (x > from && x < to) xs.add(x);
  return [...xs].sort((a, b) => a - b);
}

export function createFordCarrierModel(quality: FordCarrierQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `ford-carrier-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const haze = new THREE.MeshLambertMaterial({ color: 0x8b9198 });
  const hazeShade = new THREE.MeshLambertMaterial({ color: 0x737a81 });
  const deck = new THREE.MeshLambertMaterial({ color: 0x3e4145 });
  const elevatorDeck = new THREE.MeshLambertMaterial({ color: 0x4b4f54 });
  const antifouling = new THREE.MeshLambertMaterial({ color: 0x7a2f2a });
  const black = new THREE.MeshLambertMaterial({ color: 0x1b1c1d });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1f2a33 });
  const white = new THREE.MeshLambertMaterial({ color: 0xe6e6e0 });
  const yellow = new THREE.MeshLambertMaterial({ color: 0xd7b53a });
  const radar = new THREE.MeshLambertMaterial({ color: 0x9da3a8 });
  const bronze = new THREE.MeshLambertMaterial({ color: 0xa47b3d });
  const materials = [haze, hazeShade, deck, elevatorDeck, antifouling, black, glass, white, yellow, radar, bronze];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, high ? 24 : 12);
  const hexagon = new THREE.CylinderGeometry(1, 1, 1, 6);
  const sphere = new THREE.SphereGeometry(1, high ? 16 : 8, high ? 12 : 6);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  /** Box between x0..x1, y0..y1, z0..z1. */
  function block(
    name: string,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    material: THREE.Material = haze
  ) {
    const mesh = add(name, cube, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.scale.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    return mesh;
  }
  /** Cylinder from a to b. */
  function rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material = haze) {
    const mesh = add(name, disc, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** A flat strip on the flight deck from (x0, z0) to (x1, z1). */
  function stripe(
    name: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    width: number,
    material: THREE.Material
  ) {
    const mesh = add(name, cube, material);
    mesh.position.set((x0 + x1) / 2, DECK_Y + 0.02, (z0 + z1) / 2);
    mesh.scale.set(Math.hypot(x1 - x0, z1 - z0), 0.04, width);
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    return mesh;
  }
  function dashed(name: string, x0: number, z0: number, x1: number, z1: number, width: number, dash: number) {
    const length = Math.hypot(x1 - x0, z1 - z0),
      count = Math.floor(length / (dash * 2));
    for (let i = 0; i < count; i++) {
      const t0 = (i * 2 * dash) / length,
        t1 = ((i * 2 + 1) * dash) / length;
      stripe(name, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, width, white);
    }
  }

  // Hull: red below the waterline, haze grey above, with a bulbous bow.
  const sides = high ? 6 : 3;
  const underwater = (x: number) => {
    const { keel, waterline: b } = hullAt(x);
    const r = Math.min(3, b * 0.6, -keel * 0.8);
    const half: THREE.Vector3[] = [v(x, 0, b), v(x, keel + r, b)];
    for (let i = 1; i < sides; i++) {
      const a = (i / sides) * (Math.PI / 2);
      half.push(v(x, keel + r - Math.sin(a) * r, b - r + Math.cos(a) * r));
    }
    half.push(v(x, keel, b - r));
    return [...half, ...[...half].reverse().map(p => v(p.x, p.y, -p.z))];
  };
  const topside = (x: number) => {
    const { keel } = hullAt(x),
      y0 = Math.max(0, keel);
    const ys = Array.from({ length: sides + 2 }, (_, i) => y0 + ((HULL_TOP - y0) * i) / (sides + 1));
    const half = ys.map(y => v(x, y, hullHalfWidth(x, y)));
    return [...half, ...[...half].reverse().map(p => v(p.x, p.y, -p.z))];
  };
  add("hull-bottom", loft(stations(-158, 164, high ? 4 : 16).map(underwater)), antifouling);
  add("hull", loft(stations(-166, 167.5, high ? 4 : 16).map(topside)), haze);
  const bulb = add("bulbous-bow", sphere, antifouling);
  bulb.position.set(160, -7, 0);
  bulb.scale.set(7, 3.2, 3.2);
  if (high)
    add(
      "boot-topping",
      loft(
        stations(-158, 164, 4).map(x => {
          const b = hullAt(x).waterline + 0.06;
          return [v(x, -1, b), v(x, 1.2, b + 0.02), v(x, 1.2, -b - 0.02), v(x, -1, -b)];
        })
      ),
      black
    );

  // Sponsons carry the overhanging flight deck out from the flared hull on both sides.
  for (const side of [-1, 1]) {
    const rings = stations(-165, 166, high ? 3 : 12).map(x => {
      const top = hullAt(x).top,
        edge = Math.max(top + 0.2, side > 0 ? starboardEdge(x) : -portEdge(x)),
        overhang = edge - top,
        y = Math.max(4, DECK_Y - DECK_THICKNESS - 0.6 * overhang);
      return [
        v(x, y, side * hullHalfWidth(x, y)),
        v(x, DECK_Y - DECK_THICKNESS + 0.1, side * edge),
        v(x, HULL_TOP, side * (top - 0.5))
      ];
    });
    add("sponson", loft(rings), hazeShade);
  }

  // Flight deck.
  const outline = new THREE.Shape();
  const deckOutline = [...[...STARBOARD_EDGE].reverse(), ...PORT_EDGE];
  outline.moveTo(deckOutline[0][0], -deckOutline[0][1]);
  for (const [x, z] of deckOutline.slice(1)) outline.lineTo(x, -z);
  outline.closePath();
  const deckGeometry = new THREE.ExtrudeGeometry(outline, { depth: DECK_THICKNESS, bevelEnabled: false });
  deckGeometry.rotateX(-Math.PI / 2);
  deckGeometry.translate(0, DECK_Y - DECK_THICKNESS, 0);
  add("flight-deck", deckGeometry, deck);
  for (const e of ELEVATORS) {
    block(
      "elevator",
      e.x - ELEVATOR_LENGTH / 2,
      e.x + ELEVATOR_LENGTH / 2,
      DECK_Y - 1.2,
      DECK_Y + 0.01,
      e.z0,
      e.z1,
      elevatorDeck
    );
    if (high) {
      // Hangar-bay opening in the hull side under the elevator.
      const side = Math.sign(e.z1),
        y0 = 8,
        y1 = 15.5,
        z = side * (hullHalfWidth(e.x, (y0 + y1) / 2) + 0.08);
      const opening = block("hangar-opening", e.x - 9, e.x + 9, y0, y1, z - 0.05, z + 0.05, black);
      opening.rotation.x = side * Math.atan2(hullHalfWidth(e.x, y1) - hullHalfWidth(e.x, y0), y1 - y0);
    }
  }

  // Island: four stepped levels well aft on the starboard edge, a mast and the Dual Band Radar faces.
  const levels = [
    { y0: DECK_Y, y1: 27, inset: 0 },
    { y0: 27, y1: 33, inset: 1.5 },
    { y0: 33, y1: 39, inset: 2.5 },
    { y0: 39, y1: 43, inset: 4.5 }
  ];
  for (const level of levels)
    block(
      "island",
      ISLAND.x0 + level.inset,
      ISLAND.x1 - level.inset,
      level.y0,
      level.y1,
      ISLAND.z0 + level.inset / 2,
      ISLAND.z1 - level.inset / 2,
      haze
    );
  const islandCentre = { x: (ISLAND.x0 + ISLAND.x1) / 2, z: (ISLAND.z0 + ISLAND.z1) / 2 };
  for (const [y, size, inset, name] of [
    [30.5, 2.6, 1.5, "radar-array-spy3"],
    [36.5, 3.4, 2.5, "radar-array-spy4"]
  ] as const)
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3 + (name === "radar-array-spy3" ? Math.PI / 3 : 0),
        dx = Math.cos(a),
        dz = -Math.sin(a),
        halfX = (ISLAND.x1 - ISLAND.x0) / 2 - inset,
        halfZ = (ISLAND.z1 - ISLAND.z0) / 2 - inset / 2,
        reach = Math.min(Math.abs(dx) > 1e-6 ? halfX / Math.abs(dx) : Infinity, halfZ / Math.abs(dz || 1e-6));
      const plate = add(name, hexagon, radar);
      plate.position.set(islandCentre.x + dx * (reach + 0.25), y, islandCentre.z + dz * (reach + 0.25));
      plate.scale.set(size, 0.4, size);
      plate.quaternion.setFromUnitVectors(v(0, 1, 0), v(dx, 0, dz));
    }
  const mastX = islandCentre.x - 2,
    mastZ = islandCentre.z;
  rod("mast", v(mastX, 43, mastZ), v(mastX, 60, mastZ), high ? 0.7 : 0.9, hazeShade);
  rod("mast", v(mastX, 59.5, mastZ), v(mastX, MAST_TOP, mastZ), 0.18, hazeShade);
  if (high) {
    for (const [y, half] of [
      [50, 4.5],
      [55.5, 3]
    ] as const)
      rod("yard", v(mastX, y, mastZ - half), v(mastX, y, mastZ + half), 0.15, hazeShade);
    for (const [dx, dz, y, r] of [
      [1.6, 0, 46.5, 1.1],
      [-1.4, 1.4, 48, 0.8],
      [-1.4, -1.4, 48, 0.8]
    ] as const) {
      const dome = add("antenna-dome", sphere, white);
      dome.position.set(mastX + dx, y, mastZ + dz);
      dome.scale.setScalar(r);
      block("antenna-platform", mastX + dx - r, mastX + dx + r, y - r - 0.3, y - r, mastZ + dz - r, mastZ + dz + r);
    }
    // Navigation bridge band all round, primary flight control windows looking aft and over the deck.
    const l3 = levels[2],
      x0 = ISLAND.x0 + l3.inset,
      x1 = ISLAND.x1 - l3.inset,
      z0 = ISLAND.z0 + l3.inset / 2,
      z1 = ISLAND.z1 - l3.inset / 2;
    block("bridge-window", x1, x1 + 0.08, 37.6, 38.8, z0 + 0.3, z1 - 0.3, glass);
    block("bridge-window", x0 + 0.3, x1 - 0.3, 37.6, 38.8, z0 - 0.08, z0, glass);
    block("bridge-window", x0 + 0.3, x1 - 0.3, 37.6, 38.8, z1, z1 + 0.08, glass);
    const l4 = levels[3],
      px0 = ISLAND.x0 + l4.inset,
      px1 = ISLAND.x1 - l4.inset,
      pz0 = ISLAND.z0 + l4.inset / 2;
    block("pri-fly-window", px0 - 0.08, px0, 40.4, 42.2, pz0 + 0.3, ISLAND.z1 - l4.inset / 2 - 0.3, glass);
    block("pri-fly-window", px0 + 0.3, px1 - 0.3, 40.4, 42.2, pz0 - 0.08, pz0, glass);
    block("island-roof-rail", px0, px1, 43, 43.15, pz0, ISLAND.z1 - l4.inset / 2, hazeShade);
  }

  // Flight-deck markings: the angled landing area, catapults, arresting wires and the bow line.
  const axisStart = { x: STERN_X + 2, z: 3 };
  const axisDir = { x: Math.cos(ANGLE), z: -Math.sin(ANGLE) };
  const onAxis = (s: number, offset = 0) => ({
    x: axisStart.x + axisDir.x * s - axisDir.z * offset,
    z: axisStart.z + axisDir.z * s + axisDir.x * offset
  });
  const axisEnd = 196;
  if (high) {
    for (const offset of [-11.5, 11.5]) {
      const a = onAxis(6, offset),
        b = onAxis(axisEnd, offset);
      stripe("landing-area-edge", a.x, a.z, b.x, b.z, 0.45, white);
    }
    const c0 = onAxis(6),
      c1 = onAxis(axisEnd);
    dashed("landing-centreline", c0.x, c0.z, c1.x, c1.z, 0.5, 4.5);
    for (const s of [42, 54, 66]) {
      const a = onAxis(s, -11),
        b = onAxis(s, 11);
      rod("arresting-wire", v(a.x, DECK_Y + 0.12, a.z), v(b.x, DECK_Y + 0.12, b.z), 0.05, black);
    }
    stripe("bow-line", 30, 1, BOW_X - 4, 1, 0.5, yellow);
    stripe("deck-edge-line", -150, 21.5, 125, 21.5, 0.4, yellow);
    // Bow catapults run along the ship; waist catapults run along the angled deck.
    const catapults: [number, number, number, number][] = [
      [80, -4.5, 0, 82],
      [74, 8.5, 0.035, 80],
      [-15, -14, -ANGLE, 80],
      [-25, -24, -ANGLE, 66]
    ];
    for (const [x, z, heading, length] of catapults) {
      const dx = Math.cos(heading),
        dz = Math.sin(heading);
      stripe("catapult", x, z, x + dx * length, z + dz * length, 0.6, black);
      // Jet-blast deflector raised behind the launch position.
      const jbd = add("jet-blast-deflector", cube, hazeShade);
      jbd.position.set(x - dx * 6, DECK_Y + 1.3, z - dz * 6);
      jbd.scale.set(0.4, 4, 11);
      jbd.rotation.order = "YZX";
      jbd.rotation.y = -heading;
      jbd.rotation.z = -0.85;
    }
    for (const e of ELEVATORS) {
      // The outline runs just inside the platform edge.
      const z0 = Math.min(e.z0, e.z1) + 0.2,
        z1 = Math.max(e.z0, e.z1) - 0.2,
        x0 = e.x - ELEVATOR_LENGTH / 2 + 0.2,
        x1 = e.x + ELEVATOR_LENGTH / 2 - 0.2;
      for (const [ax, az, bx, bz] of [
        [x0, z0, x1, z0],
        [x0, z1, x1, z1],
        [x0, z0, x0, z1],
        [x1, z0, x1, z1]
      ])
        stripe("elevator-outline", ax, az, bx, bz, 0.3, yellow);
    }

    // Anchor hawsepipes in the bow flare.
    for (const side of [-1, 1]) {
      const x = 150,
        y = 12,
        z = side * (hullHalfWidth(x, y) + 0.05);
      rod("hawsepipe", v(x, y, z - side * 0.1), v(x, y, z + side * 0.05), 1.1, black);
    }

    // Self-defence on the sponsons: Mk 29 ESSM, Mk 49 RAM and Phalanx CIWS.
    const platform = (x: number, z: number) => {
      block("weapon-platform", x - 4, x + 4, 16.6, 17.2, z - 3.5, z + 3.5, hazeShade);
      return 17.2;
    };
    for (const [x, z] of [
      [128, 21.5],
      [-148, -26]
    ] as const) {
      const y = platform(x, z);
      block("mk29-launcher", x - 2, x + 2, y + 0.6, y + 2.4, z - 1.4, z + 1.4, haze);
      rod("mk29-launcher", v(x, y, z), v(x, y + 0.6, z), 0.7, hazeShade);
    }
    for (const [x, z] of [
      [140, -16],
      [-158, 21]
    ] as const) {
      const y = platform(x, z);
      rod("ram-launcher", v(x, y, z), v(x, y + 0.8, z), 0.8, hazeShade);
      block("ram-launcher", x - 1.6, x + 1.6, y + 0.8, y + 2.2, z - 1, z + 1, haze);
    }
    for (const [x, z] of [
      [100, -21],
      [-138, 22.5],
      [-120, -38]
    ] as const) {
      const y = platform(x, z);
      rod("ciws", v(x, y, z), v(x, y + 1.6, z), 0.9, hazeShade);
      const dome = add("ciws", sphere, white);
      dome.position.set(x, y + 3, z);
      dome.scale.set(0.9, 1.4, 0.9);
      rod("ciws", v(x, y + 1.6, z), v(x, y + 3, z), 0.75, white);
      rod("ciws", v(x + 0.6, y + 2, z), v(x + 2.6, y + 2, z), 0.12, black);
    }
  }

  // Four shafts with propellers and two rudders under the stern.
  for (const z of [-15, -6.5, 6.5, 15]) {
    const x = -142,
      y = -8,
      radius = 3.2;
    rod("propeller-shaft", v(x, y, z), v(-95, -10, z * 0.8), 0.35, bronze);
    rod("propeller-hub", v(x - 0.8, y, z), v(x + 0.8, y, z), 0.7, bronze);
    if (high) {
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI) / 5,
          blade = add("propeller-blade", cube, bronze);
        blade.position.set(x, y + Math.cos(a) * radius * 0.55, z + Math.sin(a) * radius * 0.55);
        blade.scale.set(0.25, radius * 0.9, 1.6);
        blade.rotation.order = "XYZ";
        blade.rotation.x = a;
        blade.rotateY(0.6);
      }
      rod("shaft-strut", v(-130, -8.5, z * 0.96), v(-130, -5.5, z * 0.96), 0.3, hazeShade);
    } else rod("propeller", v(x - 0.3, y, z), v(x + 0.3, y, z), radius, bronze);
  }
  for (const z of [-10.5, 10.5]) block("rudder", -156, -149, -11.2, -0.8, z - 0.45, z + 0.45, antifouling);

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createFordCarrier(quality: FordCarrierQuality = "low"): FordCarrierMeshes {
  const model = createFordCarrierModel(quality);
  return {
    ...model,
    elevation: meshProjection(model, "side"),
    plan: meshProjection(model, "top")
  };
}
