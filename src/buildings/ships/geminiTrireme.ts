import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

export const GEMINI_TRIREME_QUALITIES = ["high", "low"] as const;
export type GeminiTriremeQuality = (typeof GEMINI_TRIREME_QUALITIES)[number];

/**
 * Olympias, the 1987 full-size reconstruction of a 5th-century BC Athenian trireme, in meters.
 * Bow points +X, starboard +Z and the waterline is Y = 0.
 * 36.9 m from ram tip to aphlaston, 5.45 m over the outriggers (3.85 m moulded hull), 1.1 m draught.
 * 170 oars on a single 0.888 m room (interscalmium): 31 thranites a side on the parexeiresia,
 * 27 zygites on the gunwale and 27 thalamites through askomata-sleeved ports above the waterline.
 * Brailed linen square main sail and raked akateion; main mast and yard strike onto deck crutches for battle.
 */
export const GEMINI_TRIREME = {
  author: "Gemini 4 Neon" as Author,
  name: "Trireme",
  length: 36.9,
  beam: 5.45,
  hullBeam: 3.85,
  height: 12.2,
  draft: 1.1,
  room: 0.888,
  oars: 170,
  thranites: 62,
  zygites: 54,
  thalamites: 54,
  source: "https://en.wikipedia.org/wiki/Olympias_(trireme)",
  note: "Olympias, the 1987 Hellenic Navy reconstruction of an Athenian trireme: cast three-finned bronze ram and proembolion, miltos red-ochre cheeks with marble ophthalmoi, epotides guarding the outriggers, open-sided hull with internal ribs, three-tier oar benches on one 0.888 m room, hypozoma bracing cables tensioned at the stern windlass, twin quarter rudders, fanned seven-plume aphlaston and stylis with a plain streamer. Brailed main and akateion square sails; the main mast strikes onto deck crutches for battle."
} as const;

export interface GeminiTriremeState {
  /** `struck` lowers the main mast and furled main yard onto deck crutches for battle trim. */
  sails?: "set" | "furled" | "struck";
  oars?: "out" | "stowed";
}

const COLORS: Partial<Record<Surface, number>> = {
  dark: 0x191614,
  oak: 0x6d4a2f,
  wood: 0xc49c66,
  thatch: 0xa68352,
  ruby: 0xa33522,
  cloth: 0x8f2924,
  white: 0xebe3d0,
  brass: 0xb58b3c,
  leather: 0x4d3322,
  straw: 0x997c52,
  stone: 0x8c877d,
  azure: 0x2d4e73
};

const STANDING_ROPE = 0x382f26;
const RUNNING_ROPE = 0x806d52;
const SEAM_THREAD = 0xb9a884;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): Position => [v.x, v.y, v.z];

function smooth(from: number, to: number, x: number) {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- hull lines

const ROOM = GEMINI_TRIREME.room;
const HALF_BEAM = GEMINI_TRIREME.hullBeam / 2;
const KEEL_BASE = -1.0;
const DECK_Y = 2.52;
const DECK_HALF = 1.42;
const OUTRIGGER_Z = 2.65;
const OUTRIGGER_Y = 1.58;
const THALAMITE_Y = 0.44;

const keelY = (x: number) => KEEL_BASE + 0.72 * smooth(8.8, 16.2, x) + 0.62 * smooth(-8.6, -15.65, x);
const sheerY = (x: number) => 1.26 + 0.56 * smooth(10.5, 16.6, x) + 1.22 * smooth(-10.0, -16.85, x);
const bowX = (s: number) => 16.18 + 0.4 * s ** 1.1;
const sternX = (s: number) => -15.6 - 1.25 * s ** 1.45;

/** Wineglass hull cross-section: fine deadrise, full turn of bilge, gentle tumblehome toward the gunwale. */
function sectionProfile(s: number) {
  const bilge = Math.min(s / 0.72, 1);
  const full = 0.05 + 0.95 * (1 - (1 - bilge) ** 2.35);
  const tumblehome = 0.05 * Math.max(0, (s - 0.72) / 0.28);
  return full - tumblehome;
}

function halfBreadth(x: number, s: number) {
  const fore = clamp((x - 8.6) / (bowX(s) - 8.6), 0, 1);
  const aft = clamp((-7.8 - x) / (-7.8 - sternX(s)), 0, 1);
  const plan = (1 - fore ** 1.9) * (1 - aft ** 1.75);
  return Math.max(0.04, HALF_BEAM * plan * sectionProfile(s));
}

function hullPoint(u: number, s: number, side: number) {
  const x = lerp(sternX(s), bowX(s), u);
  return V(x, lerp(keelY(x), sheerY(x), s), side * halfBreadth(x, s));
}

const sFromY = (x: number, y: number) => clamp((y - keelY(x)) / (sheerY(x) - keelY(x)), 0, 1);

function sidePoint(x: number, y: number, side = 1) {
  return V(x, y, side * halfBreadth(x, sFromY(x, y)));
}

function sideNormal(x: number, y: number, side: number) {
  const dx = sidePoint(x + 0.05, y, side).sub(sidePoint(x - 0.05, y, side));
  const dy = sidePoint(x, y + 0.05, side).sub(sidePoint(x, y - 0.05, side));
  const n = dx.cross(dy).normalize();
  return n.z * side < 0 ? n.negate() : n;
}

function constantHeightCurve(y: number, steps: number, side: number, u0 = 0.008, u1 = 0.992) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = lerp(u0, u1, i / steps);
    let s = 0.5;
    for (let k = 0; k < 6; k++) s = sFromY(lerp(sternX(s), bowX(s), u), y);
    pts.push(hullPoint(u, s, side));
  }
  return pts;
}

const innerHalf = (x: number, y: number, clearance = 0.045) => Math.max(0.05, halfBreadth(x, sFromY(x, y)) - clearance);
const deckHalfAt = (x: number) => Math.min(DECK_HALF, innerHalf(x, sheerY(x), 0.05));

// ---------------------------------------------------------------- oar banks

export interface GeminiTriremeBank {
  id: "thranite" | "zygite" | "thalamite";
  perSide: number;
  /** Longitudinal midpoint of the bank; each lower tier trails the one above by ~1/3 room. */
  centerOffset: number;
  /** Outboard length from pivot to blade tip; inboard loom is constant. */
  outboard: number;
}

export const GEMINI_TRIREME_BANKS: readonly GeminiTriremeBank[] = [
  { id: "thranite", perSide: 31, centerOffset: 0.2, outboard: 3.05 },
  { id: "zygite", perSide: 27, centerOffset: -0.1, outboard: 2.96 },
  { id: "thalamite", perSide: 27, centerOffset: -0.4, outboard: 2.86 }
];

const OAR_INBOARD = 1.18;
const OAR_BLADE = 0.72;

export function geminiTriremeRooms(bank: GeminiTriremeBank) {
  return Array.from({ length: bank.perSide }, (_, i) => bank.centerOffset + (i - (bank.perSide - 1) / 2) * ROOM);
}

const THRANITE_X = geminiTriremeRooms(GEMINI_TRIREME_BANKS[0]);
const ZYGITE_X = geminiTriremeRooms(GEMINI_TRIREME_BANKS[1]);
const THALAMITE_X = geminiTriremeRooms(GEMINI_TRIREME_BANKS[2]);

/** Pivot coordinates for each bank: outrigger thole, gunwale thole, or hull askoma port. */
export function geminiTriremePivot(bank: GeminiTriremeBank["id"], x: number, side: number) {
  if (bank === "thranite") return V(x, OUTRIGGER_Y + 0.11, side * OUTRIGGER_Z);
  if (bank === "zygite") {
    const gunwale = sidePoint(x, sheerY(x), side);
    return V(x, sheerY(x) + 0.09, side * (Math.abs(gunwale.z) + 0.04));
  }
  return sidePoint(x, THALAMITE_Y, side);
}

// ---------------------------------------------------------------- geometry helpers

const kitOf = (name: string) => new SailingKit(name, COLORS);

class QuadMesh {
  readonly positions: number[] = [];
  readonly indices: number[] = [];

  push(v: THREE.Vector3) {
    this.positions.push(v.x, v.y, v.z);
    return this.positions.length / 3 - 1;
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
    const i0 = this.push(a);
    const i1 = this.push(b);
    const i2 = this.push(c);
    const i3 = this.push(d);
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  grid(rows: number, cols: number, sample: (i: number, j: number) => THREE.Vector3) {
    const base = this.positions.length / 3;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) this.push(sample(i, j));
    const stride = cols + 1;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = base + i * stride + j;
        this.indices.push(a, a + 1, a + stride + 1, a, a + stride + 1, a + stride);
      }
    }
  }

  commit(kit: SailingKit, name: string, surface: Surface) {
    if (!this.indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    kit.add(name, geometry, surface);
  }
}

function taperedSpar(
  kit: SailingKit,
  name: string,
  a: THREE.Vector3,
  b: THREE.Vector3,
  rA: number,
  rB: number,
  radialSegments: number,
  surface: Surface = "thatch"
) {
  const length = a.distanceTo(b);
  const mesh = kit.add(name, new THREE.CylinderGeometry(rB, rA, length, radialSegments), surface);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function orientedBox(
  kit: SailingKit,
  name: string,
  center: THREE.Vector3,
  axisY: THREE.Vector3,
  size: Position,
  surface: Surface
) {
  const mesh = kit.box(name, [0, 0, 0], size, surface);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), axisY.clone().normalize());
  mesh.position.copy(center);
  return mesh;
}

function curvedTube(
  kit: SailingKit,
  name: string,
  points: THREE.Vector3[],
  radius: number,
  high: boolean,
  surface: Surface
) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubular = Math.max(4, points.length * (high ? 4 : 2));
  const radial = high ? 8 : 4;
  return kit.add(name, new THREE.TubeGeometry(curve, tubular, radius, radial, false), surface);
}

interface LoftStation {
  x: number;
  hw: number;
  y0: number;
  y1: number;
}

function loftProfile(kit: SailingKit, name: string, stations: readonly LoftStation[], surface: Surface) {
  const mesh = new QuadMesh();
  const ring = (st: LoftStation) => [
    V(st.x, st.y0, -st.hw),
    V(st.x, st.y0, st.hw),
    V(st.x, st.y1, st.hw),
    V(st.x, st.y1, -st.hw)
  ];
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = ring(stations[i]);
    const b = ring(stations[i + 1]);
    for (let k = 0; k < 4; k++) mesh.quad(a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]);
  }
  const first = ring(stations[0]);
  const last = ring(stations[stations.length - 1]);
  mesh.quad(first[0], first[3], first[2], first[1]);
  mesh.quad(last[0], last[1], last[2], last[3]);
  mesh.commit(kit, name, surface);
}

function deckSlab(
  kit: SailingKit,
  name: string,
  x0: number,
  x1: number,
  topY: number,
  thickness: number,
  halfAt: (x: number) => number,
  steps: number,
  surface: Surface = "wood"
) {
  const mesh = new QuadMesh();
  const botY = topY - thickness;
  for (let i = 0; i < steps; i++) {
    const xa = lerp(x0, x1, i / steps);
    const xb = lerp(x0, x1, (i + 1) / steps);
    const ha = halfAt(xa);
    const hb = halfAt(xb);
    mesh.quad(V(xa, topY, -ha), V(xa, topY, ha), V(xb, topY, hb), V(xb, topY, -hb));
    mesh.quad(V(xa, botY, -ha), V(xb, botY, -hb), V(xb, botY, hb), V(xa, botY, ha));
    mesh.quad(V(xa, botY, ha), V(xb, botY, hb), V(xb, topY, hb), V(xa, topY, ha));
    mesh.quad(V(xa, botY, -ha), V(xa, topY, -ha), V(xb, topY, -hb), V(xb, botY, -hb));
  }
  for (const [x, dir] of [
    [x0, -1],
    [x1, 1]
  ] as const) {
    const h = halfAt(x);
    const a = V(x, botY, -h);
    const b = V(x, botY, h);
    const c = V(x, topY, h);
    const d = V(x, topY, -h);
    if (dir > 0) mesh.quad(a, b, c, d);
    else mesh.quad(a, d, c, b);
  }
  mesh.commit(kit, name, surface);
}

function addRopeCoil(kit: SailingKit, name: string, center: Position, outerRadius: number, surface: Surface = "straw") {
  for (let i = 0; i < 3; i++) {
    const r = outerRadius - i * 0.048;
    if (r < 0.04) break;
    const torus = kit.add(name, new THREE.TorusGeometry(r, 0.022, 6, 12), surface);
    torus.position.set(center[0], center[1] + 0.024, center[2]);
    torus.rotation.x = Math.PI / 2;
  }
}

// ---------------------------------------------------------------- hull

function buildHull(high: boolean) {
  const kit = kitOf("gemini-trireme-hull");
  const U = high ? 86 : 28;
  const S = high ? 16 : 6;
  const buckets = new Map<Surface, QuadMesh>();
  const bucket = (surface: Surface) => {
    let entry = buckets.get(surface);
    if (!entry) {
      entry = new QuadMesh();
      buckets.set(surface, entry);
    }
    return entry;
  };
  const classify = (center: THREE.Vector3): Surface => {
    if (center.y < 0.03) return "dark";
    if (center.x > 12.2 && center.y > 0.24 && center.y < 1.66) return "ruby";
    return "oak";
  };

  for (const side of [-1, 1]) {
    for (let i = 0; i < U; i++) {
      for (let j = 0; j < S; j++) {
        const a = hullPoint(i / U, j / S, side);
        const b = hullPoint((i + 1) / U, j / S, side);
        const c = hullPoint((i + 1) / U, (j + 1) / S, side);
        const d = hullPoint(i / U, (j + 1) / S, side);
        const center = a.clone().add(c).multiplyScalar(0.5);
        if (side > 0) bucket(classify(center)).quad(a, b, c, d);
        else bucket(classify(center)).quad(a, d, c, b);
      }
    }
  }
  // Close stem and stern faces and keel bottom strip.
  for (let j = 0; j < S; j++) {
    for (const u of [0, 1]) {
      const a = hullPoint(u, j / S, -1);
      const b = hullPoint(u, j / S, 1);
      const c = hullPoint(u, (j + 1) / S, 1);
      const d = hullPoint(u, (j + 1) / S, -1);
      const surf: Surface = a.y < 0.03 ? "dark" : "oak";
      if (u === 1) bucket(surf).quad(a, b, c, d);
      else bucket(surf).quad(a, d, c, b);
    }
  }
  for (let i = 0; i < U; i++) {
    bucket("dark").quad(
      hullPoint(i / U, 0, -1),
      hullPoint((i + 1) / U, 0, -1),
      hullPoint((i + 1) / U, 0, 1),
      hullPoint(i / U, 0, 1)
    );
  }
  for (const [surface, mesh] of buckets) {
    const label = surface === "dark" ? "hull-pitch" : surface === "ruby" ? "hull-cheek" : "hull-planking";
    mesh.commit(kit, label, surface);
  }

  // Keel timber along the bottom rocker.
  const keelPts: THREE.Vector3[] = [];
  for (let i = 0; i <= (high ? 22 : 12); i++) {
    const x = lerp(-15.35, 16.0, i / (high ? 22 : 12));
    keelPts.push(V(x, keelY(x) - 0.015, 0));
  }
  curvedTube(kit, "keel", keelPts, 0.07, high, "dark");

  // External wales and gunwale cap.
  const waleSteps = high ? 28 : 12;
  for (const side of [-1, 1]) {
    curvedTube(kit, "wale-waterline", constantHeightCurve(0.05, waleSteps, side), 0.068, high, "dark");
    curvedTube(kit, "wale-upper", constantHeightCurve(0.74, waleSteps, side), 0.055, high, "dark");
    if (high) {
      curvedTube(kit, "wale-lower", constantHeightCurve(-0.34, 22, side, 0.06, 0.94), 0.045, true, "dark");
    }
    const gunwalePts: THREE.Vector3[] = [];
    for (let i = 0; i <= waleSteps; i++) gunwalePts.push(hullPoint(lerp(0.004, 0.996, i / waleSteps), 1, side));
    curvedTube(kit, "gunwale", gunwalePts, 0.062, high, "wood");
  }

  // Thalamite oar ports with waterproof leather askomata sleeves.
  for (const x of THALAMITE_X) {
    for (const side of [-1, 1]) {
      const p = sidePoint(x, THALAMITE_Y, side);
      const n = sideNormal(x, THALAMITE_Y, side);
      if (high) {
        taperedSpar(
          kit,
          "thalamite-port",
          p.clone().addScaledVector(n, -0.01),
          p.clone().addScaledVector(n, 0.025),
          0.09,
          0.088,
          10,
          "dark"
        );
        taperedSpar(
          kit,
          "askoma",
          p.clone().addScaledVector(n, 0.015),
          p.clone().addScaledVector(n, 0.14),
          0.095,
          0.052,
          8,
          "leather"
        );
      } else {
        taperedSpar(
          kit,
          "thalamite-port",
          p.clone().addScaledVector(n, -0.01),
          p.clone().addScaledVector(n, 0.04),
          0.088,
          0.068,
          5,
          "leather"
        );
      }
    }
  }

  // Cast bronze ram (embolon) straddling the waterline with three cutting fins and collar.
  loftProfile(
    kit,
    "ram",
    [
      { x: 15.65, hw: 0.37, y0: -0.35, y1: 0.56 },
      { x: 16.55, hw: 0.31, y0: -0.3, y1: 0.5 },
      { x: 17.5, hw: 0.16, y0: -0.22, y1: 0.4 },
      { x: 18.42, hw: 0.05, y0: -0.15, y1: 0.33 }
    ],
    "brass"
  );
  for (const y of [-0.09, 0.09, 0.27]) {
    loftProfile(
      kit,
      "ram-fin",
      [
        { x: 16.95, hw: 0.19, y0: y - 0.028, y1: y + 0.028 },
        { x: 17.85, hw: 0.28, y0: y - 0.028, y1: y + 0.028 },
        { x: 18.4, hw: 0.14, y0: y - 0.024, y1: y + 0.024 }
      ],
      "brass"
    );
  }
  if (high) {
    // Vertical cutting spine and rear reinforcement collar on the bronze ram.
    loftProfile(
      kit,
      "ram-spine",
      [
        { x: 17.55, hw: 0.032, y0: -0.24, y1: 0.42 },
        { x: 18.42, hw: 0.026, y0: -0.17, y1: 0.35 }
      ],
      "brass"
    );
    kit.box("ram-collar", [15.72, 0.1, 0], [0.18, 0.94, 0.78], "brass");
  }

  // Proembolion: secondary upper beak with bronze cap.
  loftProfile(
    kit,
    "proembolion",
    [
      { x: 15.9, hw: 0.14, y0: 1.48, y1: 1.74 },
      { x: 17.02, hw: 0.1, y0: 1.52, y1: 1.7 }
    ],
    "oak"
  );
  kit.sphere("proembolion-cap", [17.12, 1.61, 0], [0.17, 0.14, 0.13], "brass");

  // Swept stempost (akrostolion) curling inward at the head.
  curvedTube(
    kit,
    "stem",
    [
      V(16.1, -0.26, 0),
      V(16.38, 0.78, 0),
      V(16.58, 1.85, 0),
      V(16.65, 2.75, 0),
      V(16.45, 3.36, 0),
      V(16.1, 3.62, 0),
      V(15.88, 3.48, 0)
    ],
    0.11,
    high,
    "oak"
  );

  // Sweeping sternpost and fanned aphlaston (seven plumes on high, three on low).
  const sternCurve = [
    V(-15.55, -0.38, 0),
    V(-16.02, 1.05, 0),
    V(-16.84, 2.5, 0),
    V(-17.64, 3.66, 0),
    V(-18.2, 4.82, 0),
    V(-18.24, 5.68, 0),
    V(-17.82, 6.18, 0),
    V(-17.18, 6.26, 0)
  ];
  curvedTube(kit, "sternpost", sternCurve, 0.11, high, "oak");
  const plumes = high ? [-0.48, -0.32, -0.16, 0.16, 0.32, 0.48] : [-0.36, 0.36];
  for (const z of plumes) {
    const absZ = Math.abs(z);
    curvedTube(
      kit,
      "aphlaston",
      [
        V(-17.64, 3.66, 0),
        V(-18.12, 4.7, z * 0.58),
        V(-18.18, 5.5 - absZ * 0.36, z),
        V(-17.86 + absZ * 0.42, 6.0 - absZ * 0.65, z * 1.08)
      ],
      0.05,
      high,
      "oak"
    );
  }
  kit.beam("aphlaston-batten", [-18.16, 5.26, -0.5], [-18.16, 5.26, 0.5], 0.06, "oak");
  if (high) {
    kit.beam("aphlaston-batten", [-18.08, 4.78, -0.34], [-18.08, 4.78, 0.34], 0.05, "oak");
    kit.sphere("aphlaston-finial", [-17.16, 6.24, 0], [0.11, 0.11, 0.11], "brass");
  }

  // Epotides: heavy bow catheads shielding the forward ends of the outriggers.
  kit.box("epotis-beam", [14.06, 1.7, 0], [0.28, 0.24, 2 * OUTRIGGER_Z - 0.1], "oak");
  for (const side of [-1, 1]) {
    kit.box("epotis-cap", [14.06, 1.7, side * OUTRIGGER_Z], [0.38, 0.38, 0.16], "ruby");
    if (high) {
      kit.sphere("epotis-boss", [14.26, 1.7, side * OUTRIGGER_Z], [0.07, 0.08, 0.08], "brass");
    }
  }

  // Marble ophthalmoi (apotropaic eyes) fitted flush onto the red-ochre bow cheeks.
  for (const side of [-1, 1]) {
    const x = 14.5;
    const y = 1.02;
    const normal = sideNormal(x, y, side);
    const tangent = sidePoint(x + 0.05, y, side)
      .sub(sidePoint(x - 0.05, y, side))
      .normalize();
    const up = normal.clone().cross(tangent).normalize();
    if (up.y < 0) up.negate();
    const right = up.clone().cross(normal).normalize();
    const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    const origin = sidePoint(x, y, side).addScaledVector(normal, 0.016);

    const sclera = kit.sphere("ophthalmos", [0, 0, 0], [0.32, 0.18, 0.036], "white");
    sclera.position.copy(origin);
    sclera.quaternion.copy(basis);

    if (high) {
      const iris = kit.sphere("ophthalmos-iris", [0, 0, 0], [0.13, 0.13, 0.028], "azure");
      iris.position.copy(origin).addScaledVector(normal, 0.016).addScaledVector(right, 0.035);
      iris.quaternion.copy(basis);
    }

    const pupil = kit.sphere("ophthalmos-pupil", [0, 0, 0], [0.08, 0.08, 0.026], "dark");
    pupil.position
      .copy(origin)
      .addScaledVector(normal, high ? 0.026 : 0.02)
      .addScaledVector(right, 0.04);
    pupil.quaternion.copy(basis);
  }

  return kit.finish();
}

// ---------------------------------------------------------------- interior

function buildInterior(high: boolean) {
  const kit = kitOf("gemini-trireme-interior");
  const floorY = -0.44;

  deckSlab(kit, "hold-floor", -13.4, 13.6, floorY, 0.05, x => innerHalf(x, floorY), high ? 30 : 10, "oak");
  if (high) {
    deckSlab(kit, "central-gangway", -13.0, 13.0, floorY + 0.04, 0.03, () => 0.42, 16, "wood");
  }
  kit.box("mast-step", [0.85, floorY + 0.13, 0], [0.76, 0.22, 0.44], "oak");

  // Internal transverse hull ribs visible through the open sides on high quality.
  if (high) {
    for (let x = -12.6; x <= 12.6; x += 1.2) {
      for (const side of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 5; k++) {
          const y = lerp(floorY, sheerY(x) - 0.05, k / 5);
          pts.push(V(x, y, side * innerHalf(x, y, 0.055)));
        }
        curvedTube(kit, "hull-rib", pts, 0.042, false, "oak");
      }
    }
  }

  // Zyga: transverse beams carrying the zygite rowers.
  for (const x of ZYGITE_X) {
    const zgonX = x + 0.44;
    const half = innerHalf(zgonX, 1.0, 0.02);
    kit.box("zygon", [zgonX, 1.0, 0], [0.12, 0.12, 2 * half], "oak");
    if (high) {
      for (const side of [-1, 1]) {
        kit.box("zygite-seat", [zgonX, 1.08, side * Math.min(1.22, half - 0.2)], [0.3, 0.05, 0.42], "wood");
      }
    }
  }

  if (high) {
    // Thalamite benches with stanchions and foot stretchers.
    for (const x of THALAMITE_X) {
      const seatX = x + 0.44;
      for (const side of [-1, 1]) {
        kit.box("thalamite-seat", [seatX, 0.13, side * 0.84], [0.32, 0.06, 0.42], "wood");
        kit.beam("thalamite-seat-post", [seatX, floorY, side * 0.84], [seatX, 0.1, side * 0.84], 0.065, "oak");
      }
    }
    // Thranite stringers and elevated benches.
    for (const side of [-1, 1]) {
      kit.box("thranite-stringer", [0.2, OUTRIGGER_Y, side * 1.98], [27.4, 0.1, 0.1], "oak");
      for (const x of THRANITE_X) {
        kit.box("thranite-seat", [x + 0.44, OUTRIGGER_Y + 0.085, side * 1.98], [0.32, 0.065, 0.4], "wood");
      }
    }
  }

  // Hypozoma: twin pre-tensioned longitudinal cables running from bow bitt to stern windlass.
  for (const z of [-0.21, 0.21]) {
    const aft = V(-14.05, 1.2, z);
    const fore = V(15.1, 1.2, z);
    if (high) {
      curvedTube(kit, "hypozoma", [aft, V(0, 1.18, z), fore], 0.048, true, "straw");
    } else {
      kit.lines("hypozoma", [[P(aft), P(fore)]], STANDING_ROPE);
    }
  }
  taperedSpar(kit, "hypozoma-windlass", V(-14.2, 1.32, -0.48), V(-14.2, 1.32, 0.48), 0.1, 0.1, high ? 10 : 6, "oak");
  if (high) {
    for (const z of [-0.32, 0.32]) {
      kit.beam("windlass-bar", [-14.2, 0.86, z], [-14.2, 1.78, z], 0.05, "wood", true);
    }
    kit.box("hypozoma-bitt", [15.1, 1.28, 0], [0.24, 0.34, 0.62], "oak");
  }

  return kit.finish();
}

// ---------------------------------------------------------------- decks

function buildDecks(high: boolean) {
  const kit = kitOf("gemini-trireme-decks");
  deckSlab(kit, "katastroma", -13.8, 12.95, DECK_Y + 0.06, 0.06, deckHalfAt, high ? 32 : 10, "wood");
  deckSlab(kit, "bow-deck", 12.95, 15.95, 1.94, 0.06, x => Math.min(1.28, innerHalf(x, sheerY(x), 0.04)), high ? 8 : 3);
  deckSlab(kit, "stern-deck", -16.15, -13.8, DECK_Y + 0.1, 0.06, deckHalfAt, high ? 6 : 2, "wood");
  kit.box("bow-breastwork", [12.95, (1.94 + DECK_Y) / 2, 0], [0.09, DECK_Y - 1.94, 2 * deckHalfAt(12.95)], "oak");

  if (high) {
    // Deck edge coamings and plank seam lines.
    const seams: [Position, Position][] = [];
    for (const z of [-0.9, -0.45, 0, 0.45, 0.9]) {
      seams.push([
        [-13.7, DECK_Y + 0.064, z],
        [12.85, DECK_Y + 0.064, z]
      ]);
    }
    kit.lines("deck-seams", seams, 0x8a6d43);

    for (const side of [-1, 1]) {
      const coaming: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const x = lerp(-13.8, 12.95, k / 24);
        coaming.push(V(x, DECK_Y + 0.095, side * (deckHalfAt(x) - 0.03)));
      }
      curvedTube(kit, "deck-coaming", coaming, 0.036, true, "oak");
    }

    // Companionway ladders descending from the katastroma fore and aft.
    for (const [xTop, xBot, yBot] of [
      [12.95, 13.45, 1.94],
      [-13.55, -13.05, 1.25]
    ] as const) {
      for (const z of [-0.22, 0.22]) {
        kit.beam("ladder-rail", [xTop, DECK_Y + 0.05, z], [xBot, yBot, z], 0.05, "oak");
      }
      for (let r = 1; r <= 4; r++) {
        const t = r / 5;
        kit.beam(
          "ladder-rung",
          [lerp(xTop, xBot, t), lerp(DECK_Y + 0.05, yBot, t), -0.22],
          [lerp(xTop, xBot, t), lerp(DECK_Y + 0.05, yBot, t), 0.22],
          0.035,
          "wood"
        );
      }
    }
  }

  // Stanchions carrying the fighting deck above the open rowing gallery.
  for (let i = 0; i < THRANITE_X.length; i += high ? 2 : 4) {
    const x = THRANITE_X[i] - 0.14;
    if (x < -13.6 || x > 12.8) continue;
    for (const side of [-1, 1]) {
      const foot = sidePoint(x, sheerY(x), side);
      kit.beam(
        "stanchion",
        [x, sheerY(x), foot.z - side * 0.06],
        [x, DECK_Y, side * (deckHalfAt(x) - 0.05)],
        0.085,
        "oak"
      );
    }
    if (high) {
      kit.box("deck-beam", [x, DECK_Y - 0.03, 0], [0.09, 0.08, 2 * (deckHalfAt(x) - 0.04)], "oak");
    }
  }

  kit.ring("mast-partner", [0.85, DECK_Y + 0.08, 0], 0.23, 0.055, "oak");
  kit.box("fore-mast-tabernacle", [10.75, DECK_Y + 0.16, 0], [0.44, 0.22, 0.36], "oak");
  return kit.finish();
}

// ---------------------------------------------------------------- outrigger

function buildOutrigger(high: boolean) {
  const kit = kitOf("gemini-trireme-outrigger");
  const x0 = THRANITE_X[0] - 0.5;
  const x1 = 13.94;

  for (const side of [-1, 1]) {
    kit.box("parexeiresia", [(x0 + x1) / 2, OUTRIGGER_Y, side * OUTRIGGER_Z], [x1 - x0, 0.16, 0.14], "oak");
    if (high) {
      // Light side-rail along the top outer edge of the outrigger box.
      kit.box(
        "outrigger-rail",
        [(x0 + x1) / 2, OUTRIGGER_Y + 0.26, side * (OUTRIGGER_Z + 0.03)],
        [x1 - x0, 0.05, 0.05],
        "wood"
      );
    }

    for (let i = 0; i < THRANITE_X.length; i += high ? 2 : 4) {
      const x = THRANITE_X[i] + 0.4;
      if (x > x1 - 0.1) continue;
      const gunwale = sidePoint(x, sheerY(x), side);
      const bracketY = Math.max(OUTRIGGER_Y - 0.08, sheerY(x) + 0.1);
      kit.beam(
        "outrigger-bracket",
        [x, bracketY, gunwale.z - side * 0.05],
        [x, OUTRIGGER_Y - 0.08, side * (OUTRIGGER_Z - 0.05)],
        0.1,
        "oak"
      );
      const braceY = Math.min(0.76, sheerY(x) - 0.42);
      const hullFoot = sidePoint(x, braceY, side);
      kit.beam("outrigger-brace", [x, OUTRIGGER_Y - 0.12, side * (OUTRIGGER_Z - 0.06)], P(hullFoot), 0.08, "oak");
    }

    for (const x of THRANITE_X) {
      kit.cylinder(
        "thranite-thole",
        [x + 0.07, OUTRIGGER_Y + 0.19, side * OUTRIGGER_Z],
        0.03,
        0.22,
        "oak",
        0.025,
        high ? 8 : 5
      );
    }
    for (const x of ZYGITE_X) {
      const pivot = geminiTriremePivot("zygite", x, side);
      kit.cylinder("zygite-thole", [x + 0.07, pivot.y + 0.08, pivot.z], 0.025, 0.2, "oak", 0.02, high ? 8 : 5);
    }
  }
  return kit.finish();
}

// ---------------------------------------------------------------- fittings

function buildFittings(high: boolean) {
  const kit = kitOf("gemini-trireme-fittings");

  // Twin quarter rudders (pedalia) slung from a stern cross-beam with tillers (oiakes).
  kit.box("rudder-beam", [-14.55, 2.3, 0], [0.24, 0.22, 4.18], "oak");
  for (const side of [-1, 1]) {
    const head = V(-14.35, 2.94, side * 1.94);
    const tip = V(-15.98, -0.82, side * 1.74);
    const dir = tip.clone().sub(head).normalize();
    taperedSpar(kit, "pedalion", head, tip.clone().addScaledVector(dir, -0.62), 0.078, 0.058, high ? 10 : 6, "oak");
    const blade = orientedBox(
      kit,
      "pedalion-blade",
      tip.clone().addScaledVector(dir, -0.62),
      dir,
      [0.54, 1.28, 0.058],
      "oak"
    );
    blade.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2 - 0.06));
    kit.beam("oiax", P(head.clone().add(V(0, -0.07, 0))), [-13.9, 2.82, side * 1.12], 0.06, "wood", true);
    kit.box("rudder-strap", [-14.5, 2.3, side * 1.94], [0.3, 0.3, 0.22], "leather");
  }

  // Helmsman bench and stern deck shelter frame.
  kit.box("helmsman-bench", [-15.15, DECK_Y + 0.28, 0], [0.42, 0.28, 1.0], "wood");
  if (high) {
    for (const side of [-1, 1]) {
      const z = side * 0.92;
      kit.beam("stern-rail-post", [-14.1, DECK_Y + 0.1, z], [-14.1, DECK_Y + 0.85, z], 0.05, "oak");
      kit.beam("stern-rail-post", [-15.65, DECK_Y + 0.1, z * 0.72], [-15.65, DECK_Y + 0.85, z * 0.72], 0.05, "oak");
      kit.beam("stern-rail", [-14.1, DECK_Y + 0.85, z], [-15.65, DECK_Y + 0.85, z * 0.72], 0.045, "wood");
    }
  }

  // Stylis staff with crossbar and a plain crimson cloth streamer.
  kit.beam("stylis", [-15.72, DECK_Y + 0.1, 0], [-15.72, 4.45, 0], 0.055, "wood", true);
  kit.beam("stylis-bar", [-15.72, 4.18, -0.34], [-15.72, 4.18, 0.34], 0.042, "wood", true);
  const pennant = new QuadMesh();
  const segs = high ? 6 : 3;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const wave0 = Math.sin(t0 * Math.PI * 1.6) * 0.06;
    const wave1 = Math.sin(t1 * Math.PI * 1.6) * 0.06;
    const droop0 = t0 * t0 * 0.12;
    const droop1 = t1 * t1 * 0.12;
    const h0 = lerp(0.14, 0.03, t0);
    const h1 = lerp(0.14, 0.03, t1);
    const x0 = -15.74 - t0 * 1.1;
    const x1 = -15.74 - t1 * 1.1;
    pennant.quad(
      V(x0, 4.35 + h0 - droop0, wave0),
      V(x0, 4.35 - h0 - droop0, wave0),
      V(x1, 4.35 - h1 - droop1, wave1),
      V(x1, 4.35 + h1 - droop1, wave1)
    );
  }
  pennant.commit(kit, "pennant", "cloth");

  // Wooden anchors with stone stocks and mooring gear on the bow deck.
  for (const side of [-1, 1]) {
    const z = side * 0.46;
    kit.beam("anchor-shank", [13.95, 1.99, z], [15.25, 1.99, z], 0.075, "oak");
    for (const arm of [-1, 1]) {
      kit.beam("anchor-arm", [15.25, 1.99, z], [15.62, 1.99, z + arm * 0.31], 0.068, "oak");
    }
    kit.box("anchor-stock", [14.12, 2.03, z], [0.18, 0.16, 0.6], "stone");
    if (high) {
      kit.cylinder("bollard", [13.45, 2.09, side * 0.85], 0.075, 0.3, "oak", 0.075, 8);
      addRopeCoil(kit, "anchor-cable-coil", [14.65, 1.94, side * 0.92], 0.22);
    }
  }

  return kit.finish();
}

// ---------------------------------------------------------------- spars and rigging

const MAIN_MAST = { x: 0.85, heel: -0.44, head: 11.95 } as const;
const FORE_RAKE = THREE.MathUtils.degToRad(18);
const FORE_MAST = { heel: V(10.75, DECK_Y + 0.08, 0), length: 5.25 } as const;

const foreMastHead = () =>
  FORE_MAST.heel.clone().add(V(Math.sin(FORE_RAKE), Math.cos(FORE_RAKE), 0).multiplyScalar(FORE_MAST.length));

const foreMastAtY = (y: number) => V(FORE_MAST.heel.x + (y - FORE_MAST.heel.y) * Math.tan(FORE_RAKE), y, 0);

export interface GeminiTriremeSail {
  id: "main-sail" | "fore-sail";
  x: number;
  yardY: number;
  half: number;
  footY: number;
  belly: number;
  bundle: number;
}

export const GEMINI_TRIREME_SAILS: readonly GeminiTriremeSail[] = [
  { id: "main-sail", x: 1.1, yardY: 10.95, half: 5.0, footY: 3.15, belly: 0.78, bundle: 0.24 },
  { id: "fore-sail", x: 12.4, yardY: 6.95, half: 2.6, footY: 3.15, belly: 0.42, bundle: 0.15 }
];

const YARD_OVERHANG = 0.22;
const STRUCK = { y: DECK_Y + 0.38, from: -10.8, to: 2.1, yardZ: 0.56, crutches: [-8.6, -3.3, 1.25] } as const;

function buildCompositeYard(kit: SailingKit, sail: GeminiTriremeSail, high: boolean) {
  const half = sail.half + YARD_OVERHANG;
  const rMid = sail.id === "main-sail" ? 0.115 : 0.075;
  for (const side of [-1, 1]) {
    taperedSpar(kit, "yard", V(sail.x, sail.yardY, 0), V(sail.x, sail.yardY, side * half), rMid, 0.045, high ? 10 : 6);
  }
  if (high) {
    // Central fish-lashings binding the two overlapping spars of an ancient yard.
    for (const z of [-0.55, 0, 0.55]) {
      const band = kit.add("yard-lashing", new THREE.TorusGeometry(rMid + 0.012, 0.015, 5, 10), "leather");
      band.position.set(sail.x, sail.yardY, z);
    }
  }
}

function buildSpars(high: boolean, struck: boolean) {
  const kit = kitOf("gemini-trireme-spars");
  const seg = high ? 12 : 6;
  const [main, fore] = GEMINI_TRIREME_SAILS;

  if (struck) {
    taperedSpar(kit, "mast-main", V(STRUCK.from, STRUCK.y, 0), V(STRUCK.to, STRUCK.y, 0), 0.175, 0.1, seg);
    const half = main.half + YARD_OVERHANG;
    taperedSpar(
      kit,
      "yard",
      V(-4.3 - half, STRUCK.y - 0.04, STRUCK.yardZ),
      V(-4.3 + half, STRUCK.y - 0.04, STRUCK.yardZ),
      0.072,
      0.072,
      high ? 10 : 6
    );
    for (const x of STRUCK.crutches) {
      for (const z of [0, STRUCK.yardZ]) {
        kit.beam("crutch-post", [x, DECK_Y + 0.06, z], [x, STRUCK.y - 0.16, z], 0.08, "oak");
        kit.box("crutch-fork", [x, STRUCK.y - 0.14, z], [0.1, 0.06, 0.36], "oak");
      }
    }
  } else {
    taperedSpar(
      kit,
      "mast-main",
      V(MAIN_MAST.x, MAIN_MAST.heel, 0),
      V(MAIN_MAST.x, MAIN_MAST.head, 0),
      0.175,
      0.1,
      seg
    );
    if (high) {
      // Masthead calcet block housing the halyard sheaves.
      kit.box("mast-calcet", [MAIN_MAST.x, MAIN_MAST.head - 0.14, 0], [0.26, 0.3, 0.22], "oak");
    }
    kit.sphere("truck", [MAIN_MAST.x, MAIN_MAST.head + 0.08, 0], [0.12, 0.11, 0.12], "brass");
    buildCompositeYard(kit, main, high);
  }

  const fHead = foreMastHead();
  taperedSpar(kit, "mast-fore", FORE_MAST.heel, fHead, 0.11, 0.07, seg);
  kit.sphere("truck", [fHead.x, fHead.y + 0.05, 0], [0.09, 0.09, 0.09], "brass");
  buildCompositeYard(kit, fore, high);
  return kit.finish();
}

function buildRigging(high: boolean, struck: boolean) {
  const kit = kitOf("gemini-trireme-rigging");
  const standing: [Position, Position][] = [];
  const running: [Position, Position][] = [];
  const addLine = (list: [Position, Position][], a: THREE.Vector3, b: THREE.Vector3) => list.push([P(a), P(b)]);
  const [main, fore] = GEMINI_TRIREME_SAILS;
  const toggles: THREE.Vector3[] = [];

  if (!struck) {
    const top = V(MAIN_MAST.x, MAIN_MAST.head - 0.24, 0);
    // Forestay and twin backstays.
    addLine(standing, top, V(9.55, DECK_Y + 0.06, 0));
    for (const z of [-0.36, 0.36]) addLine(standing, top, V(-15.35, DECK_Y + 0.16, z));
    // Three shrouds per side leading to the outrigger.
    for (const side of [-1, 1]) {
      for (const x of [0.3, -0.6, -1.5]) {
        const foot = V(x, OUTRIGGER_Y + 0.08, side * (OUTRIGGER_Z - 0.04));
        addLine(standing, V(MAIN_MAST.x, MAIN_MAST.head - 1.25, side * 0.1), foot);
        toggles.push(foot);
      }
    }
    const mainHalf = main.half + YARD_OVERHANG - 0.05;
    for (const side of [-1, 1]) {
      const yardArm = V(main.x, main.yardY, side * mainHalf);
      addLine(running, V(MAIN_MAST.x, MAIN_MAST.head - 0.1, 0), yardArm);
      addLine(running, yardArm, V(-14.75, DECK_Y + 0.16, side * 1.28));
    }
    // Halyard and downhaul.
    addLine(running, V(MAIN_MAST.x, MAIN_MAST.head - 0.06, 0), V(main.x, main.yardY + 0.08, 0));
    addLine(running, V(MAIN_MAST.x, MAIN_MAST.head - 0.06, 0.05), V(MAIN_MAST.x - 0.55, DECK_Y + 0.06, 0.3));
  } else {
    for (const x of STRUCK.crutches) {
      for (const z of [0, STRUCK.yardZ]) {
        running.push([
          [x - 0.05, STRUCK.y + 0.18, z - 0.2],
          [x + 0.05, STRUCK.y - 0.12, z + 0.2]
        ]);
      }
    }
  }

  const fHead = foreMastHead();
  addLine(standing, fHead.clone().add(V(-0.05, -0.12, 0)), V(16.4, 3.35, 0));
  for (const side of [-1, 1]) {
    for (const x of [10.1, 9.4]) {
      const foot = V(x, DECK_Y + 0.06, side * (deckHalfAt(x) - 0.05));
      addLine(standing, foreMastAtY(fHead.y - 0.55).add(V(0, 0, side * 0.06)), foot);
      toggles.push(foot);
    }
  }
  const foreHalf = fore.half + YARD_OVERHANG - 0.05;
  for (const side of [-1, 1]) {
    const yardArm = V(fore.x, fore.yardY, side * foreHalf);
    addLine(running, fHead.clone().add(V(0, -0.05, 0)), yardArm);
    addLine(running, yardArm, V(7.55, DECK_Y + 0.06, side * 1.38));
  }
  addLine(running, fHead.clone().add(V(0, -0.03, 0)), V(fore.x, fore.yardY + 0.06, 0));

  kit.lines("standing-rigging", standing, STANDING_ROPE);
  kit.lines("running-rigging", running, RUNNING_ROPE);
  for (const foot of toggles) {
    if (high) kit.sphere("lanyard-toggle", P(foot), [0.052, 0.052, 0.052], "dark");
    else kit.box("lanyard-toggle", P(foot), [0.09, 0.09, 0.09], "dark");
  }
  return kit.finish();
}

// ---------------------------------------------------------------- sails

function sailSurfacePoint(sail: GeminiTriremeSail, t: number, u: number) {
  const across = Math.sin(Math.PI * u);
  const belly = sail.belly * (Math.sin(Math.PI * t) * across + 0.28 * t * across);
  // Slight inward roach along the foot for classical linen square sail geometry.
  const footLift = t * t * 0.14 * across;
  return V(sail.x + 0.05 + belly, lerp(sail.yardY - 0.06, sail.footY, t) + footLift, lerp(-sail.half, sail.half, u));
}

function buildSquareSail(sail: GeminiTriremeSail, state: GeminiTriremeState, high: boolean) {
  const kit = kitOf(`gemini-trireme-${sail.id}`);
  const mode = state.sails ?? "set";

  if (mode === "struck" && sail.id === "main-sail") {
    addSailBundle(
      kit,
      "furled-sail",
      [-4.3 - sail.half, STRUCK.y + 0.13, STRUCK.yardZ],
      [-4.3 + sail.half, STRUCK.y + 0.13, STRUCK.yardZ],
      sail.bundle * 0.9,
      high
    );
    return kit.finish();
  }

  if (mode !== "set") {
    addSailBundle(
      kit,
      "furled-sail",
      [sail.x + 0.06, sail.yardY - 0.2, -sail.half],
      [sail.x + 0.06, sail.yardY - 0.2, sail.half],
      sail.bundle,
      high
    );
    return kit.finish();
  }

  const rows = high ? 12 : 5;
  const cols = high ? 16 : 6;
  const cloth = new QuadMesh();
  cloth.grid(rows, cols, (i, j) => sailSurfacePoint(sail, i / rows, j / cols));
  cloth.commit(kit, "square-sail", "white");

  // Horizontal linen panel seams and vertical brailing lines with leather rings.
  const seams: [Position, Position][] = [];
  const brails: [Position, Position][] = [];
  const foreFace = (t: number, u: number) => sailSurfacePoint(sail, t, u).add(V(0.026, 0, 0));
  const panelRows = high ? 6 : 3;
  const brailCount = sail.id === "main-sail" ? (high ? 9 : 5) : high ? 5 : 3;

  for (let r = 1; r < panelRows; r++) {
    const t = r / panelRows;
    for (let c = 0; c < cols; c++) {
      seams.push([P(foreFace(t, c / cols)), P(foreFace(t, (c + 1) / cols))]);
    }
  }
  for (let b = 1; b <= brailCount; b++) {
    const u = b / (brailCount + 1);
    for (let r = 0; r < rows; r++) {
      brails.push([P(foreFace(r / rows, u)), P(foreFace((r + 1) / rows, u))]);
    }
    const lead =
      sail.id === "main-sail"
        ? V(MAIN_MAST.x - 0.65, DECK_Y + 0.06, (u - 0.5) * 1.55)
        : V(9.75, DECK_Y + 0.06, (u - 0.5) * 1.15);
    brails.push([P(foreFace(0, u).add(V(0, 0.12, 0))), P(lead)]);
    if (high) {
      for (let r = 1; r < panelRows; r++) {
        const ring = kit.add("brail-ring", new THREE.TorusGeometry(0.04, 0.01, 4, 7), "leather");
        ring.position.copy(foreFace(r / panelRows, u));
        ring.rotation.y = Math.PI / 2;
      }
    }
  }

  kit.lines("sail-seam", seams, SEAM_THREAD);
  kit.lines("brail", brails, RUNNING_ROPE);

  const sheets: [Position, Position][] = [0, 1].map(u => {
    const clew = sailSurfacePoint(sail, 1, u);
    return [P(clew), [sail.x - 3.25, DECK_Y + 0.06, Math.sign(clew.z) * (sail.id === "main-sail" ? 1.38 : 1.08)]];
  });
  kit.lines("sheet", sheets, RUNNING_ROPE);
  return kit.finish();
}

// ---------------------------------------------------------------- oars

function buildOars(high: boolean, stowed: boolean) {
  const kit = kitOf("gemini-trireme-oars");
  const seg = high ? 8 : 5;

  for (const bank of GEMINI_TRIREME_BANKS) {
    for (const side of [-1, 1]) {
      for (const x of geminiTriremeRooms(bank)) {
        const pivot = geminiTriremePivot(bank.id, x, side);
        if (stowed) {
          // Run in and laid aft along the side; blades stay clear of the water and close to the beam.
          const lift = bank.id === "thranite" ? 0.11 : bank.id === "zygite" ? 0.03 : 0.02;
          const tuck = bank.id === "thalamite" ? 0.0 : 0.12;
          const hinge = pivot.clone().add(V(0, lift, -side * tuck));
          const aftDir = V(-0.94, 0, -0.34 * side).normalize();
          taperedSpar(
            kit,
            "oar-stowed-shaft",
            hinge.clone().addScaledVector(aftDir, 3.15),
            hinge.clone().addScaledVector(aftDir, -0.28),
            0.044,
            0.034,
            seg,
            "wood"
          );
          const blade = orientedBox(
            kit,
            "oar-stowed",
            hinge.clone().addScaledVector(aftDir, -0.28 - OAR_BLADE / 2),
            aftDir,
            [0.15, OAR_BLADE, 0.03],
            "wood"
          );
          blade.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2));
          continue;
        }

        // Deployed mid-stroke perpendicular to the hull, tips dipping evenly at the waterline.
        const drop = pivot.y + 0.06;
        const reach = Math.sqrt(bank.outboard ** 2 - drop ** 2);
        const dir = V(0, -drop, side * reach).normalize();
        const handle = pivot.clone().addScaledVector(dir, -OAR_INBOARD);
        const bladeNeck = pivot.clone().addScaledVector(dir, bank.outboard - OAR_BLADE);
        taperedSpar(kit, `${bank.id}-shaft`, handle, bladeNeck, 0.045, 0.034, seg, "wood");
        orientedBox(
          kit,
          `oar-${bank.id}`,
          pivot.clone().addScaledVector(dir, bank.outboard - OAR_BLADE / 2),
          dir,
          [0.03, OAR_BLADE, 0.155],
          "wood"
        );
        if (high) {
          taperedSpar(
            kit,
            "oar-strap",
            pivot.clone().addScaledVector(dir, -0.05),
            pivot.clone().addScaledVector(dir, 0.05),
            0.056,
            0.056,
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

interface PartSpec {
  id: string;
  role: string;
  create: (state: GeminiTriremeState, high: boolean) => CityStructureMeshes;
}

const PARTS: readonly PartSpec[] = [
  {
    id: "hull",
    role: "Hull, three-finned ram, proembolion, eyes, epotides and aphlaston",
    create: (_, high) => buildHull(high)
  },
  {
    id: "interior",
    role: "Hold floor, hull ribs, zyga, rowing benches and hypozoma",
    create: (_, high) => buildInterior(high)
  },
  {
    id: "decks",
    role: "Fighting deck, bow and stern decks, stanchions and ladders",
    create: (_, high) => buildDecks(high)
  },
  {
    id: "outrigger",
    role: "Outrigger (parexeiresia), brackets, braces and tholes",
    create: (_, high) => buildOutrigger(high)
  },
  {
    id: "fittings",
    role: "Quarter rudders, helm, stylis, streamer and anchors",
    create: (_, high) => buildFittings(high)
  },
  {
    id: "spars",
    role: "Masts, calcet and composite yards",
    create: (state, high) => buildSpars(high, state.sails === "struck")
  },
  {
    id: "rigging",
    role: "Standing and running rigging",
    create: (state, high) => buildRigging(high, state.sails === "struck")
  },
  ...GEMINI_TRIREME_SAILS.map(sail => ({
    id: sail.id,
    role: sail.id === "main-sail" ? "Main square sail" : "Boat sail (akateion)",
    create: (state: GeminiTriremeState, high: boolean) => buildSquareSail(sail, state, high)
  })),
  { id: "oars", role: "Three oar banks (170 oars)", create: (state, high) => buildOars(high, state.oars === "stowed") }
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
