import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

export const OPUS_GALLEON_QUALITIES = ["high", "low"] as const;
export type OpusGalleonQuality = (typeof OPUS_GALLEON_QUALITIES)[number];

/** An imagined late-16th-century race-built galleon in meters; the bow points along +X, the waterline is y = 0. */
export const OPUS_GALLEON = {
  author: "Claude Opus 5.5",
  name: "Galleon",
  length: 63,
  beam: 12.4,
  height: 43,
  draft: 3.9,
  guns: 28,
  note: "Lofted hull with deadrise, tumblehome and a wineglass transom; stepped forecastle, quarterdeck and poop; two tiers of gunports; beakhead with lion figurehead; stern gallery, quarter galleries and lanterns. Fore and main masts carry course, topsail and topgallant; the mizzen carries a lateen and a small topsail; spritsail under the bowsprit. Standing rigging with channels, deadeyes and ratlines; principal running rigging. Dimensions are illustrative; interiors are omitted."
} as const;

const BMAX = 6.2;
const KEEL = 3.6;
const MAIN_DECK = 4.2;
const QUARTER_DECK = 6.7;
const POOP_DECK = 8.8;
const FORECASTLE_DECK = 6.6;
const BOW_U = 0.8;
const QUARTER_U = 0.31;
const POOP_U = 0.15;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
/** Smoothstep that also runs downhill when `from > to`. */
function step(from: number, to: number, x: number): number {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}
const bowFraction = (u: number) => Math.max(0, (u - 0.55) / 0.45);
const sternFraction = (u: number) => Math.max(0, (0.42 - u) / 0.42);

/** Top of the bulwark: waist, then stepped quarterdeck, poop and forecastle. */
function sheer(u: number): number {
  return 5.9 + 2 * step(0.33, 0.29, u) + 2.1 * step(0.17, 0.13, u) + 1.6 * step(0.78, 0.82, u) + 0.5 * step(0.9, 1, u);
}
function keel(u: number): number {
  return KEEL - 0.9 * bowFraction(u) ** 3 - 0.3 * sternFraction(u) ** 3;
}
/** Stern and stem lines rake outward with height (s = 0 at the keel, 1 at the sheer). */
const sternX = (s: number) => -21 - 1.4 * s;
const stemX = (s: number) => 15.5 + 5.5 * s ** 1.6;

function halfBreadth(u: number, s: number): number {
  const bow = bowFraction(u),
    stern = sternFraction(u);
  const fineness = bow + 0.6 * stern;
  const widest = (1.5 + keel(u)) / (sheer(u) + keel(u));
  const section =
    s < widest
      ? Math.sin(((Math.PI / 2) * s) / widest) ** (0.55 + 0.9 * fineness)
      : 1 - 0.2 * ((s - widest) / (1 - widest)) ** 1.6;
  const plan = (1 - bow ** 2.3) * (1 - stern ** 2.2 * (1 - 0.7 * s ** 0.6));
  return BMAX * plan * section;
}

/** Hull surface point at lengthwise parameter u and height y, on the starboard (+Z) side. */
function hullPoint(u: number, y: number): THREE.Vector3 {
  const top = sheer(u),
    bottom = keel(u);
  const height = clamp(y, -bottom, top);
  const s = (height + bottom) / (top + bottom);
  return new THREE.Vector3(lerp(sternX(s), stemX(s), u), height, halfBreadth(u, s));
}
function uAt(x: number, y: number): number {
  let u = 0.5;
  for (let i = 0; i < 8; i++) {
    const s = (clamp(y, -keel(u), sheer(u)) + keel(u)) / (sheer(u) + keel(u));
    u = clamp((x - sternX(s)) / (stemX(s) - sternX(s)), 0, 1);
  }
  return u;
}
const breadthAt = (x: number, y: number) => hullPoint(uAt(x, y), y).z;

type Layer = "solid" | "cloth" | "glow";

interface MastPlan {
  x: number;
  lowerHead: number;
  topHead: number;
  gallantHead?: number;
  radius: number;
  shrouds: number;
  yards: {
    y: number;
    width: number;
    foot: number;
    footWidth: number;
    tier: 0 | 1 | 2;
  }[];
}
const MASTS: MastPlan[] = [
  {
    x: 10,
    lowerHead: 21,
    topHead: 31,
    gallantHead: 37,
    radius: 0.38,
    shrouds: 5,
    yards: [
      { y: 19.6, width: 17, foot: 9.4, footWidth: 18, tier: 0 },
      { y: 29.6, width: 12, foot: 21.8, footWidth: 16, tier: 1 },
      { y: 35.6, width: 7, foot: 30.6, footWidth: 10.5, tier: 2 }
    ]
  },
  {
    x: -2,
    lowerHead: 24,
    topHead: 35,
    gallantHead: 42,
    radius: 0.44,
    shrouds: 6,
    yards: [
      { y: 22.4, width: 21, foot: 9.2, footWidth: 22, tier: 0 },
      { y: 33.4, width: 15, foot: 24.8, footWidth: 19, tier: 1 },
      { y: 40.4, width: 8.6, foot: 34.6, footWidth: 13, tier: 2 }
    ]
  },
  {
    x: -14.5,
    lowerHead: 18.5,
    topHead: 25.5,
    radius: 0.3,
    shrouds: 4,
    yards: [{ y: 24.6, width: 7.5, foot: 19.4, footWidth: 10, tier: 1 }]
  }
];
const LOWER_GUNS = [-15.5, -12.6, -9.7, -6.8, -3.9, -1, 1.9, 4.8, 7.7, 10.6];
const UPPER_GUNS = [-8, 1.2, 4.2];

const COLORS = {
  tallow: 0xd6cbb0,
  tar: 0x2c241e,
  wale: 0x3f2d22,
  oak: 0x6e4b31,
  ochre: 0xc89b45,
  red: 0x7a2a21,
  teal: 0x2b4a52,
  inner: 0x8a5c3c,
  deck: 0xb89466,
  spar: 0x6a4a30,
  dark: 0x14191b,
  iron: 0x2a2f31,
  gold: 0xc9a24a,
  cream: 0xd9c690,
  glass: 0x1c2a33,
  canvas: 0xebe1c6,
  crimson: 0x9c1f24,
  lantern: 0xffd27a
};

export interface OpusGalleonOptions {
  /** National ensign on the stern staff; hidden by default. */
  ensign?: boolean;
}

export function createOpusGalleon(
  quality: OpusGalleonQuality = "high",
  { ensign = false }: OpusGalleonOptions = {}
): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = "opus-galleon";
  const pieces: Record<Layer, THREE.BufferGeometry[]> = {
    solid: [],
    cloth: [],
    glow: []
  };
  const rig: number[] = [];
  const running: number[] = [];
  const seams: number[] = [];
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const Y = new THREE.Vector3(0, 1, 0);

  function put(geometry: THREE.BufferGeometry, color: number, layer: Layer = "solid", matrix?: THREE.Matrix4) {
    if (matrix) geometry.applyMatrix4(matrix);
    geometry.deleteAttribute("uv");
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.getAttribute("color")) {
      const c = new THREE.Color(color);
      const count = flat.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
      flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    pieces[layer].push(flat);
  }
  function mesh(points: number[], indices: number[], color: number, layer: Layer = "solid", colors?: number[]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    put(geometry, color, layer);
  }
  function box(color: number, at: THREE.Vector3, w: number, h: number, d: number, q = new THREE.Quaternion()) {
    put(new THREE.BoxGeometry(w, h, d), color, "solid", new THREE.Matrix4().compose(at, q, v(1, 1, 1)));
  }
  function rod(
    color: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r0: number,
    r1 = r0,
    segments = 8,
    layer: Layer = "solid"
  ) {
    const length = a.distanceTo(b);
    if (length < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize());
    const at = a.clone().add(b).multiplyScalar(0.5);
    put(
      new THREE.CylinderGeometry(r1, r0, length, segments, 1),
      color,
      layer,
      new THREE.Matrix4().compose(at, q, v(1, 1, 1))
    );
  }
  function ball(
    color: number,
    at: THREE.Vector3,
    scale: THREE.Vector3,
    layer: Layer = "solid",
    q = new THREE.Quaternion()
  ) {
    put(
      new THREE.SphereGeometry(1, high ? 14 : 8, high ? 10 : 6),
      color,
      layer,
      new THREE.Matrix4().compose(at, q, scale)
    );
  }
  function tube(color: number, points: THREE.Vector3[], radius: number, segments = 48) {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points);
    put(new THREE.TubeGeometry(curve, high ? segments : Math.ceil(segments / 2), radius, high ? 6 : 4), color);
  }
  const line = (target: number[], a: THREE.Vector3, b: THREE.Vector3) => target.push(...a.toArray(), ...b.toArray());
  /** Outward-facing frame on the hull at (x, y): the quaternion turns +Z onto the surface normal. */
  function onHull(x: number, y: number, side: number) {
    const slope = (breadthAt(x + 0.05, y) - breadthAt(x - 0.05, y)) / 0.1;
    const normal = v(-slope, 0, side).normalize();
    const point = v(x, y, side * breadthAt(x, y));
    return {
      point,
      normal,
      q: new THREE.Quaternion().setFromUnitVectors(v(0, 0, 1), normal)
    };
  }

  // Hull: painted bands lofted between fixed heights so each colour edge stays crisp.
  const stations = high ? 56 : 28;
  const us = Array.from({ length: stations + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / stations));
  function band(y0: number, y1: number, rows: number, color: number, inner = false) {
    for (const side of [-1, 1]) {
      const points: number[] = [],
        indices: number[] = [];
      for (const u of us) {
        const lo = clamp(y0, -keel(u), sheer(u)),
          hi = clamp(y1, -keel(u), sheer(u));
        for (let r = 0; r <= rows; r++) {
          const p = hullPoint(u, lerp(lo, hi, r / rows));
          const z = inner ? Math.max(0, p.z * 0.97 - 0.18) : p.z;
          points.push(p.x, p.y, side * z);
        }
      }
      const flip = side < 0 !== inner;
      for (let i = 0; i < stations; i++)
        for (let r = 0; r < rows; r++) {
          const a = i * (rows + 1) + r,
            b = a + rows + 1,
            c = a + 1,
            d = b + 1;
          indices.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
        }
      mesh(points, indices, color);
    }
  }
  const rows = (n: number) => (high ? n : Math.max(1, Math.ceil(n / 2)));
  band(-10, 0.1, rows(10), COLORS.tallow);
  band(0.1, 2, rows(4), COLORS.tar);
  band(2, 3.3, rows(3), COLORS.wale);
  band(3.3, 5, rows(3), COLORS.oak);
  band(5, 5.4, 1, COLORS.ochre);
  band(5.4, 6.5, rows(2), COLORS.red);
  band(6.5, 12, rows(8), COLORS.teal);
  band(MAIN_DECK - 0.3, 12, rows(10), COLORS.inner, true);
  {
    // Wineglass transom closes the stern.
    const points: number[] = [],
      indices: number[] = [];
    const n = high ? 24 : 12;
    for (let r = 0; r <= n; r++) {
      const p = hullPoint(0, lerp(-keel(0), sheer(0), r / n));
      points.push(p.x, p.y, -p.z, p.x, p.y, p.z);
      if (r < n) indices.push(2 * r, 2 * r + 1, 2 * r + 2, 2 * r + 1, 2 * r + 3, 2 * r + 2);
    }
    mesh(points, indices, COLORS.teal);
  }
  function deckStrip(y: number, u0: number, u1: number, inset = 0.2) {
    const points: number[] = [],
      indices: number[] = [];
    const n = high ? 40 : 16;
    for (let i = 0; i <= n; i++) {
      const p = hullPoint(lerp(u0, u1, i / n), y);
      const z = Math.max(0, p.z * 0.97 - inset);
      points.push(p.x, y, -z, p.x, y, z);
      if (i < n) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      if (high && i % 2 === 0) seams.push(p.x, y + 0.01, -z, p.x, y + 0.01, z);
    }
    mesh(points, indices, COLORS.deck);
    if (high)
      for (let z = -BMAX + 0.35; z < BMAX; z += 0.35) {
        const run: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          const p = hullPoint(lerp(u0, u1, i / n), y);
          if (Math.abs(z) < p.z * 0.97 - inset) run.push(v(p.x, y + 0.012, z));
        }
        for (let i = 0; i + 1 < run.length; i++) line(seams, run[i], run[i + 1]);
      }
  }
  deckStrip(MAIN_DECK, 0.01, 0.995);
  deckStrip(QUARTER_DECK, 0.005, QUARTER_U + 0.005);
  deckStrip(POOP_DECK, 0.004, POOP_U + 0.004);
  deckStrip(FORECASTLE_DECK, BOW_U - 0.005, 0.99);

  // Bulkheads that close the castles, with doors, windows and balustrades.
  function bulkhead(u: number, y0: number, y1: number, facing: 1 | -1) {
    const points: number[] = [],
      indices: number[] = [];
    const n = 6;
    for (let r = 0; r <= n; r++) {
      const p = hullPoint(u, lerp(y0, y1, r / n));
      const z = p.z * 0.97 - 0.15;
      points.push(p.x, p.y, -z, p.x, p.y, z);
      if (r < n)
        indices.push(
          ...(facing > 0
            ? [2 * r, 2 * r + 2, 2 * r + 1, 2 * r + 1, 2 * r + 2, 2 * r + 3]
            : [2 * r, 2 * r + 1, 2 * r + 2, 2 * r + 1, 2 * r + 3, 2 * r + 2])
        );
    }
    mesh(points, indices, COLORS.red);
    const x = hullPoint(u, y0).x + facing * 0.06;
    const width = hullPoint(u, y1).z * 0.97 - 0.15;
    for (const z of [-width * 0.45, width * 0.45]) {
      box(COLORS.cream, v(x, y0 + 0.95, z), 0.1, 1.95, 1.05);
      box(COLORS.dark, v(x + facing * 0.03, y0 + 0.9, z), 0.1, 1.75, 0.85);
    }
    for (const z of [-width * 0.15, width * 0.15]) {
      box(COLORS.cream, v(x, y0 + 1.35, z), 0.1, 0.7, 0.6);
      box(COLORS.glass, v(x + facing * 0.03, y0 + 1.35, z), 0.1, 0.52, 0.42);
    }
    balustrade(v(x, y1, -width), v(x, y1, width), 1);
  }
  function balustrade(a: THREE.Vector3, b: THREE.Vector3, height: number) {
    const top = v(0, height, 0);
    rod(COLORS.spar, a.clone().add(top), b.clone().add(top), 0.08, 0.08, 6);
    const count = Math.max(2, Math.round(a.distanceTo(b) / (high ? 0.38 : 1.2)));
    for (let i = 0; i <= count; i++) {
      const p = a.clone().lerp(b, i / count);
      if (high) {
        rod(COLORS.cream, p, p.clone().add(v(0, height * 0.45)), 0.035, 0.08, 6);
        rod(COLORS.cream, p.clone().add(v(0, height * 0.45)), p.clone().add(top), 0.08, 0.035, 6);
      } else rod(COLORS.cream, p, p.clone().add(top), 0.05, 0.05, 4);
    }
  }
  bulkhead(QUARTER_U, MAIN_DECK, QUARTER_DECK, 1);
  bulkhead(POOP_U, QUARTER_DECK, POOP_DECK, 1);
  bulkhead(BOW_U, MAIN_DECK, FORECASTLE_DECK, -1);

  // Wales, friezes and the capping rail follow the hull at fixed heights.
  for (const side of [-1, 1]) {
    for (const [y, radius, color] of [
      [2, 0.14, COLORS.wale],
      [3.3, 0.14, COLORS.wale],
      [5, 0.07, COLORS.gold],
      [5.4, 0.07, COLORS.gold],
      [6.5, 0.06, COLORS.gold]
    ] as const) {
      const points = us
        .filter(u => u > 0.002 && u < 0.998 && sheer(u) > y + 0.1 && hullPoint(u, y).z > 0.2)
        .map(u => {
          const p = hullPoint(u, y);
          return v(p.x, y, side * (p.z + radius * 0.6));
        });
      tube(color, points, radius, 96);
    }
    tube(
      COLORS.spar,
      us
        .filter(u => u > 0.002 && u < 0.995)
        .map(u => {
          const p = hullPoint(u, sheer(u));
          return v(p.x, p.y + 0.05, side * Math.max(0, p.z - 0.08));
        }),
      0.13,
      128
    );
  }
  tube(
    COLORS.wale,
    us.map(u => v(hullPoint(u, -keel(u)).x, -keel(u) - 0.05)),
    0.22,
    64
  );
  tube(
    COLORS.wale,
    Array.from({ length: 9 }, (_, i) => hullPoint(1, lerp(-keel(1), sheer(1), i / 8)).add(v(0.1, 0))),
    0.24,
    24
  );
  tube(
    COLORS.wale,
    Array.from({ length: 9 }, (_, i) =>
      hullPoint(0, lerp(-keel(0), sheer(0), i / 8))
        .add(v(-0.1, 0))
        .setZ(0)
    ),
    0.22,
    24
  );

  // Gunports, guns and lids.
  function gun(x: number, y: number, side: number, lid: boolean) {
    const { point, normal, q } = onHull(x, y, side);
    put(
      new THREE.BoxGeometry(1.05, 0.95, 0.16),
      COLORS.red,
      "solid",
      new THREE.Matrix4().compose(point.clone().addScaledVector(normal, 0.02), q, v(1, 1, 1))
    );
    put(
      new THREE.BoxGeometry(0.8, 0.7, 0.18),
      COLORS.dark,
      "solid",
      new THREE.Matrix4().compose(point.clone().addScaledVector(normal, 0.04), q, v(1, 1, 1))
    );
    const muzzle = point.clone().addScaledVector(normal, 0.95);
    rod(COLORS.iron, point.clone().addScaledVector(normal, -0.3), muzzle, 0.19, 0.14, high ? 10 : 6);
    if (high) rod(COLORS.iron, muzzle.clone().addScaledVector(normal, -0.12), muzzle, 0.18, 0.18, 10);
    if (lid) {
      const hinge = point
        .clone()
        .add(v(0, 0.48, 0))
        .addScaledVector(normal, 0.1);
      const open = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), -1.05));
      const centre = hinge.clone().add(v(0, 0, 0.45).applyQuaternion(open));
      put(
        new THREE.BoxGeometry(0.95, 0.09, 0.9),
        COLORS.red,
        "solid",
        new THREE.Matrix4().compose(centre, open, v(1, 1, 1))
      );
    }
  }
  for (const side of [-1, 1]) {
    for (const x of LOWER_GUNS) gun(x, 2.5, side, high);
    for (const x of UPPER_GUNS) gun(x, 5.05, side, false);
  }

  // Stern: chase ports, great-cabin windows, gallery, arms and lanterns.
  const rake = Math.atan(1.4 / (sheer(0) + keel(0)));
  const sternQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rake));
  const sternAt = (y: number, z: number, out = 0) => v(hullPoint(0, y).x - out, y, z);
  for (const z of [-1.4, 1.4]) {
    box(COLORS.red, sternAt(2.5, z, 0.05), 0.14, 0.95, 1.05, sternQ);
    box(COLORS.dark, sternAt(2.5, z, 0.09), 0.14, 0.7, 0.8, sternQ);
    rod(COLORS.iron, sternAt(2.5, z, -0.3), sternAt(2.5, z, 0.9), 0.17, 0.13, 8);
  }
  function windows(y: number, count: number, spacing: number, h: number) {
    for (let i = 0; i < count; i++) {
      const z = (i - (count - 1) / 2) * spacing;
      box(COLORS.cream, sternAt(y, z, 0.05), 0.14, h + 0.2, spacing * 0.78, sternQ);
      box(COLORS.glass, sternAt(y, z, 0.1), 0.1, h, spacing * 0.6, sternQ);
      if (high) {
        box(COLORS.cream, sternAt(y, z, 0.13), 0.04, 0.05, spacing * 0.6, sternQ);
        box(COLORS.cream, sternAt(y, z, 0.13), 0.04, h, 0.05, sternQ);
      }
    }
  }
  windows(5.4, 5, 1.05, 1.0);
  windows(7.6, 4, 1.0, 0.8);
  {
    const back = hullPoint(0, 4.4).x - 1.0;
    const half = hullPoint(0, 4.4).z * 0.95;
    box(COLORS.spar, v(back + 0.5, 4.4, 0), 1.1, 0.2, half * 2);
    box(COLORS.teal, v(back + 0.55, 6.6, 0), 1.2, 0.18, half * 2 + 0.2);
    for (const z of [-half, -half / 3, half / 3, half])
      rod(COLORS.gold, v(back, 4.5, z), v(back, 6.5, z), 0.07, 0.07, 6);
    balustrade(v(back, 4.5, -half), v(back, 4.5, half), 0.85);
    box(COLORS.gold, sternAt(9.25, 0, 0.06), 0.12, 1.3, 2.3, sternQ);
    box(COLORS.crimson, sternAt(9.25, 0, 0.1), 0.1, 1.0, 0.75, sternQ);
    for (const z of [-0.6, 0.6]) box(COLORS.gold, sternAt(9.25, z * 1.3, 0.1), 0.08, 0.5, 0.35, sternQ);
    const top = hullPoint(0, sheer(0));
    for (const z of [-2.3, 0, 2.3]) {
      const big = z === 0 ? 1.3 : 1;
      const base = v(top.x + 0.2, top.y, z);
      rod(COLORS.iron, base, base.clone().add(v(-0.2, 0.9 * big)), 0.06, 0.06, 6);
      const lamp = base.clone().add(v(-0.2, 1.35 * big));
      put(
        new THREE.CylinderGeometry(0.28 * big, 0.2 * big, 0.75 * big, 8),
        COLORS.lantern,
        "glow",
        new THREE.Matrix4().makeTranslation(lamp.x, lamp.y, lamp.z)
      );
      put(
        new THREE.ConeGeometry(0.34 * big, 0.45 * big, 8),
        COLORS.gold,
        "solid",
        new THREE.Matrix4().makeTranslation(lamp.x, lamp.y + 0.6 * big, lamp.z)
      );
      ball(COLORS.gold, lamp.clone().add(v(0, 0.9 * big)), v(0.08, 0.08, 0.08));
    }
    // Ensign staff streams its colours forward with the following wind.
    const staff = v(top.x - 0.2, top.y, 0);
    rod(COLORS.spar, staff, staff.clone().add(v(-0.4, 5.2)), 0.08, 0.05, 6);
    if (ensign)
      flag(
        staff.clone().add(v(-0.35, 5.1)),
        3.4,
        [2.1 / 3, 2.1 / 3, 2.1 / 3],
        [COLORS.crimson, COLORS.ochre, COLORS.crimson]
      );
  }
  // Quarter galleries.
  for (const side of [-1, 1]) {
    const { point, q } = onHull(-18.6, 7, side);
    const at = (dy: number, out: number) => point.clone().add(v(0, dy, side * out));
    put(
      new THREE.BoxGeometry(3, 3.6, 0.9),
      COLORS.teal,
      "solid",
      new THREE.Matrix4().compose(at(0, 0.25), q, v(1, 1, 1))
    );
    for (const dx of [-0.9, 0, 0.9]) {
      const offset = v(dx, 0.3, 0).applyQuaternion(q);
      box(COLORS.cream, at(0, 0.72).add(offset), 0.7, 1.1, 0.06, q);
      box(COLORS.glass, at(0, 0.76).add(offset), 0.52, 0.85, 0.06, q);
    }
    box(COLORS.gold, at(-1.85, 0.3), 3.2, 0.14, 1.05, q);
    box(COLORS.gold, at(1.85, 0.3), 3.2, 0.14, 1.05, q);
    put(
      new THREE.ConeGeometry(0.75, 1.6, high ? 12 : 6),
      COLORS.teal,
      "solid",
      new THREE.Matrix4().compose(
        at(-2.7, 0.35),
        new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), Math.PI),
        v(1.8, 1, 0.6)
      )
    );
    put(
      new THREE.SphereGeometry(0.8, high ? 12 : 6, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      COLORS.teal,
      "solid",
      new THREE.Matrix4().compose(at(1.92, 0.3), new THREE.Quaternion(), v(1.8, 1.1, 0.62))
    );
    ball(COLORS.gold, at(2.95, 0.3), v(0.14, 0.2, 0.14));
  }

  // Rudder hung on the sternpost with iron pintles.
  {
    const top = hullPoint(0, 4.2),
      bottom = hullPoint(0, -keel(0) + 0.15);
    const shape = new THREE.Shape([
      new THREE.Vector2(top.x - 0.15, top.y),
      new THREE.Vector2(bottom.x - 0.15, bottom.y),
      new THREE.Vector2(bottom.x - 1.75, bottom.y),
      new THREE.Vector2(top.x - 0.75, top.y - 0.6)
    ]);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.36,
      bevelEnabled: false
    });
    put(geometry, COLORS.tar, "solid", new THREE.Matrix4().makeTranslation(0, 0, -0.18));
    for (let i = 0; i < 4; i++) {
      const p = top.clone().lerp(bottom, (i + 0.5) / 4);
      box(COLORS.iron, v(p.x - 0.3, p.y, 0), 0.75, 0.14, 0.44);
    }
  }

  // Knee of the head, beakhead platform, head rails and lion figurehead.
  {
    const lower = hullPoint(1, -1.5),
      upper = hullPoint(1, 5.9);
    const shape = new THREE.Shape([
      new THREE.Vector2(lower.x - 0.2, lower.y),
      new THREE.Vector2(19.6, -0.2),
      new THREE.Vector2(22.3, 2.0),
      new THREE.Vector2(24.4, 4.3),
      new THREE.Vector2(25.9, 5.5),
      new THREE.Vector2(22.5, 5.95),
      new THREE.Vector2(upper.x - 0.3, upper.y)
    ]);
    put(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.42,
        bevelEnabled: false,
        curveSegments: 4
      }),
      COLORS.wale,
      "solid",
      new THREE.Matrix4().makeTranslation(0, 0, -0.21)
    );
    const deckY = 5.95,
      root = hullPoint(uAt(19, deckY), deckY);
    mesh(
      [root.x, deckY, -root.z, root.x, deckY, root.z, 24.8, deckY, -0.45, 24.8, deckY, 0.45],
      [0, 1, 2, 1, 3, 2],
      COLORS.deck
    );
    for (const side of [-1, 1]) {
      for (const [lift, color] of [
        [0, COLORS.gold],
        [-0.9, COLORS.red]
      ] as const) {
        const start = onHull(17.4, 6.8 + lift, side).point;
        tube(
          color,
          [
            start,
            v(21.5, 6.6 + lift, side * 1.55),
            v(24.2, 6.1 + lift * 0.6, side * 0.75),
            v(25.6, 5.9 + lift * 0.3, side * 0.15)
          ],
          0.1,
          24
        );
      }
      for (const t of high ? [0.25, 0.45, 0.65, 0.85] : [0.5]) {
        const x = lerp(19.5, 25, t),
          z = side * lerp(1.7, 0.2, t);
        rod(COLORS.gold, v(x, deckY, z), v(x, 6.65 - 0.5 * t, z), 0.06, 0.06, 6);
      }
    }
    const lionQ = new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), 0.45);
    ball(COLORS.gold, v(25.9, 5.95), v(1.0, 0.45, 0.42), "solid", lionQ);
    ball(COLORS.gold, v(26.75, 6.55), v(0.42, 0.44, 0.4));
    put(
      new THREE.TorusGeometry(0.42, 0.16, 6, high ? 14 : 8),
      COLORS.ochre,
      "solid",
      new THREE.Matrix4().compose(v(26.6, 6.5), new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2), v(1, 1, 1))
    );
    for (const side of [-1, 1]) rod(COLORS.gold, v(26.3, 5.6, side * 0.18), v(26.8, 5.1, side * 0.2), 0.08, 0.06, 6);
  }

  // Bowsprit, spritsail yard and the gammoning that lashes it to the knee.
  const bowsprit = [v(17.6, 7.1), v(36, 14.4)] as const;
  rod(COLORS.spar, bowsprit[0], bowsprit[1], 0.38, 0.2, 10);
  const spritYard = bowsprit[0].clone().lerp(bowsprit[1], 0.62).add(v(0, -0.35));
  rod(COLORS.spar, spritYard.clone().setZ(-5), spritYard.clone().setZ(5), 0.12, 0.12, 8);
  squareSail(spritYard.x + 0.2, spritYard.y - 0.1, 9, spritYard.y - 4.6, 10);
  for (let i = 0; i < 3; i++) line(rig, v(20.4 + i * 0.3, 8.3 + i * 0.12), v(22.8 + i * 0.4, 3.0 + i * 0.3));
  line(rig, bowsprit[1], v(23.2, 1.4));

  // Catheads and anchors.
  for (const side of [-1, 1]) {
    const head = onHull(15.8, 7.0, side);
    rod(
      COLORS.spar,
      head.point.clone().addScaledVector(head.normal, -0.6),
      head.point.clone().addScaledVector(head.normal, 1.3).add(v(0.4, 0.15)),
      0.17,
      0.15,
      8
    );
    const hang = onHull(14.2, 4.5, side);
    const top = hang.point.clone().addScaledVector(hang.normal, 0.45).setY(6.5);
    const crown = top.clone().setY(1.8);
    rod(COLORS.iron, top, crown, 0.1, 0.11, 8);
    for (const dir of [-1, 1]) {
      const tip = crown.clone().add(v(dir * 1.15, 0.9));
      rod(COLORS.iron, crown, tip, 0.1, 0.07, 6);
      box(
        COLORS.iron,
        tip.clone().add(v(dir * -0.1, -0.05)),
        0.45,
        0.5,
        0.08,
        new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), dir * -0.9)
      );
    }
    box(COLORS.spar, top.clone().add(v(0, -0.25)), 0.22, 0.22, 2.6, hang.q);
    put(
      new THREE.TorusGeometry(0.22, 0.04, 4, 10),
      COLORS.iron,
      "solid",
      new THREE.Matrix4().compose(
        top.clone().add(v(0, 0.18)),
        new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2),
        v(1, 1, 1)
      )
    );
    line(rig, top.clone().add(v(0, 0.35)), head.point.clone().addScaledVector(head.normal, 1.2).add(v(0.4, 0.1)));
  }

  // Deck furniture: hatches, ship's boat, capstan, belfry and companion ladders.
  function grating(x: number, y: number, length: number, width: number) {
    box(COLORS.spar, v(x, y + 0.18, 0), length + 0.3, 0.36, width + 0.3);
    if (!high) {
      box(COLORS.dark, v(x, y + 0.37, 0), length, 0.02, width);
      return;
    }
    box(COLORS.dark, v(x, y + 0.3, 0), length, 0.04, width);
    for (let dx = -length / 2 + 0.2; dx < length / 2; dx += 0.3)
      box(COLORS.deck, v(x + dx, y + 0.38, 0), 0.07, 0.05, width);
    for (let dz = -width / 2 + 0.2; dz < width / 2; dz += 0.3) box(COLORS.deck, v(x, y + 0.4, dz), length, 0.04, 0.07);
  }
  grating(1.2, MAIN_DECK, 2.6, 2.4);
  grating(-6, MAIN_DECK, 1.6, 1.6);
  grating(-17.5, QUARTER_DECK, 1.4, 1.4);
  {
    const boat = v(5.6, MAIN_DECK + 1.15, 0);
    put(
      new THREE.SphereGeometry(1, high ? 20 : 10, high ? 8 : 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      COLORS.oak,
      "solid",
      new THREE.Matrix4().compose(boat, new THREE.Quaternion(), v(2.9, 0.75, 1.0))
    );
    put(
      new THREE.CircleGeometry(1, high ? 20 : 10),
      COLORS.deck,
      "solid",
      new THREE.Matrix4().compose(
        boat.clone().add(v(0, -0.12)),
        new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), -Math.PI / 2),
        v(2.8, 0.95, 1)
      )
    );
    for (const dx of [-1.2, 0, 1.2]) box(COLORS.spar, boat.clone().add(v(dx, -0.05)), 0.18, 0.08, 1.7);
    for (const dx of [-1.6, 1.6]) box(COLORS.wale, v(boat.x + dx, MAIN_DECK + 0.25, 0), 0.3, 0.5, 1.6);
  }
  {
    const at = v(-9.2, MAIN_DECK);
    rod(COLORS.spar, at, at.clone().add(v(0, 1.1)), 0.42, 0.34, 12);
    rod(COLORS.spar, at.clone().add(v(0, 1.1)), at.clone().add(v(0, 1.35)), 0.55, 0.55, 12);
    for (const angle of high ? [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4] : [0, Math.PI / 2]) {
      const dir = v(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(1.7);
      rod(COLORS.oak, at.clone().add(v(0, 1.2)).sub(dir), at.clone().add(v(0, 1.2)).add(dir), 0.05, 0.05, 5);
    }
  }
  {
    const x = hullPoint(BOW_U, FORECASTLE_DECK).x + 0.9;
    for (const dx of [-0.4, 0.4])
      for (const z of [-0.4, 0.4])
        rod(COLORS.spar, v(x + dx, FORECASTLE_DECK, z), v(x + dx, FORECASTLE_DECK + 1.6, z), 0.06, 0.06, 6);
    box(COLORS.red, v(x, FORECASTLE_DECK + 1.72, 0), 1.1, 0.16, 1.1);
    put(
      new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      COLORS.gold,
      "solid",
      new THREE.Matrix4().compose(v(x, FORECASTLE_DECK + 1.15), new THREE.Quaternion(), v(1, 1.4, 1))
    );
  }
  function ladder(x0: number, y0: number, x1: number, y1: number, z: number) {
    for (const dz of [-0.45, 0.45]) rod(COLORS.spar, v(x0, y0, z + dz), v(x1, y1, z + dz), 0.06, 0.06, 6);
    const steps = Math.round((y1 - y0) / 0.32);
    for (let i = 1; i < steps; i++)
      box(COLORS.deck, v(lerp(x0, x1, i / steps), lerp(y0, y1, i / steps), z), 0.22, 0.05, 0.9);
  }
  {
    const xq = hullPoint(QUARTER_U, MAIN_DECK).x,
      xp = hullPoint(POOP_U, QUARTER_DECK).x,
      xf = hullPoint(BOW_U, MAIN_DECK).x;
    for (const z of [-2.9, 2.9]) ladder(xq + 1.4, MAIN_DECK, xq + 0.05, QUARTER_DECK, z);
    ladder(xp + 1.2, QUARTER_DECK, xp + 0.05, POOP_DECK, 2.2);
    for (const z of [-2.3, 2.3]) ladder(xf - 1.4, MAIN_DECK, xf - 0.05, FORECASTLE_DECK, z);
  }
  if (high)
    for (const side of [-1, 1])
      for (const x of [-11.5, -7.5, 2.8, 6.4])
        box(COLORS.wale, v(x, MAIN_DECK + 0.3, side * (breadthAt(x, MAIN_DECK + 0.4) * 0.97 - 0.32)), 0.25, 0.6, 0.25);

  // Masts, tops, yards, sails and rigging.
  function topX(mast: MastPlan, tier: number) {
    return mast.x + (tier > 0 ? 0.6 : 0) + (tier > 1 ? 0.35 : 0);
  }
  function squareSail(x: number, top: number, width: number, foot: number, footWidth: number, reefs = 0) {
    const cols = high ? 16 : 8,
      rows = high ? 12 : 6;
    const points: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const base = new THREE.Color(COLORS.canvas);
    const depth = 0.1 * Math.min(width, (top - foot) * 1.3);
    const vertex = (u: number, t: number) => {
      const belly = depth * Math.sin(Math.PI * u) * Math.sin(Math.PI * 0.9 * t);
      return v(
        x + 0.35 + belly,
        lerp(top, foot, t) + 0.5 * Math.sin(Math.PI * u) * t ** 4,
        (u - 0.5) * lerp(width, footWidth, t)
      );
    };
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++) {
        const u = c / cols,
          t = r / rows;
        points.push(...vertex(u, t).toArray());
        const shade =
          0.86 + 0.14 * (1 - Math.sin(Math.PI * u) * Math.sin(Math.PI * 0.9 * t)) - (high && c % 2 ? 0.025 : 0);
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    mesh(points, indices, COLORS.canvas, "cloth", colors);
    if (!high) return;
    const edge = (fn: (k: number) => THREE.Vector3, n: number) => {
      for (let k = 0; k < n; k++) line(running, fn(k / n), fn((k + 1) / n));
    };
    edge(k => vertex(0, k), rows);
    edge(k => vertex(1, k), rows);
    edge(k => vertex(k, 1), cols);
    for (let i = 1; i <= reefs; i++) edge(k => vertex(k, i * 0.14).add(v(0.03, 0)), cols);
  }
  function flag(at: THREE.Vector3, length: number, bands: number[], colors: number[], fork = false) {
    let top = at.y;
    bands.forEach((height, index) => {
      const points: number[] = [],
        indices: number[] = [];
      const n = high ? 16 : 6;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const wave = 0.22 * Math.sin(u * Math.PI * 3) * u;
        const taper = fork ? 1 - 0.75 * u : 1;
        const mid = at.y - (at.y - top) * taper;
        points.push(at.x + u * length, mid, at.z + wave, at.x + u * length, mid - height * taper, at.z + wave);
        if (i < n) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      }
      mesh(points, indices, colors[index], "cloth");
      top -= height;
    });
  }
  for (const mast of MASTS) {
    const foot = MAIN_DECK - 0.1;
    rod(COLORS.spar, v(mast.x, foot), v(mast.x, mast.lowerHead + 0.4), mast.radius, mast.radius * 0.78, high ? 14 : 8);
    if (high)
      for (let y = foot + 2.2; y < mast.lowerHead - 2.5; y += 1.6)
        put(
          new THREE.TorusGeometry(mast.radius * 0.95, 0.05, 4, 12),
          COLORS.tar,
          "solid",
          new THREE.Matrix4().compose(
            v(mast.x, y),
            new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), Math.PI / 2),
            v(1, 1, 1)
          )
        );
    const tx = topX(mast, 1);
    rod(
      COLORS.spar,
      v(tx, mast.lowerHead - 2.2),
      v(tx, mast.topHead + 0.3),
      mast.radius * 0.6,
      mast.radius * 0.42,
      high ? 10 : 6
    );
    box(COLORS.wale, v(mast.x + 0.3, mast.lowerHead + 0.45), 1.5, 0.35, 0.8);
    const topY = mast.lowerHead - 1.2;
    const top = v(mast.x + 0.3, topY);
    rod(COLORS.spar, top.clone().add(v(0, -0.12)), top.clone().add(v(0, 0.12)), 1.9, 1.9, high ? 20 : 10);
    put(
      new THREE.TorusGeometry(1.9, 0.11, 4, high ? 24 : 12),
      COLORS.red,
      "solid",
      new THREE.Matrix4().compose(
        top.clone().add(v(0, 0.45)),
        new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), Math.PI / 2),
        v(1, 1, 1)
      )
    );
    if (high)
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const p = top.clone().add(v(Math.cos(a) * 1.85, 0.1, Math.sin(a) * 1.85));
        rod(COLORS.spar, p, p.clone().add(v(0, 0.35)), 0.04, 0.04, 4);
      }
    const crossY = mast.topHead - 1;
    box(COLORS.spar, v(tx, crossY), 0.2, 0.18, 3.4);
    box(COLORS.spar, v(tx, crossY), 1.3, 0.18, 0.2);
    let masthead = v(tx, mast.topHead + 0.3);
    if (mast.gallantHead) {
      const gx = topX(mast, 2);
      rod(COLORS.spar, v(gx, mast.topHead - 1.4), v(gx, mast.gallantHead), mast.radius * 0.36, mast.radius * 0.2, 8);
      box(COLORS.wale, v(tx + 0.18, mast.topHead + 0.35), 0.9, 0.25, 0.55);
      masthead = v(gx, mast.gallantHead);
      for (const side of [-1, 1]) {
        for (const dx of [-0.3, 0.3])
          line(rig, v(tx + dx, crossY, side * 1.6), v(gx, mast.gallantHead - 0.9, side * 0.12));
        line(
          rig,
          v(gx, mast.gallantHead - 0.3),
          v(mast.x - 4.5, sheer(uAt(mast.x - 4.5, 5)), side * breadthAt(mast.x - 4.5, 5.5))
        );
      }
    }
    ball(COLORS.gold, masthead.clone().add(v(0, 0.2)), v(0.2, 0.15, 0.2));
    flag(
      masthead.clone().add(v(0, -0.05)),
      mast.gallantHead ? 7 : 4.5,
      [0.25, 0.3],
      [COLORS.ochre, COLORS.crimson],
      true
    );

    // Channels and deadeyes carry the lower shrouds outboard of the hull.
    for (const side of [-1, 1]) {
      const channelY = sheer(uAt(mast.x, 5)) - 0.35;
      const xs = Array.from({ length: mast.shrouds }, (_, i) => mast.x + 0.9 - (i * 3.6) / (mast.shrouds - 1));
      const mid = onHull((xs[0] + xs.at(-1)!) / 2, channelY, side);
      put(
        new THREE.BoxGeometry(4.6, 0.14, 1.0),
        COLORS.wale,
        "solid",
        new THREE.Matrix4().compose(mid.point.clone().addScaledVector(mid.normal, 0.45), mid.q, v(1, 1, 1))
      );
      const hounds = v(mast.x, mast.lowerHead - 1.7, side * mast.radius);
      const deadeyes = xs.map(x => {
        const frame = onHull(x, channelY, side);
        const eye = frame.point.clone().addScaledVector(frame.normal, 0.85).add(v(0, 0.3));
        put(
          new THREE.CylinderGeometry(0.2, 0.2, 0.12, high ? 10 : 6),
          COLORS.tar,
          "solid",
          new THREE.Matrix4().compose(eye, new THREE.Quaternion().setFromUnitVectors(Y, frame.normal), v(1, 1, 1))
        );
        if (high) {
          const plate = frame.point.clone().addScaledVector(frame.normal, 0.83).add(v(0, -0.6));
          box(COLORS.iron, plate, 0.08, 1.6, 0.08, frame.q);
        }
        line(rig, eye, hounds);
        return eye;
      });
      // Ratlines: rungs every 0.4 m up the lower shrouds.
      if (high) {
        const span = hounds.y - deadeyes[0].y;
        for (let t = 0.6 / span; t < 0.93; t += 0.4 / span)
          for (let i = 0; i + 1 < deadeyes.length; i++)
            line(rig, deadeyes[i].clone().lerp(hounds, t), deadeyes[i + 1].clone().lerp(hounds, t));
      }
      // Topmast shrouds rise from the top rim; futtock shrouds tie the rim back to the lower mast.
      const topHounds = v(tx, mast.topHead - 1.5, side * 0.2);
      const rim = [-0.9, -0.3, 0.3, 0.9].map(dx => v(mast.x + 0.3 + dx, topY + 0.2, side * 1.75));
      for (const p of rim) {
        line(rig, p, topHounds);
        line(rig, p, v(mast.x, topY - 1.6, side * mast.radius));
      }
      if (high) {
        const span = topHounds.y - rim[0].y;
        for (let t = 0.4 / span; t < 0.9; t += 0.4 / span)
          for (let i = 0; i + 1 < rim.length; i++)
            line(rig, rim[i].clone().lerp(topHounds, t), rim[i + 1].clone().lerp(topHounds, t));
      }
      // Backstays from the topmast head to the channel's after end.
      const anchor = onHull(xs.at(-1)! - 1.2, channelY, side);
      line(rig, v(tx, mast.topHead), anchor.point.clone().addScaledVector(anchor.normal, 0.8));
    }

    for (const yard of mast.yards) {
      const yx = topX(mast, yard.tier) + 0.45;
      const half = yard.width / 2 + 0.7;
      const radius = 0.08 + yard.width * 0.011;
      for (const side of [-1, 1]) rod(COLORS.spar, v(yx, yard.y), v(yx, yard.y, side * half), radius, radius * 0.45, 8);
      squareSail(
        yx,
        yard.y - 0.15,
        yard.width,
        yard.foot,
        yard.footWidth,
        yard.tier === 1 ? 3 : yard.tier === 0 ? 1 : 0
      );
      if (!high) continue;
      const head = yard.tier === 0 ? mast.lowerHead : yard.tier === 1 ? mast.topHead : mast.gallantHead!;
      for (const side of [-1, 1]) {
        const arm = v(yx, yard.y, side * half);
        line(running, arm, v(topX(mast, yard.tier), head - 0.2));
        // Braces lead aft to the next mast or to the quarterdeck rail.
        const lead =
          mast.x > 5 ? v(-2, MASTS[1].lowerHead - 2 + yard.tier * 6) : v(mast.x - 12, QUARTER_DECK + 1, side * 3.6);
        line(running, arm, lead);
        if (yard.tier === 0) {
          const clew = v(yx + 0.35, yard.foot, (side * yard.footWidth) / 2);
          const sheet = onHull(mast.x - 5, sheer(uAt(mast.x - 5, 5)), side).point;
          line(running, clew, sheet);
          line(running, clew, v(yx, yard.y, side * yard.width * 0.2));
        }
      }
    }
  }
  // Lateen mizzen: yard steeved up toward the stern, sail set aft of the mast.
  {
    const fore = v(-5.5, 9.6, 0.5),
      aft = v(-25.4, 23.4, 0.5),
      clew = v(-22.4, 11.2, 0.5);
    rod(COLORS.spar, fore, aft, 0.14, 0.18, 8);
    const n = high ? 14 : 6;
    const points: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const base = new THREE.Color(COLORS.canvas);
    const index = (i: number, j: number) => (i * (2 * n + 3 - i)) / 2 + j;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const a = j / n,
          b = i / n,
          w = 1 - a - b;
        const belly = 27 * a * b * w * 0.9;
        const p = aft.clone().addScaledVector(fore.clone().sub(aft), a).addScaledVector(clew.clone().sub(aft), b);
        points.push(p.x, p.y, p.z + belly);
        const shade = 0.88 + 0.12 * (1 - 27 * a * b * w);
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        indices.push(index(i, j), index(i + 1, j), index(i, j + 1));
        if (j < n - i - 1) indices.push(index(i, j + 1), index(i + 1, j), index(i + 1, j + 1));
      }
    mesh(points, indices, COLORS.canvas, "cloth", colors);
    if (high) {
      line(running, aft, v(-14.5, 18.2));
      line(running, clew, v(-21.6, POOP_DECK + 1, 2.8));
      line(running, fore, v(-8, QUARTER_DECK + 0.2, 0.6));
    }
  }
  // Fore-and-aft stays.
  const [fore, main, mizzen] = MASTS;
  const onSprit = (t: number) => bowsprit[0].clone().lerp(bowsprit[1], t);
  line(rig, v(fore.x, fore.lowerHead - 1.4), onSprit(0.3));
  line(rig, v(topX(fore, 1), fore.topHead - 0.6), onSprit(0.98));
  line(rig, v(topX(fore, 2), fore.gallantHead! - 0.5), onSprit(0.98));
  line(rig, v(main.x, main.lowerHead - 1.4), v(fore.x - 0.4, FORECASTLE_DECK + 0.8));
  line(rig, v(topX(main, 1), main.topHead - 0.6), v(fore.x + 0.2, fore.lowerHead - 1.1));
  line(rig, v(topX(main, 2), main.gallantHead! - 0.5), v(topX(fore, 1), fore.topHead - 0.9));
  line(rig, v(mizzen.x, mizzen.lowerHead - 1.4), v(main.x - 0.5, MAIN_DECK + 1.6));
  line(rig, v(topX(mizzen, 1), mizzen.topHead - 0.5), v(main.x + 0.2, main.lowerHead - 1.1));

  const materials = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    cloth: new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true })
  };
  const names: Record<Layer, string> = {
    solid: "galleon-hull-and-fittings",
    cloth: "galleon-sails-and-flags",
    glow: "galleon-lanterns"
  };
  const pickables: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  for (const layer of ["solid", "cloth", "glow"] as const) {
    const merged = mergeGeometries(pieces[layer], false)!;
    for (const piece of pieces[layer]) piece.dispose();
    geometries.push(merged);
    const object = new THREE.Mesh(merged, materials[layer]);
    object.name = names[layer];
    group.add(object);
    pickables.push(object);
  }
  const lineMaterials: THREE.LineBasicMaterial[] = [];
  for (const [name, positions, color] of [
    ["standing-rigging", rig, 0x2e2620],
    ["running-rigging", running, 0x8a7458],
    ["deck-seams", seams, 0x6e5434]
  ] as const) {
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = name;
    group.add(lines);
    geometries.push(geometry);
    lineMaterials.push(material);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of [...Object.values(materials), ...lineMaterials]) material.dispose();
    }
  };
}
