import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { ModelKit } from "../medieval/modelKit";
import type { ModelPart, ModelPartFactory, ModelPartRange } from "../modelParts";
import type { GalleonState } from "./galleonArmament";
import { addSailBundle } from "./sailingAssembly";

/*
 * HMS Victory as fought at Trafalgar (1805), in meters. The bow points along +X, starboard along +Z and the
 * load waterline is y = 0. Particulars used: 56.7 m on the gun deck, 46.4 m keel, 15.8 m moulded beam,
 * 6.55 m depth in hold, main truck 62.5 m above the waterline. The 1803 refit is followed: closed stern
 * with three tiers of lights and quarter galleries, beakhead bulkhead under the forecastle, Nelson chequer
 * (black with ochre bands along the three gun decks, black port lids) and copper below the waterline.
 * Hull lines are lofted from those figures rather than taken from a lines plan.
 */

const AUTHOR: Author = "Claude Opus 5.5";

const BMAX = 7.9;
const WIDE_Y = 0.8;
const KEEL_AFT = 7.4;
const KEEL_FORE = 6.6;
const UPPER_DECK = 5.2;
const QUARTER_DECK = 7.3;
const FORECASTLE = 7.3;
const POOP = 9.4;
/** Height above which the bow is cut square by the beakhead bulkhead. */
const BEAK_Y = 5.3;
const BEAK_X = 27.5;
const QD_FRONT = -3.5;
const FC_BACK = 14;
const POOP_FRONT = -19;
const INSET = 0.35;
const STERN_ROUND = 0.5;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
/** Smoothstep that also runs downhill when `from > to`. */
function step(from: number, to: number, x: number): number {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const keelDepth = (u: number) => lerp(KEEL_AFT, KEEL_FORE, u);
/** Sternpost, then the raked counter and stern above the tuck. */
const sternX = (y: number) => (y < 2.2 ? -26 - 0.12 * (y + KEEL_AFT) : -27.15 - 0.22 * (y - 2.2));
const sternSlope = (y: number) => (y < 2.2 ? -0.12 : -0.22);
/** Stem: a quarter-round forefoot rising into a nearly upright stem. */
function stemX(y: number): number {
  if (y >= 1) return 29 + 0.1 * (y - 1);
  const t = clamp((1 - y) / (1 + KEEL_FORE), 0, 1);
  return 20.4 + 8.6 * Math.sqrt(1 - t * t);
}
/** Top of the side: waist, then quarterdeck, poop and forecastle bulwarks. */
const sheer = (x: number) => 8.2 + 0.7 * step(-2.5, -4, x) + 1.7 * step(-18.5, -19.5, x) + 0.7 * step(13, 14.5, x);
const xAt = (u: number, y: number) => lerp(sternX(y), stemX(y), u);
const uAt = (x: number, y: number) => clamp((x - sternX(y)) / (stemX(y) - sternX(y)), 0, 1);
/** Midship section: round bilge with deadrise below the widest line, tumblehome above it. */
function section(y: number, u: number): number {
  if (y > WIDE_Y) return BMAX - 1.35 * ((y - WIDE_Y) / 9.5) ** 1.5;
  const d = clamp((WIDE_Y - y) / (WIDE_Y + keelDepth(u)), 0, 1);
  return Math.max(0.3, BMAX * (1 - d ** 2.4) ** 0.55);
}
/** Bluff bow that fines below water, and a fine run that opens into the broad stern above the tuck. */
function plan(u: number, y: number): number {
  const f = Math.max(0, (u - 0.68) / 0.32);
  const bow = Math.max(0, 1 - f ** 2.3) ** (0.5 + 0.45 * clamp(-y / KEEL_FORE, 0, 1));
  const g = Math.max(0, (0.36 - u) / 0.36);
  const transom = lerp(0.04, 0.6, step(-1.5, 3.5, y));
  return bow * (1 - g ** 1.9 * (1 - transom));
}
function halfBreadth(x: number, y: number): number {
  const u = uAt(x, y);
  return section(y, u) * plan(u, y);
}
function hullPoint(u: number, y: number, cut = false): THREE.Vector3 {
  let x = xAt(u, y);
  if (cut && x > BEAK_X) x = BEAK_X;
  return v(x, y, halfBreadth(x, y));
}
const hullTop = (u: number) => sheer(xAt(u, 6));
/** Stern face, rounded aft in plan above the tuck. */
function sternFaceX(y: number, z: number): number {
  const x = sternX(y),
    hb = Math.max(halfBreadth(x, y), 1e-3);
  return x - STERN_ROUND * step(1.5, 3, y) * (1 - Math.min(1, (z / hb) ** 2));
}
/** Basis whose local +Z is the outward normal and local +Y is as near vertical as the surface allows. */
function surfaceFrame(point: THREE.Vector3, normal: THREE.Vector3): THREE.Matrix4 {
  const right = new THREE.Vector3().crossVectors(Y_AXIS, normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right);
  return new THREE.Matrix4().makeBasis(right, up, normal).setPosition(point);
}
function hullFrame(x: number, y: number, side: number) {
  const e = 0.05;
  const hx = (halfBreadth(x + e, y) - halfBreadth(x - e, y)) / (2 * e);
  const hy = (halfBreadth(x, y + e) - halfBreadth(x, y - e)) / (2 * e);
  const normal = v(-hx, -hy, side).normalize();
  const point = v(x, y, side * halfBreadth(x, y));
  return { point, normal, frame: surfaceFrame(point, normal) };
}
function sternFrame(y: number, z: number) {
  const x = sternX(y),
    hb = halfBreadth(x, y),
    round = STERN_ROUND * step(1.5, 3, y);
  const normal = v(-1, sternSlope(y), (2 * round * z) / (hb * hb)).normalize();
  const point = v(sternFaceX(y, z), y, z);
  return { point, normal, frame: surfaceFrame(point, normal) };
}
const spaced = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

interface Yard {
  length: number;
  set: number;
  furled: number;
  r: number;
}
interface Mast {
  x: number;
  foot: number;
  r: number;
  topY: number;
  head: number;
  topW: number;
  topD: number;
  tmR: number;
  cross: number;
  tmHead: number;
  crossHalf: number;
  tgR: number;
  tgHead: number;
  truck: number;
  shrouds: number;
  tmShrouds: number;
  channel: number;
  chainplates: boolean;
  /** Course yard, or the crossjack on the mizzen, which sets no square sail. */
  course: Yard;
  courseFoot?: number;
  topsail: Yard;
  gallant: Yard;
}
const FORE: Mast = {
  x: 18.6,
  foot: FORECASTLE,
  r: 0.46,
  topY: 28.3,
  head: 30.8,
  topW: 6.6,
  topD: 4.6,
  tmR: 0.28,
  cross: 42.9,
  tmHead: 45,
  crossHalf: 1.5,
  tgR: 0.16,
  tgHead: 53.8,
  truck: 57.4,
  shrouds: 9,
  tmShrouds: 4,
  channel: 7.9,
  chainplates: true,
  course: { length: 28.2, set: 27.2, furled: 27.2, r: 0.3 },
  courseFoot: 13.2,
  topsail: { length: 20.4, set: 41.6, furled: 31.8, r: 0.21 },
  gallant: { length: 13, set: 51.8, furled: 45.6, r: 0.12 }
};
const MAIN: Mast = {
  x: 1.5,
  foot: UPPER_DECK,
  r: 0.5,
  topY: 31,
  head: 33.6,
  topW: 7.2,
  topD: 5,
  tmR: 0.3,
  cross: 46.8,
  tmHead: 49,
  crossHalf: 1.7,
  tgR: 0.17,
  tgHead: 58.4,
  truck: 62.5,
  shrouds: 10,
  tmShrouds: 4,
  channel: 7.9,
  chainplates: true,
  course: { length: 31, set: 29.9, furled: 29.9, r: 0.32 },
  courseFoot: 14.6,
  topsail: { length: 22.6, set: 45.4, furled: 34.6, r: 0.22 },
  gallant: { length: 14.4, set: 56.4, furled: 49.6, r: 0.13 }
};
const MIZZEN: Mast = {
  x: -14.4,
  foot: QUARTER_DECK,
  r: 0.33,
  topY: 23.8,
  head: 25.8,
  topW: 5,
  topD: 3.6,
  tmR: 0.2,
  cross: 35.3,
  tmHead: 37,
  crossHalf: 1.2,
  tgR: 0.12,
  tgHead: 43.6,
  truck: 46.5,
  shrouds: 6,
  tmShrouds: 3,
  channel: 8.78,
  // The mizzen channel sits over the quarterdeck ports, so its chain plates are not drawn down the side.
  chainplates: false,
  course: { length: 21, set: 22.8, furled: 22.8, r: 0.22 },
  topsail: { length: 15.2, set: 34, furled: 26.6, r: 0.16 },
  gallant: { length: 9.6, set: 42, furled: 37.6, r: 0.1 }
};
const MASTS = [FORE, MAIN, MIZZEN] as const;
const topmastX = (m: Mast) => m.x + m.r * 0.85 + m.tmR + 0.05;
const gallantX = (m: Mast) => topmastX(m) + m.tmR * 0.8 + m.tgR + 0.04;
const yardX = (m: Mast, which: "course" | "topsail" | "gallant") =>
  which === "course"
    ? m.x + m.r + m[which].r + 0.05
    : which === "topsail"
      ? topmastX(m) + m.tmR + m[which].r + 0.05
      : gallantX(m) + m.tgR + m[which].r + 0.03;
const shroudX = (m: Mast, i: number) => m.x + 1.2 - i * 0.85;
const channelZ = (m: Mast, x: number) => halfBreadth(x, m.channel) + 1;

const BS_HEEL = v(23.5, 6.52);
const BS_END = v(43.6, 15.47);
const bowsprit = (t: number) => BS_HEEL.clone().lerp(BS_END, t);
const JB_HEEL = v(37.97, 13.49);
const JB_END = v(49.6, 17.95);
const jibboom = (t: number) => JB_HEEL.clone().lerp(JB_END, t);
const SPRIT = bowsprit(0.62).add(v(0, -0.65));
const GAFF_THROAT = v(MIZZEN.x - MIZZEN.r - 0.15, 22.3);
const GAFF_PEAK = v(-26.8, 29);
const BOOM_START = v(MIZZEN.x - MIZZEN.r - 0.2, 12.6);
const BOOM_END = v(-31.5, 13.2);
const FORE_TM_HEAD = v(topmastX(FORE), FORE.tmHead - 0.8);
const FORE_TG_HEAD = v(gallantX(FORE), FORE.tgHead - 0.5);

export const OPUS_SHIP_OF_THE_LINE = {
  author: AUTHOR,
  name: "Ship of the line · HMS Victory",
  length: Math.round((JB_END.x - BOOM_END.x) * 10) / 10,
  beam: BMAX * 2,
  height: MAIN.truck,
  draft: KEEL_AFT + 0.1,
  guns: 104,
  windows: 33,
  source: "https://en.wikipedia.org/wiki/HMS_Victory",
  note: "HMS Victory as at Trafalgar after the 1803 refit: lofted hull with round bilge and tumblehome, Nelson chequer over copper, closed stern with three tiers of lights and quarter galleries, beakhead bulkhead with head rails and a blank gilt figurehead, catted anchors. 104 guns: 30 × 32-pdr, 28 × 24-pdr, 30 + 12 × 12-pdr, two forecastle 12-pdrs and two 68-pdr carronades. Three masts with courses, topsails and topgallants, spanker, spritsail and three headsails; standing and running rigging with ratlines. Ship's boats on the booms. Royals, studdingsails and interiors are omitted."
} as const;

export const OPUS_SHIP_OF_THE_LINE_PARTS = [
  "hull",
  "decks",
  "stern",
  "head",
  "armament",
  "boats",
  "masts",
  "sails",
  "standing-rigging",
  "running-rigging"
] as const;
export type OpusShipOfTheLinePart = (typeof OPUS_SHIP_OF_THE_LINE_PARTS)[number];
const ROLES: Record<OpusShipOfTheLinePart, string> = {
  hull: "Hull shell, wales, keel and rudder",
  decks: "Decks, breaks, rails and deck fittings",
  stern: "Stern lights, quarter galleries and lanterns",
  head: "Head, figurehead, catheads and anchors",
  armament: "Gunports, lids and guns",
  boats: "Ship's boats",
  masts: "Masts, tops, yards and bowsprit",
  sails: "Sails",
  "standing-rigging": "Channels, shrouds, ratlines and stays",
  "running-rigging": "Braces, lifts, sheets and footropes"
};

export interface OpusShipOfTheLineState extends GalleonState {
  /** Glazed stern and gallery lights, or wooden deadlights fitted for action. */
  windows?: "open" | "closed";
}
type State = Required<OpusShipOfTheLineState>;

const C = {
  copper: 0xa9673f,
  black: 0x1e1d1b,
  ochre: 0xcf9b42,
  red: 0x8c3326,
  deck: 0xb9996b,
  grating: 0x5c4532,
  wood: 0x7b5434,
  spar: 0xc49c5c,
  sparBlack: 0x252321,
  iron: 0x26292b,
  brass: 0xb8923f,
  gold: 0xc9a54c,
  glass: 0x2a414c,
  deadlight: 0x2b221a,
  cream: 0xddd0aa,
  dark: 0x0c0b0a,
  netting: 0x55585a,
  canvas: 0xebe2c8,
  pennant: 0xa0231e,
  lantern: 0xffd27a,
  boat: 0x2f2b27
};

type Layer = "solid" | "cloth" | "glow";
type Stroke = "standing" | "running" | "seams";
const STROKE_COLORS: Record<Stroke, number> = { standing: 0x1f1a16, running: 0x8f7a5b, seams: 0x76593a };

/** Collects vertex-coloured pieces and line segments, tagged with the part being built. */
class Batch {
  part: OpusShipOfTheLinePart = "hull";
  readonly pieces: Record<Layer, { part: OpusShipOfTheLinePart; geometry: THREE.BufferGeometry }[]> = {
    solid: [],
    cloth: [],
    glow: []
  };
  readonly strokes: Record<Stroke, { positions: number[]; ranges: ModelPartRange[] }> = {
    standing: { positions: [], ranges: [] },
    running: { positions: [], ranges: [] },
    seams: { positions: [], ranges: [] }
  };
  /** Gunport frames on the hull, for anything that needs to find a port. */
  readonly mounts: { id: string; point: number[]; normal: number[] }[] = [];
  windows = 0;

  put(geometry: THREE.BufferGeometry, color: number, layer: Layer = "solid", matrix?: THREE.Matrix4) {
    if (matrix) geometry.applyMatrix4(matrix);
    geometry.deleteAttribute("uv");
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    if (!flat.getAttribute("color")) {
      const c = new THREE.Color(color),
        count = flat.getAttribute("position").count,
        colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
      flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    this.pieces[layer].push({ part: this.part, geometry: flat });
  }
  mesh(points: number[], indices: number[], color: number, layer: Layer = "solid", colors?: number[]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.put(geometry, color, layer);
  }
  box(color: number, at: THREE.Vector3, w: number, h: number, d: number, q = new THREE.Quaternion()) {
    this.put(new THREE.BoxGeometry(w, h, d), color, "solid", new THREE.Matrix4().compose(at, q, v(1, 1, 1)));
  }
  /** Box placed at `local` inside a surface frame. */
  boxIn(color: number, frame: THREE.Matrix4, local: THREE.Vector3, w: number, h: number, d: number) {
    this.put(
      new THREE.BoxGeometry(w, h, d),
      color,
      "solid",
      frame.clone().multiply(new THREE.Matrix4().makeTranslation(local.x, local.y, local.z))
    );
  }
  rod(color: number, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, segments = 8, layer: Layer = "solid") {
    const length = a.distanceTo(b);
    if (length < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, b.clone().sub(a).normalize());
    this.put(
      new THREE.CylinderGeometry(r1, r0, length, segments, 1),
      color,
      layer,
      new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v(1, 1, 1))
    );
  }
  /** Square-section timber from a to b; `w` lies horizontal across it. */
  bar(color: number, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
    const along = b.clone().sub(a);
    const length = along.length();
    if (length < 1e-4) return;
    along.normalize();
    let across = new THREE.Vector3().crossVectors(Y_AXIS, along);
    if (across.lengthSq() < 1e-6) across = v(0, 0, 1);
    across.normalize();
    const up = new THREE.Vector3().crossVectors(along, across);
    const frame = new THREE.Matrix4().makeBasis(along, up, across).setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.put(new THREE.BoxGeometry(length, h, w), color, "solid", frame);
  }
  ball(color: number, at: THREE.Vector3, scale: THREE.Vector3, layer: Layer = "solid") {
    this.put(
      new THREE.SphereGeometry(1, 12, 8),
      color,
      layer,
      new THREE.Matrix4().compose(at, new THREE.Quaternion(), scale)
    );
  }
  tube(color: number, points: THREE.Vector3[], radius: number, segments = 32, radial = 6) {
    if (points.length < 2) return;
    this.put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, radial), color);
  }
  /** Rectangular moulding along a path: `halfW` horizontal across the path, `halfH` square to both. */
  sweep(color: number, path: THREE.Vector3[], halfW: number, halfH: number) {
    const n = path.length;
    if (n < 2) return;
    const points: number[] = [],
      indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const tangent = path[Math.min(n - 1, i + 1)]
        .clone()
        .sub(path[Math.max(0, i - 1)])
        .normalize();
      let side = new THREE.Vector3().crossVectors(Y_AXIS, tangent);
      if (side.lengthSq() < 1e-6) side = v(0, 0, 1);
      side.normalize();
      const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
      for (const [a, b] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1]
      ])
        points.push(
          ...path[i]
            .clone()
            .addScaledVector(side, a * halfW)
            .addScaledVector(up, b * halfH)
            .toArray()
        );
    }
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < 4; k++) {
        const a = i * 4 + k,
          b = i * 4 + ((k + 1) % 4);
        indices.push(a, b, a + 4, b, b + 4, a + 4);
      }
    const last = (n - 1) * 4;
    indices.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
    this.mesh(points, indices, color);
  }
  /** Flat outline in its local XY plane, extruded symmetrically along local Z. */
  slab(color: number, outline: readonly (readonly [number, number])[], depth: number, matrix?: THREE.Matrix4) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
    geometry.translate(0, 0, -depth / 2);
    this.put(geometry, color, "solid", matrix);
  }
  /** Furled canvas with its gaskets, borrowed from the shared sailing kit. */
  bundle(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const kit = new ModelKit("opus-line-furled-canvas");
    addSailBundle(kit, "furled-sail", [a.x, a.y, a.z], [b.x, b.y, b.z], radius, true);
    const source = kit.finish();
    source.group.updateMatrixWorld(true);
    try {
      for (const object of source.pickables) {
        const material = object.material as THREE.MeshLambertMaterial;
        this.put(
          object.geometry.clone(),
          material.color.getHex(),
          object.name === "furled-sail" ? "cloth" : "solid",
          object.matrixWorld
        );
      }
    } finally {
      source.dispose();
    }
  }
  line(kind: Stroke, a: THREE.Vector3, b: THREE.Vector3) {
    const stroke = this.strokes[kind];
    const start = stroke.positions.length / 3;
    stroke.positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const last = stroke.ranges.at(-1);
    if (last && last.partId === this.part && last.start + last.count === start) last.count += 2;
    else stroke.ranges.push({ partId: this.part, start, count: 2 });
  }
  polyline(kind: Stroke, points: readonly THREE.Vector3[]) {
    for (let i = 0; i + 1 < points.length; i++) this.line(kind, points[i], points[i + 1]);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Hull

/** Paint bands lofted between fixed heights so the chequer edges stay crisp. */
const BANDS: readonly { y0: number; y1: number; rows: number; color: number; cut: boolean }[] = [
  { y0: -9, y1: 0.35, rows: 16, color: C.copper, cut: false },
  { y0: 0.35, y1: 1.4, rows: 3, color: C.black, cut: false },
  { y0: 1.4, y1: 2.55, rows: 2, color: C.ochre, cut: false },
  { y0: 2.55, y1: 3.5, rows: 2, color: C.black, cut: false },
  { y0: 3.5, y1: 4.65, rows: 2, color: C.ochre, cut: false },
  { y0: 4.65, y1: BEAK_Y, rows: 2, color: C.black, cut: false },
  { y0: BEAK_Y, y1: 5.6, rows: 1, color: C.black, cut: true },
  { y0: 5.6, y1: 6.75, rows: 2, color: C.ochre, cut: true },
  { y0: 6.75, y1: 12, rows: 6, color: C.black, cut: true }
];

function hullPart(b: Batch) {
  const stations = 96;
  const us = Array.from({ length: stations + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / stations));
  for (const band of BANDS) {
    const rowY = (u: number, r: number) => {
      const lo = clamp(band.y0, -keelDepth(u), hullTop(u)),
        hi = clamp(band.y1, -keelDepth(u), hullTop(u));
      return lerp(lo, hi, r / band.rows);
    };
    for (const side of [-1, 1]) {
      const points: number[] = [],
        indices: number[] = [];
      for (const u of us)
        for (let r = 0; r <= band.rows; r++) {
          const p = hullPoint(u, rowY(u, r), band.cut);
          points.push(p.x, p.y, side * p.z);
        }
      const w = band.rows + 1;
      for (let i = 0; i < stations; i++)
        for (let r = 0; r < band.rows; r++) {
          const a = i * w + r;
          indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
        }
      b.mesh(points, indices, band.color);
    }
    // The stern face shares the shell's edge samples, so the two meet without cracks.
    const cols = 16,
      points: number[] = [],
      indices: number[] = [];
    for (let r = 0; r <= band.rows; r++) {
      const y = rowY(0, r),
        hb = halfBreadth(sternX(y), y);
      for (let c = 0; c <= cols; c++) {
        const z = lerp(-hb, hb, c / cols);
        points.push(sternFaceX(y, z), y, z);
      }
    }
    for (let r = 0; r < band.rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
      }
    b.mesh(points, indices, band.color);
    // Beakhead bulkhead: the square front of the forecastle above the head.
    if (band.cut) {
      const rows = band.rows,
        points: number[] = [],
        indices: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const y = lerp(band.y0, Math.min(band.y1, sheer(BEAK_X)), r / rows),
          hb = halfBreadth(BEAK_X, y);
        points.push(BEAK_X, y, -hb, BEAK_X, y, hb);
        if (r < rows) indices.push(2 * r, 2 * r + 1, 2 * r + 2, 2 * r + 1, 2 * r + 3, 2 * r + 2);
      }
      b.mesh(points, indices, band.color);
    }
  }

  // Inner bulwark, red as was the Navy's habit, and the capping rail over it.
  {
    const n = 80,
      rows = 4,
      points: number[] = [],
      indices: number[] = [];
    for (const side of [-1, 1]) {
      const base = points.length / 3;
      for (let i = 0; i <= n; i++)
        for (let r = 0; r <= rows; r++) {
          const t = i / n;
          const xMid = lerp(sternX(8) + INSET, BEAK_X - INSET, t);
          const y = lerp(UPPER_DECK, sheer(xMid), r / rows);
          const x = lerp(sternX(y) + INSET, BEAK_X - INSET, t);
          points.push(x, y, side * Math.max(0.2, halfBreadth(x, y) - INSET));
        }
      for (let i = 0; i < n; i++)
        for (let r = 0; r < rows; r++) {
          const a = base + i * (rows + 1) + r;
          indices.push(a, a + 1, a + rows + 1, a + 1, a + rows + 2, a + rows + 1);
        }
    }
    b.mesh(points, indices, C.red);
    for (const side of [-1, 1]) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 90; i++) {
        const x = lerp(sternX(10) + 0.05, BEAK_X - 0.05, i / 90),
          y = sheer(x);
        path.push(v(x, y + 0.06, side * (halfBreadth(x, y) - INSET / 2)));
      }
      b.sweep(C.black, path, INSET / 2 + 0.06, 0.08);
    }
    const y = sheer(BEAK_X) + 0.06,
      hb = halfBreadth(BEAK_X, y);
    b.sweep(C.black, [v(BEAK_X - 0.1, y, -hb), v(BEAK_X - 0.1, y, hb)], 0.24, 0.08);
  }

  // Wales stand proud of the planking between the gun tiers.
  for (const side of [-1, 1])
    for (const [y, halfH] of [
      [0.92, 0.12],
      [1.2, 0.12],
      [3.02, 0.1],
      [5.12, 0.1]
    ] as const) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 90; i++) {
        const x = lerp(sternX(y) + 0.15, stemX(y) - 0.5, i / 90);
        path.push(v(x, y, side * (halfBreadth(x, y) + 0.05)));
      }
      b.sweep(C.black, path, 0.08, halfH);
    }

  // Keel, stem, sternpost and rudder.
  b.bar(C.copper, v(-26.1, -KEEL_AFT + 0.3), v(20.6, -KEEL_FORE + 0.3), 0.6, 0.7);
  const stem = (y0: number, y1: number) =>
    Array.from({ length: 13 }, (_, i) => {
      const y = lerp(y0, y1, i / 12);
      return v(stemX(y) + 0.12, y, 0);
    });
  b.tube(C.copper, stem(-KEEL_FORE + 0.1, 0.35), 0.32, 24);
  b.tube(C.black, stem(0.35, BEAK_Y), 0.32, 16);
  b.bar(C.copper, v(sternX(-KEEL_AFT) - 0.1, -KEEL_AFT + 0.05), v(sternX(0.35) - 0.1, 0.35), 0.62, 0.6);
  b.bar(C.black, v(sternX(0.35) - 0.1, 0.35), v(sternX(2.6) - 0.1, 2.6), 0.62, 0.6);
  const post = (y: number) => sternX(y) - 0.05;
  b.slab(
    C.copper,
    [
      [post(-7.35), -7.35],
      [-27.9, -7.35],
      [-28.35, -2],
      [-28.25, 0.35],
      [post(0.35), 0.35]
    ],
    0.55
  );
  b.slab(
    C.black,
    [
      [post(0.35), 0.35],
      [-28.25, 0.35],
      [-28.05, 1.8],
      [-27.6, 3],
      [post(3), 3]
    ],
    0.55
  );
}

// ---------------------------------------------------------------------------------------------------------
// Decks and deck fittings

function deckPlate(b: Batch, y: number, x0: number, x1: number, inset = INSET, color = C.deck) {
  const n = 40,
    points: number[] = [],
    indices: number[] = [];
  const width = (x: number) => Math.max(0, halfBreadth(x, y) - inset);
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n),
      z = width(x);
    points.push(x, y, -z, x, y, z);
    if (i < n) indices.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  }
  b.mesh(points, indices, color);
  for (let z = -BMAX + 0.18; z < BMAX; z += 0.36) {
    const run: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n);
      if (Math.abs(z) < width(x) - 0.05) run.push(v(x, y + 0.012, z));
      else if (run.length) break;
    }
    b.polyline("seams", run);
  }
}
/** Athwartships bulkhead from y0 to y1 at x, filling the hull between the inner bulwarks. */
function bulkhead(b: Batch, x: number, y0: number, y1: number, color: number) {
  const rows = 4,
    points: number[] = [],
    indices: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = lerp(y0, y1, r / rows),
      z = halfBreadth(x, y) - INSET;
    points.push(x, y, -z, x, y, z);
    if (r < rows) indices.push(2 * r, 2 * r + 1, 2 * r + 2, 2 * r + 1, 2 * r + 3, 2 * r + 2);
  }
  b.mesh(points, indices, color);
}
function balustrade(b: Batch, x: number, y: number, height: number) {
  const hb = halfBreadth(x, y) - INSET - 0.05;
  b.box(C.black, v(x, y + height, 0), 0.16, 0.1, hb * 2);
  const count = Math.round((hb * 2) / 0.4);
  for (let i = 0; i <= count; i++) {
    const z = lerp(-hb, hb, i / count);
    b.rod(C.ochre, v(x, y, z), v(x, y + height * 0.5, z), 0.035, 0.07, 6);
    b.rod(C.ochre, v(x, y + height * 0.5, z), v(x, y + height, z), 0.07, 0.035, 6);
  }
}
function door(b: Batch, x: number, y: number, z: number, facing: number) {
  b.box(C.ochre, v(x + facing * 0.04, y + 0.95, z), 0.08, 1.95, 1.05);
  b.box(C.dark, v(x + facing * 0.07, y + 0.9, z), 0.06, 1.75, 0.85);
}

function decksPart(b: Batch) {
  deckPlate(b, UPPER_DECK, QD_FRONT - 0.2, FC_BACK + 0.2);
  deckPlate(b, QUARTER_DECK, sternX(QUARTER_DECK) + INSET, QD_FRONT);
  deckPlate(b, FORECASTLE, FC_BACK, BEAK_X - 0.05);
  deckPlate(b, POOP, sternX(POOP) + INSET, POOP_FRONT);

  // Gangways join the quarterdeck to the forecastle along each side of the waist.
  for (const side of [-1, 1]) {
    const n = 20,
      points: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(QD_FRONT, FC_BACK, i / n),
        outer = halfBreadth(x, QUARTER_DECK) - INSET;
      points.push(x, QUARTER_DECK, side * outer, x, QUARTER_DECK, side * (outer - 2.1));
      if (i < n) indices.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    }
    b.mesh(points, indices, C.deck);
    const edge = Array.from({ length: 9 }, (_, i) => {
      const x = lerp(QD_FRONT, FC_BACK, i / 8);
      return v(x, QUARTER_DECK - 0.1, side * (halfBreadth(x, QUARTER_DECK) - INSET - 2.1));
    });
    b.sweep(C.black, edge, 0.06, 0.12);
  }

  // Breaks of the quarterdeck, forecastle and poop.
  bulkhead(b, QD_FRONT + 0.2, UPPER_DECK, QUARTER_DECK, 0x7d3b2a);
  for (const z of [-2.2, 2.2]) door(b, QD_FRONT + 0.2, UPPER_DECK, z, 1);
  b.box(C.black, v(QD_FRONT, QUARTER_DECK - 0.15, 0), 0.25, 0.3, (halfBreadth(QD_FRONT, QUARTER_DECK) - INSET) * 2);
  balustrade(b, QD_FRONT + 0.05, QUARTER_DECK, 1);
  bulkhead(b, FC_BACK - 0.2, UPPER_DECK, FORECASTLE, 0x7d3b2a);
  for (const z of [-2.2, 2.2]) door(b, FC_BACK - 0.2, UPPER_DECK, z, -1);
  b.box(C.black, v(FC_BACK, FORECASTLE - 0.15, 0), 0.25, 0.3, (halfBreadth(FC_BACK, FORECASTLE) - INSET) * 2);
  balustrade(b, FC_BACK - 0.05, FORECASTLE, 1);
  bulkhead(b, POOP_FRONT + 0.2, QUARTER_DECK, POOP, C.cream);
  for (const z of [-1.6, 1.6]) door(b, POOP_FRONT + 0.2, QUARTER_DECK, z, 1);
  for (const z of [-3.6, 0, 3.6]) {
    b.box(C.ochre, v(POOP_FRONT + 0.24, QUARTER_DECK + 1.25, z), 0.08, 0.8, 0.95);
    b.box(C.glass, v(POOP_FRONT + 0.27, QUARTER_DECK + 1.25, z), 0.06, 0.62, 0.75);
  }
  balustrade(b, POOP_FRONT + 0.05, POOP, 1);

  // Hammock nettings along the rails.
  for (const side of [-1, 1]) {
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const x = lerp(sternX(10) + 0.4, BEAK_X - 0.4, i / 80),
        y = sheer(x);
      path.push(v(x, y + 0.42, side * (halfBreadth(x, y) - INSET / 2)));
    }
    b.sweep(C.netting, path, 0.26, 0.28);
  }

  // Skid beams over the waist carry the boats; gratings below them.
  for (const x of [1.6, 4.6, 8.2, 11.6]) {
    const hb = halfBreadth(x, QUARTER_DECK) - INSET;
    b.box(C.wood, v(x, 7.55, 0), 0.3, 0.3, hb * 2);
  }
  for (const x of [5.6, 10.4]) {
    b.box(C.grating, v(x, UPPER_DECK + 0.12, 0), 2.6, 0.24, 2.8);
    for (let k = -1; k <= 1; k += 0.25)
      b.line("seams", v(x - 1.3, UPPER_DECK + 0.25, k * 1.4), v(x + 1.3, UPPER_DECK + 0.25, k * 1.4));
  }

  // Double steering wheel and binnacle before the poop; belfry and galley chimney on the forecastle.
  const wheelX = -17.3,
    axle = QUARTER_DECK + 1.25;
  b.box(C.wood, v(wheelX, QUARTER_DECK + 0.6, 0), 0.4, 1.2, 0.5);
  b.rod(C.brass, v(wheelX, axle, -0.75), v(wheelX, axle, 0.75), 0.08, 0.08, 8);
  for (const z of [-0.55, 0.55]) {
    const ring = new THREE.TorusGeometry(0.9, 0.05, 6, 24);
    b.put(ring, C.wood, "solid", new THREE.Matrix4().makeTranslation(wheelX, axle, z));
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5,
        dir = v(Math.cos(a), Math.sin(a));
      b.rod(C.wood, v(wheelX, axle, z), v(wheelX, axle, z).addScaledVector(dir, 1.15), 0.03, 0.025, 5);
    }
    b.rod(C.brass, v(wheelX, axle, z - 0.1), v(wheelX, axle, z + 0.1), 0.14, 0.14, 10);
  }
  b.box(C.wood, v(-15.9, QUARTER_DECK + 0.55, 0), 0.7, 1.1, 1.2);
  b.ball(C.brass, v(-15.9, QUARTER_DECK + 1.15, 0), v(0.3, 0.2, 0.3));
  for (const [dx, dz] of [
    [-0.45, -0.5],
    [-0.45, 0.5],
    [0.45, -0.5],
    [0.45, 0.5]
  ])
    b.rod(C.ochre, v(FC_BACK + 0.6 + dx, FORECASTLE, dz), v(FC_BACK + 0.6 + dx, FORECASTLE + 2, dz), 0.07, 0.07, 6);
  b.box(C.black, v(FC_BACK + 0.6, FORECASTLE + 2.1, 0), 1.3, 0.2, 1.4);
  b.ball(C.brass, v(FC_BACK + 0.6, FORECASTLE + 1.55, 0), v(0.28, 0.34, 0.28));
  b.box(C.iron, v(16.6, FORECASTLE + 0.7, -1.4), 0.8, 1.4, 0.8);
  b.box(C.iron, v(16.6, FORECASTLE + 1.5, -1.4), 0.55, 0.2, 0.55);
}

// ---------------------------------------------------------------------------------------------------------
// Stern and head

function lights(b: Batch, frame: THREE.Matrix4, w: number, h: number, glazed: boolean) {
  b.boxIn(C.ochre, frame, v(0, 0, 0.02), w + 0.16, h + 0.16, 0.08);
  if (!glazed) return b.boxIn(C.deadlight, frame, v(0, 0, 0.08), w + 0.04, h + 0.04, 0.06);
  b.boxIn(C.glass, frame, v(0, 0, 0.06), w, h, 0.04);
  for (const t of [-1 / 3, 1 / 3]) b.boxIn(C.cream, frame, v(t * w, 0, 0.09), 0.035, h, 0.03);
  b.boxIn(C.cream, frame, v(0, 0, 0.09), w, 0.035, 0.03);
}
const STERN_TIERS = [
  { y: 4.15, h: 0.8 },
  { y: 6.35, h: 0.95 },
  { y: 8.4, h: 0.85 }
];

function sternPart(b: Batch, state: State) {
  const glazed = state.windows === "open";
  let windows = 0;
  for (const tier of STERN_TIERS) {
    const hb = halfBreadth(sternX(tier.y), tier.y),
      zs = spaced(-hb * 0.78, hb * 0.78, 7),
      w = (zs[1] - zs[0]) * 0.68;
    for (const z of zs) {
      lights(b, sternFrame(tier.y, z).frame, w, tier.h, glazed);
      windows++;
    }
    for (let i = 0; i + 1 < zs.length; i++) {
      const z = (zs[i] + zs[i + 1]) / 2;
      b.boxIn(C.ochre, sternFrame(tier.y, z).frame, v(0, 0, 0.04), 0.14, tier.h + 0.3, 0.1);
    }
    for (const y of [tier.y - tier.h / 2 - 0.25, tier.y + tier.h / 2 + 0.25]) {
      const edge = halfBreadth(sternX(y), y) - 0.05;
      const path = Array.from({ length: 13 }, (_, i) => {
        const { point, normal } = sternFrame(y, lerp(-edge, edge, i / 12));
        return point.addScaledVector(normal, 0.05);
      });
      b.sweep(C.ochre, path, 0.07, 0.08);
    }
  }

  // Taffrail crest; the carving is left blank.
  const crestY = sheer(-30) + 0.05;
  const crestFrame = new THREE.Matrix4()
    .makeBasis(v(0, 0, 1), v(0, 1, 0), v(-1, 0, 0))
    .setPosition(sternFaceX(crestY, 0) + 0.2, crestY, 0);
  b.slab(
    C.gold,
    [
      [-3.6, 0],
      [3.6, 0],
      [3.6, 0.35],
      [2.4, 0.6],
      [1.2, 0.95],
      [0, 1.1],
      [-1.2, 0.95],
      [-2.4, 0.6],
      [-3.6, 0.35]
    ],
    0.25,
    crestFrame
  );
  // Three stern lanterns of a flagship.
  for (const z of [-2.4, 0, 2.4]) {
    const base = v(sternFaceX(crestY, z) + 0.1, crestY + 0.3, z);
    const lamp = base.clone().add(v(-0.75, 0.75));
    b.rod(C.iron, base, lamp.clone().add(v(0, -0.35)), 0.05, 0.05, 6);
    b.rod(C.lantern, lamp.clone().add(v(0, -0.3)), lamp.clone().add(v(0, 0.35)), 0.3, 0.34, 6, "glow");
    b.rod(C.gold, lamp.clone().add(v(0, 0.35)), lamp.clone().add(v(0, 0.62)), 0.38, 0.06, 6);
    b.rod(C.gold, lamp.clone().add(v(0, -0.42)), lamp.clone().add(v(0, -0.3)), 0.12, 0.32, 6);
  }

  // Quarter galleries: two glazed tiers, a carved drop below and a cupola above.
  const x0 = -26.3,
    x1 = -22.5,
    xc = (x0 + x1) / 2;
  for (const side of [-1, 1]) {
    const slope = (halfBreadth(x1, 7.3) - halfBreadth(x0, 7.3)) / (x1 - x0);
    const yaw = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -Math.atan(side * slope));
    const outward = v(-side * slope, 0, side).normalize();
    for (const [y0, y1, tier] of [
      [5.45, 7.35, STERN_TIERS[1]],
      [7.35, 9.4, STERN_TIERS[2]]
    ] as const) {
      const ym = (y0 + y1) / 2,
        zc = side * (halfBreadth(xc, ym) + 0.25);
      b.box(C.black, v(xc, ym, zc), x1 - x0, y1 - y0, 1.3, yaw);
      b.box(C.ochre, v(xc, y1 - 0.08, zc + side * 0.05), x1 - x0 + 0.2, 0.16, 1.45, yaw);
      for (const dx of [-1.2, 0, 1.2]) {
        const point = v(xc + dx, tier.y, zc + side * 0.65 + side * slope * dx);
        lights(b, surfaceFrame(point, outward), 0.75, tier.h, glazed);
        windows++;
      }
    }
    const zc = side * (halfBreadth(xc, 9.4) + 0.2);
    b.put(
      new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      C.gold,
      "solid",
      new THREE.Matrix4().compose(v(xc, 9.4, zc), yaw, v(2, 0.8, 0.75))
    );
    b.put(
      new THREE.CylinderGeometry(1, 0.06, 1.4, 12),
      C.gold,
      "solid",
      new THREE.Matrix4().compose(v(xc, 4.75, side * (halfBreadth(xc, 5.4) + 0.15)), yaw, v(1.9, 1, 0.7))
    );
  }
  b.windows = windows;
}

function headPart(b: Batch) {
  // Heads platform and gratings forward of the bulkhead.
  const x1 = stemX(BEAK_Y) - 0.05;
  deckPlate(b, BEAK_Y, BEAK_X, x1, 0.05, C.grating);
  for (const z of [-2, 2]) door(b, BEAK_X, BEAK_Y, z * 0.8, 1);
  // Knee of the head with gilt trailboards.
  b.slab(
    C.black,
    [
      [28.6, -0.5],
      [29.3, -0.5],
      [29.8, 1.5],
      [30.6, 3.6],
      [31.5, 5.4],
      [32.3, 6.8],
      [32.8, 7.6],
      [32.1, 7.9],
      [31, 7],
      [29.9, 6],
      [29.2, 5.3],
      [28.9, 3]
    ],
    0.7
  );
  for (const side of [-1, 1])
    b.slab(
      C.gold,
      [
        [29.9, 4.2],
        [31.2, 5.6],
        [32, 6.8],
        [31.6, 7],
        [30.6, 5.9],
        [29.6, 4.8]
      ],
      0.06,
      new THREE.Matrix4().makeTranslation(0, 0, side * 0.37)
    );
  // A blank gilt figurehead: shield and supporters without heraldry.
  const figure = new THREE.Matrix4().makeBasis(v(0, 0, -1), v(0, 1, 0), v(1, 0, 0)).setPosition(32.7, 8.35, 0);
  b.slab(
    C.gold,
    [
      [-0.75, -0.9],
      [0.75, -0.9],
      [0.85, 0.6],
      [0.4, 1],
      [-0.4, 1],
      [-0.85, 0.6]
    ],
    0.45,
    figure
  );
  for (const side of [-1, 1]) {
    b.ball(C.gold, v(32.55, 8.1, side * 0.95), v(0.35, 0.55, 0.3));
    b.ball(C.gold, v(32.65, 8.8, side * 0.95), v(0.22, 0.22, 0.22));
  }
  b.ball(C.gold, v(32.45, 7.5, 0), v(0.5, 0.3, 0.45));

  for (const side of [-1, 1]) {
    // Head rails sweep from the bulkhead down to the figurehead.
    for (const [y, drop] of [
      [8.4, 0],
      [7.2, 0.5]
    ] as const)
      b.tube(
        C.ochre,
        [
          v(BEAK_X + 0.05, y, side * (halfBreadth(BEAK_X, y) - 0.05)),
          v(28.9, y - 0.75 + drop * 0.1, side * 2.5),
          v(30.4, y - 1.3 + drop * 0.2, side * 1.35),
          v(31.7, y - 1.4 + drop * 0.2, side * 0.4)
        ],
        0.09,
        24
      );
    for (const x of [28.9, 30.2])
      b.rod(
        C.ochre,
        v(x, BEAK_Y, side * (x < 29.5 ? 2.3 : 1.3)),
        v(x, 6.8, side * (x < 29.5 ? 2.4 : 1.3)),
        0.06,
        0.06,
        6
      );
    // Cheeks of the head.
    for (const y of [4.1, 5])
      b.tube(
        C.ochre,
        [
          v(25.8, y, side * (halfBreadth(25.8, y) + 0.05)),
          v(27.6, y, side * (halfBreadth(27.6, y) + 0.05)),
          v(28.8, y + 0.05, side * (halfBreadth(28.8, y) + 0.05)),
          v(30, y + 0.25, side * 0.42),
          v(30.8, y + 0.5, side * 0.38)
        ],
        0.1,
        24
      );
    // Cathead and the bower anchor catted beneath it.
    const root = v(26.6, 8.75, side * (halfBreadth(26.6, 8.75) - 0.4));
    const end = v(28.4, 9.15, side * 5.7);
    b.bar(C.black, root, end, 0.45, 0.45);
    b.bar(C.gold, end.clone().add(v(0.02)), end.clone().add(v(0.06)), 0.5, 0.5);
    const ring = v(28.4, 8.55, side * 5.75),
      crown = v(28.15, 3.2, side * 5.55);
    b.put(
      new THREE.TorusGeometry(0.3, 0.05, 6, 16),
      C.iron,
      "solid",
      new THREE.Matrix4().makeTranslation(ring.x, ring.y + 0.25, ring.z)
    );
    b.rod(C.iron, ring, crown, 0.13, 0.15, 8);
    b.bar(C.wood, v(28.4, 8.05, side * 3.85), v(28.4, 8.05, side * 7.65), 0.3, 0.3);
    b.tube(
      C.iron,
      [v(26.7, 4.6, crown.z), v(27.2, 3.6, crown.z), crown, v(29.1, 3.6, crown.z), v(29.6, 4.6, crown.z)],
      0.12,
      16
    );
    for (const x of [26.7, 29.6]) b.box(C.iron, v(x, 4.75, crown.z), 0.55, 0.75, 0.12);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Armament

const TIERS = [
  { y: 1.975, w: 0.95, h: 0.85, guns: spaced(-21, 23, 15), r: 0.2, length: 1.35, carronade: false },
  { y: 4.075, w: 0.92, h: 0.82, guns: spaced(-20, 22, 14), r: 0.18, length: 1.3, carronade: false },
  { y: 6.175, w: 0.85, h: 0.78, guns: spaced(-21, 23.5, 15), r: 0.14, length: 1.2, carronade: false },
  { y: 8.2, w: 0.78, h: 0.7, guns: spaced(-20.5, -8.5, 6), r: 0.13, length: 1, carronade: false },
  { y: 8.2, w: 0.78, h: 0.7, guns: [22], r: 0.13, length: 1.05, carronade: false },
  { y: 8.2, w: 0.9, h: 0.7, guns: [25], r: 0.25, length: 0.55, carronade: true }
];

function armamentPart(b: Batch, state: State) {
  const open = state.gunports === "open";
  for (const tier of TIERS)
    for (const x of tier.guns)
      for (const side of [-1, 1]) {
        const { point, normal, frame } = hullFrame(x, tier.y, side);
        b.mounts.push({
          id: `port-${side > 0 ? "s" : "p"}-${x.toFixed(2)}-${tier.y}`,
          point: point.toArray(),
          normal: normal.toArray()
        });
        b.boxIn(C.dark, frame, v(), tier.w, tier.h, 0.12);
        // Lid hinged along its top edge: black outside, red within.
        const lidLength = tier.h + 0.08;
        const lid = frame
          .clone()
          .multiply(new THREE.Matrix4().makeTranslation(0, tier.h / 2 + 0.04, 0.07))
          .multiply(new THREE.Matrix4().makeRotationX(open ? -1.15 : 0))
          .multiply(new THREE.Matrix4().makeTranslation(0, -lidLength / 2, 0));
        b.boxIn(C.black, lid, v(0, 0, 0.025), tier.w + 0.1, lidLength, 0.06);
        b.boxIn(C.red, lid, v(0, 0, -0.03), tier.w + 0.02, lidLength - 0.06, 0.05);
        if (!open) continue;
        const local = (z: number) => v(0, -0.05, z).applyMatrix4(frame);
        const muzzle = local(tier.length);
        if (tier.carronade) {
          b.rod(C.iron, local(-0.3), muzzle, tier.r, tier.r * 0.9, 10);
          b.rod(C.iron, muzzle, local(tier.length + 0.12), tier.r * 1.05, tier.r * 1.2, 10);
        } else {
          b.rod(C.iron, local(-0.35), muzzle, tier.r, tier.r * 0.72, 10);
          b.rod(C.iron, local(tier.length - 0.14), muzzle, tier.r * 0.92, tier.r * 0.92, 10);
        }
      }
}

// ---------------------------------------------------------------------------------------------------------
// Boats

function boat(b: Batch, cx: number, cz: number, keel: number, length: number, beam: number, depth: number) {
  const n = 16,
    m = 6,
    points: number[] = [],
    indices: number[] = [];
  const station = (t: number) => {
    const half = (beam / 2) * Math.sin(Math.PI * (0.12 + 0.86 * t)) ** 0.55;
    const top = keel + depth + 0.25 * (2 * t - 1) ** 2;
    return { x: cx - length / 2 + length * t, half, top };
  };
  for (let i = 0; i <= n; i++) {
    const { x, half, top } = station(i / n);
    for (let j = -m; j <= m; j++) {
      const phi = ((j / m) * Math.PI) / 2;
      points.push(x, top - depth * Math.cos(phi) * (1 - 0.15 * (i / n) ** 4), cz + half * Math.sin(phi));
    }
  }
  const w = 2 * m + 1;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 2 * m; j++) {
      const a = i * w + j;
      indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  // Transom.
  const centre = points.length / 3;
  const stern = station(0);
  points.push(stern.x, stern.top - depth * 0.5, cz);
  for (let j = 0; j < 2 * m; j++) indices.push(centre, j, j + 1);
  b.mesh(points, indices, C.boat);
  for (const side of [-1, 1])
    b.sweep(
      C.wood,
      Array.from({ length: n + 1 }, (_, i) => {
        const { x, half, top } = station(i / n);
        return v(x, top, cz + side * half);
      }),
      0.06,
      0.06
    );
  for (let k = 1; k <= 4; k++) {
    const { x, half, top } = station(k / 5);
    b.box(C.wood, v(x, top - 0.3, cz), 0.25, 0.06, half * 1.9);
  }
}

function boatsPart(b: Batch) {
  boat(b, 7, 0, 7.72, 10.4, 3.2, 1.25);
  for (const side of [-1, 1]) boat(b, 7.4, side * 3.3, 7.72, 8.2, 2.2, 0.95);
}

// ---------------------------------------------------------------------------------------------------------
// Masts and spars

const yardY = (yard: Yard, state: State) => (state.sails === "set" ? yard.set : yard.furled);

function yardSpar(b: Batch, x: number, y: number, yard: { length: number; r: number }) {
  for (const side of [-1, 1])
    b.rod(C.sparBlack, v(x, y, 0), v(x, y, (side * yard.length) / 2), yard.r, yard.r * 0.45, 10);
}

function mastsPart(b: Batch, state: State) {
  for (const m of MASTS) {
    const tmX = topmastX(m),
      tgX = gallantX(m);
    b.rod(C.spar, v(m.x, m.foot - 0.1), v(m.x, m.topY), m.r, m.r * 0.9, 16);
    b.rod(C.sparBlack, v(m.x, m.topY), v(m.x, m.head), m.r * 0.9, m.r * 0.85, 12);
    // Top: square after edge and rounded fore edge, with a rail aft.
    const cx = m.x - 0.2;
    b.box(C.sparBlack, v(cx - m.topD / 4, m.topY, 0), m.topD / 2, 0.22, m.topW);
    b.put(
      new THREE.CylinderGeometry(1, 1, 0.22, 16, 1, false, 0, Math.PI),
      C.sparBlack,
      "solid",
      new THREE.Matrix4().compose(v(cx, m.topY, 0), new THREE.Quaternion(), v(m.topD / 2, 1, m.topW / 2))
    );
    const railX = cx - m.topD / 2 + 0.08;
    b.box(C.sparBlack, v(railX, m.topY + 0.9, 0), 0.08, 0.08, m.topW * 0.9);
    for (const z of spaced(-m.topW * 0.45, m.topW * 0.45, 5))
      b.rod(C.sparBlack, v(railX, m.topY, z), v(railX, m.topY + 0.9, z), 0.04, 0.04, 4);
    b.box(C.sparBlack, v((m.x + tmX) / 2, m.head + 0.2, 0), tmX - m.x + m.r * 2 + 0.3, 0.4, m.r * 2 + 0.3);
    // Topmast with crosstrees and cap.
    b.rod(C.spar, v(tmX, m.topY - 2.4), v(tmX, m.cross), m.tmR, m.tmR * 0.85, 12);
    b.rod(C.sparBlack, v(tmX, m.cross), v(tmX, m.tmHead), m.tmR * 0.85, m.tmR * 0.8, 10);
    for (const dx of [-0.35, 0.45]) b.box(C.sparBlack, v(tmX + dx, m.cross + 0.1, 0), 0.18, 0.18, m.crossHalf * 2);
    for (const dz of [-0.3, 0.3]) b.box(C.sparBlack, v(tmX + 0.05, m.cross + 0.25, dz), 1.6, 0.16, 0.14);
    b.box(C.sparBlack, v((tmX + tgX) / 2, m.tmHead + 0.15, 0), tgX - tmX + m.tmR * 2, 0.3, m.tmR * 2 + 0.15);
    // Topgallant mast, pole and truck.
    b.rod(C.spar, v(tgX, m.cross - 1.4), v(tgX, m.tgHead), m.tgR, m.tgR * 0.8, 10);
    b.rod(C.spar, v(tgX, m.tgHead), v(tgX, m.truck - 0.2), m.tgR * 0.8, m.tgR * 0.45, 8);
    b.rod(C.spar, v(tgX, m.truck - 0.2), v(tgX, m.truck), m.tgR * 1.3, m.tgR * 1.3, 10);
    yardSpar(b, yardX(m, "course"), yardY(m.course, state), m.course);
    yardSpar(b, yardX(m, "topsail"), yardY(m.topsail, state), m.topsail);
    yardSpar(b, yardX(m, "gallant"), yardY(m.gallant, state), m.gallant);
  }
  // Bowsprit, jib-boom, cap, spritsail yard and dolphin striker.
  b.rod(C.spar, BS_HEEL, BS_END, 0.5, 0.36, 16);
  b.rod(C.sparBlack, bowsprit(0.93), BS_END, 0.38, 0.37, 12);
  const dir = BS_END.clone().sub(BS_HEEL).normalize();
  b.bar(C.sparBlack, BS_END.clone().addScaledVector(dir, -0.1), BS_END.clone().addScaledVector(dir, 0.3), 1, 1.8);
  b.rod(C.spar, JB_HEEL, JB_END, 0.26, 0.16, 12);
  yardSpar(b, SPRIT.x, SPRIT.y, { length: 19, r: 0.2 });
  b.rod(C.sparBlack, bowsprit(0.96), bowsprit(0.96).add(v(0.3, -3.2)), 0.08, 0.07, 6);
  // Spanker gaff and boom.
  b.rod(C.sparBlack, GAFF_THROAT, GAFF_PEAK, 0.18, 0.12, 10);
  b.rod(C.spar, BOOM_START, BOOM_END, 0.22, 0.16, 10);
  // A plain red masthead pennant streaming aft.
  const n = 20,
    points: number[] = [],
    indices: number[] = [];
  const mainTg = gallantX(MAIN);
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      half = 0.28 * (1 - t) + 0.04;
    const x = mainTg - 0.1 - 13 * t,
      y = MAIN.truck - 0.5 - 1.6 * t,
      z = 0.35 * Math.sin(t * Math.PI * 3) * t;
    points.push(x, y + half, z, x, y - half, z);
    if (i < n) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  b.mesh(points, indices, C.pennant, "cloth");
}

// ---------------------------------------------------------------------------------------------------------
// Sails

interface SquareSail {
  xHead: number;
  xFoot: number;
  headY: number;
  headW: number;
  footY: number;
  footW: number;
  roach: number;
}
/** Square sails when set; the topsails and topgallants hang between their own yard and the one below. */
function squareSails(): SquareSail[] {
  const sails: SquareSail[] = [];
  for (const m of MASTS) {
    const cx = yardX(m, "course"),
      tx = yardX(m, "topsail"),
      gx = yardX(m, "gallant");
    if (m.courseFoot)
      sails.push({
        xHead: cx + m.course.r + 0.1,
        xFoot: cx + 0.6,
        headY: m.course.set - 0.3,
        headW: m.course.length * 0.92,
        footY: m.courseFoot,
        footW: m.course.length * 1.02,
        roach: 0.6
      });
    sails.push({
      xHead: tx + m.topsail.r + 0.08,
      xFoot: cx + m.course.r,
      headY: m.topsail.set - 0.25,
      headW: m.topsail.length * 0.92,
      footY: m.course.set + 0.35,
      footW: m.course.length * 0.9,
      roach: 0.9
    });
    sails.push({
      xHead: gx + m.gallant.r + 0.06,
      xFoot: tx + m.topsail.r,
      headY: m.gallant.set - 0.2,
      headW: m.gallant.length * 0.9,
      footY: m.topsail.set + 0.3,
      footW: m.topsail.length * 0.88,
      roach: 0.4
    });
  }
  sails.push({
    xHead: SPRIT.x + 0.25,
    xFoot: SPRIT.x + 1.2,
    headY: SPRIT.y - 0.25,
    headW: 17.5,
    footY: SPRIT.y - 6,
    footW: 18.5,
    roach: 0.5
  });
  return sails;
}
function squarePoint(sail: SquareSail, t: number, q: number): THREE.Vector3 {
  const depth = 0.1 * (sail.headY - sail.footY);
  const belly = depth * Math.sin(Math.PI * t * 0.9) * (0.25 + 0.75 * Math.sin(Math.PI * q) ** 0.8);
  const footY = sail.footY + sail.roach * Math.sin(Math.PI * q);
  return v(
    lerp(sail.xHead, sail.xFoot, t) + belly,
    lerp(sail.headY, footY, t),
    (q - 0.5) * lerp(sail.headW, sail.footW, t)
  );
}
interface Headsail {
  tack: THREE.Vector3;
  head: THREE.Vector3;
  clew: THREE.Vector3;
}
function headsails(): Headsail[] {
  const make = (tack: THREE.Vector3, stayHead: THREE.Vector3, up: number, back: number, lift: number): Headsail => ({
    tack,
    head: tack.clone().lerp(stayHead, up),
    clew: v(lerp(tack.x, stayHead.x, back), tack.y + lift, 0)
  });
  return [
    make(bowsprit(0.97), FORE_TM_HEAD, 0.45, 0.42, 0.8),
    make(jibboom(0.55), FORE_TM_HEAD, 0.62, 0.4, 1.2),
    make(jibboom(0.95), FORE_TG_HEAD, 0.6, 0.38, 1.6)
  ];
}
const SPANKER = {
  tack: v(MIZZEN.x - MIZZEN.r - 0.15, BOOM_START.y + 0.3),
  throat: GAFF_THROAT.clone().add(v(0, -0.2)),
  peak: GAFF_THROAT.clone().lerp(GAFF_PEAK, 0.97).add(v(0, -0.2)),
  clew: BOOM_START.clone().lerp(BOOM_END, 0.96).add(v(0, 0.25))
};

function sailsPart(b: Batch, state: State) {
  const base = new THREE.Color(C.canvas);
  if (state.sails === "furled") {
    for (const m of MASTS)
      for (const [which, radius] of [
        ["course", 0.5],
        ["topsail", 0.4],
        ["gallant", 0.28]
      ] as const) {
        if (which === "course" && !m.courseFoot) continue;
        const yard = m[which],
          x = yardX(m, which) + 0.1,
          y = yardY(yard, state) + yard.r + radius * 0.55;
        b.bundle(v(x, y, -yard.length * 0.45), v(x, y, yard.length * 0.45), radius);
      }
    b.bundle(v(SPRIT.x + 0.1, SPRIT.y + 0.45, -8.6), v(SPRIT.x + 0.1, SPRIT.y + 0.45, 8.6), 0.35);
    const lift = v(0, 0.42);
    b.bundle(bowsprit(0.55).add(lift), bowsprit(0.92).add(lift), 0.3);
    b.bundle(jibboom(0.12).add(lift), jibboom(0.55).add(lift), 0.26);
    b.bundle(jibboom(0.6).add(lift), jibboom(0.95).add(lift), 0.2);
    b.bundle(GAFF_THROAT.clone().add(v(-0.3, -0.35)), GAFF_PEAK.clone().add(v(0.2, -0.3)), 0.32);
    b.bundle(v(MIZZEN.x - MIZZEN.r - 0.4, 13.2), v(MIZZEN.x - MIZZEN.r - 0.4, 21.8), 0.38);
    return;
  }
  for (const sail of squareSails()) {
    const cols = 14,
      rows = 10,
      points: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const depth = 0.1 * (sail.headY - sail.footY);
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++) {
        const p = squarePoint(sail, r / rows, c / cols);
        points.push(p.x, p.y, p.z);
        const shade = 0.84 + 0.16 * (1 - (p.x - lerp(sail.xHead, sail.xFoot, r / rows)) / depth);
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    b.mesh(points, indices, C.canvas, "cloth", colors);
  }
  // Triangular headsails bellying to leeward (port).
  for (const sail of headsails()) {
    const n = 10,
      points: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const index = (i: number, j: number) => (i * (2 * n + 3 - i)) / 2 + j;
    const depth = 0.08 * sail.tack.distanceTo(sail.head);
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const a = i / n,
          c = j / n,
          w = 1 - a - c;
        const belly = 27 * a * c * w * depth;
        const p = sail.tack.clone().multiplyScalar(w).addScaledVector(sail.head, a).addScaledVector(sail.clew, c);
        points.push(p.x, p.y, p.z - belly);
        const shade = 0.86 + 0.14 * (1 - 27 * a * c * w);
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        indices.push(index(i, j), index(i + 1, j), index(i, j + 1));
        if (j < n - i - 1) indices.push(index(i, j + 1), index(i + 1, j), index(i + 1, j + 1));
      }
    b.mesh(points, indices, C.canvas, "cloth", colors);
  }
  // Spanker between mast, gaff and boom.
  {
    const n = 10,
      points: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const { tack, throat, peak, clew } = SPANKER;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const s = i / n,
          t = j / n;
        const luff = tack.clone().lerp(throat, t),
          leech = clew.clone().lerp(peak, t);
        const p = luff.lerp(leech, s);
        const belly = 1.1 * Math.sin(Math.PI * s) * Math.sin(Math.PI * (0.15 + 0.85 * t));
        points.push(p.x, p.y, p.z - belly);
        const shade = 0.86 + 0.14 * (1 - belly / 1.1);
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = i * (n + 1) + j;
        indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    b.mesh(points, indices, C.canvas, "cloth", colors);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Rigging

function hullSide(x: number, y: number, side: number, out = 0.05) {
  return v(x, y, side * (halfBreadth(x, y) + out));
}
/** Ratlines between neighbouring shrouds, each shroud given as [lower, upper]. */
function ratlines(b: Batch, shrouds: readonly (readonly [THREE.Vector3, THREE.Vector3])[], y0: number, y1: number) {
  const at = ([lo, hi]: readonly [THREE.Vector3, THREE.Vector3], y: number) =>
    lo.clone().lerp(hi, clamp((y - lo.y) / (hi.y - lo.y), 0, 1));
  for (let y = y0; y < y1; y += 0.4)
    for (let i = 0; i + 1 < shrouds.length; i++) b.line("standing", at(shrouds[i], y), at(shrouds[i + 1], y));
}

function standingRiggingPart(b: Batch) {
  for (const m of MASTS) {
    const tmX = topmastX(m),
      tgX = gallantX(m);
    for (const side of [-1, 1]) {
      // Channel with its deadeyes, lanyards and chain plates.
      const xFore = shroudX(m, 0) + 0.6,
        xAft = shroudX(m, m.shrouds - 1) - 0.6,
        xc = (xFore + xAft) / 2;
      const slope = (halfBreadth(xFore, m.channel) - halfBreadth(xAft, m.channel)) / (xFore - xAft);
      b.box(
        C.black,
        v(xc, m.channel, side * (halfBreadth(xc, m.channel) + 0.55)),
        xFore - xAft,
        0.22,
        1.2,
        new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -Math.atan(side * slope))
      );
      const lower: [THREE.Vector3, THREE.Vector3][] = [];
      for (let i = 0; i < m.shrouds; i++) {
        const x = shroudX(m, i),
          z = side * channelZ(m, x);
        const low = v(x, m.channel + 0.35, z),
          high = v(x, m.channel + 1.05, z);
        for (const at of [low, high])
          b.put(
            new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10),
            C.black,
            "solid",
            new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(at)
          );
        for (const dx of [-0.1, 0, 0.1]) b.line("standing", low.clone().add(v(dx, 0.1)), high.clone().add(v(dx, -0.1)));
        if (m.chainplates) b.line("standing", low.clone().add(v(0, -0.2)), hullSide(x - 0.1, 6.85, side));
        const top = v(m.x + 0.1 - i * 0.04, m.topY - 0.3, side * m.r);
        b.line("standing", high.clone().add(v(0, 0.2)), top);
        lower.push([high.clone().add(v(0, 0.2)), top]);
      }
      ratlines(b, lower, m.channel + 1.8, m.topY - 1.6);
      // Futtock shrouds under the top, then topmast shrouds and their ratlines.
      const upper: [THREE.Vector3, THREE.Vector3][] = [];
      for (let k = 0; k < m.tmShrouds; k++) {
        const x = m.x + 0.6 - k * 0.7;
        const rim = v(x, m.topY + 0.1, side * (m.topW / 2 - 0.1));
        b.line("standing", rim, v(m.x, m.topY - 2.3, side * (m.r + 0.25)));
        const head = v(tmX - 0.05 * k, m.cross - 0.2, side * m.tmR);
        b.line("standing", rim, head);
        upper.push([rim, head]);
      }
      ratlines(b, upper, m.topY + 0.6, m.cross - 1.2);
      for (const dx of [-0.3, 0.3])
        b.line("standing", v(tmX + dx, m.cross + 0.15, side * m.crossHalf), v(tgX, m.tgHead - 0.6, side * m.tgR));
      // Backstays to the after end of the channel.
      for (let j = 0; j < 2; j++)
        b.line(
          "standing",
          v(tmX, m.cross, side * 0.3),
          v(xAft - 0.2 - j * 0.9, m.channel + 0.4, side * channelZ(m, xAft - j * 0.9))
        );
      b.line(
        "standing",
        v(tgX, m.tgHead - 0.5, side * 0.15),
        v(xAft - 2, m.channel + 0.4, side * channelZ(m, xAft - 2))
      );
    }
  }
  // Fore-and-aft stays: the main and fore stays are doubled with preventers.
  const fore = FORE,
    main = MAIN,
    mizzen = MIZZEN;
  for (const dy of [0, -0.5]) {
    b.line("standing", v(main.x + 0.4, main.topY - 0.6 + dy), v(fore.x + 2.2 + dy, FORECASTLE + 0.4));
    b.line("standing", v(fore.x + 0.4, fore.topY - 0.6 + dy), bowsprit(0.3 - dy * 0.1));
  }
  b.line("standing", v(topmastX(main), main.tmHead - 0.8), v(fore.x + 0.5, fore.topY + 0.3));
  b.line("standing", v(gallantX(main), main.tgHead - 0.5), v(topmastX(fore), fore.tmHead - 0.4));
  b.line("standing", FORE_TM_HEAD, BS_END);
  b.line("standing", FORE_TM_HEAD, jibboom(0.55));
  b.line("standing", FORE_TG_HEAD, jibboom(0.95));
  b.line("standing", v(mizzen.x + 0.3, mizzen.topY - 0.5), v(main.x - 0.6, 9.2));
  b.line("standing", v(topmastX(mizzen), mizzen.tmHead - 0.6), v(main.x - 0.5, main.topY - 0.6));
  b.line("standing", v(gallantX(mizzen), mizzen.tgHead - 0.4), v(topmastX(main), main.cross - 0.5));
  // Bobstays, bowsprit shrouds and the martingale.
  b.line("standing", bowsprit(0.55), v(30.4, 3.6));
  b.line("standing", bowsprit(0.78), v(30, 2.6));
  for (const side of [-1, 1]) b.line("standing", bowsprit(0.5), hullSide(28.2, 5.4, side));
  const striker = bowsprit(0.96).add(v(0.3, -3.2));
  b.line("standing", JB_END, striker);
  b.line("standing", jibboom(0.6), striker);
  for (const side of [-1, 1]) b.line("standing", striker, hullSide(28.6, 7.6, side));
}

function runningRiggingPart(b: Batch, state: State) {
  const set = state.sails === "set";
  const footrope = (x: number, y: number, length: number) => {
    for (const side of [-1, 1])
      b.polyline(
        "running",
        Array.from({ length: 7 }, (_, i) => {
          const t = i / 6;
          return v(x - 0.2, y - 0.2 - 0.75 * Math.sin(Math.PI * t), side * lerp(0.4, length * 0.48, t));
        })
      );
  };
  const braceTargets: Record<"course" | "topsail" | "gallant", (m: Mast) => THREE.Vector3> = {
    course: m => (m === FORE ? v(MAIN.x + 0.6, 24) : m === MAIN ? v(-24, 10.9, 5.5) : v(MAIN.x - 0.6, 18)),
    topsail: m =>
      m === FORE
        ? v(MAIN.x, MAIN.topY + 0.3, 2.5)
        : m === MAIN
          ? v(MIZZEN.x - 0.5, MIZZEN.topY + 0.3, 2)
          : v(MAIN.x - 1.5, MAIN.topY, 2),
    gallant: m =>
      m === FORE
        ? v(topmastX(MAIN), MAIN.cross, 1)
        : m === MAIN
          ? v(topmastX(MIZZEN), MIZZEN.cross, 1)
          : v(topmastX(MAIN), MAIN.tmHead - 0.5, 0.5)
  };
  for (const m of MASTS)
    for (const which of ["course", "topsail", "gallant"] as const) {
      const yard = m[which],
        x = yardX(m, which),
        y = yardY(yard, state),
        half = yard.length * 0.48;
      const liftTo =
        which === "course"
          ? (side: number) => v(m.x, m.head - 0.6, side * 0.5)
          : which === "topsail"
            ? (side: number) => v(topmastX(m), m.cross + 0.3, side * 1.2)
            : () => v(gallantX(m), m.truck - 2.5);
      const brace = braceTargets[which](m);
      for (const side of [-1, 1]) {
        const arm = v(x, y, side * half);
        b.line("running", arm, liftTo(side));
        b.line("running", arm, v(brace.x, brace.y, side * Math.abs(brace.z)));
      }
      if (which !== "course")
        b.line(
          "running",
          v(x, y + 0.2),
          v(which === "topsail" ? topmastX(m) : gallantX(m), which === "topsail" ? m.tmHead - 0.3 : m.tgHead - 0.2)
        );
      footrope(x, y, yard.length);
    }
  // Spritsail yard and spanker.
  for (const side of [-1, 1]) b.line("running", v(SPRIT.x, SPRIT.y, side * 9), BS_END);
  footrope(SPRIT.x, SPRIT.y, 19);
  b.line("running", GAFF_PEAK, v(topmastX(MIZZEN), MIZZEN.cross));
  b.line("running", GAFF_THROAT.clone().add(v(0, 0.3)), v(MIZZEN.x, MIZZEN.topY - 0.4));
  for (const side of [-1, 1]) b.line("running", GAFF_PEAK, v(-27.5, sheer(-27.5) + 0.2, side * 3.4));
  b.line("running", BOOM_END, v(topmastX(MIZZEN), MIZZEN.cross - 0.4));
  b.line("running", BOOM_END.clone().lerp(BOOM_START, 0.08), v(sternFaceX(11, 0) + 0.3, sheer(-30)));
  if (!set) return;
  // Sheets and tacks from the clews of the set sails.
  const sails = squareSails();
  for (const [index, sail] of sails.entries()) {
    const course = sail.footY < 16 && sail !== sails.at(-1);
    for (const side of [-1, 1]) {
      const clew = squarePoint(sail, 1, side > 0 ? 1 : 0);
      if (course) {
        const aft = clew.x - 9,
          fwd = clew.x + 8;
        b.line("running", clew, v(aft, sheer(aft) + 0.1, side * (halfBreadth(aft, sheer(aft)) + 0.05)));
        b.line("running", clew, v(fwd, sheer(fwd) + 0.1, side * (halfBreadth(fwd, sheer(fwd)) + 0.05)));
      } else if (index === sails.length - 1) b.line("running", clew, v(28, 9, side * 3));
    }
  }
  for (const sail of headsails()) b.line("running", sail.clew, v(25.5, sheer(25.5) + 0.2, -3.5));
  for (const side of [-1, 1]) b.line("running", SPANKER.clew, v(BOOM_END.x + 1, BOOM_END.y, side * 0.3));
}

// ---------------------------------------------------------------------------------------------------------
// Assembly

const BUILDERS: Record<OpusShipOfTheLinePart, (b: Batch, state: State) => void> = {
  hull: hullPart,
  decks: decksPart,
  stern: sternPart,
  head: headPart,
  armament: armamentPart,
  boats: boatsPart,
  masts: mastsPart,
  sails: sailsPart,
  "standing-rigging": standingRiggingPart,
  "running-rigging": runningRiggingPart
};

function build(parts: readonly OpusShipOfTheLinePart[], options: OpusShipOfTheLineState): CityStructureMeshes {
  const state: State = {
    sails: options.sails ?? "set",
    gunports: options.gunports ?? "open",
    windows: options.windows ?? "open"
  };
  const b = new Batch();
  for (const id of parts) {
    b.part = id;
    BUILDERS[id](b, state);
  }
  const group = new THREE.Group();
  group.name = "opus-ship-of-the-line";
  const materials = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    cloth: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true })
  };
  const names: Record<Layer, string> = {
    solid: "ship-of-the-line-hull-and-fittings",
    cloth: "ship-of-the-line-canvas",
    glow: "ship-of-the-line-lanterns"
  };
  const ledger = new Map<OpusShipOfTheLinePart, ModelPart>();
  const entry = (id: OpusShipOfTheLinePart) => {
    let found = ledger.get(id);
    if (!found) {
      found = { id, role: ROLES[id], quality: "high", author: AUTHOR, meshes: 0, triangles: 0 };
      ledger.set(id, found);
    }
    return found;
  };
  const geometries: THREE.BufferGeometry[] = [];
  const pickables: THREE.Mesh[] = [];
  for (const layer of ["solid", "cloth", "glow"] as const) {
    const pieces = b.pieces[layer];
    if (!pieces.length) continue;
    const ranges: ModelPartRange[] = [];
    let start = 0;
    for (const { part, geometry } of pieces) {
      const count = geometry.getAttribute("position").count;
      const last = ranges.at(-1);
      if (last && last.partId === part) last.count += count;
      else ranges.push({ partId: part, start, count });
      start += count;
      const record = entry(part);
      record.meshes++;
      record.triangles += count / 3;
    }
    const merged = mergeGeometries(
      pieces.map(piece => piece.geometry),
      false
    )!;
    for (const piece of pieces) piece.geometry.dispose();
    geometries.push(merged);
    const object = new THREE.Mesh(merged, materials[layer]);
    object.name = names[layer];
    object.userData.modelPartRanges = ranges;
    group.add(object);
    pickables.push(object);
  }
  const lineMaterials: THREE.LineBasicMaterial[] = [];
  for (const kind of ["standing", "running", "seams"] as const) {
    const { positions, ranges } = b.strokes[kind];
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: STROKE_COLORS[kind] });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = `${kind}-${kind === "seams" ? "lines" : "rigging"}`;
    lines.userData.modelPartRanges = ranges;
    for (const range of ranges) entry(range.partId as OpusShipOfTheLinePart);
    group.add(lines);
    geometries.push(geometry);
    lineMaterials.push(material);
  }
  group.userData.modelParts = OPUS_SHIP_OF_THE_LINE_PARTS.filter(id => ledger.has(id)).map(id => ledger.get(id)!);
  group.userData.shipState = state;
  if (parts.includes("armament")) group.userData.gunports = b.mounts;
  if (parts.includes("stern")) group.userData.windows = b.windows;
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of [...Object.values(materials), ...lineMaterials]) material.dispose();
    }
  };
}

export function createOpusShipOfTheLine(state: OpusShipOfTheLineState = {}): CityStructureMeshes {
  return build(OPUS_SHIP_OF_THE_LINE_PARTS, state);
}

/** Each part builds only its own components, so a part can be shown or reused without the rest of the ship. */
export function opusShipOfTheLineParts(state: OpusShipOfTheLineState = {}): readonly ModelPartFactory[] {
  return OPUS_SHIP_OF_THE_LINE_PARTS.map(id => ({
    id,
    role: ROLES[id],
    quality: "high" as const,
    author: AUTHOR,
    create: () => build([id], state)
  }));
}
