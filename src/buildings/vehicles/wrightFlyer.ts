import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

/** The 1903 Wright Flyer resting on its landing skids, in meters; the forward elevator faces positive X. */
export const WRIGHT_FLYER = {
  author: "Claude Opus 5.5" as Author,
  name: "Wright Flyer (1903)",
  /** Front of the elevator to the back of the rudders. */
  length: 6.43,
  span: 12.29,
  /** To the tip of a propeller blade standing upright. */
  height: 2.74,
  chord: 1.98,
  /** Vertical distance between the wings. */
  gap: 1.83,
  propellerDiameter: 2.59,
  /** Camber of the wing sections as rise over chord. */
  camber: 1 / 20,
  highNote:
    "High tier: rib pockets on both wings and both elevator surfaces; cross-bracing wires in every bay but the centre, where the pilot lay; the semicircular blinkers between the elevator surfaces; the four-cylinder engine with its cylinders, water jackets, flywheel, the vertical radiator and the fuel tank hung from a strut; the drive shaft, sprockets and chain guide tubes to both propellers, the left chain crossed so the propellers turn in opposite directions; the propeller shaft bearings; the hip cradle that worked the wing warping and the elevator lever.",
  note: "Schematic exterior of the Wright Flyer built by Wilbur and Orville Wright (United States), which made the first sustained, controlled, powered flights at Kill Devil Hills near Kitty Hawk, North Carolina, on 17 December 1903. A canard biplane of spruce and ash covered in unbleached muslin: the two cambered wings droop slightly towards the tips and were twisted (warped) for roll control by a hip cradle under the prone pilot; a biplane elevator on outriggers ahead of the wings controls pitch and twin rudders behind control yaw. The Wrights' own 12 hp four-cylinder water-cooled engine sits right of centre to balance the pilot and drives two pusher propellers through bicycle-type chains. Span, length, height, chord, gap, camber and propeller diameter follow the published figures; strut stations, outrigger geometry and the elevator and rudder sizes are proportioned from general-arrangement drawings. The pilot, the launching rail and its truck, the control wires and the instruments are omitted. Static model: the surfaces do not warp and the propellers do not turn."
} as const;

export interface WrightFlyerMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export type WrightFlyerQuality = "low" | "high";

const NOSE_X = WRIGHT_FLYER.length / 2;
/** Model X at a distance aft of the front of the elevator. */
const xAt = (d: number) => NOSE_X - d;
const WING_HALF = WRIGHT_FLYER.span / 2;
const PROP_R = WRIGHT_FLYER.propellerDiameter / 2;
/** The propeller hubs sit midway between the wings; an upright blade reaches the published height. */
const HUB_Y = WRIGHT_FLYER.height - PROP_R;
const LOWER_Y = HUB_Y - WRIGHT_FLYER.gap / 2;
const UPPER_Y = HUB_Y + WRIGHT_FLYER.gap / 2;
const WING_LE = 2.95;
/** Fall of the wing tips below the centre section. */
const DROOP = 0.22;
/** Chord fractions of the front and rear spars. */
const FRONT_SPAR = 0.02,
  REAR_SPAR = 0.85;
/** Span stations of the interplane struts, outward from the centre section. */
const STRUTS = [0.94, 2.3, 3.66, 5.02, 6.0];
/** Ribs are about a foot apart. */
const RIB_PITCH = 0.31;
const PLATE = 0.035;

const ELEVATOR = { le: 0, chord: 0.61, half: 1.83, lower: HUB_Y - 0.5, upper: HUB_Y + 0.4, camber: 1 / 20 };
const RUDDER = { chord: 0.51, z: 0.3 };
const RUDDER_LE = WRIGHT_FLYER.length - RUDDER.chord;
const PROP = { d: 5.2, z: 1.68 };
const SKID_Z = 0.5;
const ENGINE = { d: 3.8, z: 0.48 };
const SHAFT = { d: 4.3, y: LOWER_Y + 0.26, sprocket: 0.95 };

/** NACA mean line of camber `m` peaking at chord fraction `p`, as a height over the chord. */
function meanLine(u: number, m: number, p = 0.3): number {
  const c = Math.min(1, Math.max(0, u));
  return c <= p ? (m / p ** 2) * (2 * p * c - c * c) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * c - c * c);
}

/** A point on the mean surface of a wing: chord fraction u and span station z. */
function wingPoint(base: number, u: number, z: number): THREE.Vector3 {
  const c = WRIGHT_FLYER.chord;
  const droop = DROOP * (z / WING_HALF) ** 2;
  return new THREE.Vector3(xAt(WING_LE + u * c), base - droop + c * meanLine(u, WRIGHT_FLYER.camber), z);
}
/** Underside of a wing at a chord fraction and span station. */
const wingUnderside = (base: number, u: number, z: number) =>
  wingPoint(base, u, z).add(new THREE.Vector3(0, -PLATE / 2, 0));
const wingTopside = (base: number, u: number, z: number) =>
  wingPoint(base, u, z).add(new THREE.Vector3(0, PLATE / 2, 0));

function elevatorPoint(base: number, u: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(
    xAt(ELEVATOR.le + u * ELEVATOR.chord),
    base + ELEVATOR.chord * meanLine(u, ELEVATOR.camber),
    z
  );
}

/**
 * A closed surface through rings of equal point count with end caps. Each face is turned to look away from the
 * axis between the centroids of its two rings, so the rings must be convex.
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

/**
 * A thin plate of the given thickness through a grid of mean-surface points, offset along `up`. The two faces are
 * smooth; the edge band has its own vertices so it shades flat.
 */
function sheet(grid: readonly THREE.Vector3[][], thickness: number, up: THREE.Vector3): THREE.BufferGeometry {
  const rows = grid.length,
    cols = grid[0].length;
  const offset = up.clone().multiplyScalar(thickness / 2);
  const positions: THREE.Vector3[] = [];
  const index: number[] = [];
  const centre = grid
    .flat()
    .reduce((sum, p) => sum.add(p), new THREE.Vector3())
    .divideScalar(rows * cols);
  function tri(a: number, b: number, c: number, outward: THREE.Vector3) {
    const n = positions[b].clone().sub(positions[a]).cross(positions[c].clone().sub(positions[a]));
    if (n.dot(outward) < 0) index.push(a, c, b);
    else index.push(a, b, c);
  }
  for (const side of [1, -1]) {
    const start = positions.length;
    for (const row of grid) for (const p of row) positions.push(p.clone().addScaledVector(offset, side));
    const outward = up.clone().multiplyScalar(side);
    for (let i = 0; i + 1 < rows; i++)
      for (let j = 0; j + 1 < cols; j++) {
        const a = start + i * cols + j;
        tri(a, a + 1, a + cols + 1, outward);
        tri(a, a + cols + 1, a + cols, outward);
      }
  }
  const boundary: THREE.Vector3[] = [
    ...grid[0],
    ...grid.slice(1, -1).map(row => row.at(-1)!),
    ...[...grid.at(-1)!].reverse(),
    ...grid
      .slice(1, -1)
      .map(row => row[0])
      .reverse()
  ];
  for (let k = 0; k < boundary.length; k++) {
    const p = boundary[k],
      q = boundary[(k + 1) % boundary.length];
    const outward = p.clone().add(q).multiplyScalar(0.5).sub(centre);
    outward.addScaledVector(up, -outward.dot(up));
    const a = positions.length;
    positions.push(p.clone().add(offset), q.clone().add(offset), q.clone().sub(offset), p.clone().sub(offset));
    tri(a, a + 1, a + 2, outward);
    tri(a, a + 2, a + 3, outward);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Stations from `from` to `to` no further apart than `step`, always including the given breaks. */
function stations(from: number, to: number, step: number, breaks: readonly number[] = []): number[] {
  const count = Math.max(1, Math.ceil((to - from) / step));
  const all = new Set<number>();
  for (let i = 0; i <= count; i++) all.add(+(from + ((to - from) * i) / count).toFixed(4));
  for (const b of breaks) if (b > from && b < to) all.add(b);
  return [...all].sort((a, b) => a - b);
}
const chordStations = (count: number) =>
  Array.from({ length: count + 1 }, (_, i) => (1 - Math.cos((Math.PI * i) / count)) / 2);

export function createWrightFlyerModel(quality: WrightFlyerQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `wright-flyer-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const muslin = new THREE.MeshLambertMaterial({ color: 0xe9e1ca, side: THREE.DoubleSide });
  const rib = new THREE.MeshLambertMaterial({ color: 0xd6c9a5 });
  const spruce = new THREE.MeshLambertMaterial({ color: 0xc7a06a });
  const ash = new THREE.MeshLambertMaterial({ color: 0xa97f4c });
  const propWood = new THREE.MeshLambertMaterial({ color: 0xbf9257 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x5c5f61 });
  const aluminium = new THREE.MeshLambertMaterial({ color: 0xa9aaa6 });
  const chain = new THREE.MeshLambertMaterial({ color: 0x2b2a28 });
  const copper = new THREE.MeshLambertMaterial({ color: 0x9a6b3e });
  const wire = new THREE.MeshLambertMaterial({ color: 0x8b8d8e });
  const materials = [muslin, rib, spruce, ash, propWood, steel, aluminium, chain, copper, wire];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, high ? 20 : 10);
  const thin = new THREE.CylinderGeometry(1, 1, 1, 6);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const Y = v(0, 1, 0),
    Z = v(0, 0, 1);
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
  function rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = spruce, geometry = disc) {
    const mesh = add(name, geometry, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }
  /** Rectangular timber from a to b, its depth kept vertical where it can be. */
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, material = ash) {
    const along = b.clone().sub(a).normalize();
    const side = Math.abs(along.y) > 0.95 ? Z.clone() : along.clone().cross(Y).normalize();
    const upright = side.clone().cross(along).normalize();
    const mesh = add(name, cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(a.distanceTo(b), depth, width);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, upright, side));
    return mesh;
  }
  const wireRod = (a: THREE.Vector3, b: THREE.Vector3) => rod("bracing-wire", a, b, 0.0045, wire, thin);

  // Wings: two cambered muslin plates; ribs ride in pockets a foot apart on the high tier.
  const half = WING_HALF;
  const strutBreaks = [...STRUTS.map(s => -s), ...STRUTS];
  const spanZ = stations(-half, half, high ? 0.3 : 0.9, strutBreaks);
  const chordU = chordStations(high ? 14 : 6);
  for (const [name, base] of [
    ["lower-wing", LOWER_Y],
    ["upper-wing", UPPER_Y]
  ] as const) {
    add(
      name,
      sheet(
        spanZ.map(z => chordU.map(u => wingPoint(base, u, z))),
        PLATE,
        Y
      ),
      muslin
    );
    if (high) {
      const ribCount = Math.round(WRIGHT_FLYER.span / RIB_PITCH);
      for (let i = 0; i <= ribCount; i++) {
        const z = -half + 0.04 + ((WRIGHT_FLYER.span - 0.08) * i) / ribCount;
        add(
          "wing-rib",
          sheet(
            [z - 0.012, z + 0.012].map(zz => chordU.map(u => wingPoint(base, u, zz))),
            PLATE + 0.012,
            Y
          ),
          rib
        );
      }
    }
  }

  // Interplane struts at the front and rear spars, and the cross-bracing wires of each bay.
  const strutZs = [...STRUTS.map(s => -s).reverse(), ...STRUTS];
  for (const z of strutZs)
    for (const u of [FRONT_SPAR + 0.01, REAR_SPAR])
      rod("interplane-strut", wingTopside(LOWER_Y, u, z), wingUnderside(UPPER_Y, u, z), 0.017, spruce);
  if (high)
    for (let i = 0; i + 1 < strutZs.length; i++) {
      const [a, b] = [strutZs[i], strutZs[i + 1]];
      if (a < 0 && b > 0) continue;
      for (const u of [FRONT_SPAR + 0.01, REAR_SPAR]) {
        wireRod(wingTopside(LOWER_Y, u, a), wingUnderside(UPPER_Y, u, b));
        wireRod(wingTopside(LOWER_Y, u, b), wingUnderside(UPPER_Y, u, a));
      }
    }

  // Biplane elevator on its outriggers, with the semicircular blinkers between the surfaces.
  const elevatorZ = stations(-ELEVATOR.half, ELEVATOR.half, high ? 0.3 : 0.9);
  const elevatorU = chordStations(high ? 10 : 4);
  for (const base of [ELEVATOR.lower, ELEVATOR.upper]) {
    add(
      "elevator",
      sheet(
        elevatorZ.map(z => elevatorU.map(u => elevatorPoint(base, u, z))),
        0.03,
        Y
      ),
      muslin
    );
    if (high)
      for (let z = -ELEVATOR.half + 0.1; z < ELEVATOR.half; z += RIB_PITCH)
        add(
          "elevator-rib",
          sheet(
            [z - 0.01, z + 0.01].map(zz => elevatorU.map(u => elevatorPoint(base, u, zz))),
            0.04,
            Y
          ),
          rib
        );
  }
  const elevatorPivot = 0.3;
  for (const z of [-ELEVATOR.half + 0.25, -0.75, 0.75, ELEVATOR.half - 0.25])
    rod(
      "elevator-strut",
      elevatorPoint(ELEVATOR.lower, elevatorPivot, z).add(v(0, 0.015, 0)),
      elevatorPoint(ELEVATOR.upper, elevatorPivot, z).add(v(0, -0.015, 0)),
      0.013
    );
  if (high)
    for (const z of [-0.3, 0.3]) {
      // A half disc standing on the lower surface, its straight edge forward.
      const top = elevatorPoint(ELEVATOR.upper, 0.05, z).y - 0.02;
      const bottom = elevatorPoint(ELEVATOR.lower, 0.05, z).y + 0.02;
      const radius = (top - bottom) / 2,
        cy = (top + bottom) / 2,
        x0 = elevatorPoint(ELEVATOR.lower, 0.05, z).x;
      const grid = [0, 1].map(k =>
        Array.from({ length: 13 }, (_, i) => {
          const a = -Math.PI / 2 + (Math.PI * i) / 12;
          const r = k === 0 ? 0.001 : radius;
          return v(x0 - r * Math.cos(a), cy + r * Math.sin(a), z);
        })
      );
      add("blinker", sheet(grid, 0.02, Z), muslin);
    }
  // Outriggers run from both wings' front spars to the elevator pivot.
  for (const z of [-SKID_Z, SKID_Z]) {
    const lowerPivot = elevatorPoint(ELEVATOR.lower, elevatorPivot, z).add(v(0, -0.03, 0));
    const upperPivot = elevatorPoint(ELEVATOR.upper, elevatorPivot, z).add(v(0, 0.03, 0));
    beam("elevator-outrigger", wingUnderside(LOWER_Y, FRONT_SPAR, z), lowerPivot, 0.03, 0.045);
    beam("elevator-outrigger", wingTopside(UPPER_Y, FRONT_SPAR, z), upperPivot, 0.03, 0.045);
    beam("elevator-outrigger", wingUnderside(UPPER_Y, FRONT_SPAR, z), lowerPivot, 0.025, 0.035);

    // Landing skids: flat along the ground, sweeping up to meet the lower elevator outrigger.
    const tail = WING_LE + 0.92 * WRIGHT_FLYER.chord;
    const path: THREE.Vector3[] = [v(xAt(tail), 0.0225, z)];
    const toe = WING_LE - 0.7;
    for (let i = 0; i <= (high ? 8 : 3); i++) {
      const t = i / (high ? 8 : 3);
      const d = toe - t * (toe - (elevatorPivot * ELEVATOR.chord + ELEVATOR.le + 0.2));
      path.push(v(xAt(d), 0.0225 + (lowerPivot.y - 0.08) * Math.sin((t * Math.PI) / 2) ** 1.6, z));
    }
    for (let i = 0; i + 1 < path.length; i++) beam("skid", path[i], path[i + 1], 0.04, 0.045);
    for (const u of [0.05, 0.6, 0.85])
      beam("skid-strut", v(xAt(WING_LE + u * WRIGHT_FLYER.chord), 0.045, z), wingUnderside(LOWER_Y, u, z), 0.025, 0.03);
  }

  // Twin rudders on outriggers from the rear spars.
  const rudderX0 = xAt(RUDDER_LE),
    rudderX1 = xAt(WRIGHT_FLYER.length);
  const rudderTop = UPPER_Y - 0.02,
    rudderBottom = LOWER_Y + 0.02;
  for (const z of [-RUDDER.z, RUDDER.z]) {
    const grid = stations(rudderBottom, rudderTop, high ? 0.1 : 0.3).map(y =>
      chordStations(high ? 6 : 2).map(u => {
        // Rounded trailing corners of radius `corner`.
        const corner = 0.2,
          c = rudderX0 - rudderX1;
        const dist = Math.max(0, Math.min(y - rudderBottom, rudderTop - y));
        const k = dist >= corner ? 1 : 1 - corner / c + (corner / c) * Math.sqrt(1 - (1 - dist / corner) ** 2);
        return v(rudderX0 - c * u * k, y, z);
      })
    );
    add("rudder", sheet(grid, 0.03, Z), muslin);
    rod("rudder-post", v(rudderX0, rudderBottom, z), v(rudderX0, rudderTop, z), 0.015);
  }
  for (const y of [rudderBottom, rudderTop])
    beam("rudder-frame", v(rudderX0, y, -RUDDER.z), v(rudderX0, y, RUDDER.z), 0.03, 0.03);
  for (const z of [-0.62, 0.62]) {
    beam(
      "rudder-outrigger",
      wingTopside(LOWER_Y, REAR_SPAR, z),
      v(rudderX0, rudderBottom, Math.sign(z) * RUDDER.z),
      0.03,
      0.04
    );
    beam(
      "rudder-outrigger",
      wingUnderside(UPPER_Y, REAR_SPAR, z),
      v(rudderX0, rudderTop, Math.sign(z) * RUDDER.z),
      0.03,
      0.04
    );
  }

  // Two pusher propellers behind the wings; the left one (negative Z) turns the other way.
  const blade = (side: number, up: number) => {
    const rings: THREE.Vector3[][] = [];
    const hub = v(xAt(PROP.d), HUB_Y, side * PROP.z);
    const radii = stations(0.1, PROP_R, high ? 0.08 : 0.3);
    for (const r of radii) {
      const t = r / PROP_R;
      const width = 0.05 + 0.16 * Math.max(0, Math.sin(Math.PI * t ** 1.4)) ** 0.8;
      const thickness = 0.06 * (1 - 0.75 * t);
      // Blade angle from a geometric pitch of about 1.6 m.
      const angle = Math.atan(1.6 / (2 * Math.PI * Math.max(r, 0.15)));
      const chordDir = v(-Math.sin(angle), 0, side * Math.cos(angle));
      const thickDir = v(Math.cos(angle), 0, side * Math.sin(angle));
      const centre = hub.clone().add(v(0, up * r, 0));
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < (high ? 10 : 6); k++) {
        const a = (2 * Math.PI * k) / (high ? 10 : 6);
        ring.push(
          centre
            .clone()
            .addScaledVector(chordDir, (Math.cos(a) * width) / 2)
            .addScaledVector(thickDir, (Math.sin(a) * thickness) / 2)
        );
      }
      rings.push(ring);
    }
    add("propeller-blade", loft(rings), propWood);
  };
  for (const side of [-1, 1]) {
    blade(side, 1);
    blade(side, -1);
    const hub = v(xAt(PROP.d), HUB_Y, side * PROP.z);
    rod("propeller-hub", hub.clone().add(v(0.06, 0, 0)), hub.clone().add(v(-0.06, 0, 0)), 0.1, propWood);
    rod(
      "propeller-shaft",
      v(xAt(WING_LE + REAR_SPAR * WRIGHT_FLYER.chord - 0.05), HUB_Y, side * PROP.z),
      hub,
      0.02,
      steel
    );
    // Shaft bearings are carried on braces from the rear spars of both wings.
    for (const base of [LOWER_Y, UPPER_Y]) {
      const spar =
        base === LOWER_Y ? wingTopside(base, REAR_SPAR, side * PROP.z) : wingUnderside(base, REAR_SPAR, side * PROP.z);
      beam("propeller-brace", spar, v(xAt(PROP.d - 0.25), HUB_Y, side * PROP.z), 0.025, 0.03);
    }
  }

  // Engine right of centre, the drive shaft and chains to the propellers.
  const engineBase = wingTopside(LOWER_Y, (ENGINE.d - WING_LE) / WRIGHT_FLYER.chord, ENGINE.z).y;
  if (high) {
    box("crankcase", v(xAt(ENGINE.d + 0.12), engineBase + 0.13, ENGINE.z), 0.26, 0.22, 0.62, aluminium);
    for (let i = 0; i < 4; i++) {
      const z = ENGINE.z - 0.225 + i * 0.15;
      rod(
        "engine-cylinder",
        v(xAt(ENGINE.d), engineBase + 0.15, z),
        v(xAt(ENGINE.d - 0.36), engineBase + 0.15, z),
        0.055,
        steel
      );
    }
    box("water-jacket", v(xAt(ENGINE.d - 0.22), engineBase + 0.15, ENGINE.z), 0.2, 0.15, 0.6, aluminium);
    rod(
      "flywheel",
      v(xAt(ENGINE.d + 0.12), engineBase + 0.16, ENGINE.z + 0.36),
      v(xAt(ENGINE.d + 0.12), engineBase + 0.16, ENGINE.z + 0.42),
      0.15,
      steel
    );
    const radiatorZ = STRUTS[0] - 0.08;
    box("radiator", v(xAt(WING_LE + 0.12), (LOWER_Y + UPPER_Y) / 2 - 0.1, radiatorZ), 0.07, 0.95, 0.22, copper);
    rod(
      "fuel-tank",
      v(xAt(WING_LE + 0.06), UPPER_Y - 0.12, radiatorZ - 0.18),
      v(xAt(WING_LE + 0.06), UPPER_Y - 0.48, radiatorZ - 0.18),
      0.05,
      aluminium
    );
    // Drive shaft across the centre section with a sprocket at each end.
    const shaftX = xAt(SHAFT.d);
    rod(
      "drive-shaft",
      v(shaftX, SHAFT.y, -SHAFT.sprocket - 0.03),
      v(shaftX, SHAFT.y, SHAFT.sprocket + 0.03),
      0.018,
      steel
    );
    for (const side of [-1, 1]) {
      const z = side * SHAFT.sprocket;
      rod("sprocket", v(shaftX, SHAFT.y, z - 0.01), v(shaftX, SHAFT.y, z + 0.01), 0.07, steel);
      const propX = xAt(WING_LE + REAR_SPAR * WRIGHT_FLYER.chord + 0.08);
      rod("sprocket", v(propX, HUB_Y, side * PROP.z - 0.01), v(propX, HUB_Y, side * PROP.z + 0.01), 0.17, steel);
      // Upper and lower runs; the left chain crosses over to reverse its propeller.
      const crossed = side < 0;
      for (const run of [1, -1]) {
        const from = v(shaftX, SHAFT.y + run * 0.07, z);
        const to = v(propX, HUB_Y + (crossed ? -run : run) * 0.17, side * PROP.z);
        rod("chain", from, to, 0.008, chain, thin);
        rod("chain-guide", from.clone().lerp(to, 0.2), from.clone().lerp(to, 0.8), 0.016, steel);
      }
    }
    // Hip cradle on its rails and the elevator lever at the pilot's left hand.
    const cradleZ = -0.35;
    const cradleBase = wingTopside(LOWER_Y, 0.45, cradleZ).y;
    box("hip-cradle", v(xAt(WING_LE + 0.9), cradleBase + 0.07, cradleZ), 0.35, 0.06, 0.34, ash);
    for (const dz of [-0.12, 0.12])
      beam(
        "cradle-rail",
        v(xAt(WING_LE + 0.65), cradleBase + 0.02, cradleZ + dz),
        v(xAt(WING_LE + 1.15), cradleBase + 0.02, cradleZ + dz),
        0.02,
        0.025
      );
    rod(
      "elevator-lever",
      v(xAt(WING_LE + 0.3), cradleBase, cradleZ - 0.25),
      v(xAt(WING_LE + 0.2), cradleBase + 0.32, cradleZ - 0.25),
      0.012,
      ash
    );
  } else {
    box("engine", v(xAt(ENGINE.d - 0.06), engineBase + 0.14, ENGINE.z), 0.5, 0.26, 0.62, steel);
    rod(
      "drive-shaft",
      v(xAt(SHAFT.d), SHAFT.y, -SHAFT.sprocket),
      v(xAt(SHAFT.d), SHAFT.y, SHAFT.sprocket),
      0.02,
      steel
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

export function createWrightFlyer(quality: WrightFlyerQuality = "low"): WrightFlyerMeshes {
  const model = createWrightFlyerModel(quality);
  return {
    ...model,
    elevation: meshProjection(model, "side"),
    plan: meshProjection(model, "top")
  };
}
