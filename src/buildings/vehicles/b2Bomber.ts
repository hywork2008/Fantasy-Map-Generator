import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

/** Northrop B-2 Spirit stealth bomber, parked on its tricycle gear, in meters; the nose faces positive X. */
export const B2 = {
  author: "Claude Opus 5.5" as Author,
  name: "B-2 Spirit stealth bomber",
  length: 21.0,
  span: 52.4,
  /** To the top of the crew compartment. */
  height: 5.18,
  /** Leading-edge sweep in degrees; every trailing-edge segment runs parallel to one of the leading edges. */
  sweep: 33,
  highNote:
    "High tier: a finely sampled blended wing with separate elevons (three a side), split drag rudders at the tips and the centre gust-load-alleviation surface (beaver tail); four cockpit windows and the two crew escape hatches; the in-flight refuelling receptacle; engine humps with dark intake mouths, open auxiliary inlet doors and four recessed exhaust troughs; bomb-bay door seams on the belly; four-wheel main bogies with oleo struts, side and drag braces, torque links, gear wells and open doors; a twin nose wheel with its brace and doors.",
  note: "Schematic exterior of the Northrop Grumman B-2 Spirit (United States, in service from 1997): a tailless flying wing whose straight leading edges are swept 33° and whose double-W sawtooth trailing edge keeps every edge parallel to one of the leading edges. A thick centre body houses the crew compartment and two bomb bays; the four General Electric F118 turbofans are buried in the wing in two humps, fed by intakes on the upper surface and exhausting over recessed troughs ahead of the trailing edge, hidden from radar below. Uniform dark grey finish without markings. Length, span, height and sweep follow the published figures; the trailing-edge breaks, thickness, intake and gear positions are proportioned from general-arrangement drawings. Interior, weapons, radar-absorbent panel joints and sensors are omitted. Static model: the control surfaces and doors do not move."
} as const;

export interface B2Meshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export type B2Quality = "low" | "high";

const NOSE_X = B2.length / 2;
/** Model X at a distance aft of the nose. */
const xAt = (d: number) => NOSE_X - d;
const WING_HALF = B2.span / 2;
const SWEEP = Math.tan((B2.sweep * Math.PI) / 180);
const TIP_CHORD = 3.9;
/** Height of the chord plane at the leading edge. */
const CHORD_Y = 3.05;
/** Upper and lower shares of the section thickness: the upper surface carries most of the camber. */
const UPPER = 1.2,
  LOWER = 0.8;

/** Trailing edge as [span station, distance aft of the nose]: centre point, inner notch, inner point, outer notch, tip. */
const TRAILING_EDGE: readonly [number, number][] = (() => {
  const inner = 6.6,
    point = 11.4;
  const notch = B2.length - SWEEP * inner;
  const aft = notch + SWEEP * (point - inner);
  const outer = (aft + SWEEP * point - TIP_CHORD) / (2 * SWEEP);
  return [
    [0, B2.length],
    [inner, notch],
    [point, aft],
    [outer, SWEEP * outer + TIP_CHORD],
    [WING_HALF, SWEEP * WING_HALF + TIP_CHORD]
  ];
})();
/** Thickness-to-chord ratio along the span. */
const THICKNESS: readonly [number, number][] = [
  [0, 0.13],
  [3.2, 0.13],
  [6.6, 0.1],
  [11.4, 0.08],
  [TRAILING_EDGE[3][0], 0.065],
  [WING_HALF, 0.055]
];

const NOSE_GEAR = { d: 6.6, tire: 0.45, width: 0.25 };
const MAIN_GEAR = { d: 13.3, z: 6.1, tire: 0.6, width: 0.36 };
/** Engine humps sit over each pair of engines; the intake opens at the front of the hump. */
const ENGINE_HUMP = { z: 4.2, width: 1.15, rise: 0.5, intake: 6.8, intakeDepth: 1.0 };
const COCKPIT = { d: 0.3 * B2.length, front: 1.9, back: 3.8, width: 1.7 };

function piecewise(table: readonly [number, number][], s: number, smooth: boolean): number {
  for (let i = 1; i < table.length; i++) {
    const [s0, v0] = table[i - 1],
      [s1, v1] = table[i];
    if (s <= s1) {
      const t = Math.max(0, (s - s0) / (s1 - s0));
      return v0 + (v1 - v0) * (smooth ? (1 - Math.cos(Math.PI * t)) / 2 : t);
    }
  }
  return table.at(-1)![1];
}

const leadingEdge = (z: number) => SWEEP * Math.abs(z);
const trailingEdge = (z: number) => piecewise(TRAILING_EDGE, Math.abs(z), false);
const chord = (z: number) => trailingEdge(z) - leadingEdge(z);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Normalised symmetric NACA half-thickness: 0.5 at the 30% station. */
function profile(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return 5 * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4);
}

function cockpitBump(d: number, z: number): number {
  const s = d < COCKPIT.d ? COCKPIT.front : COCKPIT.back;
  return Math.exp(-0.5 * ((d - COCKPIT.d) / s) ** 2 - 0.5 * (z / COCKPIT.width) ** 2);
}

function engineBump(d: number, z: number): number {
  const across = Math.exp(-0.5 * ((Math.abs(z) - ENGINE_HUMP.z) / ENGINE_HUMP.width) ** 2);
  const along =
    smoothstep(ENGINE_HUMP.intake, ENGINE_HUMP.intake + ENGINE_HUMP.intakeDepth, d) * (1 - smoothstep(11.5, 15.5, d));
  return ENGINE_HUMP.rise * across * along;
}

/** Outer surface heights at distance d aft of the nose and span station z, without the cockpit rise. */
function baseUpper(d: number, z: number): number {
  const c = chord(z);
  const t = piecewise(THICKNESS, Math.abs(z), true);
  return CHORD_Y + c * t * UPPER * profile((d - leadingEdge(z)) / c) + engineBump(d, z);
}
function lowerY(d: number, z: number): number {
  const c = chord(z);
  const t = piecewise(THICKNESS, Math.abs(z), true);
  return CHORD_Y - c * t * LOWER * profile((d - leadingEdge(z)) / c);
}

/** Chordwise loop between fractions `from` and `to`: over the top aft to fore, back underneath; sharp edges once. */
function chordLoop(count: number, from: number, to: number): [number, 1 | -1][] {
  const us = Array.from(
    { length: count + 1 },
    (_, i) => from + ((to - from) * (1 - Math.cos((Math.PI * i) / count))) / 2
  );
  const upper = [...us].reverse().map(u => [u, 1] as [number, 1]);
  let lower = us.map(u => [u, -1] as [number, -1]);
  if (from === 0) lower = lower.slice(1);
  if (to === 1) lower = lower.slice(0, -1);
  return [...upper, ...lower];
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

/** Spanwise panels of one half, outward from the centre panel; controls are cut a fixed depth ahead of the edge. */
const HALF_PANELS: readonly { to: number; control?: string; depth?: number }[] = [
  { to: 7.0 },
  { to: 11.0, control: "elevon", depth: 1.5 },
  { to: 11.9 },
  { to: 17.4, control: "elevon", depth: 1.4 },
  { to: 18.5 },
  { to: 22.1, control: "elevon", depth: 1.25 },
  { to: 22.5 },
  { to: 25.8, control: "drag-rudder", depth: 1.25 },
  { to: WING_HALF }
];
const CENTRE_PANEL = { half: 1.5, control: "beaver-tail", depth: 1.7 };

export function createB2Model(quality: B2Quality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `b2-spirit-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const skin = new THREE.MeshLambertMaterial({ color: 0x5d6267 });
  const control = new THREE.MeshLambertMaterial({ color: 0x53585d });
  const shade = new THREE.MeshLambertMaterial({ color: 0x45494d });
  const glass = new THREE.MeshLambertMaterial({ color: 0x27323a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e20 });
  const exhaust = new THREE.MeshLambertMaterial({ color: 0x3b3936 });
  const gear = new THREE.MeshLambertMaterial({ color: 0xb9bcbf });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const materials = [skin, control, shade, glass, dark, exhaust, gear, rubber];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, high ? 28 : 16);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = gear) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  /** Cylinder from a to b. */
  function rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = gear) {
    const mesh = add(name, disc, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** A wheel turning about the Z axis. */
  const wheel = (name: string, x: number, y: number, z: number, radius: number, width: number, material = rubber) =>
    rod(name, v(x, y, z - width / 2), v(x, y, z + width / 2), radius, material);

  // The cockpit rise is scaled so the crest of the actual centre-line samples reaches the published height.
  const chordCount = high ? 72 : 28;
  const centreCut = high ? 1 - CENTRE_PANEL.depth / B2.length : 1;
  let rise = Infinity;
  for (const [u, side] of chordLoop(chordCount, 0, centreCut)) {
    const d = u * B2.length,
      g = cockpitBump(d, 0);
    if (side > 0 && g > 1e-6) rise = Math.min(rise, (B2.height - baseUpper(d, 0)) / g);
  }
  const upperY = (d: number, z: number) => baseUpper(d, z) + rise * cockpitBump(d, z);
  const surfacePoint = (u: number, side: number, z: number) => {
    const d = leadingEdge(z) + u * chord(z);
    return v(xAt(d), side > 0 ? upperY(d, z) : lowerY(d, z), z);
  };

  // Blended wing: spanwise stations are dense across the humps and include every trailing-edge break.
  const breaks = TRAILING_EDGE.map(([s]) => s);
  const stations = new Set<number>();
  const inner = high ? 0.2 : 0.6,
    outer = high ? 0.7 : 2.4;
  for (let s = 0; s < 7.6; s += inner) stations.add(+s.toFixed(3));
  for (let s = 7.6; s < WING_HALF; s += outer) stations.add(+s.toFixed(3));
  for (const s of [...breaks, CENTRE_PANEL.half, ...HALF_PANELS.map(p => p.to)]) stations.add(s);
  const half = [...stations].sort((a, b) => a - b);
  const span = (from: number, to: number) => {
    const all = [...half.map(s => -s), ...half].filter(s => s > from + 1e-6 && s < to - 1e-6);
    return [from, ...[...new Set(all)].sort((a, b) => a - b), to];
  };
  function panel(name: string, from: number, to: number, controlName?: string, depth = 0) {
    const zs = span(from, to);
    const cut = (z: number) => (controlName ? 1 - depth / chord(z) : 1);
    add(name, loft(zs.map(z => chordLoop(chordCount, 0, cut(z)).map(([u, side]) => surfacePoint(u, side, z)))), skin);
    if (controlName)
      add(
        controlName,
        loft(zs.map(z => chordLoop(high ? 6 : 3, cut(z), 1).map(([u, side]) => surfacePoint(u, side, z)))),
        control
      );
  }
  if (high) {
    panel("centre-body", -CENTRE_PANEL.half, CENTRE_PANEL.half, CENTRE_PANEL.control, CENTRE_PANEL.depth);
    for (const side of [-1, 1]) {
      let from = CENTRE_PANEL.half;
      for (const p of HALF_PANELS) {
        const [a, b] = side > 0 ? [from, p.to] : [-p.to, -from];
        panel("wing", a, b, p.control, p.depth);
        from = p.to;
      }
    }
  } else panel("wing", -WING_HALF, WING_HALF);

  /**
   * A skin patch over a quad given as [span station, distance aft] corners, following the upper or lower surface
   * at a small offset; every face is wound to look away from the wing.
   */
  function patch(
    name: string,
    corners: readonly [number, number][],
    material: THREE.Material,
    { lower = false, lift = 0.02, nu = 6, nv = 6 } = {}
  ) {
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const a = i / nu,
          b = j / nv;
        const mix = (k: number) =>
          (1 - a) * (1 - b) * corners[0][k] +
          a * (1 - b) * corners[1][k] +
          a * b * corners[2][k] +
          (1 - a) * b * corners[3][k];
        const z = mix(0),
          d = mix(1);
        points.push(v(xAt(d), lower ? lowerY(d, z) - lift : upperY(d, z) + lift, z));
      }
    const index: number[] = [];
    const tri = (p: number, q: number, r: number) => {
      const n = points[q].clone().sub(points[p]).cross(points[r].clone().sub(points[p]));
      if (n.y < 0 !== lower) index.push(p, r, q);
      else index.push(p, q, r);
    };
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const p = j * (nu + 1) + i;
        tri(p, p + 1, p + nu + 2);
        tri(p, p + nu + 2, p + nu + 1);
      }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  const mirror = (corners: readonly [number, number][]) => corners.map(([z, d]) => [-z, d] as [number, number]);
  const bothSides = (corners: readonly [number, number][], draw: (c: readonly [number, number][]) => void) => {
    draw(corners);
    draw(mirror(corners));
  };

  // Cockpit windows on the front of the crew compartment: two windscreens and two side windows.
  bothSides(
    [
      [0.08, 4.3],
      [0.95, 4.5],
      [0.85, 5.25],
      [0.08, 5.2]
    ],
    c => patch("cockpit-window", c, glass, { lift: 0.025 })
  );
  bothSides(
    [
      [1.05, 4.6],
      [1.6, 4.95],
      [1.45, 5.45],
      [0.95, 5.35]
    ],
    c => patch("cockpit-window", c, glass, { lift: 0.025 })
  );

  // Engine intakes at the front of each hump, and the exhaust troughs ahead of the inner trailing edge.
  const intake = ENGINE_HUMP.intake;
  for (const side of [-1, 1]) {
    const zc = side * ENGINE_HUMP.z;
    patch(
      "engine-intake",
      [
        [zc - 2.1, intake - 0.05],
        [zc + 2.1, intake - 0.05],
        [zc + 2.1, intake + ENGINE_HUMP.intakeDepth * 0.85],
        [zc - 2.1, intake + ENGINE_HUMP.intakeDepth * 0.85]
      ],
      dark,
      { lift: 0.05, nu: 24, nv: 8 }
    );
    for (const z of [3.3, 5.1]) {
      const zz = side * z;
      const te = (s: number) => trailingEdge(s) - 0.08;
      patch(
        "exhaust-trough",
        [
          [zz - side * 0.75, 14.6],
          [zz + side * 0.75, 14.3],
          [zz + side * 0.75, te(z + 0.75)],
          [zz - side * 0.75, te(z - 0.75)]
        ],
        exhaust,
        { lift: 0.025, nu: 4, nv: 6 }
      );
    }
  }

  // Tricycle gear: four-wheel main bogies, a twin nose wheel under the crew compartment.
  for (const side of [-1, 1]) {
    const x = xAt(MAIN_GEAR.d),
      z = side * MAIN_GEAR.z,
      y = MAIN_GEAR.tire;
    const top = lowerY(MAIN_GEAR.d, z);
    for (const dx of [-0.68, 0.68])
      for (const dz of [-0.4, 0.4]) {
        wheel("tire", x + dx, y, z + dz, MAIN_GEAR.tire, MAIN_GEAR.width);
        wheel("wheel-hub", x + dx, y, z + dz, 0.34, MAIN_GEAR.width + 0.02, gear);
      }
    rod("bogie-beam", v(x - 0.85, y, z), v(x + 0.85, y, z), 0.09);
    for (const dx of [-0.68, 0.68]) rod("main-axle", v(x + dx, y, z - 0.55), v(x + dx, y, z + 0.55), 0.06);
    if (high) {
      rod("main-gear-oleo", v(x, y, z), v(x, y + 1.0, z), 0.1, gear);
      rod("main-gear-strut", v(x, y + 0.95, z), v(x, top + 0.1, z), 0.15, shade);
      for (const dz of [-0.12, 0.12])
        rod("torque-link", v(x - 0.03, y + 0.2, z + dz), v(x - 0.3, y + 0.65, z + dz), 0.03);
      rod("side-brace", v(x, y + 1.15, z), v(x, lowerY(MAIN_GEAR.d, z + side * 1.4), z + side * 1.4), 0.07, shade);
      rod("drag-brace", v(x, y + 1.15, z), v(xAt(MAIN_GEAR.d - 1.5), lowerY(MAIN_GEAR.d - 1.5, z), z), 0.07, shade);
      patch(
        "gear-well",
        [
          [z - 0.85, MAIN_GEAR.d - 1.9],
          [z + 0.85, MAIN_GEAR.d - 1.9],
          [z + 0.85, MAIN_GEAR.d + 1.6],
          [z - 0.85, MAIN_GEAR.d + 1.6]
        ],
        dark,
        { lower: true, lift: 0.015 }
      );
      for (const flank of [-1, 1]) {
        const dz = z + flank * 0.95;
        const doorTop = lowerY(MAIN_GEAR.d, dz);
        box("main-gear-door", x + 0.15, doorTop - 0.6, dz, 3.4, 1.2, 0.04, skin);
      }
    } else rod("main-gear-strut", v(x, y, z), v(x, top + 0.1, z), 0.14, shade);
  }
  const noseX = xAt(NOSE_GEAR.d);
  const noseTop = lowerY(NOSE_GEAR.d, 0);
  for (const dz of [-0.3, 0.3]) {
    wheel("tire", noseX, NOSE_GEAR.tire, dz, NOSE_GEAR.tire, NOSE_GEAR.width);
    wheel("wheel-hub", noseX, NOSE_GEAR.tire, dz, 0.24, NOSE_GEAR.width + 0.02, gear);
  }
  rod("nose-axle", v(noseX, NOSE_GEAR.tire, -0.4), v(noseX, NOSE_GEAR.tire, 0.4), 0.05);
  rod("nose-gear-strut", v(noseX, NOSE_GEAR.tire, 0), v(noseX, noseTop + 0.1, 0), high ? 0.09 : 0.1, shade);
  if (high) {
    rod("nose-gear-oleo", v(noseX, NOSE_GEAR.tire, 0), v(noseX, NOSE_GEAR.tire + 0.7, 0), 0.075, gear);
    rod(
      "nose-gear-brace",
      v(noseX, NOSE_GEAR.tire + 0.85, 0),
      v(xAt(NOSE_GEAR.d + 1.2), lowerY(NOSE_GEAR.d + 1.2, 0), 0),
      0.05,
      shade
    );
    patch(
      "gear-well",
      [
        [-0.5, NOSE_GEAR.d - 1.1],
        [0.5, NOSE_GEAR.d - 1.1],
        [0.5, NOSE_GEAR.d + 1.4],
        [-0.5, NOSE_GEAR.d + 1.4]
      ],
      dark,
      { lower: true, lift: 0.015 }
    );
    for (const flank of [-1, 1])
      box(
        "nose-gear-door",
        xAt(NOSE_GEAR.d + 0.15),
        lowerY(NOSE_GEAR.d, flank * 0.6) - 0.45,
        flank * 0.6,
        2.3,
        0.9,
        0.035,
        skin
      );

    // Crew escape hatches behind the windows and the refuelling receptacle on the spine.
    bothSides(
      [
        [0.2, 5.75],
        [0.9, 5.75],
        [0.9, 6.75],
        [0.2, 6.75]
      ],
      c => patch("escape-hatch", c, shade, { lift: 0.02, nu: 3, nv: 3 })
    );
    patch(
      "refuelling-receptacle",
      [
        [-0.35, 8.3],
        [0.35, 8.3],
        [0.35, 9.4],
        [-0.35, 9.4]
      ],
      dark,
      { lift: 0.02, nu: 3, nv: 3 }
    );
    // Auxiliary inlet doors on the humps, hinged at the back and propped open on the ground.
    for (const side of [-1, 1])
      for (const dz of [-0.75, 0.75]) {
        const z = side * ENGINE_HUMP.z + dz,
          d = intake + 1.9;
        const door = box("auxiliary-inlet-door", xAt(d), upperY(d, z) + 0.1, z, 0.6, 0.03, 0.55, shade);
        door.rotation.z = -0.35;
      }
    // Bomb-bay door seams: two bays either side of the keel, each closed by a pair of doors.
    for (const side of [-1, 1]) {
      const [inner, outer] = [side * 0.25, side * 1.85];
      const [front, back] = [8.2, 13.6];
      const seam = (corners: [number, number][]) =>
        patch("bomb-bay-seam", corners, dark, { lower: true, lift: 0.012, nu: 2, nv: 6 });
      for (const z of [inner, (inner + outer) / 2, outer])
        seam([
          [z - 0.02, front],
          [z + 0.02, front],
          [z + 0.02, back],
          [z - 0.02, back]
        ]);
      for (const d of [front, back])
        seam([
          [inner, d - 0.02],
          [outer, d - 0.02],
          [outer, d + 0.02],
          [inner, d + 0.02]
        ]);
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

export function createB2(quality: B2Quality = "low"): B2Meshes {
  const model = createB2Model(quality);
  return {
    ...model,
    elevation: meshProjection(model, "side"),
    plan: meshProjection(model, "top")
  };
}
