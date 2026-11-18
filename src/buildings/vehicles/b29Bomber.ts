import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

/** Boeing B-29 Superfortress heavy bomber, parked on its tricycle gear, in meters; the nose faces positive X. */
export const B29 = {
  author: "Claude Opus 5.5" as Author,
  name: "B-29 Superfortress bomber",
  length: 30.18,
  span: 43.05,
  /** To the top of the fin. */
  height: 8.46,
  propellerDiameter: 5.05,
  highNote:
    "High tier: NACA-section wing, tailplane and fin with separate Fowler flaps, ailerons, elevators and rudder; rounded tips; a framed glazed nose, a navigator's astrodome and pitot tubes; four remote-controlled turrets and the tail position with paired barrels; side and top sighting blisters; bomb-bay door seams; cowlings with front-row cylinders behind the intake, chin oil-cooler scoops, opened cowl flaps and turbosuperchargers; twisted Hamilton Standard blades with yellow tips; dual main wheels with oleo struts, drag braces and open gear doors; a twin nose wheel with its doors; and the radio mast with its wire to the fin.",
  note: "Schematic exterior of the Boeing B-29 Superfortress (United States, in service 1944–1960): a pressurized cylindrical fuselage with a glazed nose and no stepped cockpit, a high-aspect-ratio tapered wing with 4.5° dihedral, four Wright R-3350 Duplex-Cyclone radials in long nacelles driving four-blade propellers, a tall fin with a dorsal fillet, remote-controlled gun turrets above and below the fuselage, a manned tail position and tricycle landing gear with dual main wheels retracting into the inboard nacelles. Bare natural-metal finish without markings. Length, span, height and propeller diameter follow the published figures; the tail surfaces, nacelle stations and gear positions are proportioned from general-arrangement drawings. Interior, bomb load, the APQ-13 radome of some aircraft and the four-gun upper turret of later blocks are omitted. Static model: the propellers, turrets and control surfaces do not move."
} as const;

export interface B29Meshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export type B29Quality = "low" | "high";

const NOSE_X = B29.length / 2,
  TAIL_X = -B29.length / 2;
const WING_HALF = B29.span / 2;
/** Chord plane at the wing root, just below the fuselage axis (mid-wing). */
const WING_Y = 3.35;
const DIHEDRAL = Math.tan((4.5 * Math.PI) / 180);
const WING_ROOT = { chord: 5.6, le: 3.6 };
const WING_TIP = {
  chord: 2.0,
  le: WING_ROOT.le - WING_HALF * Math.tan((7 * Math.PI) / 180)
};
const ENGINES = [
  { s: 4.85, ahead: 3.2, inboard: true },
  { s: 10.55, ahead: 3.0, inboard: false }
];
const PROP_RADIUS = B29.propellerDiameter / 2;
const MAIN_GEAR = { x: 1.2, tire: 0.71, width: 0.42 };
const NOSE_GEAR = { x: 10.6, tire: 0.455, width: 0.26 };

/** Fuselage profile: station x, radius and centre height. Dense at the nose and tail cone, straight between. */
const FUSELAGE: readonly [number, number, number][] = [
  [NOSE_X, 0.04, 3.4],
  [15.0, 0.42, 3.42],
  [14.75, 0.78, 3.44],
  [14.35, 1.07, 3.46],
  [13.8, 1.28, 3.48],
  [13.1, 1.41, 3.5],
  [12.4, 1.45, 3.5],
  [-5.5, 1.45, 3.5],
  [-7.5, 1.36, 3.55],
  [-9.5, 1.18, 3.65],
  [-11.5, 0.95, 3.78],
  [-13.2, 0.7, 3.9],
  [-14.2, 0.55, 3.96],
  [-14.5, 0.47, 3.98],
  [-14.7, 0.36, 3.99],
  [-14.82, 0.2, 4.0],
  [-14.85, 0.05, 4.0]
];
const GLAZING_FROM = 12.6,
  TAIL_GLAZING_FROM = -14.2;

function fuselageAt(x: number): { r: number; cy: number } {
  for (let i = 1; i < FUSELAGE.length; i++) {
    const [x0, r0, y0] = FUSELAGE[i - 1],
      [x1, r1, y1] = FUSELAGE[i];
    if (x <= x0 && x >= x1) {
      const t = x0 === x1 ? 0 : (x0 - x) / (x0 - x1);
      return { r: r0 + (r1 - r0) * t, cy: y0 + (y1 - y0) * t };
    }
  }
  const [, r, cy] = x > NOSE_X ? FUSELAGE[0] : FUSELAGE.at(-1)!;
  return { r, cy };
}

/** A lifting surface: chord, leading edge and thickness ratio taper linearly from root (s = 0) to tip. */
interface Surface {
  half: number;
  root: { chord: number; le: number; t: number };
  tip: { chord: number; le: number; t: number };
  /** Maps span station, chordwise x and thickness offset to model space. */
  place(s: number, x: number, v: number): THREE.Vector3;
}

const WING = (side: number): Surface => ({
  half: WING_HALF,
  root: { ...WING_ROOT, t: 0.22 },
  tip: { ...WING_TIP, t: 0.09 },
  place: (s, x, v) => new THREE.Vector3(x, WING_Y + s * DIHEDRAL + v, side * s)
});
/** Tailplane span and planform are proportioned from drawings. */
const TAILPLANE = (side: number): Surface => ({
  half: 6.6,
  root: { chord: 3.7, le: -10.4, t: 0.12 },
  tip: { chord: 1.5, le: -11.8, t: 0.09 },
  place: (s, x, v) => new THREE.Vector3(x, 3.85 + v, side * s)
});
const FIN_ROOT_Y = 4.3;
const FIN: Surface = {
  half: B29.height - FIN_ROOT_Y,
  root: { chord: 6.2, le: -8.6, t: 0.11 },
  tip: { chord: 2.4, le: -12.3, t: 0.09 },
  place: (s, x, v) => new THREE.Vector3(x, FIN_ROOT_Y + s, v)
};

function section(surface: Surface, s: number) {
  const t = s / surface.half;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const chord = lerp(surface.root.chord, surface.tip.chord);
  // Rounded tips: the last stations shrink about a point 40% back along the chord.
  const round =
    s <= surface.half - 0.6
      ? 1
      : s <= surface.half - 0.25
        ? 1 - ((s - surface.half + 0.6) / 0.35) * 0.2
        : 0.8 - ((s - surface.half + 0.25) / 0.25) * 0.45;
  const c = chord * round;
  return {
    chord: c,
    le: lerp(surface.root.le, surface.tip.le) - (chord - c) * 0.4,
    t: lerp(surface.root.t, surface.tip.t) * Math.sqrt(round)
  };
}

/**
 * Symmetric NACA four-digit section as a closed loop between chord fractions `from` and `to`:
 * over the top from the aft cut forward, then back underneath. Zero-thickness edges are not repeated.
 */
function airfoil(t: number, count: number, from = 0, to = 1): [number, number][] {
  const half = (u: number) =>
    5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  const us = Array.from(
    { length: count + 1 },
    (_, i) => from + ((to - from) * (1 - Math.cos((Math.PI * i) / count))) / 2
  );
  const upper = [...us].reverse().map(u => [u, half(u)] as [number, number]);
  let lower = us.map(u => [u, -half(u)] as [number, number]);
  if (from === 0) lower = lower.slice(1);
  if (to === 1) lower = lower.slice(0, -1);
  return [...upper, ...lower];
}

/**
 * A closed surface through rings of equal point count with end caps. Every ring is convex, so each face is
 * turned to look away from the axis between the centroids of its two rings.
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

/** A circle in the YZ plane at station x. */
function hoop(x: number, cy: number, cz: number, r: number, count: number): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i * Math.PI * 2) / count - Math.PI / 2;
    return new THREE.Vector3(x, cy + Math.sin(a) * r, cz + Math.cos(a) * r);
  });
}

export function createB29Model(quality: B29Quality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `b29-superfortress-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const metal = new THREE.MeshLambertMaterial({ color: 0xc8ccd1 });
  const metalShade = new THREE.MeshLambertMaterial({ color: 0xa9aeb4 });
  /** Doped fabric of the control surfaces. */
  const fabric = new THREE.MeshLambertMaterial({ color: 0xbabdbf });
  const glass = new THREE.MeshLambertMaterial({ color: 0x5f7684 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2d2f });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const blade = new THREE.MeshLambertMaterial({ color: 0x1f2021 });
  const tipPaint = new THREE.MeshLambertMaterial({ color: 0xd8b13a });
  const materials = [metal, metalShade, fabric, glass, dark, rubber, blade, tipPaint];
  const segments = high ? 36 : 16;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, high ? 28 : 16);
  const dome = new THREE.SphereGeometry(1, high ? 24 : 12, high ? 8 : 4, 0, Math.PI * 2, 0, Math.PI / 2);
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
    material: THREE.Material = metal
  ) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  /** Cylinder from a to b. */
  function rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material = metal) {
    const mesh = add(name, disc, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** A wheel turning about the Z axis. */
  const wheel = (
    name: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    width: number,
    material: THREE.Material
  ) => rod(name, v(x, y, z - width / 2), v(x, y, z + width / 2), radius, material);
  /** A flattened dome at p whose crown points along `up`. */
  function bubble(
    name: string,
    p: THREE.Vector3,
    up: THREE.Vector3,
    radius: number,
    rise: number,
    material: THREE.Material
  ) {
    const mesh = add(name, dome, material);
    mesh.position.copy(p);
    mesh.scale.set(radius, rise, radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), up.clone().normalize());
    return mesh;
  }
  /** A thin hoop, or an arc of one centred on the underside, in the YZ plane at station x. */
  function frameRing(name: string, x: number, cy: number, r: number, tube: number, arc = Math.PI * 2) {
    const geometry = new THREE.TorusGeometry(r, tube, 4, high ? 48 : 24, arc);
    geometry.rotateZ(-Math.PI / 2 - arc / 2);
    geometry.rotateY(Math.PI / 2);
    const mesh = add(name, geometry, metalShade);
    mesh.position.set(x, cy, 0);
    return mesh;
  }

  // Lifting surfaces, split into fixed panels and control surfaces on the high tier.
  function surface(
    name: string,
    spec: Surface,
    panels: readonly {
      from: number;
      to: number;
      split?: number;
      control?: string;
    }[]
  ) {
    const count = high ? 22 : 8;
    const tipStations = [spec.half - 0.6, spec.half - 0.25];
    for (const panel of panels) {
      const stations = [panel.from, ...tipStations.filter(s => s > panel.from && s < panel.to), panel.to];
      const ranges: [number, number, string, THREE.Material][] = panel.split
        ? [
            [0, panel.split, name, metal],
            [panel.split, 1, panel.control!, fabric]
          ]
        : [[0, 1, name, metal]];
      for (const [from, to, part, material] of ranges) {
        const rings = stations.map(s => {
          const { chord, le, t } = section(spec, s);
          return airfoil(t, count, from, to).map(([u, y]) => spec.place(s, le - u * chord, y * chord));
        });
        add(part, loft(rings), material);
      }
    }
  }
  for (const side of [-1, 1]) {
    surface(
      "wing",
      WING(side),
      high
        ? [
            { from: 0, to: 12.6, split: 0.74, control: "flap" },
            { from: 12.6, to: 13.0 },
            { from: 13.0, to: 20.4, split: 0.75, control: "aileron" },
            { from: 20.4, to: WING_HALF }
          ]
        : [{ from: 0, to: WING_HALF }]
    );
    surface(
      "tailplane",
      TAILPLANE(side),
      high
        ? [
            { from: 0, to: 6.3, split: 0.7, control: "elevator" },
            { from: 6.3, to: 6.6 }
          ]
        : [{ from: 0, to: 6.6 }]
    );
  }
  surface(
    "fin",
    FIN,
    high
      ? [
          { from: 0, to: FIN.half - 0.35, split: 0.65, control: "rudder" },
          { from: FIN.half - 0.35, to: FIN.half }
        ]
      : [{ from: 0, to: FIN.half }]
  );
  // Dorsal fillet running forward from the fin along the spine.
  const fillet = new THREE.Shape();
  fillet.moveTo(-5.2, 4.85);
  fillet.quadraticCurveTo(-8.6, 5.0, -10.1, 5.9);
  fillet.lineTo(-10.5, 4.4);
  fillet.closePath();
  const filletGeometry = new THREE.ExtrudeGeometry(fillet, {
    depth: 0.22,
    bevelEnabled: false,
    curveSegments: 10
  });
  filletGeometry.translate(0, 0, -0.11);
  add("dorsal-fillet", filletGeometry, metal);

  // Fuselage, glazed nose and the tail gunner's glazing.
  const stations = (from: number, to: number) => FUSELAGE.map(([x]) => x).filter(x => x < from && x > to);
  const body = [GLAZING_FROM, ...stations(GLAZING_FROM, TAIL_GLAZING_FROM), TAIL_GLAZING_FROM];
  const rings = (xs: number[]) =>
    xs.map(x => {
      const { r, cy } = fuselageAt(x);
      return hoop(x, cy, 0, r, segments);
    });
  add("fuselage", loft(rings(body)), metal);
  add("nose-glazing", loft(rings([NOSE_X, ...stations(NOSE_X, GLAZING_FROM), GLAZING_FROM])), glass);
  add("tail-gunner-glazing", loft(rings([TAIL_GLAZING_FROM, ...stations(TAIL_GLAZING_FROM, TAIL_X)])), glass);
  for (const z of [-0.12, 0.12]) rod("tail-gun", v(-14.4, 3.75, z), v(TAIL_X, 3.75, z), 0.035, dark);
  box("tail-gun-mount", -14.7, 3.75, 0, 0.3, 0.2, 0.42, metalShade);

  // Remote-controlled turrets, each with paired barrels: forward ones face forward, aft ones aft.
  const turrets = [
    { x: 8.6, up: 1, aim: 1 },
    { x: -5.0, up: 1, aim: -1 },
    { x: 8.3, up: -1, aim: 1 },
    { x: -7.2, up: -1, aim: -1 }
  ];
  for (const turret of turrets) {
    const { r, cy } = fuselageAt(turret.x);
    const y = cy + turret.up * (r - 0.06);
    bubble("gun-turret", v(turret.x, y, 0), v(0, turret.up, 0), 0.55, 0.36, metalShade);
    const gunY = y + turret.up * 0.17;
    for (const z of [-0.13, 0.13])
      rod("turret-gun", v(turret.x + turret.aim * 0.3, gunY, z), v(turret.x + turret.aim * 1.55, gunY, z), 0.03, dark);
  }

  // Engine nacelles: cowling ahead of the wing, tapering aft over or past the trailing edge.
  const wingLe = (s: number) => WING_ROOT.le + (WING_TIP.le - WING_ROOT.le) * (s / WING_HALF);
  const wingTe = (s: number) => wingLe(s) - (WING_ROOT.chord + (WING_TIP.chord - WING_ROOT.chord) * (s / WING_HALF));
  for (const side of [-1, 1])
    for (const engine of ENGINES) {
      const z = side * engine.s;
      const yt = WING_Y + engine.s * DIHEDRAL - 0.3;
      const le = wingLe(engine.s),
        te = wingTe(engine.s);
      const front = le + engine.ahead;
      const aft = engine.inboard ? te - 1.6 : te - 0.3;
      const profile: [number, number, number][] = [
        [front, 0.66, 0],
        [front - 0.12, 0.78, 0],
        [front - 0.5, 0.84, 0],
        [front - 1.7, 0.86, 0],
        [le + 0.2, 0.86, 0],
        ...(engine.inboard
          ? ([
              [te + 0.4, 0.74, 0.05],
              [aft + 0.8, 0.5, 0.15],
              [aft, 0.15, 0.25]
            ] as [number, number, number][])
          : ([
              [(le + te) / 2, 0.76, 0.05],
              [te + 0.3, 0.45, 0.2],
              [aft, 0.12, 0.28]
            ] as [number, number, number][]))
      ];
      add("nacelle", loft(profile.map(([x, r, dy]) => hoop(x, yt + dy, z, r, segments))), metal);
      rod("cowl-intake", v(front, yt, z), v(front + 0.01, yt, z), 0.6, dark);
      bubble("reduction-gear-housing", v(front, yt, z), v(1, 0, 0), 0.42, 0.3, metalShade);
      const propX = front + 0.3;
      bubble("propeller-hub", v(propX - 0.05, yt, z), v(1, 0, 0), 0.3, 0.42, metal);
      if (high) {
        for (let i = 0; i < 9; i++) {
          const a = (i * Math.PI * 2) / 9;
          box(
            "engine-cylinder",
            front - 0.02,
            yt + Math.cos(a) * 0.5,
            z + Math.sin(a) * 0.5,
            0.1,
            0.2,
            0.13,
            dark
          ).rotation.x = a;
        }
        box("oil-cooler-scoop", front - 0.3, yt - 0.82, z, 0.6, 0.2, 0.6, metal);
        box("oil-cooler-intake", front + 0.005, yt - 0.82, z, 0.01, 0.12, 0.5, dark);
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI * 2) / 16;
          const flap = box(
            "cowl-flap",
            front - 1.85,
            yt + Math.cos(a) * 0.885,
            z + Math.sin(a) * 0.885,
            0.32,
            0.02,
            0.3,
            metalShade
          );
          flap.rotation.set(a, 0, -0.14);
        }
        for (const flank of [-1, 1]) {
          wheel("turbo-supercharger", le + 0.4, yt - 0.42, z + flank * 0.78, 0.2, 0.12, metalShade);
          rod(
            "turbo-exhaust",
            v(le + 0.25, yt - 0.42, z + flank * 0.84),
            v(le - 0.15, yt - 0.42, z + flank * 0.84),
            0.07,
            dark
          );
        }
      }
      // Four blades in an X when parked, twisted from a coarse root to a finer tip.
      for (let b = 0; b < 4; b++) {
        const a = Math.PI / 4 + (b * Math.PI) / 2;
        const radial = v(0, Math.cos(a), Math.sin(a)),
          tangent = v(0, -Math.sin(a), Math.cos(a)),
          axial = v(1, 0, 0);
        const hub = v(propX, yt, z);
        const fractions = high ? [0, 0.12, 0.35, 0.6, 0.8, 0.93, 0.98, 1] : [0, 0.35, 0.8, 1];
        const chordAt = (f: number) =>
          f < 0.12
            ? 0.17
            : f < 0.35
              ? 0.17 + ((f - 0.12) / 0.23) * 0.15
              : f < 0.8
                ? 0.32 - ((f - 0.35) / 0.45) * 0.05
                : 0.27 - ((f - 0.8) / 0.2) * 0.19;
        const thickAt = (f: number) =>
          f < 0.12 ? 0.15 : 0.15 - Math.min(1, (f - 0.12) / 0.3) * 0.09 - Math.max(0, f - 0.42) * 0.05;
        const ringAt = (f: number) => {
          const rho = 0.25 + f * (PROP_RADIUS - 0.25);
          const pitch = high ? ((52 - f * 32) * Math.PI) / 180 : (38 * Math.PI) / 180;
          const chordDir = tangent.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(axial, Math.sin(pitch));
          const thickDir = tangent.clone().multiplyScalar(-Math.sin(pitch)).addScaledVector(axial, Math.cos(pitch));
          const centre = hub.clone().addScaledVector(radial, rho);
          const count = high ? 12 : 6;
          return Array.from({ length: count }, (_, i) => {
            const t = (i * Math.PI * 2) / count;
            return centre
              .clone()
              .addScaledVector(chordDir, (Math.cos(t) * chordAt(f)) / 2)
              .addScaledVector(thickDir, (Math.sin(t) * thickAt(f)) / 2);
          });
        };
        const split = high ? fractions.indexOf(0.93) : fractions.length - 1;
        add("propeller-blade", loft(fractions.slice(0, split + 1).map(ringAt)), blade);
        if (high) add("propeller-tip", loft(fractions.slice(split).map(ringAt)), tipPaint);
      }
    }

  // Tricycle gear: dual main wheels under the inboard nacelles, a twin nose wheel under the forward cabin.
  for (const side of [-1, 1]) {
    const z = side * ENGINES[0].s;
    const y = MAIN_GEAR.tire;
    for (const offset of [-0.33, 0.33]) {
      wheel("tire", MAIN_GEAR.x, y, z + offset, MAIN_GEAR.tire, MAIN_GEAR.width, rubber);
      wheel("wheel-hub", MAIN_GEAR.x, y, z + offset, 0.36, MAIN_GEAR.width + 0.02, metalShade);
    }
    rod("main-axle", v(MAIN_GEAR.x, y, z - 0.55), v(MAIN_GEAR.x, y, z + 0.55), 0.06, metalShade);
    const nacelleBottom = WING_Y + ENGINES[0].s * DIHEDRAL - 0.3 - 0.7;
    if (high) {
      rod("main-gear-oleo", v(MAIN_GEAR.x, y, z), v(MAIN_GEAR.x, y + 0.9, z), 0.075, metal);
      rod("main-gear-strut", v(MAIN_GEAR.x, y + 0.85, z), v(MAIN_GEAR.x, nacelleBottom, z), 0.12, metalShade);
      for (const dz of [-0.09, 0.09])
        rod(
          "torque-link",
          v(MAIN_GEAR.x + 0.02, y + 0.15, z + dz),
          v(MAIN_GEAR.x + 0.25, y + 0.55, z + dz),
          0.025,
          metalShade
        );
      rod("drag-brace", v(MAIN_GEAR.x, y + 0.9, z), v(MAIN_GEAR.x + 1.5, nacelleBottom, z), 0.07, metalShade);
      for (const flank of [-1, 1])
        box("main-gear-door", MAIN_GEAR.x - 0.2, nacelleBottom - 0.2, z + flank * 0.62, 2.4, 0.75, 0.03, metalShade);
    } else rod("main-gear-strut", v(MAIN_GEAR.x, y, z), v(MAIN_GEAR.x, nacelleBottom, z), 0.11, metalShade);
  }
  const noseBelly = fuselageAt(NOSE_GEAR.x).cy - fuselageAt(NOSE_GEAR.x).r;
  for (const offset of [-0.2, 0.2]) {
    wheel("tire", NOSE_GEAR.x, NOSE_GEAR.tire, offset, NOSE_GEAR.tire, NOSE_GEAR.width, rubber);
    wheel("wheel-hub", NOSE_GEAR.x, NOSE_GEAR.tire, offset, 0.22, NOSE_GEAR.width + 0.02, metalShade);
  }
  rod(
    "nose-gear-strut",
    v(NOSE_GEAR.x, NOSE_GEAR.tire, 0),
    v(NOSE_GEAR.x, noseBelly + 0.2, 0),
    high ? 0.08 : 0.09,
    metalShade
  );
  if (high) {
    rod(
      "nose-gear-brace",
      v(NOSE_GEAR.x, NOSE_GEAR.tire + 0.9, 0),
      v(NOSE_GEAR.x - 1.0, noseBelly + 0.1, 0),
      0.05,
      metalShade
    );
    for (const flank of [-1, 1])
      box("nose-gear-door", NOSE_GEAR.x - 0.2, noseBelly - 0.36, flank * 0.42, 1.5, 0.85, 0.03, metalShade);
  }

  if (high) {
    // Framed nose glazing: hoops and meridian ribs over the glass.
    for (const x of [14.75, 14.35, 13.8, 13.1, GLAZING_FROM]) {
      const { r, cy } = fuselageAt(x);
      frameRing("glazing-frame", x, cy, r + 0.008, 0.016);
    }
    const ribStations = [15.0, 14.75, 14.35, 13.8, 13.1, GLAZING_FROM];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const at = (x: number) => {
        const { r, cy } = fuselageAt(x);
        return v(x, cy + Math.cos(a) * (r + 0.008), Math.sin(a) * (r + 0.008));
      };
      for (let k = 1; k < ribStations.length; k++)
        rod("glazing-rib", at(ribStations[k - 1]), at(ribStations[k]), 0.012, metalShade);
    }
    for (const x of [-14.5, TAIL_GLAZING_FROM]) {
      const { r, cy } = fuselageAt(x);
      frameRing("glazing-frame", x, cy, r + 0.006, 0.014);
    }
    // Navigator's astrodome, the gunners' side and top sighting blisters.
    const top = (x: number) => fuselageAt(x).cy + fuselageAt(x).r;
    bubble("astrodome", v(11.0, top(11.0) - 0.04, 0), v(0, 1, 0), 0.3, 0.28, glass);
    bubble("sighting-blister", v(-6.6, top(-6.6) - 0.06, 0), v(0, 1, 0), 0.4, 0.3, glass);
    for (const side of [-1, 1]) {
      const { r, cy } = fuselageAt(-8.0);
      bubble("sighting-blister", v(-8.0, cy, side * (r - 0.06)), v(0, 0, side), 0.4, 0.26, glass);
      rod("pitot-tube", v(13.0, 3.0, side * 1.33), v(13.6, 3.0, side * 1.33), 0.015, metalShade);
    }
    // Bomb-bay door seams ahead of and behind the wing centre section.
    for (const [from, to] of [
      [3.8, 7.6],
      [-6.0, -2.2]
    ]) {
      const { r, cy } = fuselageAt((from + to) / 2);
      box("bomb-bay-seam", (from + to) / 2, cy - r, 0, to - from, 0.02, 0.03, dark);
      for (const x of [from, to]) frameRing("bomb-bay-seam", x, cy, r + 0.004, 0.01, 1.0).material = dark;
      for (const side of [-1, 1]) {
        const a = Math.asin(0.6 / r);
        const seam = box(
          "bomb-bay-seam",
          (from + to) / 2,
          cy - Math.cos(a) * (r + 0.004),
          side * 0.6,
          to - from,
          0.02,
          0.03,
          dark
        );
        seam.rotation.x = -side * a;
      }
    }
    // Radio mast on the forward spine and its wire to the fin.
    const mastTop = v(9.8, top(9.8) + 0.55, 0);
    rod("radio-mast", v(9.8, top(9.8) - 0.05, 0), mastTop, 0.03, metalShade);
    const finS = 2.5;
    rod("antenna-wire", mastTop, v(section(FIN, finS).le + 0.05, FIN_ROOT_Y + finS, 0), 0.006, dark);
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

export function createB29(quality: B29Quality = "low"): B29Meshes {
  const model = createB29Model(quality);
  return {
    ...model,
    elevation: meshProjection(model, "side"),
    plan: meshProjection(model, "top")
  };
}
