import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

export const GEMINI_TRIREME_QUALITIES = ["high", "low"] as const;
export type GeminiTriremeQuality = (typeof GEMINI_TRIREME_QUALITIES)[number];

/**
 * HS Olympias (1987 Hellenic Navy reconstruction by John Coates and John Morrison), in meters.
 * Coordinate convention: bow +X, starboard +Z, up +Y, waterline Y = 0.
 *
 * Authentic Olympias architectural characteristics modeled here:
 * - Slender 3.65 m moulded hull beam (36.9 m overall, 5.45 m across the parexeiresia outriggers, 1.1 m draught).
 * - Natural varnished Oregon pine planking with dark pitch bottom and twin heavy converging wales (zosteres).
 * - Cast Piraeus-type three-bladed bronze ram (embolon) at the waterline; NO secondary proembolion.
 * - Swept flat-section stempost (akrostolion) and painted marble ophthalmoi (white sclera, blue iris, dark pupil).
 * - Full framed parexeiresia outrigger box closing forward into triangular bow epotides (catheads).
 * - Broad ~4.5 m canopy deck (katastroma) on stanchions with an open recessed central gangway slot and broad parodoi.
 * - Swan-neck sternpost rising ~6.5 m above the keel underside into a forward-curling multi-rib aphlaston.
 * - Twin long aft-raked (~38 deg) quarter steering oars (pedalia) in stern outrigger housings with linked tillers.
 * - Wide low-aspect ~95 m^2 main square sail on a 13.0 m arched composite yard, plus ~24 m^2 raked akateion boat sail.
 * - 170 sculpted 4.0-4.2 m oars on 0.888 m room spacing (31 thranites, 27 zygites, 27 thalamites per side).
 */
export const GEMINI_TRIREME = {
  author: "Gemini 4 Neon" as Author,
  name: "Trireme",
  length: 36.9,
  beam: 5.45,
  hullBeam: 3.65,
  canopyBeam: 4.5,
  height: 12.1,
  draft: 1.1,
  room: 0.888,
  oars: 170,
  thranites: 62,
  zygites: 54,
  thalamites: 54,
  mainYardLength: 13.0,
  source: "https://en.wikipedia.org/wiki/Olympias_(trireme)",
  note: "HS Olympias (Coates & Morrison, 1987): slender 3.65 m varnished pine hull with dark pitch bottom, twin converging wales and a Piraeus-type three-bladed bronze ram (no proembolion); framed 5.45 m parexeiresia outriggers with triangular bow epotides; broad 4.5 m canopy deck with a recessed central gangway; swan-neck sternpost curving forward into a ribbed aphlaston; twin aft-raked quarter steering oars in stern housings; 13 m arched main yard with ~95 m² brailed square sail, raked akateion and 170 sculpted oars (4.0–4.2 m) in three staggered banks."
} as const;

export interface GeminiTriremeState {
  /** `struck` lowers the main mast and furled main yard onto deck crutches for battle trim. */
  sails?: "set" | "furled" | "struck";
  oars?: "out" | "stowed";
}

// Olympias natural varnished Oregon pine, Virginia oak, pitch bottom, cast bronze and classical accents.
const PALETTE: Partial<Record<Surface, number>> = {
  wood: 0xba8d53, // Varnished Oregon pine planking
  thatch: 0xd0a96e, // Lighter pine decking, oars and spars
  oak: 0x6c472a, // Virginia oak framing, outrigger, wales, rudders
  dark: 0x1c1815, // Waterproof pitch below waterline, pupils, iron/dark toggles
  brass: 0xb88b3a, // Cast bronze Piraeus-style ram & fittings
  ruby: 0x9b3121, // Classical ochre/red trim & plain stern streamer
  azure: 0x245a94, // Blue iris of the ophthalmoi & bow accent band
  white: 0xefe7d4, // Unbleached linen sails & marble sclera
  leather: 0x4b3120, // Askomata oar-port sleeves, oar strops, brail rings, rudder straps
  straw: 0x9b7e52, // Hypozoma bracing cables & coiled mooring lines
  stone: 0x8b867b, // Stone anchor stocks
  cloth: 0x8d2820 // Plain crimson pennant cloth
};

const STANDING_LINE_COLOR = 0x352c24;
const RUNNING_LINE_COLOR = 0x7e6b4f;
const SAIL_SEAM_COLOR = 0xbaa886;
const DECK_SEAM_COLOR = 0x8c6c42;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const vec3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const pos3 = (v: THREE.Vector3): Position => [v.x, v.y, v.z];

function hermite(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- naval architecture (Olympias hull lines)

const ROOM = GEMINI_TRIREME.room;
const MAX_HALF_HULL = GEMINI_TRIREME.hullBeam / 2; // 1.825 m
const KEEL_DEPTH = -0.99; // False keel adds 0.08 m -> min.y ~ -1.07 m (>= -1.1 m draft)
const OUTRIGGER_HALF_Z = 2.66; // Outer timber face reaches ~2.72 m (<= 2.725 m = 5.45/2)
const OUTRIGGER_RAIL_Y = 1.54; // Top of parexeiresia thole beam
const CANOPY_Y = 2.22; // Broad canopy deck top height (low, authentic Olympias profile)
const CANOPY_HALF_Z = GEMINI_TRIREME.canopyBeam / 2; // 2.25 m
const GANGWAY_SLOT_HALF = 0.39; // Open recessed central gangway width 0.78 m
const THALAMITE_PORT_Y = 0.43;

/** Longitudinal keel rocker profile from sternpost heel (-15.5) to ram forefoot (+16.1). */
function keelProfileY(x: number): number {
  const foreLift = 0.74 * hermite(8.5, 16.1, x);
  const aftLift = 0.68 * hermite(-8.2, -15.5, x);
  return KEEL_DEPTH + foreLift + aftLift;
}

/** Gunwale sheer profile: low waist amidships, rising gracefully fore and sweeping high aft. */
function gunwaleY(x: number): number {
  const foreSheer = 0.68 * hermite(10.0, 16.45, x);
  const aftSheer = 1.18 * hermite(-9.8, -16.75, x);
  return 1.16 + foreSheer + aftSheer;
}

/** Longitudinal bounds of the hull planking at vertical parameter s in [0, 1]. */
function forePlankX(s: number): number {
  return 16.05 + 0.42 * s ** 1.05;
}
function aftPlankX(s: number): number {
  return -15.45 - 1.32 * s ** 1.4;
}

/**
 * Slender wineglass section characteristic of Coates' Olympias lines:
 * sharp hollow deadrise at the keel, sleek turn of bilge, narrow waterline (~3.2 m),
 * flaring to 3.65 m near upper topsides with subtle tumblehome at the gunwale.
 */
function crossSectionFactor(s: number): number {
  const deadrise = 0.04 + 0.14 * hermite(0.0, 0.18, s);
  const bilge = 0.82 * (1 - (1 - clamp((s - 0.06) / 0.72, 0, 1)) ** 2.15);
  const tumblehome = 0.045 * Math.max(0, (s - 0.78) / 0.22);
  return clamp(deadrise + bilge - tumblehome, 0.04, 1.0);
}

/** Half-breadth of the moulded hull at longitudinal coordinate x and vertical parameter s. */
function hullHalfWidth(x: number, s: number): number {
  const foreT = clamp((x - 7.8) / (forePlankX(s) - 7.8), 0, 1);
  const aftT = clamp((-7.2 - x) / (-7.2 - aftPlankX(s)), 0, 1);
  // Sharp, needle-like fine entry at the bow and clean long run aft.
  const waterlinePlan = (1 - foreT ** 1.75) * (1 - aftT ** 1.65);
  return Math.max(0.035, MAX_HALF_HULL * waterlinePlan * crossSectionFactor(s));
}

function hullSurface(u: number, s: number, side: number): THREE.Vector3 {
  const x = lerp(aftPlankX(s), forePlankX(s), u);
  const y = lerp(keelProfileY(x), gunwaleY(x), s);
  return vec3(x, y, side * hullHalfWidth(x, s));
}

function verticalParam(x: number, y: number): number {
  return clamp((y - keelProfileY(x)) / (gunwaleY(x) - keelProfileY(x)), 0, 1);
}

function hullSideAt(x: number, y: number, side: number): THREE.Vector3 {
  return vec3(x, y, side * hullHalfWidth(x, verticalParam(x, y)));
}

function hullNormalAt(x: number, y: number, side: number): THREE.Vector3 {
  const along = hullSideAt(x + 0.05, y, side).sub(hullSideAt(x - 0.05, y, side));
  const up = hullSideAt(x, y + 0.05, side).sub(hullSideAt(x, y - 0.05, side));
  const normal = along.cross(up).normalize();
  return normal.z * side < 0 ? normal.negate() : normal;
}

function hullContourAtY(y: number, steps: number, side: number, uStart = 0.008, uEnd = 0.992): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = lerp(uStart, uEnd, i / steps);
    let s = 0.5;
    for (let iter = 0; iter < 6; iter++) s = verticalParam(lerp(aftPlankX(s), forePlankX(s), u), y);
    points.push(hullSurface(u, s, side));
  }
  return points;
}

function hullInnerHalf(x: number, y: number, wallThickness = 0.045): number {
  return Math.max(0.05, hullHalfWidth(x, verticalParam(x, y)) - wallThickness);
}

/** Outrigger outer edge Z tapers cleanly forward into the epotis cathead and aft toward the stern rudder housing. */
function outriggerOuterZ(x: number): number {
  if (x > 13.0) return lerp(OUTRIGGER_HALF_Z, hullHalfWidth(x, 0.95) + 0.16, hermite(13.0, 14.35, x));
  if (x < -13.0) return lerp(OUTRIGGER_HALF_Z, hullHalfWidth(x, 0.92) + 0.24, hermite(-13.0, -14.75, x));
  return OUTRIGGER_HALF_Z;
}

/** Canopy deck outer half-width: broad 4.5 m amidships, tapering cleanly toward the bow and stern decks. */
function canopyHalfWidth(x: number): number {
  const foreTaper = hermite(9.8, 13.4, x);
  const aftTaper = hermite(-10.2, -14.2, x);
  const base = CANOPY_HALF_Z * (1 - 0.42 * foreTaper) * (1 - 0.36 * aftTaper);
  return Math.min(base, outriggerOuterZ(x) - 0.14);
}

// ---------------------------------------------------------------- oar banks (170 oars on 0.888 m room)

export interface GeminiTriremeBank {
  id: "thranite" | "zygite" | "thalamite";
  perSide: number;
  /** Center X of the bank; each lower tier trails the one above by ~1/3 room. */
  centerOffset: number;
  /** Nominal oar length amidships (4.2 m standard, 4.0 m near ends as on Olympias). */
  midLength: number;
  /** Constant inboard loom length from pivot to handle grip. */
  inboard: number;
}

export const GEMINI_TRIREME_BANKS: readonly GeminiTriremeBank[] = [
  { id: "thranite", perSide: 31, centerOffset: 0.22, midLength: 4.2, inboard: 1.15 },
  { id: "zygite", perSide: 27, centerOffset: -0.08, midLength: 4.2, inboard: 1.2 },
  { id: "thalamite", perSide: 27, centerOffset: -0.38, midLength: 4.0, inboard: 1.15 }
];

export function geminiTriremeRooms(bank: GeminiTriremeBank): number[] {
  return Array.from({ length: bank.perSide }, (_, i) => bank.centerOffset + (i - (bank.perSide - 1) / 2) * ROOM);
}

const THRANITE_ROOMS = geminiTriremeRooms(GEMINI_TRIREME_BANKS[0]);
const ZYGITE_ROOMS = geminiTriremeRooms(GEMINI_TRIREME_BANKS[1]);
const THALAMITE_ROOMS = geminiTriremeRooms(GEMINI_TRIREME_BANKS[2]);

/** True pivot point of each oar bank: parexeiresia thole, gunwale thole, or askoma hull port. */
export function geminiTriremePivot(bank: GeminiTriremeBank["id"], x: number, side: number): THREE.Vector3 {
  if (bank === "thranite") return vec3(x, OUTRIGGER_RAIL_Y + 0.1, side * outriggerOuterZ(x));
  if (bank === "zygite") {
    const gunwale = hullSideAt(x, gunwaleY(x), side);
    return vec3(x, gunwaleY(x) + 0.08, side * (Math.abs(gunwale.z) + 0.04));
  }
  return hullSideAt(x, THALAMITE_PORT_Y, side);
}

// ---------------------------------------------------------------- procedural geometry primitives

const makeKit = (name: string) => new SailingKit(name, PALETTE);

class SurfaceAccumulator {
  readonly verts: number[] = [];
  readonly tris: number[] = [];

  addVertex(v: THREE.Vector3): number {
    this.verts.push(v.x, v.y, v.z);
    return this.verts.length / 3 - 1;
  }

  addQuad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void {
    const i0 = this.addVertex(a);
    const i1 = this.addVertex(b);
    const i2 = this.addVertex(c);
    const i3 = this.addVertex(d);
    this.tris.push(i0, i1, i2, i0, i2, i3);
  }

  addGrid(rows: number, cols: number, fn: (r: number, c: number) => THREE.Vector3): void {
    const base = this.verts.length / 3;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) this.addVertex(fn(r, c));
    const stride = cols + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = base + r * stride + c;
        this.tris.push(a, a + 1, a + stride + 1, a, a + stride + 1, a + stride);
      }
    }
  }

  flush(kit: SailingKit, name: string, surface: Surface): void {
    if (!this.tris.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.verts, 3));
    geometry.setIndex(this.tris);
    geometry.computeVertexNormals();
    kit.add(name, geometry, surface);
  }
}

/** Sweep a rectangular cross-section along a 3D spline with consistent world-up or binormal framing. */
function sweepRibbon(
  kit: SailingKit,
  name: string,
  controlPoints: readonly THREE.Vector3[],
  widthFn: (t: number) => number,
  heightFn: (t: number) => number,
  steps: number,
  surface: Surface,
  lateralAxis?: THREE.Vector3
): void {
  const curve = new THREE.CatmullRomCurve3([...controlPoints]);
  const acc = new SurfaceAccumulator();
  const rings: THREE.Vector3[][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const side = lateralAxis
      ? lateralAxis.clone().normalize()
      : Math.abs(tangent.z) < 0.95
        ? vec3(0, 0, 1)
        : vec3(1, 0, 0);
    const normal = side.clone().cross(tangent).normalize();
    const binormal = tangent.clone().cross(normal).normalize();
    const hw = widthFn(t) / 2;
    const hh = heightFn(t) / 2;
    rings.push([
      center.clone().addScaledVector(binormal, -hw).addScaledVector(normal, -hh),
      center.clone().addScaledVector(binormal, hw).addScaledVector(normal, -hh),
      center.clone().addScaledVector(binormal, hw).addScaledVector(normal, hh),
      center.clone().addScaledVector(binormal, -hw).addScaledVector(normal, hh)
    ]);
  }
  for (let i = 0; i < steps; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let k = 0; k < 4; k++) acc.addQuad(a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]);
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  acc.addQuad(first[0], first[3], first[2], first[1]);
  acc.addQuad(last[0], last[1], last[2], last[3]);
  acc.flush(kit, name, surface);
}

function addTaperedCylinder(
  kit: SailingKit,
  name: string,
  from: THREE.Vector3,
  to: THREE.Vector3,
  rFrom: number,
  rTo: number,
  radialSegments: number,
  surface: Surface
) {
  const length = from.distanceTo(to);
  const mesh = kit.add(name, new THREE.CylinderGeometry(rTo, rFrom, length, radialSegments), surface);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(vec3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
}

function addTube(
  kit: SailingKit,
  name: string,
  points: readonly THREE.Vector3[],
  radius: number,
  high: boolean,
  surface: Surface
) {
  const curve = new THREE.CatmullRomCurve3([...points]);
  return kit.add(
    name,
    new THREE.TubeGeometry(curve, Math.max(4, points.length * (high ? 4 : 2)), radius, high ? 8 : 4, false),
    surface
  );
}

function addPlankedStrip(
  kit: SailingKit,
  name: string,
  x0: number,
  x1: number,
  topY: number,
  thick: number,
  zMinFn: (x: number) => number,
  zMaxFn: (x: number) => number,
  steps: number,
  surface: Surface = "thatch"
): void {
  const acc = new SurfaceAccumulator();
  const botY = topY - thick;
  for (let i = 0; i < steps; i++) {
    const xa = lerp(x0, x1, i / steps);
    const xb = lerp(x0, x1, (i + 1) / steps);
    const za0 = zMinFn(xa);
    const za1 = zMaxFn(xa);
    const zb0 = zMinFn(xb);
    const zb1 = zMaxFn(xb);
    if (za1 <= za0 + 0.01 && zb1 <= zb0 + 0.01) continue;
    acc.addQuad(vec3(xa, topY, za0), vec3(xa, topY, za1), vec3(xb, topY, zb1), vec3(xb, topY, zb0));
    acc.addQuad(vec3(xa, botY, za0), vec3(xb, botY, zb0), vec3(xb, botY, zb1), vec3(xa, botY, za1));
    acc.addQuad(vec3(xa, botY, za1), vec3(xb, botY, zb1), vec3(xb, topY, zb1), vec3(xa, topY, za1));
    acc.addQuad(vec3(xa, botY, za0), vec3(xa, topY, za0), vec3(xb, topY, zb0), vec3(xb, botY, zb0));
  }
  for (const [x, sign] of [
    [x0, -1],
    [x1, 1]
  ] as const) {
    const z0 = zMinFn(x);
    const z1 = zMaxFn(x);
    if (z1 <= z0 + 0.01) continue;
    const a = vec3(x, botY, z0);
    const b = vec3(x, botY, z1);
    const c = vec3(x, topY, z1);
    const d = vec3(x, topY, z0);
    if (sign > 0) acc.addQuad(a, b, c, d);
    else acc.addQuad(a, d, c, b);
  }
  acc.flush(kit, name, surface);
}

/** Shared sculpted classical oar blade geometry (local +Y from neck 0 to tip length, thickness along X, width along Z). */
function createSculptedBladeGeometry(
  length: number,
  maxWidth: number,
  thickness: number,
  high: boolean
): THREE.BufferGeometry {
  const stations: readonly [number, number, number][] = high
    ? [
        [0.0, 0.036, 0.034],
        [0.18, 0.064, 0.026],
        [0.45, 0.115, 0.02],
        [0.75, maxWidth, 0.015],
        [0.92, maxWidth * 0.94, 0.012],
        [1.0, maxWidth * 0.42, 0.008]
      ]
    : [
        [0.0, 0.04, 0.032],
        [0.45, maxWidth * 0.85, 0.02],
        [0.88, maxWidth, 0.014],
        [1.0, maxWidth * 0.45, 0.01]
      ];

  const verts: number[] = [];
  const indices: number[] = [];
  const ringProfile = (y: number, w: number, t: number) => {
    const hw = w / 2;
    const ht = Math.max(t, thickness) / 2;
    return [
      [0, y, -hw],
      [ht, y, -hw * 0.5],
      [ht, y, hw * 0.5],
      [0, y, hw],
      [-ht, y, hw * 0.5],
      [-ht, y, -hw * 0.5]
    ];
  };
  for (const [frac, w, t] of stations) {
    for (const p of ringProfile(frac * length, w, t)) verts.push(p[0], p[1], p[2]);
  }
  const ringLen = 6;
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = i * ringLen;
    const b = (i + 1) * ringLen;
    for (let k = 0; k < ringLen; k++) {
      const kn = (k + 1) % ringLen;
      indices.push(a + k, a + kn, b + kn, a + k, b + kn, b + k);
    }
  }
  // End caps.
  const firstCenter = verts.length / 3;
  verts.push(0, 0, 0);
  const lastCenter = verts.length / 3;
  verts.push(0, length, 0);
  const lastRing = (stations.length - 1) * ringLen;
  for (let k = 0; k < ringLen; k++) {
    const kn = (k + 1) % ringLen;
    indices.push(firstCenter, kn, k);
    indices.push(lastCenter, lastRing + k, lastRing + kn);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------- 1. hull, Piraeus ram, stem, swan-neck aphlaston, eyes

function buildHull(high: boolean) {
  const kit = makeKit("gemini-trireme-hull");
  const U = high ? 84 : 28;
  const S = high ? 16 : 6;

  const layers = new Map<Surface, SurfaceAccumulator>();
  const layer = (surf: Surface) => {
    let acc = layers.get(surf);
    if (!acc) {
      acc = new SurfaceAccumulator();
      layers.set(surf, acc);
    }
    return acc;
  };

  // Authentic Olympias colour scheme: dark waterproof pitch below the waterline,
  // warm varnished Oregon pine topsides, with a sleek classical red/blue trim band near the bow gunwale.
  const surfaceOf = (c: THREE.Vector3): Surface => {
    if (c.y < 0.04) return "dark";
    if (c.x > 12.6 && c.y > 1.24 && c.y < 1.56) return "ruby";
    if (c.x > 13.4 && c.y > 0.96 && c.y <= 1.24) return "azure";
    return "wood";
  };

  for (const side of [-1, 1]) {
    for (let i = 0; i < U; i++) {
      for (let j = 0; j < S; j++) {
        const a = hullSurface(i / U, j / S, side);
        const b = hullSurface((i + 1) / U, j / S, side);
        const c = hullSurface((i + 1) / U, (j + 1) / S, side);
        const d = hullSurface(i / U, (j + 1) / S, side);
        const center = a.clone().add(c).multiplyScalar(0.5);
        if (side > 0) layer(surfaceOf(center)).addQuad(a, b, c, d);
        else layer(surfaceOf(center)).addQuad(a, d, c, b);
      }
    }
  }
  // Close bow & stern faces and bottom keel strip.
  for (let j = 0; j < S; j++) {
    for (const u of [0, 1]) {
      const a = hullSurface(u, j / S, -1);
      const b = hullSurface(u, j / S, 1);
      const c = hullSurface(u, (j + 1) / S, 1);
      const d = hullSurface(u, (j + 1) / S, -1);
      const surf: Surface = a.y < 0.04 ? "dark" : "wood";
      if (u === 1) layer(surf).addQuad(a, b, c, d);
      else layer(surf).addQuad(a, d, c, b);
    }
  }
  for (let i = 0; i < U; i++) {
    layer("dark").addQuad(
      hullSurface(i / U, 0, -1),
      hullSurface((i + 1) / U, 0, -1),
      hullSurface((i + 1) / U, 0, 1),
      hullSurface(i / U, 0, 1)
    );
  }
  for (const [surf, acc] of layers) {
    const label =
      surf === "dark"
        ? "hull-pitch"
        : surf === "ruby"
          ? "hull-bow-band"
          : surf === "azure"
            ? "hull-bow-stripe"
            : "hull-planking";
    acc.flush(kit, label, surf);
  }

  // Heavy Iroko keel timber along the bottom rocker.
  const keelPts: THREE.Vector3[] = [];
  const kSteps = high ? 24 : 12;
  for (let i = 0; i <= kSteps; i++) {
    const x = lerp(-15.35, 16.0, i / kSteps);
    keelPts.push(vec3(x, keelProfileY(x) - 0.02, 0));
  }
  sweepRibbon(
    kit,
    "keel",
    keelPts,
    () => 0.14,
    () => 0.12,
    kSteps,
    "dark",
    vec3(0, 0, 1)
  );

  // Twin heavy external wales (zosteres) converging cleanly into the bronze ram at the bow, plus gunwale cap.
  const wSteps = high ? 30 : 12;
  for (const side of [-1, 1]) {
    // Lower waterline wale sweeping forward into the lower ram socket.
    const lowerWale = hullContourAtY(0.06, wSteps, side, 0.012, 0.99);
    lowerWale.push(vec3(16.15, 0.04, side * 0.24));
    addTube(kit, "wale-lower", lowerWale, 0.078, high, "oak");

    // Upper mid-hull wale converging slightly downward at the bow into the upper ram shoulder.
    const upperWale: THREE.Vector3[] = [];
    for (let i = 0; i <= wSteps; i++) {
      const u = lerp(0.012, 0.992, i / wSteps);
      const yTarget = lerp(0.76, 0.44, hermite(0.78, 1.0, u));
      let s = 0.55;
      for (let iter = 0; iter < 6; iter++) s = verticalParam(lerp(aftPlankX(s), forePlankX(s), u), yTarget);
      upperWale.push(hullSurface(u, s, side));
    }
    addTube(kit, "wale-upper", upperWale, 0.064, high, "oak");

    // Gunwale cap timber.
    const gunwalePts: THREE.Vector3[] = [];
    for (let i = 0; i <= wSteps; i++) gunwalePts.push(hullSurface(lerp(0.004, 0.996, i / wSteps), 1, side));
    addTube(kit, "gunwale", gunwalePts, 0.06, high, "oak");
  }

  // Thalamite oarports (27 per side) sealed with conical leather askomata sleeves.
  for (const x of THALAMITE_ROOMS) {
    for (const side of [-1, 1]) {
      const p = hullSideAt(x, THALAMITE_PORT_Y, side);
      const n = hullNormalAt(x, THALAMITE_PORT_Y, side);
      if (high) {
        addTaperedCylinder(
          kit,
          "thalamite-port",
          p.clone().addScaledVector(n, -0.01),
          p.clone().addScaledVector(n, 0.025),
          0.09,
          0.088,
          10,
          "dark"
        );
        addTaperedCylinder(
          kit,
          "askoma",
          p.clone().addScaledVector(n, 0.015),
          p.clone().addScaledVector(n, 0.145),
          0.096,
          0.052,
          8,
          "leather"
        );
      } else {
        addTaperedCylinder(
          kit,
          "thalamite-port",
          p.clone().addScaledVector(n, -0.01),
          p.clone().addScaledVector(n, 0.04),
          0.088,
          0.066,
          5,
          "leather"
        );
      }
    }
  }

  // Piraeus-style cast bronze ram (embolon): waisted body gripping the forefoot and converging wales,
  // flaring at the blunt striking face into three horizontal cutting blades. No proembolion on Olympias.
  buildPiraeusRam(kit, high);

  // Sweeping flat-section stempost (akrostolion) rising cleanly above the ram and curling back at the stolos crest.
  const stemCurve = [
    vec3(15.98, -0.22, 0),
    vec3(16.32, 0.72, 0),
    vec3(16.52, 1.75, 0),
    vec3(16.56, 2.68, 0),
    vec3(16.32, 3.42, 0),
    vec3(15.86, 3.74, 0),
    vec3(15.48, 3.56, 0)
  ];
  sweepRibbon(
    kit,
    "stem",
    stemCurve,
    t => lerp(0.2, 0.12, t),
    t => lerp(0.28, 0.16, t),
    high ? 22 : 10,
    "oak",
    vec3(0, 0, 1)
  );
  if (high) {
    // Decorative terminal medallion/volute at the akrostolion head.
    const cap = kit.cylinder("stem-volute", [15.5, 3.55, 0], 0.15, 0.14, "ruby", 0.15, 12);
    cap.rotation.x = Math.PI / 2;
  }

  // Swan-neck sternpost rising ~6.4 m above keel underside (~5.35 m above waterline)
  // and curling forward into a multi-ribbed aphlaston (authentic Olympias profile, curved in X-Y plane).
  const sternSpine = [
    vec3(-15.42, -0.34, 0),
    vec3(-15.95, 0.95, 0),
    vec3(-16.75, 2.25, 0),
    vec3(-17.58, 3.42, 0),
    vec3(-18.18, 4.46, 0),
    vec3(-18.16, 5.18, 0),
    vec3(-17.62, 5.42, 0),
    vec3(-16.92, 5.14, 0)
  ];
  sweepRibbon(
    kit,
    "sternpost",
    sternSpine,
    t => lerp(0.22, 0.1, t),
    t => lerp(0.26, 0.12, t),
    high ? 24 : 10,
    "oak",
    vec3(0, 0, 1)
  );

  // Layered forward-curling aphlaston plumes (curved ribbons radiating slightly in both X-Y arc and subtle Z fan).
  const plumeOffsets = high ? [-0.28, -0.19, -0.095, 0.095, 0.19, 0.28] : [-0.22, 0.22];
  for (const zTip of plumeOffsets) {
    const rank = Math.abs(zTip) / 0.28;
    const plumePts = [
      vec3(-17.55, 3.38, zTip * 0.18),
      vec3(-18.15 + rank * 0.12, 4.35 - rank * 0.18, zTip * 0.62),
      vec3(-18.08 + rank * 0.22, 5.04 - rank * 0.34, zTip * 0.92),
      vec3(-17.48 + rank * 0.32, 5.26 - rank * 0.48, zTip),
      vec3(-16.94 + rank * 0.36, 4.98 - rank * 0.52, zTip * 0.96)
    ];
    sweepRibbon(
      kit,
      "aphlaston",
      plumePts,
      () => 0.042,
      () => 0.068,
      high ? 14 : 6,
      "oak",
      vec3(0, 0, 1)
    );
  }
  // Curved cross-battens binding the aphlaston fan together.
  kit.beam("aphlaston-batten", [-18.14, 4.42, -0.26], [-18.14, 4.42, 0.26], 0.055, "ruby");
  kit.beam("aphlaston-batten", [-17.85, 5.15, -0.3], [-17.85, 5.15, 0.3], 0.05, "oak");

  // Large painted classical ophthalmoi (white marble sclera, vivid blue iris, black pupil & dark outline).
  for (const side of [-1, 1]) {
    const ex = 14.35;
    const ey = 1.04;
    const normal = hullNormalAt(ex, ey, side);
    const tangent = hullSideAt(ex + 0.05, ey, side)
      .sub(hullSideAt(ex - 0.05, ey, side))
      .normalize();
    const up = normal.clone().cross(tangent).normalize();
    if (up.y < 0) up.negate();
    const right = up.clone().cross(normal).normalize();
    const orient = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    const anchor = hullSideAt(ex, ey, side).addScaledVector(normal, 0.015);

    if (high) {
      const outline = kit.sphere("ophthalmos-outline", [0, 0, 0], [0.42, 0.24, 0.024], "dark");
      outline.position.copy(anchor);
      outline.quaternion.copy(orient);
    }
    const sclera = kit.sphere("ophthalmos", [0, 0, 0], [0.37, 0.2, 0.032], "white");
    sclera.position.copy(anchor).addScaledVector(normal, 0.01);
    sclera.quaternion.copy(orient);

    const iris = kit.sphere("ophthalmos-iris", [0, 0, 0], [0.155, 0.155, 0.026], "azure");
    iris.position.copy(anchor).addScaledVector(normal, 0.022).addScaledVector(right, 0.03);
    iris.quaternion.copy(orient);

    const pupil = kit.sphere("ophthalmos-pupil", [0, 0, 0], [0.082, 0.082, 0.024], "dark");
    pupil.position.copy(anchor).addScaledVector(normal, 0.032).addScaledVector(right, 0.035);
    pupil.quaternion.copy(orient);
  }

  return kit.finish();
}

/** Cast Piraeus-type three-bladed bronze ram straddling the waterline. */
function buildPiraeusRam(kit: SailingKit, high: boolean): void {
  // Waisted octagonal-section bronze cowl gripping the forefoot and tapering to the striking face.
  const stations: readonly { x: number; hw: number; y0: number; y1: number }[] = [
    { x: 15.55, hw: 0.36, y0: -0.34, y1: 0.56 },
    { x: 16.35, hw: 0.29, y0: -0.3, y1: 0.48 },
    { x: 17.15, hw: 0.17, y0: -0.23, y1: 0.38 }, // waisted neck
    { x: 17.85, hw: 0.14, y0: -0.19, y1: 0.36 },
    { x: 18.42, hw: 0.08, y0: -0.16, y1: 0.35 } // blunt triple-fin striking face
  ];
  const acc = new SurfaceAccumulator();
  const chamferRing = (st: (typeof stations)[number]) => {
    const chW = st.hw * 0.72;
    const midY = (st.y0 + st.y1) / 2;
    const hH = (st.y1 - st.y0) / 2;
    const chY = hH * 0.72;
    return [
      vec3(st.x, st.y0, -chW),
      vec3(st.x, st.y0, chW),
      vec3(st.x, midY - chY, st.hw),
      vec3(st.x, midY + chY, st.hw),
      vec3(st.x, st.y1, chW),
      vec3(st.x, st.y1, -chW),
      vec3(st.x, midY + chY, -st.hw),
      vec3(st.x, midY - chY, -st.hw)
    ];
  };
  const rings = stations.map(chamferRing);
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let k = 0; k < 8; k++) acc.addQuad(a[k], a[(k + 1) % 8], b[(k + 1) % 8], b[k]);
  }
  // Close front & rear faces.
  const front = rings[rings.length - 1];
  const back = rings[0];
  for (let k = 1; k < 7; k++) {
    acc.addQuad(front[0], front[k], front[k + 1], front[k + 1]);
    acc.addQuad(back[0], back[k + 1], back[k], back[k]);
  }
  acc.flush(kit, "ram", "brass");

  // Three prominent horizontal striking fins (lower, middle, upper) flaring toward the blunt front face.
  for (const finY of [-0.08, 0.095, 0.27]) {
    const finAcc = new SurfaceAccumulator();
    const fStations = [
      { x: 16.85, hw: 0.16, t: 0.022 },
      { x: 17.65, hw: 0.25, t: 0.028 },
      { x: 18.3, hw: 0.28, t: 0.03 },
      { x: 18.42, hw: 0.23, t: 0.022 }
    ];
    const fRings = fStations.map(st => [
      vec3(st.x, finY - st.t, -st.hw),
      vec3(st.x, finY - st.t, st.hw),
      vec3(st.x, finY + st.t, st.hw),
      vec3(st.x, finY + st.t, -st.hw)
    ]);
    for (let i = 0; i + 1 < fRings.length; i++) {
      for (let k = 0; k < 4; k++) {
        finAcc.addQuad(fRings[i][k], fRings[i][(k + 1) % 4], fRings[i + 1][(k + 1) % 4], fRings[i + 1][k]);
      }
    }
    const fEnd = fRings[fRings.length - 1];
    finAcc.addQuad(fEnd[0], fEnd[1], fEnd[2], fEnd[3]);
    finAcc.flush(kit, "ram-fin", "brass");
  }
  if (high) {
    // Vertical cutting edge tying the three horizontal fins at the nose + rear socket collar.
    kit.box("ram-face-rib", [18.39, 0.095, 0], [0.06, 0.44, 0.06], "brass");
    kit.box("ram-collar", [15.62, 0.11, 0], [0.16, 0.94, 0.76], "brass");
  }
}

// ---------------------------------------------------------------- 2. interior (ribs, 3-tier benches, hypozoma)

function buildInterior(high: boolean) {
  const kit = makeKit("gemini-trireme-interior");
  const floorY = -0.42;

  addPlankedStrip(
    kit,
    "hold-floor",
    -13.2,
    13.4,
    floorY,
    0.05,
    x => -hullInnerHalf(x, floorY),
    x => hullInnerHalf(x, floorY),
    high ? 28 : 10,
    "oak"
  );
  // Central keelson & bilge walk.
  kit.box("keelson", [0.1, floorY + 0.05, 0], [26.0, 0.1, 0.24], "oak");
  kit.box("mast-step", [0.85, floorY + 0.16, 0], [0.84, 0.24, 0.48], "oak");

  // Curved Virginia oak transverse frames (ribs) visible through the open upper sides.
  if (high) {
    for (let x = -12.6; x <= 12.6; x += 1.15) {
      for (const side of [-1, 1]) {
        const ribPts: THREE.Vector3[] = [];
        for (let k = 0; k <= 5; k++) {
          const y = lerp(floorY, gunwaleY(x) - 0.04, k / 5);
          ribPts.push(vec3(x, y, side * hullInnerHalf(x, y, 0.05)));
        }
        addTube(kit, "hull-rib", ribPts, 0.04, false, "oak");
      }
    }
  }

  // Zyga: transverse crossbeams supporting the zygite rowers and stiffening the slender hull.
  for (const x of ZYGITE_ROOMS) {
    const bx = x + 0.42;
    const half = hullInnerHalf(bx, 0.88, 0.02);
    kit.box("zygon", [bx, 0.88, 0], [0.12, 0.11, 2 * half], "oak");
    if (high) {
      for (const side of [-1, 1]) {
        const seatZ = side * Math.min(1.12, Math.max(0.45, half - 0.2));
        kit.box("zygite-seat", [bx, 0.96, seatZ], [0.28, 0.05, 0.42], "thatch");
      }
    }
  }

  if (high) {
    // Thalamite low benches in the bilge with vertical legs.
    for (const x of THALAMITE_ROOMS) {
      const sx = x + 0.42;
      const maxZ = hullInnerHalf(sx, 0.12, 0.15);
      for (const side of [-1, 1]) {
        const sz = side * Math.min(0.76, maxZ);
        kit.box("thalamite-seat", [sx, 0.12, sz], [0.3, 0.055, 0.38], "thatch");
        kit.beam("thalamite-seat-post", [sx, floorY, sz], [sx, 0.09, sz], 0.06, "oak");
      }
    }
    // Thranite upper rowing stringers and cantilevered seats beneath the canopy deck.
    for (const side of [-1, 1]) {
      kit.box("thranite-stringer", [0.2, 1.32, side * 1.62], [27.4, 0.09, 0.1], "oak");
      for (const x of THRANITE_ROOMS) {
        const sx = x + 0.42;
        const sz = side * Math.min(1.62, outriggerOuterZ(sx) - 0.85);
        kit.box("thranite-seat", [sx, 1.4, sz], [0.3, 0.06, 0.38], "thatch");
      }
    }
  }

  // Hypozoma: twin pre-tensioned longitudinal hogging cables running from bow anchor post to stern windlass.
  for (const z of [-0.18, 0.18]) {
    const aft = vec3(-13.9, 1.15, z);
    const fore = vec3(14.8, 1.15, z);
    if (high) addTube(kit, "hypozoma", [aft, vec3(0, 1.13, z), fore], 0.048, true, "straw");
    else kit.lines("hypozoma", [[pos3(aft), pos3(fore)]], STANDING_LINE_COLOR);
  }
  addTaperedCylinder(
    kit,
    "hypozoma-windlass",
    vec3(-14.05, 1.24, -0.45),
    vec3(-14.05, 1.24, 0.45),
    0.1,
    0.1,
    high ? 10 : 6,
    "oak"
  );
  if (high) {
    for (const z of [-0.3, 0.3]) kit.beam("windlass-bar", [-14.05, 0.82, z], [-14.05, 1.68, z], 0.048, "thatch", true);
    kit.box("hypozoma-bitt", [14.85, 1.24, 0], [0.24, 0.34, 0.56], "oak");
  }

  return kit.finish();
}

// ---------------------------------------------------------------- 3. outrigger (parexeiresia box, epotides, stern housings)

function buildOutrigger(high: boolean) {
  const kit = makeKit("gemini-trireme-outrigger");
  const xAft = -14.65;
  const xFore = 14.3;
  const steps = high ? 28 : 12;

  for (const side of [-1, 1]) {
    // Upper parexeiresia thole-beam and lower outrigger wale following the tapered planform.
    const topRailPts: THREE.Vector3[] = [];
    const botRailPts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = lerp(xAft, xFore, i / steps);
      const z = side * outriggerOuterZ(x);
      topRailPts.push(vec3(x, OUTRIGGER_RAIL_Y, z));
      botRailPts.push(vec3(x, OUTRIGGER_RAIL_Y - 0.34, z - side * 0.08));
    }
    sweepRibbon(
      kit,
      "parexeiresia",
      topRailPts,
      () => 0.14,
      () => 0.14,
      steps,
      "oak",
      vec3(0, 0, 1)
    );
    sweepRibbon(
      kit,
      "outrigger-lower-wale",
      botRailPts,
      () => 0.1,
      () => 0.1,
      steps,
      "oak",
      vec3(0, 0, 1)
    );

    // Side splash-board (light wooden fascia panel along the outside of the outrigger box).
    const fascia = new SurfaceAccumulator();
    for (let i = 0; i < steps; i++) {
      const x0 = lerp(xAft + 0.3, xFore - 0.2, i / steps);
      const x1 = lerp(xAft + 0.3, xFore - 0.2, (i + 1) / steps);
      const z0 = side * (outriggerOuterZ(x0) + 0.055);
      const z1 = side * (outriggerOuterZ(x1) + 0.055);
      const a = vec3(x0, OUTRIGGER_RAIL_Y - 0.34, z0);
      const b = vec3(x1, OUTRIGGER_RAIL_Y - 0.34, z1);
      const c = vec3(x1, OUTRIGGER_RAIL_Y - 0.02, z1);
      const d = vec3(x0, OUTRIGGER_RAIL_Y - 0.02, z0);
      if (side > 0) fascia.addQuad(a, b, c, d);
      else fascia.addQuad(a, d, c, b);
    }
    fascia.flush(kit, "outrigger-fascia", "wood");

    // Heavy timber brackets & diagonal struts firmly seating the parexeiresia into the slender hull.
    for (let i = 0; i < THRANITE_ROOMS.length; i += high ? 2 : 4) {
      const x = THRANITE_ROOMS[i] + 0.42;
      if (x > 13.7 || x < -13.8) continue;
      const oz = side * outriggerOuterZ(x);
      const gunwale = hullSideAt(x, gunwaleY(x), side);
      kit.beam(
        "outrigger-bracket",
        [x, gunwaleY(x) + 0.02, gunwale.z - side * 0.06],
        [x, OUTRIGGER_RAIL_Y - 0.06, oz - side * 0.04],
        0.1,
        "oak"
      );
      const lowY = Math.min(0.72, gunwaleY(x) - 0.42);
      const hullFoot = hullSideAt(x, lowY, side);
      kit.beam("outrigger-brace", [x, OUTRIGGER_RAIL_Y - 0.3, oz - side * 0.08], pos3(hullFoot), 0.085, "oak");
      // Vertical stanchion rising from outrigger up to carry the broad canopy deck.
      const deckZ = side * (canopyHalfWidth(x) - 0.06);
      kit.beam("canopy-stanchion", [x, OUTRIGGER_RAIL_Y, oz - side * 0.04], [x, CANOPY_Y - 0.04, deckZ], 0.08, "oak");
    }

    // Forward triangular epotis (cathead): solid timber cheek closing the front of the outrigger box.
    const epotisBeamZ = side * (outriggerOuterZ(13.35) + 0.04);
    const bowHull = hullSideAt(14.35, 1.48, side);
    kit.beam("epotis-arm", [13.35, OUTRIGGER_RAIL_Y, epotisBeamZ], [14.35, 1.56, bowHull.z], 0.22, "oak");
    kit.box("epotis-cheek", [13.42, OUTRIGGER_RAIL_Y + 0.02, epotisBeamZ], [0.34, 0.38, 0.22], "oak");
    if (high) {
      kit.box("epotis-face", [13.6, OUTRIGGER_RAIL_Y + 0.02, epotisBeamZ], [0.06, 0.34, 0.2], "ruby");
    }

    // Stern rudder housing (built into the aft end of the outrigger framework — no protruding crossbar).
    const rudZ = side * (outriggerOuterZ(-14.25) - 0.02);
    const sternHull = hullSideAt(-14.25, 1.65, side);
    kit.beam("rudder-housing-top", [-14.25, 1.85, sternHull.z], [-14.25, 1.85, rudZ], 0.16, "oak");
    kit.beam("rudder-housing-bot", [-14.25, 1.38, sternHull.z], [-14.25, 1.38, rudZ], 0.14, "oak");
    kit.beam("rudder-housing-post", [-14.25, 1.34, rudZ], [-14.25, 1.92, rudZ], 0.14, "oak");

    // 31 thranite tholepins on the parexeiresia + 27 zygite tholepins on the gunwale.
    for (const x of THRANITE_ROOMS) {
      const z = side * outriggerOuterZ(x);
      kit.cylinder("thranite-thole", [x + 0.06, OUTRIGGER_RAIL_Y + 0.18, z], 0.028, 0.22, "oak", 0.024, high ? 8 : 5);
    }
    for (const x of ZYGITE_ROOMS) {
      const pivot = geminiTriremePivot("zygite", x, side);
      kit.cylinder("zygite-thole", [x + 0.06, pivot.y + 0.08, pivot.z], 0.024, 0.2, "oak", 0.02, high ? 8 : 5);
    }
  }

  return kit.finish();
}

// ---------------------------------------------------------------- 4. canopy deck (broad 4.5 m katastroma + gangway slot)

function buildCanopyDeck(high: boolean) {
  const kit = makeKit("gemini-trireme-canopy-deck");
  const xStart = -13.6;
  const xEnd = 12.9;
  const steps = high ? 28 : 10;

  // Port & starboard broad parodoi (side decks) forming the 4.5 m canopy over the thranite rowers,
  // flanking the characteristic 0.78 m open recessed central gangway slot.
  for (const side of [-1, 1]) {
    addPlankedStrip(
      kit,
      "katastroma",
      xStart,
      xEnd,
      CANOPY_Y,
      0.055,
      x => (side > 0 ? GANGWAY_SLOT_HALF : -canopyHalfWidth(x)),
      x => (side > 0 ? canopyHalfWidth(x) : -GANGWAY_SLOT_HALF),
      steps,
      "thatch"
    );

    // Outer deck edge coaming & thin side trim rail.
    if (high) {
      const outerEdge: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const x = lerp(xStart, xEnd, i / 24);
        outerEdge.push(vec3(x, CANOPY_Y + 0.04, side * (canopyHalfWidth(x) - 0.03)));
      }
      addTube(kit, "deck-coaming", outerEdge, 0.036, true, "oak");
      // Inner lip along the central gangway opening.
      kit.box(
        "gangway-coaming",
        [(xStart + xEnd) / 2, CANOPY_Y + 0.025, side * GANGWAY_SLOT_HALF],
        [xEnd - xStart, 0.055, 0.055],
        "oak"
      );
    }
  }

  // Recessed central gangway walkway running along the spine slightly below the side canopy decks.
  addPlankedStrip(
    kit,
    "central-gangway",
    xStart,
    xEnd,
    CANOPY_Y - 0.26,
    0.05,
    () => -GANGWAY_SLOT_HALF + 0.02,
    () => GANGWAY_SLOT_HALF - 0.02,
    high ? 16 : 6,
    "wood"
  );

  // Transverse canopy deck beams spanning across the stanchions beneath the side decks.
  for (let i = 0; i < THRANITE_ROOMS.length; i += high ? 2 : 4) {
    const x = THRANITE_ROOMS[i] + 0.42;
    if (x < xStart + 0.2 || x > xEnd - 0.2) continue;
    const hw = canopyHalfWidth(x) - 0.05;
    for (const side of [-1, 1]) {
      const z0 = side * GANGWAY_SLOT_HALF;
      const z1 = side * hw;
      kit.box("canopy-beam", [x, CANOPY_Y - 0.08, (z0 + z1) / 2], [0.085, 0.09, Math.abs(z1 - z0)], "oak");
    }
    if (high) {
      kit.box("gangway-bearer", [x, CANOPY_Y - 0.31, 0], [0.08, 0.07, GANGWAY_SLOT_HALF * 2 + 0.06], "oak");
    }
  }

  // Forward fighting forecastle (bow deck) & low bow screen.
  addPlankedStrip(
    kit,
    "bow-deck",
    xEnd,
    15.85,
    1.86,
    0.06,
    x => -Math.min(1.45, hullInnerHalf(x, gunwaleY(x), 0.03)),
    x => Math.min(1.45, hullInnerHalf(x, gunwaleY(x), 0.03)),
    high ? 8 : 3,
    "thatch"
  );
  kit.box("bow-bulkhead", [xEnd, (1.86 + CANOPY_Y) / 2, 0], [0.09, CANOPY_Y - 1.86, canopyHalfWidth(xEnd) * 2], "oak");

  // Raised stern quarterdeck (poop) where the helmsman (kybernetes) stands.
  addPlankedStrip(
    kit,
    "stern-deck",
    -16.1,
    xStart,
    CANOPY_Y + 0.14,
    0.06,
    x => -Math.min(canopyHalfWidth(xStart), hullInnerHalf(x, gunwaleY(x), 0.02) + 0.12),
    x => Math.min(canopyHalfWidth(xStart), hullInnerHalf(x, gunwaleY(x), 0.02) + 0.12),
    high ? 8 : 3,
    "thatch"
  );

  if (high) {
    // Deck plank seams on the broad canopy side decks.
    const seams: [Position, Position][] = [];
    for (const side of [-1, 1]) {
      for (const offset of [0.85, 1.35, 1.8]) {
        seams.push([
          [-10.2, CANOPY_Y + 0.006, side * offset],
          [9.8, CANOPY_Y + 0.006, side * offset]
        ]);
      }
    }
    kit.lines("deck-seams", seams, DECK_SEAM_COLOR);
  }

  // Main mast partner collar and foremast tabernacle.
  kit.box("mast-partner-bridge", [0.85, CANOPY_Y - 0.04, 0], [0.64, 0.1, GANGWAY_SLOT_HALF * 2 + 0.16], "oak");
  kit.ring("mast-partner", [0.85, CANOPY_Y + 0.03, 0], 0.23, 0.055, "oak");
  kit.box("fore-mast-tabernacle", [10.6, CANOPY_Y - 0.14, 0], [0.46, 0.24, 0.38], "oak");

  return kit.finish();
}

// ---------------------------------------------------------------- 5. steering oars (pedalia), helmsman station, stylis, anchors

function buildSteeringAndFittings(high: boolean) {
  const kit = makeKit("gemini-trireme-fittings");

  // Twin long aft-raked quarter steering oars (pedalia) mounted in the stern outrigger housings
  // (~38 deg aft rake, authentic sculpted asymmetric steering blades, linked inboard tillers).
  const bladeGeo = createSculptedBladeGeometry(1.65, 0.56, 0.045, high);
  for (const side of [-1, 1]) {
    const pivot = vec3(-14.25, 1.62, side * (outriggerOuterZ(-14.25) - 0.02));
    const head = vec3(-13.72, 2.68, side * (outriggerOuterZ(-14.25) - 0.14));
    const tip = vec3(-16.95, -0.82, side * (outriggerOuterZ(-14.25) + 0.12));
    const dir = tip.clone().sub(head).normalize();
    const bladeStart = tip.clone().addScaledVector(dir, -1.62);

    // Long tapered oak rudder shaft (auchen).
    addTaperedCylinder(kit, "pedalion", head, bladeStart, 0.082, 0.064, high ? 10 : 6, "oak");
    // Sculpted teardrop steering blade (hyperyption).
    const blade = kit.add("pedalion-blade", bladeGeo, "oak");
    blade.position.copy(bladeStart);
    const qAlign = new THREE.Quaternion().setFromUnitVectors(vec3(0, 1, 0), dir);
    // Orient blade flat face vertically (normal ~Z) so it steers cleanly through the water.
    const qTurn = new THREE.Quaternion().setFromAxisAngle(vec3(0, 1, 0), Math.PI / 2);
    blade.quaternion.copy(qAlign).multiply(qTurn);

    // Leather retaining collar at the stern housing.
    kit.box("rudder-strap", [pivot.x, pivot.y, pivot.z], [0.28, 0.34, 0.22], "leather");
    // Tiller handle (oiax) projecting inboard to the helmsman's station.
    kit.beam("oiax", pos3(head.clone().add(vec3(0, -0.05, 0))), [-14.1, 2.62, side * 0.78], 0.058, "thatch", true);
  }
  // Ganging yoke connecting both tillers directly in front of the helmsman's bench.
  kit.beam("tiller-yoke", [-14.1, 2.62, -0.78], [-14.1, 2.62, 0.78], 0.045, "thatch", true);

  // Helmsman's seat (anklima) and low stern rails on the poop deck.
  kit.box("helmsman-bench", [-14.75, CANOPY_Y + 0.34, 0], [0.46, 0.32, 1.05], "thatch");
  if (high) {
    for (const side of [-1, 1]) {
      const zFore = side * 0.96;
      const zAft = side * 0.68;
      kit.beam("stern-rail-post", [-13.85, CANOPY_Y + 0.14, zFore], [-13.85, CANOPY_Y + 0.9, zFore], 0.05, "oak");
      kit.beam("stern-rail-post", [-15.55, CANOPY_Y + 0.14, zAft], [-15.55, CANOPY_Y + 0.9, zAft], 0.05, "oak");
      kit.beam("stern-rail", [-13.85, CANOPY_Y + 0.9, zFore], [-15.55, CANOPY_Y + 0.9, zAft], 0.045, "thatch");
    }
  }

  // Stylis: classical warship standard staff on the stern deck with crossbar and plain crimson streamer.
  kit.beam("stylis", [-15.72, CANOPY_Y + 0.14, 0], [-15.72, 4.18, 0], 0.052, "thatch", true);
  kit.beam("stylis-bar", [-15.72, 3.94, -0.34], [-15.72, 3.94, 0.34], 0.04, "thatch", true);
  const flag = new SurfaceAccumulator();
  const segs = high ? 6 : 3;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const w0 = Math.sin(t0 * Math.PI * 1.5) * 0.055;
    const w1 = Math.sin(t1 * Math.PI * 1.5) * 0.055;
    const d0 = t0 * t0 * 0.12;
    const d1 = t1 * t1 * 0.12;
    const h0 = lerp(0.13, 0.025, t0);
    const h1 = lerp(0.13, 0.025, t1);
    const x0 = -15.74 - t0 * 1.05;
    const x1 = -15.74 - t1 * 1.05;
    flag.addQuad(
      vec3(x0, 4.12 + h0 - d0, w0),
      vec3(x0, 4.12 - h0 - d0, w0),
      vec3(x1, 4.12 - h1 - d1, w1),
      vec3(x1, 4.12 + h1 - d1, w1)
    );
  }
  flag.flush(kit, "pennant", "cloth");

  // Twin wooden anchors with heavy stone stocks stowed on the bow deck behind the epotides.
  for (const side of [-1, 1]) {
    const z = side * 0.48;
    kit.beam("anchor-shank", [13.85, 1.91, z], [15.15, 1.91, z], 0.075, "oak");
    for (const arm of [-1, 1]) kit.beam("anchor-arm", [15.15, 1.91, z], [15.5, 1.91, z + arm * 0.3], 0.065, "oak");
    kit.box("anchor-stock", [14.02, 1.95, z], [0.18, 0.16, 0.58], "stone");
    if (high) {
      kit.cylinder("bollard", [13.32, 2.02, side * 0.88], 0.07, 0.28, "oak", 0.07, 8);
      for (let ring = 0; ring < 3; ring++) {
        const r = 0.21 - ring * 0.046;
        const coil = kit.add("anchor-coil", new THREE.TorusGeometry(r, 0.02, 6, 12), "straw");
        coil.position.set(14.58, 1.88, side * 0.88);
        coil.rotation.x = Math.PI / 2;
      }
    }
  }

  return kit.finish();
}

// ---------------------------------------------------------------- 6 & 7. spars & rigging (13 m main yard, raked akateion)

const MAIN_MAST = { x: 0.85, heel: -0.42, head: 11.82 } as const;
const FORE_RAKE = THREE.MathUtils.degToRad(16);
const FORE_MAST = { heel: vec3(10.6, CANOPY_Y - 0.16, 0), length: 5.35 } as const;

const foreHeadPos = () =>
  FORE_MAST.heel.clone().add(vec3(Math.sin(FORE_RAKE), Math.cos(FORE_RAKE), 0).multiplyScalar(FORE_MAST.length));

const forePointAtY = (y: number) => vec3(FORE_MAST.heel.x + (y - FORE_MAST.heel.y) * Math.tan(FORE_RAKE), y, 0);

export interface GeminiTriremeSail {
  id: "main-sail" | "fore-sail";
  x: number;
  yardY: number;
  /** Sail cloth half-width (main sail ~12.4 m wide x 7.5 m tall = ~93 m²; akateion ~6.3 m x 3.8 m = ~24 m²). */
  half: number;
  footY: number;
  belly: number;
  yardArch: number;
  bundle: number;
}

export const GEMINI_TRIREME_SAILS: readonly GeminiTriremeSail[] = [
  { id: "main-sail", x: 1.12, yardY: 10.65, half: 6.2, footY: 3.15, belly: 0.88, yardArch: 0.24, bundle: 0.24 },
  { id: "fore-sail", x: 12.1, yardY: 6.72, half: 3.15, footY: 2.95, belly: 0.44, yardArch: 0.12, bundle: 0.15 }
];

const YARD_TIP_EXT = 0.3; // Main yard total span = (6.2 + 0.3) * 2 = 13.0 m
const STRUCK_LAYOUT = { y: CANOPY_Y + 0.36, from: -11.0, to: 1.8, yardZ: 0.52, crutches: [-8.6, -3.4, 1.1] } as const;

/** Point along a gently arched classical composite yard (keraia) at u in [-1, 1]. */
function yardPoint(sail: GeminiTriremeSail, u: number, includeTip = false): THREE.Vector3 {
  const span = includeTip ? sail.half + YARD_TIP_EXT : sail.half;
  const droop = sail.yardArch * u * u;
  return vec3(sail.x, sail.yardY - droop, u * span);
}

function buildCompositeYard(kit: SailingKit, sail: GeminiTriremeSail, high: boolean): void {
  const segs = high ? 12 : 6;
  const rMid = sail.id === "main-sail" ? 0.115 : 0.075;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = lerp(-1, 1, i / segs);
    pts.push(yardPoint(sail, u, true));
  }
  for (let i = 0; i < segs; i++) {
    const t0 = Math.abs(lerp(-1, 1, i / segs));
    const t1 = Math.abs(lerp(-1, 1, (i + 1) / segs));
    addTaperedCylinder(
      kit,
      "yard",
      pts[i],
      pts[i + 1],
      lerp(rMid, 0.042, t0),
      lerp(rMid, 0.042, t1),
      high ? 8 : 5,
      "thatch"
    );
  }
  if (high) {
    // Leather fish-lashings joining the two overlapping spars at the center of the yard.
    for (const u of [-0.14, -0.05, 0.05, 0.14]) {
      const p = yardPoint(sail, u);
      const band = kit.add("yard-lashing", new THREE.TorusGeometry(rMid + 0.012, 0.014, 5, 10), "leather");
      band.position.copy(p);
    }
  }
}

function buildSpars(high: boolean, struck: boolean) {
  const kit = makeKit("gemini-trireme-spars");
  const radial = high ? 12 : 6;
  const [main, fore] = GEMINI_TRIREME_SAILS;

  if (struck) {
    addTaperedCylinder(
      kit,
      "mast-main",
      vec3(STRUCK_LAYOUT.from, STRUCK_LAYOUT.y, 0),
      vec3(STRUCK_LAYOUT.to, STRUCK_LAYOUT.y, 0),
      0.175,
      0.1,
      radial,
      "thatch"
    );
    const halfSpan = main.half + YARD_TIP_EXT;
    addTaperedCylinder(
      kit,
      "yard",
      vec3(-4.5 - halfSpan, STRUCK_LAYOUT.y - 0.04, STRUCK_LAYOUT.yardZ),
      vec3(-4.5 + halfSpan, STRUCK_LAYOUT.y - 0.04, STRUCK_LAYOUT.yardZ),
      0.072,
      0.072,
      high ? 10 : 6,
      "thatch"
    );
    for (const x of STRUCK_LAYOUT.crutches) {
      for (const z of [0, STRUCK_LAYOUT.yardZ]) {
        // Centerline crutch seats on the recessed central gangway; offset crutch seats on the starboard canopy deck.
        const footY = z === 0 ? CANOPY_Y - 0.26 : CANOPY_Y;
        kit.beam("crutch-post", [x, footY, z], [x, STRUCK_LAYOUT.y - 0.16, z], 0.08, "oak");
        kit.box("crutch-fork", [x, STRUCK_LAYOUT.y - 0.14, z], [0.1, 0.06, 0.36], "oak");
      }
    }
  } else {
    addTaperedCylinder(
      kit,
      "mast-main",
      vec3(MAIN_MAST.x, MAIN_MAST.heel, 0),
      vec3(MAIN_MAST.x, MAIN_MAST.head, 0),
      0.175,
      0.1,
      radial,
      "thatch"
    );
    if (high) kit.box("mast-calcet", [MAIN_MAST.x, MAIN_MAST.head - 0.16, 0], [0.26, 0.3, 0.22], "oak");
    kit.sphere("truck", [MAIN_MAST.x, MAIN_MAST.head + 0.08, 0], [0.12, 0.11, 0.12], "brass");
    buildCompositeYard(kit, main, high);
  }

  const fHead = foreHeadPos();
  addTaperedCylinder(kit, "mast-fore", FORE_MAST.heel, fHead, 0.11, 0.07, radial, "thatch");
  kit.sphere("truck", [fHead.x, fHead.y + 0.05, 0], [0.09, 0.09, 0.09], "brass");
  buildCompositeYard(kit, fore, high);
  return kit.finish();
}

function buildRigging(high: boolean, struck: boolean) {
  const kit = makeKit("gemini-trireme-rigging");
  const standing: [Position, Position][] = [];
  const running: [Position, Position][] = [];
  const wire = (target: [Position, Position][], a: THREE.Vector3, b: THREE.Vector3) => target.push([pos3(a), pos3(b)]);
  const [main, fore] = GEMINI_TRIREME_SAILS;
  const toggles: THREE.Vector3[] = [];

  if (!struck) {
    const top = vec3(MAIN_MAST.x, MAIN_MAST.head - 0.24, 0);
    // Forestay anchored down onto the recessed central gangway bitt, plus twin backstays.
    wire(standing, top, vec3(9.4, CANOPY_Y - 0.24, 0));
    for (const z of [-0.36, 0.36]) wire(standing, top, vec3(-15.2, CANOPY_Y + 0.18, z));
    // Classical minimal shrouds (two per side) secured to the canopy deck edge.
    for (const side of [-1, 1]) {
      for (const x of [0.25, -0.85]) {
        const foot = vec3(x, CANOPY_Y + 0.04, side * (canopyHalfWidth(x) - 0.08));
        wire(standing, vec3(MAIN_MAST.x, MAIN_MAST.head - 1.1, side * 0.1), foot);
        toggles.push(foot);
      }
    }
    for (const side of [-1, 1]) {
      const arm = yardPoint(main, side, true);
      wire(running, vec3(MAIN_MAST.x, MAIN_MAST.head - 0.1, 0), arm);
      wire(running, arm, vec3(-14.6, CANOPY_Y + 0.18, side * 1.15));
    }
    wire(running, vec3(MAIN_MAST.x, MAIN_MAST.head - 0.05, 0), vec3(main.x, main.yardY + 0.08, 0));
    wire(running, vec3(MAIN_MAST.x, MAIN_MAST.head - 0.05, 0.05), vec3(MAIN_MAST.x - 0.55, CANOPY_Y + 0.02, 0.32));
  } else {
    for (const x of STRUCK_LAYOUT.crutches) {
      for (const z of [0, STRUCK_LAYOUT.yardZ]) {
        running.push([
          [x - 0.05, STRUCK_LAYOUT.y + 0.18, z - 0.2],
          [x + 0.05, STRUCK_LAYOUT.y - 0.12, z + 0.2]
        ]);
      }
    }
  }

  const fHead = foreHeadPos();
  wire(standing, fHead.clone().add(vec3(-0.05, -0.12, 0)), vec3(15.85, 3.5, 0));
  for (const side of [-1, 1]) {
    for (const x of [9.95, 9.2]) {
      const foot = vec3(x, CANOPY_Y + 0.04, side * (canopyHalfWidth(x) - 0.08));
      wire(standing, forePointAtY(fHead.y - 0.55).add(vec3(0, 0, side * 0.06)), foot);
      toggles.push(foot);
    }
  }
  for (const side of [-1, 1]) {
    const arm = yardPoint(fore, side, true);
    wire(running, fHead.clone().add(vec3(0, -0.05, 0)), arm);
    wire(running, arm, vec3(7.4, CANOPY_Y + 0.04, side * 1.6));
  }
  wire(running, fHead.clone().add(vec3(0, -0.03, 0)), vec3(fore.x, fore.yardY + 0.06, 0));

  kit.lines("standing-rigging", standing, STANDING_LINE_COLOR);
  kit.lines("running-rigging", running, RUNNING_LINE_COLOR);
  for (const foot of toggles) {
    if (high) kit.sphere("lanyard-toggle", pos3(foot), [0.052, 0.052, 0.052], "dark");
    else kit.box("lanyard-toggle", pos3(foot), [0.09, 0.09, 0.09], "dark");
  }
  return kit.finish();
}

// ---------------------------------------------------------------- 8 & 9. sails (wide 95 m² main + 24 m² akateion)

function sailPoint(sail: GeminiTriremeSail, t: number, u: number): THREE.Vector3 {
  const s = u * 2 - 1; // [-1, 1] across the yard
  const head = yardPoint(sail, s, false);
  const across = Math.sin(Math.PI * u);
  const belly = sail.belly * (Math.sin(Math.PI * t) * across + 0.25 * t * across);
  const roach = t * t * 0.16 * across;
  return vec3(head.x + 0.05 + belly, lerp(head.y - 0.06, sail.footY, t) + roach, head.z);
}

function buildSail(sail: GeminiTriremeSail, state: GeminiTriremeState, high: boolean) {
  const kit = makeKit(`gemini-trireme-${sail.id}`);
  const mode = state.sails ?? "set";

  if (mode === "struck" && sail.id === "main-sail") {
    addSailBundle(
      kit,
      "furled-sail",
      [-4.5 - sail.half, STRUCK_LAYOUT.y + 0.13, STRUCK_LAYOUT.yardZ],
      [-4.5 + sail.half, STRUCK_LAYOUT.y + 0.13, STRUCK_LAYOUT.yardZ],
      sail.bundle * 0.9,
      high
    );
    return kit.finish();
  }

  if (mode !== "set") {
    const left = yardPoint(sail, -1, false);
    const right = yardPoint(sail, 1, false);
    addSailBundle(
      kit,
      "furled-sail",
      [left.x + 0.06, left.y - 0.18, left.z],
      [right.x + 0.06, right.y - 0.18, right.z],
      sail.bundle,
      high
    );
    return kit.finish();
  }

  const rows = high ? 12 : 5;
  const cols = high ? 18 : 6;
  const cloth = new SurfaceAccumulator();
  cloth.addGrid(rows, cols, (r, c) => sailPoint(sail, r / rows, c / cols));
  cloth.flush(kit, "square-sail", "white");

  const seams: [Position, Position][] = [];
  const brails: [Position, Position][] = [];
  const front = (t: number, u: number) => sailPoint(sail, t, u).add(vec3(0.025, 0, 0));
  const panelRows = high ? 6 : 3;
  const brailCount = sail.id === "main-sail" ? (high ? 11 : 5) : high ? 5 : 3;

  for (let r = 1; r < panelRows; r++) {
    const t = r / panelRows;
    for (let c = 0; c < cols; c++) seams.push([pos3(front(t, c / cols)), pos3(front(t, (c + 1) / cols))]);
  }
  for (let b = 1; b <= brailCount; b++) {
    const u = b / (brailCount + 1);
    for (let r = 0; r < rows; r++) brails.push([pos3(front(r / rows, u)), pos3(front((r + 1) / rows, u))]);
    const lead =
      sail.id === "main-sail"
        ? vec3(MAIN_MAST.x - 0.65, CANOPY_Y + 0.02, (u - 0.5) * 1.6)
        : vec3(9.6, CANOPY_Y + 0.02, (u - 0.5) * 1.2);
    brails.push([pos3(front(0, u).add(vec3(0, 0.12, 0))), pos3(lead)]);
    if (high) {
      for (let r = 1; r < panelRows; r++) {
        const ring = kit.add("brail-ring", new THREE.TorusGeometry(0.038, 0.01, 4, 7), "leather");
        ring.position.copy(front(r / panelRows, u));
        ring.rotation.y = Math.PI / 2;
      }
    }
  }
  kit.lines("sail-seam", seams, SAIL_SEAM_COLOR);
  kit.lines("brail", brails, RUNNING_LINE_COLOR);

  const sheets: [Position, Position][] = [0, 1].map(u => {
    const clew = sailPoint(sail, 1, u);
    return [pos3(clew), [sail.x - 3.3, CANOPY_Y + 0.04, Math.sign(clew.z) * (sail.id === "main-sail" ? 1.8 : 1.3)]];
  });
  kit.lines("sheet", sheets, RUNNING_LINE_COLOR);
  return kit.finish();
}

// ---------------------------------------------------------------- 10. oars (170 sculpted 4.0-4.2 m oars)

function buildOars(high: boolean, stowed: boolean) {
  const kit = makeKit("gemini-trireme-oars");
  const seg = high ? 8 : 5;
  const bladeLen = 0.74;
  const bladeGeo = createSculptedBladeGeometry(bladeLen, 0.155, 0.024, high);

  for (const bank of GEMINI_TRIREME_BANKS) {
    const rooms = geminiTriremeRooms(bank);
    for (const side of [-1, 1]) {
      for (let idx = 0; idx < rooms.length; idx++) {
        const x = rooms[idx];
        const pivot = geminiTriremePivot(bank.id, x, side);
        // Olympias uses slightly shorter 4.0 m oars at extreme bow/stern rooms, 4.2 m amidships.
        const endRoom = idx < 3 || idx >= rooms.length - 3;
        const totalLength = endRoom ? Math.min(bank.midLength, 4.0) : bank.midLength;
        const outboard = totalLength - bank.inboard;

        if (stowed) {
          // Drawn inboard and laid parallel aft along the outrigger/hull envelope without protruding.
          const lift = bank.id === "thranite" ? 0.09 : bank.id === "zygite" ? 0.04 : 0.03;
          const tuck = bank.id === "thalamite" ? 0.06 : 0.22;
          const rest = pivot.clone().add(vec3(0, lift, -side * tuck));
          const aftDir = vec3(-0.985, 0, -0.17 * side).normalize();
          const gripEnd = rest.clone().addScaledVector(aftDir, 2.95);
          const neckEnd = rest.clone().addScaledVector(aftDir, -0.12);
          addTaperedCylinder(kit, "oar-stowed-shaft", gripEnd, neckEnd, 0.042, 0.032, seg, "thatch");
          const blade = kit.add("oar-stowed", bladeGeo, "thatch");
          blade.position.copy(neckEnd);
          blade.quaternion.setFromUnitVectors(vec3(0, 1, 0), aftDir.clone().negate());
          continue;
        }

        // Deployed mid-stroke with a graceful ~7 deg aft sweep, all 3 tiers dipping evenly at the waterline.
        const drop = pivot.y + 0.08;
        const horizontal = Math.sqrt(Math.max(0.5, outboard ** 2 - drop ** 2));
        const sweepRad = THREE.MathUtils.degToRad(7);
        const dir = vec3(-Math.sin(sweepRad) * horizontal, -drop, side * Math.cos(sweepRad) * horizontal).normalize();
        const handle = pivot.clone().addScaledVector(dir, -bank.inboard);
        const bladeNeck = pivot.clone().addScaledVector(dir, outboard - bladeLen);

        addTaperedCylinder(kit, `${bank.id}-shaft`, handle, bladeNeck, 0.044, 0.032, seg, "thatch");
        const blade = kit.add(`oar-${bank.id}`, bladeGeo, "thatch");
        blade.position.copy(bladeNeck);
        // Align blade +Y along oar axis and rotate so the broad face pushes water aft (normal along X).
        const qAlign = new THREE.Quaternion().setFromUnitVectors(vec3(0, 1, 0), dir);
        blade.quaternion.copy(qAlign);

        if (high) {
          addTaperedCylinder(
            kit,
            "oar-strap",
            pivot.clone().addScaledVector(dir, -0.05),
            pivot.clone().addScaledVector(dir, 0.05),
            0.055,
            0.055,
            6,
            "leather"
          );
        }
      }
    }
  }
  return kit.finish();
}

// ---------------------------------------------------------------- assembly

interface TriremePartSpec {
  id: string;
  role: string;
  create: (state: GeminiTriremeState, high: boolean) => CityStructureMeshes;
}

const PARTS: readonly TriremePartSpec[] = [
  {
    id: "hull",
    role: "Slender pine hull, Piraeus ram, stempost, ophthalmoi and swan-neck aphlaston",
    create: (_, high) => buildHull(high)
  },
  {
    id: "interior",
    role: "Keelson, hull ribs, three-tier benches and hypozoma",
    create: (_, high) => buildInterior(high)
  },
  {
    id: "outrigger",
    role: "Parexeiresia outrigger framework, bow epotides, stern rudder housings and tholes",
    create: (_, high) => buildOutrigger(high)
  },
  {
    id: "decks",
    role: "Broad 4.5 m canopy deck (katastroma), recessed central gangway, bow and stern decks",
    create: (_, high) => buildCanopyDeck(high)
  },
  {
    id: "fittings",
    role: "Aft-raked quarter steering oars (pedalia), linked tillers, stylis and anchors",
    create: (_, high) => buildSteeringAndFittings(high)
  },
  {
    id: "spars",
    role: "Main mast, 13 m arched composite yard and raked akateion mast",
    create: (state, high) => buildSpars(high, state.sails === "struck")
  },
  {
    id: "rigging",
    role: "Standing and running rigging",
    create: (state, high) => buildRigging(high, state.sails === "struck")
  },
  ...GEMINI_TRIREME_SAILS.map(sail => ({
    id: sail.id,
    role: sail.id === "main-sail" ? "Main square sail (~95 m²)" : "Boat sail (akateion, ~24 m²)",
    create: (state: GeminiTriremeState, high: boolean) => buildSail(sail, state, high)
  })),
  {
    id: "oars",
    role: "Three staggered banks of 170 sculpted oars (4.0–4.2 m)",
    create: (state, high) => buildOars(high, state.oars === "stowed")
  }
];

export function geminiTriremeParts(
  quality: GeminiTriremeQuality = "high",
  state: GeminiTriremeState = {}
): readonly ModelPartFactory[] {
  const high = quality === "high";
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality,
    author: GEMINI_TRIREME.author,
    create: () => part.create(state, high)
  }));
}

/** Omitted state is sails set and oars out. */
export function createGeminiTrireme(
  quality: GeminiTriremeQuality = "high",
  state: GeminiTriremeState = {}
): CityStructureMeshes {
  const model = assembleSailingParts("gemini-trireme", geminiTriremeParts(quality, state));
  model.group.userData.shipState = { sails: state.sails ?? "set", oars: state.oars ?? "out" };
  return model;
}
