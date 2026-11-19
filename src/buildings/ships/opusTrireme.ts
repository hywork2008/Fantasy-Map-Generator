import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

export const OPUS_TRIREME_QUALITIES = ["high", "low"] as const;
export type OpusTriremeQuality = (typeof OPUS_TRIREME_QUALITIES)[number];

/**
 * Olympias, the 1987 full-size reconstruction of an Athenian trireme (Coates and Morrison), in meters. Bow is +X,
 * starboard +Z and the waterline Y = 0. The hull is 36.9 m from the ram tip to the aphlaston, 5.45 m over the
 * outriggers and draws 1.1 m. 170 oars on one room spacing of 0.888 m (two Attic cubits): 31 thranites a side on
 * the outrigger, 27 zygites on the gunwale and 27 thalamites through leather-sleeved ports just above the water.
 * Brailed square main and boat sails; the main mast can be struck and laid on deck for battle.
 */
export const OPUS_TRIREME = {
  author: "Claude Opus 5.5" as Author,
  name: "Trireme",
  length: 36.9,
  beam: 5.45,
  hullBeam: 3.9,
  height: 12.1,
  draft: 1.1,
  room: 0.888,
  oars: 170,
  thranites: 62,
  zygites: 54,
  thalamites: 54,
  source: "https://en.wikipedia.org/wiki/Olympias_(trireme)",
  note: "Olympias, the 1987 Hellenic Navy reconstruction of an Athenian trireme: three-finned bronze ram and proembolion, red-ochre cheeks and marble eyes, epotides ahead of the outriggers, three oar banks on one 0.888 m room, open sides under a narrow fighting deck, a hypozoma truss tensioned at the stern, two quarter rudders and a fanned aphlaston. Brailed linen main and boat sails; for battle the main mast is struck onto deck crutches. Lines are illustrative; rowers are not modelled."
} as const;

export interface OpusTriremeState {
  /** `struck` lowers the main mast and yard onto deck crutches (battle trim); the boat sail stays brailed up. */
  sails?: "set" | "furled" | "struck";
  oars?: "out" | "stowed";
}

const COLORS: Partial<Record<Surface, number>> = {
  dark: 0x171412,
  oak: 0x6a4a31,
  wood: 0xb99467,
  thatch: 0x9c7d52,
  ruby: 0x9b3a24,
  white: 0xe6dfcd,
  brass: 0xa47a36,
  leather: 0x4b3424,
  straw: 0x8b734f,
  stone: 0x8d877c
};
const ROPE = 0x3a3027;
const RUNNING = 0x7d6a50;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
/** Smoothstep that also runs downhill when `from > to`. */
function step(from: number, to: number, x: number) {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): Position => [v.x, v.y, v.z];
const ROOM = OPUS_TRIREME.room;

// ---------------------------------------------------------------- hull lines

const HALF_BEAM = OPUS_TRIREME.hullBeam / 2;
const KEEL = -1.02;
const DECK = 2.55;
const DECK_HALF = 1.45;
const OUTRIGGER_Z = 2.64;
const OUTRIGGER_Y = 1.6;
const THALAMITE_Y = 0.42;

const keelY = (x: number) => KEEL + 0.72 * step(9, 16.2, x) + 0.55 * step(-9, -15.6, x);
const sheerY = (x: number) => 1.25 + 0.55 * step(11, 16.6, x) + 1.2 * step(-10.5, -16.8, x);
const foreX = (s: number) => 16.2 + 0.35 * s;
const aftX = (s: number) => -15.6 - 1.2 * s ** 1.5;
/** Wineglass section: a fine floor, full waterline and a slight tumblehome to the gunwale. */
function section(s: number) {
  const t = Math.min(s / 0.75, 1);
  return 0.05 + 0.95 * (1 - (1 - t) ** 2.4) - 0.04 * Math.max(0, (s - 0.75) / 0.25);
}
function halfBreadth(x: number, s: number) {
  const fore = clamp((x - 9) / (foreX(s) - 9), 0, 1);
  const aft = clamp((-8 - x) / (-8 - aftX(s)), 0, 1);
  return Math.max(0.04, HALF_BEAM * (1 - fore ** 2) * (1 - aft ** 1.8) * section(s));
}
/** Hull surface at fraction `u` from stern to stem and `s` from keel to gunwale. */
function hullAt(u: number, s: number, side: number) {
  const x = lerp(aftX(s), foreX(s), u);
  return V(x, lerp(keelY(x), sheerY(x), s), side * halfBreadth(x, s));
}
const sOf = (x: number, y: number) => clamp((y - keelY(x)) / (sheerY(x) - keelY(x)), 0, 1);
/** The side at a station and height. */
function sideAt(x: number, y: number, side = 1) {
  return V(x, y, side * halfBreadth(x, sOf(x, y)));
}
function sideNormal(x: number, y: number, side: number) {
  const along = sideAt(x + 0.05, y, side).sub(sideAt(x - 0.05, y, side));
  const up = sideAt(x, y + 0.05, side).sub(sideAt(x, y - 0.05, side));
  const normal = along.cross(up).normalize();
  return normal.z * side < 0 ? normal.negate() : normal;
}
/** Points along a constant height, between the posts. */
function waterline(y: number, n: number, side: number) {
  const points: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const u = lerp(0.006, 0.994, k / n);
    let s = 0.5;
    for (let i = 0; i < 6; i++) s = sOf(lerp(aftX(s), foreX(s), u), y);
    points.push(hullAt(u, s, side));
  }
  return points;
}

// ---------------------------------------------------------------- oar banks

export interface OpusTriremeBank {
  id: "thranite" | "zygite" | "thalamite";
  perSide: number;
  /** X of the middle room; the zygite and thalamite rooms trail the thranite ones by a third of a room each. */
  offset: number;
  /** Outboard length from the pivot; 1.2 m stays inboard. */
  outboard: number;
}
export const OPUS_TRIREME_BANKS: readonly OpusTriremeBank[] = [
  { id: "thranite", perSide: 31, offset: 0.2, outboard: 3.0 },
  { id: "zygite", perSide: 27, offset: -0.1, outboard: 2.95 },
  { id: "thalamite", perSide: 27, offset: -0.4, outboard: 2.85 }
];
const INBOARD = 1.2;
const BLADE = 0.7;
export function opusTriremeRooms(bank: OpusTriremeBank) {
  return Array.from({ length: bank.perSide }, (_, i) => bank.offset + (i - (bank.perSide - 1) / 2) * ROOM);
}
const THRANITES = opusTriremeRooms(OPUS_TRIREME_BANKS[0]);
const ZYGITES = opusTriremeRooms(OPUS_TRIREME_BANKS[1]);
const THALAMITES = opusTriremeRooms(OPUS_TRIREME_BANKS[2]);

/** Where an oar bears: a thole on the outrigger, a thole on the gunwale, or a port in the side. */
export function opusTriremePivot(bank: OpusTriremeBank["id"], x: number, side: number) {
  if (bank === "thranite") return V(x, OUTRIGGER_Y + 0.1, side * OUTRIGGER_Z);
  if (bank === "zygite") {
    const gunwale = sideAt(x, sheerY(x), side);
    return V(x, sheerY(x) + 0.08, side * (Math.abs(gunwale.z) + 0.04));
  }
  return sideAt(x, THALAMITE_Y, side);
}

// ---------------------------------------------------------------- mesh helpers

type Kit = SailingKit;
const kitOf = (name: string) => new SailingKit(name, COLORS);

class MeshBuilder {
  readonly points: number[] = [];
  readonly indices: number[] = [];
  vertex(v: THREE.Vector3) {
    this.points.push(v.x, v.y, v.z);
    return this.points.length / 3 - 1;
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
    const i = this.vertex(a),
      j = this.vertex(b),
      k = this.vertex(c),
      l = this.vertex(d);
    this.indices.push(i, j, k, i, k, l);
  }
  grid(rows: number, cols: number, at: (i: number, j: number) => THREE.Vector3) {
    const base = this.points.length / 3;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) this.vertex(at(i, j));
    const w = cols + 1;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = base + i * w + j;
        this.indices.push(a, a + 1, a + w + 1, a, a + w + 1, a + w);
      }
  }
  emit(kit: Kit, name: string, surface: Surface) {
    if (!this.indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.points, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    kit.add(name, geometry, surface);
  }
}
/** Tapered round spar from `a` (radius r0) to `b` (radius r1). */
function spar(
  kit: Kit,
  name: string,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r0: number,
  r1: number,
  segments: number,
  surface: Surface = "thatch"
) {
  const mesh = kit.add(name, new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), segments), surface);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}
/** Box whose local Y runs along `dir`, centred on `centre`. */
function along(kit: Kit, name: string, centre: THREE.Vector3, dir: THREE.Vector3, size: Position, surface: Surface) {
  const mesh = kit.box(name, [0, 0, 0], size, surface);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  mesh.position.copy(centre);
  return mesh;
}
/** Smooth timber or rope through the given points. */
function bent(kit: Kit, name: string, points: THREE.Vector3[], radius: number, high: boolean, surface: Surface) {
  const curve = new THREE.CatmullRomCurve3(points);
  return kit.add(
    name,
    new THREE.TubeGeometry(curve, Math.max(4, points.length * (high ? 4 : 2)), radius, high ? 8 : 4, false),
    surface
  );
}
interface Section {
  x: number;
  hw: number;
  y0: number;
  y1: number;
}
/** Closed loft through rectangular stations along X. */
function loft(kit: Kit, name: string, sections: readonly Section[], surface: Surface) {
  const m = new MeshBuilder();
  const ring = (s: Section) => [V(s.x, s.y0, -s.hw), V(s.x, s.y0, s.hw), V(s.x, s.y1, s.hw), V(s.x, s.y1, -s.hw)];
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = ring(sections[i]),
      b = ring(sections[i + 1]);
    for (let k = 0; k < 4; k++) m.quad(a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]);
  }
  const first = ring(sections[0]),
    last = ring(sections[sections.length - 1]);
  m.quad(first[0], first[3], first[2], first[1]);
  m.quad(last[0], last[1], last[2], last[3]);
  m.emit(kit, name, surface);
}
/** Plank slab between two stations with a half-width that follows the hull. */
function slab(
  kit: Kit,
  name: string,
  x0: number,
  x1: number,
  top: number,
  thick: number,
  half: (x: number) => number,
  steps: number,
  surface: Surface = "wood"
) {
  const m = new MeshBuilder();
  const bottom = top - thick;
  for (let i = 0; i < steps; i++) {
    const xa = lerp(x0, x1, i / steps),
      xb = lerp(x0, x1, (i + 1) / steps),
      ha = half(xa),
      hb = half(xb);
    m.quad(V(xa, top, -ha), V(xa, top, ha), V(xb, top, hb), V(xb, top, -hb));
    m.quad(V(xa, bottom, -ha), V(xb, bottom, -hb), V(xb, bottom, hb), V(xa, bottom, ha));
    m.quad(V(xa, bottom, ha), V(xb, bottom, hb), V(xb, top, hb), V(xa, top, ha));
    m.quad(V(xa, bottom, -ha), V(xa, top, -ha), V(xb, top, -hb), V(xb, bottom, -hb));
  }
  for (const [x, sign] of [
    [x0, -1],
    [x1, 1]
  ] as const) {
    const h = half(x);
    const a = V(x, bottom, -h),
      b = V(x, bottom, h),
      c = V(x, top, h),
      d = V(x, top, -h);
    if (sign > 0) m.quad(a, b, c, d);
    else m.quad(a, d, c, b);
  }
  m.emit(kit, name, surface);
}
/** Inside half-breadth at a height, kept clear of the planking. */
const inside = (x: number, y: number, gap = 0.04) => Math.max(0.05, halfBreadth(x, sOf(x, y)) - gap);

// ---------------------------------------------------------------- hull

function hull(high: boolean) {
  const kit = kitOf("opus-trireme-hull");
  const U = high ? 84 : 30;
  const S = high ? 14 : 6;
  const paint = new Map<Surface, MeshBuilder>();
  const builder = (surface: Surface) => {
    let entry = paint.get(surface);
    if (!entry) {
      entry = new MeshBuilder();
      paint.set(surface, entry);
    }
    return entry;
  };
  const paintOf = (c: THREE.Vector3): Surface =>
    c.y < 0.02 ? "dark" : c.x > 12.4 && c.y > 0.22 && c.y < 1.6 ? "ruby" : "oak";
  for (const side of [-1, 1])
    for (let i = 0; i < U; i++)
      for (let j = 0; j < S; j++) {
        const a = hullAt(i / U, j / S, side),
          b = hullAt((i + 1) / U, j / S, side),
          c = hullAt((i + 1) / U, (j + 1) / S, side),
          d = hullAt(i / U, (j + 1) / S, side);
        const centre = a.clone().add(c).multiplyScalar(0.5);
        if (side > 0) builder(paintOf(centre)).quad(a, b, c, d);
        else builder(paintOf(centre)).quad(a, d, c, b);
      }
  for (let j = 0; j < S; j++)
    for (const u of [0, 1]) {
      const a = hullAt(u, j / S, -1),
        b = hullAt(u, j / S, 1),
        c = hullAt(u, (j + 1) / S, 1),
        d = hullAt(u, (j + 1) / S, -1);
      builder(a.y < 0.02 ? "dark" : "oak").quad(a, b, c, d);
    }
  for (let i = 0; i < U; i++)
    builder("dark").quad(
      hullAt(i / U, 0, -1),
      hullAt((i + 1) / U, 0, -1),
      hullAt((i + 1) / U, 0, 1),
      hullAt(i / U, 0, 1)
    );
  for (const [surface, entry] of paint)
    entry.emit(kit, `hull-${surface === "dark" ? "pitch" : surface === "ruby" ? "cheek" : "planking"}`, surface);

  // False keel, wales and the gunwale cap.
  const keel: THREE.Vector3[] = [];
  for (let k = 0; k <= 16; k++) {
    const x = lerp(-15.2, 15.9, k / 16);
    keel.push(V(x, keelY(x) + 0.015, 0));
  }
  bent(kit, "keel", keel, 0.08, high, "dark");
  const n = high ? 26 : 12;
  for (const side of [-1, 1]) {
    bent(kit, "wale-waterline", waterline(0.06, n, side), 0.065, high, "dark");
    bent(kit, "wale-thalamite", waterline(0.72, n, side), 0.055, high, "dark");
    const cap: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) cap.push(hullAt(lerp(0.004, 0.996, k / n), 1, side));
    bent(kit, "gunwale", cap, 0.06, high, "wood");
  }

  // Thalamite ports, each closed round its oar by a leather bag (askoma).
  for (const x of THALAMITES)
    for (const side of [-1, 1]) {
      const p = sideAt(x, THALAMITE_Y, side);
      const normal = sideNormal(x, THALAMITE_Y, side);
      if (high) {
        spar(
          kit,
          "thalamite-port",
          p.clone().addScaledVector(normal, -0.01),
          p.clone().addScaledVector(normal, 0.02),
          0.085,
          0.085,
          10,
          "dark"
        );
        spar(
          kit,
          "askoma",
          p.clone().addScaledVector(normal, 0.01),
          p.clone().addScaledVector(normal, 0.13),
          0.1,
          0.055,
          8,
          "leather"
        );
      } else
        spar(
          kit,
          "thalamite-port",
          p.clone().addScaledVector(normal, -0.01),
          p.clone().addScaledVector(normal, 0.03),
          0.09,
          0.07,
          5,
          "leather"
        );
    }

  // Bronze ram over the forefoot: a cowl round the stem and wales, then three fins on a vertical blade.
  loft(
    kit,
    "ram",
    [
      { x: 15.7, hw: 0.36, y0: -0.36, y1: 0.56 },
      { x: 16.6, hw: 0.3, y0: -0.31, y1: 0.5 },
      { x: 17.55, hw: 0.15, y0: -0.23, y1: 0.39 },
      { x: 18.4, hw: 0.05, y0: -0.16, y1: 0.31 }
    ],
    "brass"
  );
  for (const y of [-0.1, 0.08, 0.26])
    loft(
      kit,
      "ram-fin",
      [
        { x: 17.0, hw: 0.2, y0: y - 0.03, y1: y + 0.03 },
        { x: 17.85, hw: 0.27, y0: y - 0.03, y1: y + 0.03 },
        { x: 18.38, hw: 0.13, y0: y - 0.025, y1: y + 0.025 }
      ],
      "brass"
    );
  // Proembolion: a second, blunt beak above the ram, capped in bronze.
  loft(
    kit,
    "proembolion",
    [
      { x: 15.9, hw: 0.13, y0: 1.48, y1: 1.72 },
      { x: 17.0, hw: 0.1, y0: 1.52, y1: 1.7 }
    ],
    "oak"
  );
  kit.sphere("proembolion-cap", [17.08, 1.61, 0], [0.16, 0.14, 0.13], "brass");

  // Stem and sternpost; the sternpost sweeps up into the fanned aphlaston.
  bent(
    kit,
    "stem",
    [V(16.1, -0.28, 0), V(16.37, 0.75, 0), V(16.55, 1.8, 0), V(16.62, 2.7, 0), V(16.42, 3.3, 0), V(16.12, 3.55, 0)],
    0.11,
    high,
    "oak"
  );
  const sternpost = [
    V(-15.55, -0.46, 0),
    V(-16.0, 1.0, 0),
    V(-16.8, 2.45, 0),
    V(-17.6, 3.6, 0),
    V(-18.12, 4.75, 0),
    V(-18.18, 5.6, 0),
    V(-17.78, 6.12, 0),
    V(-17.2, 6.28, 0)
  ];
  bent(kit, "sternpost", sternpost, 0.11, high, "oak");
  for (const z of high ? [-0.42, -0.21, 0.21, 0.42] : [-0.34, 0.34]) {
    const a = Math.abs(z);
    bent(
      kit,
      "aphlaston",
      [
        V(-17.6, 3.6, 0),
        V(-18.05, 4.65, z * 0.6),
        V(-18.12, 5.45 - a * 0.4, z),
        V(-17.85 + a * 0.4, 5.95 - a * 0.7, z * 1.08)
      ],
      0.055,
      high,
      "oak"
    );
  }
  kit.beam("aphlaston-batten", [-18.1, 5.25, -0.45], [-18.1, 5.25, 0.45], 0.06, "oak");

  // Epotides: catheads across the bow that shield the outrigger ends.
  kit.box("epotis-beam", [14.1, 1.72, 0], [0.26, 0.24, 2 * OUTRIGGER_Z - 0.12], "oak");
  for (const side of [-1, 1])
    kit.box("epotis-cap", [14.1, 1.72, side * (OUTRIGGER_Z - 0.0)], [0.36, 0.36, 0.16], "ruby");

  // Marble eyes on the bow.
  for (const side of [-1, 1]) {
    const x = 14.55,
      y = 1.0;
    const normal = sideNormal(x, y, side);
    const tangent = sideAt(x + 0.05, y, side)
      .sub(sideAt(x - 0.05, y, side))
      .normalize();
    const up = normal.clone().cross(tangent).normalize();
    if (up.y < 0) up.negate();
    const right = up.clone().cross(normal).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    const centre = sideAt(x, y, side).addScaledVector(normal, 0.015);
    const eye = kit.sphere("ophthalmos", [0, 0, 0], [0.3, 0.17, 0.035], "white");
    eye.position.copy(centre);
    eye.quaternion.copy(q);
    const pupil = kit.sphere("ophthalmos-pupil", [0, 0, 0], [0.085, 0.085, 0.025], "dark");
    pupil.position.copy(centre).addScaledVector(normal, 0.02).addScaledVector(right, 0.04);
    pupil.quaternion.copy(q);
  }
  return kit.finish();
}

// ---------------------------------------------------------------- interior

function interior(high: boolean) {
  const kit = kitOf("opus-trireme-interior");
  const FLOOR = -0.45;
  slab(kit, "hold-floor", -13.4, 13.6, FLOOR, 0.05, x => inside(x, FLOOR), high ? 30 : 10, "oak");
  kit.box("mast-step", [0.9, FLOOR + 0.12, 0], [0.7, 0.2, 0.42], "oak");
  // Zyga: the crossbeams the zygites sit on, one per room.
  for (const x of ZYGITES) {
    const half = inside(x + 0.45, 1.0, 0.02);
    kit.box("zygon", [x + 0.45, 1.0, 0], [0.12, 0.12, 2 * half], "oak");
  }
  if (high) {
    for (const x of THALAMITES)
      for (const side of [-1, 1]) {
        kit.box("thalamite-seat", [x + 0.45, 0.12, side * 0.85], [0.32, 0.06, 0.42], "wood");
        kit.beam("thalamite-seat-post", [x + 0.45, FLOOR, side * 0.85], [x + 0.45, 0.09, side * 0.85], 0.07, "oak");
      }
    for (const side of [-1, 1]) {
      kit.box("thranite-stringer", [0.2, OUTRIGGER_Y, side * 2.0], [27.3, 0.1, 0.1], "oak");
      for (const x of THRANITES)
        kit.box("thranite-seat", [x + 0.45, OUTRIGGER_Y + 0.085, side * 2.0], [0.32, 0.07, 0.4], "wood");
    }
  }
  // Hypozoma: the rope truss from stem to stern, hove taut by a windlass aft.
  for (const z of [-0.2, 0.2]) {
    const ends = [V(-14.0, 1.18, z), V(15.2, 1.18, z)];
    if (high) bent(kit, "hypozoma", [ends[0], V(0, 1.17, z), ends[1]], 0.045, true, "straw");
    else kit.lines("hypozoma", [[P(ends[0]), P(ends[1])]], ROPE);
  }
  spar(kit, "hypozoma-windlass", V(-14.2, 1.3, -0.45), V(-14.2, 1.3, 0.45), 0.1, 0.1, high ? 10 : 6, "oak");
  if (high)
    for (const z of [-0.3, 0.3]) kit.beam("windlass-bar", [-14.2, 0.85, z], [-14.2, 1.75, z], 0.05, "wood", true);
  return kit.finish();
}

// ---------------------------------------------------------------- decks

const deckHalf = (x: number) => Math.min(DECK_HALF, inside(x, sheerY(x), 0.05));

function decks(high: boolean) {
  const kit = kitOf("opus-trireme-decks");
  slab(kit, "katastroma", -13.8, 13.0, DECK + 0.06, 0.06, deckHalf, high ? 32 : 10);
  slab(kit, "bow-deck", 13.0, 15.9, 1.95, 0.06, x => Math.min(1.3, inside(x, sheerY(x), 0.04)), high ? 8 : 3);
  slab(kit, "stern-deck", -16.1, -13.8, DECK + 0.1, 0.06, deckHalf, high ? 6 : 2);
  kit.box("bow-breastwork", [13.0, (1.95 + DECK) / 2, 0], [0.08, DECK - 1.95, 2 * deckHalf(13.0)], "oak");
  if (high)
    for (const side of [-1, 1]) {
      const edge: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const x = lerp(-13.8, 13.0, k / 24);
        edge.push(V(x, DECK + 0.09, side * (deckHalf(x) - 0.03)));
      }
      bent(kit, "deck-coaming", edge, 0.035, true, "oak");
    }
  // Stanchions from the gunwale to the deck edge, clear of the oars.
  for (let i = 0; i < THRANITES.length; i += high ? 2 : 4) {
    const x = THRANITES[i] - 0.15;
    if (x < -13.6 || x > 12.9) continue;
    for (const side of [-1, 1]) {
      const foot = sideAt(x, sheerY(x), side);
      kit.beam("stanchion", [x, sheerY(x), foot.z - side * 0.06], [x, DECK, side * (deckHalf(x) - 0.05)], 0.09, "oak");
    }
  }
  kit.ring("mast-partner", [0.9, DECK + 0.08, 0], 0.22, 0.05, "oak");
  kit.box("fore-mast-tabernacle", [10.8, DECK + 0.16, 0], [0.42, 0.2, 0.36], "oak");
  return kit.finish();
}

// ---------------------------------------------------------------- outrigger

function outrigger(high: boolean) {
  const kit = kitOf("opus-trireme-outrigger");
  const x0 = THRANITES[0] - 0.5,
    x1 = 13.95;
  for (const side of [-1, 1]) {
    kit.box("parexeiresia", [(x0 + x1) / 2, OUTRIGGER_Y, side * OUTRIGGER_Z], [x1 - x0, 0.16, 0.14], "oak");
    for (let i = 0; i < THRANITES.length; i += high ? 2 : 4) {
      const x = THRANITES[i] + 0.4;
      if (x > x1 - 0.1) continue;
      const gunwale = sideAt(x, sheerY(x), side);
      const y = Math.max(OUTRIGGER_Y - 0.1, sheerY(x) + 0.1);
      kit.beam(
        "outrigger-bracket",
        [x, y, gunwale.z - side * 0.05],
        [x, OUTRIGGER_Y - 0.08, side * (OUTRIGGER_Z - 0.05)],
        0.1,
        "oak"
      );
      const low = Math.min(0.75, sheerY(x) - 0.4);
      const hullFoot = sideAt(x, low, side);
      kit.beam("outrigger-brace", [x, OUTRIGGER_Y - 0.12, side * (OUTRIGGER_Z - 0.06)], P(hullFoot), 0.08, "oak");
    }
    for (const x of THRANITES)
      kit.cylinder(
        "thranite-thole",
        [x + 0.07, OUTRIGGER_Y + 0.19, side * OUTRIGGER_Z],
        0.03,
        0.22,
        "oak",
        0.025,
        high ? 8 : 5
      );
    for (const x of ZYGITES) {
      const pivot = opusTriremePivot("zygite", x, side);
      kit.cylinder("zygite-thole", [x + 0.07, pivot.y + 0.08, pivot.z], 0.025, 0.2, "oak", 0.02, high ? 8 : 5);
    }
  }
  return kit.finish();
}

// ---------------------------------------------------------------- fittings

function fittings(high: boolean) {
  const kit = kitOf("opus-trireme-fittings");
  // Quarter rudders hung from a cross-beam, each with a tiller to the helmsman.
  kit.box("rudder-beam", [-14.6, 2.3, 0], [0.24, 0.22, 4.2], "oak");
  for (const side of [-1, 1]) {
    const head = V(-14.4, 2.95, side * 1.95);
    const tip = V(-16.0, -0.85, side * 1.75);
    const dir = tip.clone().sub(head).normalize();
    spar(kit, "pedalion", head, tip.clone().addScaledVector(dir, -0.6), 0.075, 0.06, high ? 10 : 6, "oak");
    const blade = along(kit, "pedalion-blade", tip.clone().addScaledVector(dir, -0.6), dir, [0.5, 1.25, 0.06], "oak");
    blade.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2 - 0.05));
    kit.beam("oiax", P(head.clone().add(V(0, -0.08, 0))), [-13.95, 2.82, side * 1.15], 0.06, "wood", true);
    kit.box("rudder-strap", [-14.55, 2.3, side * 1.95], [0.3, 0.3, 0.2], "leather");
  }
  kit.box("helmsman-bench", [-15.2, DECK + 0.3, 0], [0.42, 0.3, 1.0], "wood");
  // Stylis: the staff with a crossbar on the stern deck.
  kit.beam("stylis", [-15.75, DECK + 0.1, 0], [-15.75, 4.35, 0], 0.06, "wood", true);
  kit.beam("stylis-bar", [-15.75, 4.1, -0.32], [-15.75, 4.1, 0.32], 0.045, "wood", true);
  // Two wooden anchors with stone stocks on the bow deck.
  for (const side of [-1, 1]) {
    const z = side * 0.48;
    kit.beam("anchor-shank", [14.0, 2.0, z], [15.3, 2.0, z], 0.08, "oak");
    for (const arm of [-1, 1]) kit.beam("anchor-arm", [15.3, 2.0, z], [15.65, 2.0, z + arm * 0.32], 0.07, "oak");
    kit.box("anchor-stock", [14.15, 2.04, z], [0.18, 0.16, 0.62], "stone");
  }
  return kit.finish();
}

// ---------------------------------------------------------------- spars and rigging

const MAIN = { x: 0.9, heel: -0.45, head: 11.85 } as const;
const FORE_RAKE = THREE.MathUtils.degToRad(18);
const FORE = { heel: V(10.8, DECK + 0.08, 0), length: 5.2 } as const;
const foreHead = () =>
  FORE.heel.clone().add(V(Math.sin(FORE_RAKE), Math.cos(FORE_RAKE), 0).multiplyScalar(FORE.length));
const foreAt = (y: number) => V(FORE.heel.x + (y - FORE.heel.y) * Math.tan(FORE_RAKE), y, 0);

export interface OpusTriremeSail {
  id: "main-sail" | "fore-sail";
  x: number;
  yardY: number;
  half: number;
  footY: number;
  belly: number;
  bundle: number;
}
export const OPUS_TRIREME_SAILS: readonly OpusTriremeSail[] = [
  { id: "main-sail", x: 1.15, yardY: 10.9, half: 5.0, footY: 3.15, belly: 0.75, bundle: 0.24 },
  { id: "fore-sail", x: 12.42, yardY: 6.9, half: 2.6, footY: 3.15, belly: 0.4, bundle: 0.15 }
];
const YARD_OVERHANG = 0.2;
/** The main mast and yard lie on three crutches along the deck when struck. */
const STRUCK = { y: DECK + 0.38, from: -10.6, to: 2.2, yardZ: 0.55, crutches: [-8.5, -3.2, 1.3] } as const;

function yard(kit: Kit, sail: OpusTriremeSail, high: boolean) {
  const half = sail.half + YARD_OVERHANG;
  for (const side of [-1, 1])
    spar(
      kit,
      "yard",
      V(sail.x, sail.yardY, 0),
      V(sail.x, sail.yardY, side * half),
      sail.id === "main-sail" ? 0.11 : 0.075,
      0.045,
      high ? 10 : 6
    );
}

function spars(high: boolean, struck: boolean) {
  const kit = kitOf("opus-trireme-spars");
  const seg = high ? 12 : 6;
  const [main, fore] = OPUS_TRIREME_SAILS;
  if (struck) {
    spar(kit, "mast-main", V(STRUCK.from, STRUCK.y, 0), V(STRUCK.to, STRUCK.y, 0), 0.17, 0.1, seg);
    const half = main.half + YARD_OVERHANG;
    spar(
      kit,
      "yard",
      V(-4.2 - half, STRUCK.y - 0.05, STRUCK.yardZ),
      V(-4.2 + half, STRUCK.y - 0.05, STRUCK.yardZ),
      0.07,
      0.07,
      high ? 10 : 6
    );
    for (const x of STRUCK.crutches)
      for (const z of [0, STRUCK.yardZ]) {
        kit.beam("crutch-post", [x, DECK + 0.06, z], [x, STRUCK.y - 0.16, z], 0.08, "oak");
        kit.box("crutch-fork", [x, STRUCK.y - 0.14, z], [0.1, 0.06, 0.36], "oak");
      }
  } else {
    spar(kit, "mast-main", V(MAIN.x, MAIN.heel, 0), V(MAIN.x, MAIN.head, 0), 0.17, 0.1, seg);
    kit.sphere("truck", [MAIN.x, MAIN.head + 0.07, 0], [0.12, 0.12, 0.12], "wood");
    yard(kit, main, high);
  }
  const head = foreHead();
  spar(kit, "mast-fore", FORE.heel, head, 0.11, 0.07, seg);
  kit.sphere("truck", [head.x, head.y + 0.05, 0], [0.09, 0.09, 0.09], "wood");
  yard(kit, fore, high);
  return kit.finish();
}

function rigging(high: boolean, struck: boolean) {
  const kit = kitOf("opus-trireme-rigging");
  const standing: [Position, Position][] = [];
  const running: [Position, Position][] = [];
  const line = (into: [Position, Position][], a: THREE.Vector3, b: THREE.Vector3) => into.push([P(a), P(b)]);
  const [main, fore] = OPUS_TRIREME_SAILS;
  const feet: THREE.Vector3[] = [];
  if (!struck) {
    const top = V(MAIN.x, MAIN.head - 0.25, 0);
    line(standing, top, V(9.6, DECK + 0.06, 0));
    for (const z of [-0.35, 0.35]) line(standing, top, V(-15.4, DECK + 0.16, z));
    for (const side of [-1, 1])
      for (const x of [0.35, -0.55, -1.45]) {
        const foot = V(x, OUTRIGGER_Y + 0.08, side * (OUTRIGGER_Z - 0.04));
        line(standing, V(MAIN.x, MAIN.head - 1.3, side * 0.1), foot);
        feet.push(foot);
      }
    const half = main.half + YARD_OVERHANG - 0.05;
    for (const side of [-1, 1]) {
      const arm = V(main.x, main.yardY, side * half);
      line(running, V(MAIN.x, MAIN.head - 0.1, 0), arm);
      line(running, arm, V(-14.8, DECK + 0.16, side * 1.3));
    }
    line(running, V(MAIN.x, MAIN.head - 0.05, 0), V(main.x, main.yardY + 0.08, 0));
    line(running, V(MAIN.x, MAIN.head - 0.05, 0.05), V(MAIN.x - 0.5, DECK + 0.06, 0.3));
  } else
    for (const x of STRUCK.crutches)
      for (const z of [0, STRUCK.yardZ])
        running.push([
          [x - 0.05, STRUCK.y + 0.18, z - 0.2],
          [x + 0.05, STRUCK.y - 0.12, z + 0.2]
        ]);
  const head = foreHead();
  line(standing, head.clone().add(V(-0.05, -0.12, 0)), V(16.4, 3.3, 0));
  for (const side of [-1, 1])
    for (const x of [10.15, 9.45]) {
      const foot = V(x, DECK + 0.06, side * (deckHalf(x) - 0.05));
      line(standing, foreAt(head.y - 0.55).add(V(0, 0, side * 0.06)), foot);
      feet.push(foot);
    }
  const half = fore.half + YARD_OVERHANG - 0.05;
  for (const side of [-1, 1]) {
    const arm = V(fore.x, fore.yardY, side * half);
    line(running, head.clone().add(V(0, -0.05, 0)), arm);
    line(running, arm, V(7.6, DECK + 0.06, side * 1.4));
  }
  line(running, head.clone().add(V(0, -0.03, 0)), V(fore.x, fore.yardY + 0.06, 0));
  kit.lines("standing-rigging", standing, ROPE);
  kit.lines("running-rigging", running, RUNNING);
  if (high) for (const foot of feet) kit.sphere("lanyard-toggle", P(foot), [0.05, 0.05, 0.05], "dark");
  return kit.finish();
}

// ---------------------------------------------------------------- sails

function sailPoint(sail: OpusTriremeSail, t: number, u: number) {
  const across = Math.sin(Math.PI * u);
  const belly = sail.belly * (Math.sin(Math.PI * t) * across + 0.3 * t * across);
  return V(sail.x + 0.05 + belly, lerp(sail.yardY - 0.06, sail.footY, t), lerp(-sail.half, sail.half, u));
}

function squareCloth(sail: OpusTriremeSail, state: OpusTriremeState, high: boolean) {
  const kit = kitOf(`opus-trireme-${sail.id}`);
  const sails = state.sails ?? "set";
  if (sails === "struck" && sail.id === "main-sail") {
    const half = sail.half;
    addSailBundle(
      kit,
      "furled-sail",
      [-4.2 - half, STRUCK.y + 0.13, STRUCK.yardZ],
      [-4.2 + half, STRUCK.y + 0.13, STRUCK.yardZ],
      sail.bundle * 0.9,
      high
    );
    return kit.finish();
  }
  if (sails !== "set") {
    // Brailed up close under the yard.
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
  const cloth = new MeshBuilder();
  cloth.grid(rows, cols, (i, j) => sailPoint(sail, i / rows, j / cols));
  cloth.emit(kit, "square-sail", "white");
  // Linen panels sewn into squares with leather patches; brails run up the fore side through rings and over the yard.
  const seams: [Position, Position][] = [];
  const brails: [Position, Position][] = [];
  const front = (t: number, u: number) => sailPoint(sail, t, u).add(V(0.025, 0, 0));
  const panelRows = high ? 6 : 3;
  const brailCount = sail.id === "main-sail" ? (high ? 9 : 5) : high ? 5 : 3;
  for (let r = 1; r < panelRows; r++) {
    const t = r / panelRows;
    for (let k = 0; k < cols; k++) seams.push([P(front(t, k / cols)), P(front(t, (k + 1) / cols))]);
  }
  for (let b = 1; b <= brailCount; b++) {
    const u = b / (brailCount + 1);
    for (let k = 0; k < rows; k++) brails.push([P(front(k / rows, u)), P(front((k + 1) / rows, u))]);
    const lead =
      sail.id === "main-sail" ? V(MAIN.x - 0.6, DECK + 0.06, (u - 0.5) * 1.6) : V(9.8, DECK + 0.06, (u - 0.5) * 1.2);
    brails.push([P(front(0, u).add(V(0, 0.12, 0))), P(lead)]);
    if (high)
      for (let r = 1; r < panelRows; r++) {
        const ring = kit.add("brail-ring", new THREE.TorusGeometry(0.04, 0.01, 3, 6), "leather");
        ring.position.copy(front(r / panelRows, u));
        ring.rotation.y = Math.PI / 2;
      }
  }
  kit.lines("sail-seam", seams, 0xb9a988);
  kit.lines("brail", brails, RUNNING);
  const sheets: [Position, Position][] = [0, 1].map(u => {
    const clew = sailPoint(sail, 1, u);
    return [P(clew), [sail.x - 3.2, DECK + 0.06, Math.sign(clew.z) * (sail.id === "main-sail" ? 1.4 : 1.1)]];
  });
  kit.lines("sheet", sheets, RUNNING);
  return kit.finish();
}

// ---------------------------------------------------------------- oars

function oars(high: boolean, stowed: boolean) {
  const kit = kitOf("opus-trireme-oars");
  const seg = high ? 8 : 5;
  for (const bank of OPUS_TRIREME_BANKS)
    for (const side of [-1, 1])
      for (const x of opusTriremeRooms(bank)) {
        const pivot = opusTriremePivot(bank.id, x, side);
        if (stowed) {
          // Run in and turned aft along the side, blade just outboard of the thole or port.
          const lift = bank.id === "thranite" ? 0.1 : bank.id === "zygite" ? 0.02 : 0;
          const tuck = bank.id === "thalamite" ? 0 : 0.12;
          const hinge = pivot.clone().add(V(0, lift, -side * tuck));
          const inward = V(-0.94, 0, -0.34 * side).normalize();
          spar(
            kit,
            "oar-stowed-shaft",
            hinge.clone().addScaledVector(inward, 3.2),
            hinge.clone().addScaledVector(inward, -0.3),
            0.045,
            0.035,
            seg,
            "wood"
          );
          const blade = along(
            kit,
            "oar-stowed",
            hinge.clone().addScaledVector(inward, -0.3 - BLADE / 2),
            inward,
            [0.15, BLADE, 0.03],
            "wood"
          );
          blade.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2));
          continue;
        }
        // Mid-stroke, square to the side, blade buried at the waterline.
        const drop = pivot.y + 0.05;
        const reach = Math.sqrt(bank.outboard ** 2 - drop ** 2);
        const dir = V(0, -drop, side * reach).normalize();
        const handle = pivot.clone().addScaledVector(dir, -INBOARD);
        const root = pivot.clone().addScaledVector(dir, bank.outboard - BLADE);
        spar(kit, `${bank.id}-shaft`, handle, root, 0.045, 0.035, seg, "wood");
        along(
          kit,
          `oar-${bank.id}`,
          pivot.clone().addScaledVector(dir, bank.outboard - BLADE / 2),
          dir,
          [0.03, BLADE, 0.15],
          "wood"
        );
        if (high)
          spar(
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
  return kit.finish();
}

// ---------------------------------------------------------------- assembly

type PartPlan = {
  id: string;
  role: string;
  create: (state: OpusTriremeState, high: boolean) => CityStructureMeshes;
};
const PARTS: readonly PartPlan[] = [
  { id: "hull", role: "Hull, ram, proembolion, eyes, epotides, stem and aphlaston", create: (_, high) => hull(high) },
  { id: "interior", role: "Hold floor, zyga, rowing seats and hypozoma", create: (_, high) => interior(high) },
  { id: "decks", role: "Fighting deck, bow and stern decks and stanchions", create: (_, high) => decks(high) },
  { id: "outrigger", role: "Outrigger, brackets and tholes", create: (_, high) => outrigger(high) },
  { id: "fittings", role: "Quarter rudders, helm, stylis and anchors", create: (_, high) => fittings(high) },
  { id: "spars", role: "Masts and yards", create: (state, high) => spars(high, state.sails === "struck") },
  {
    id: "rigging",
    role: "Standing and running rigging",
    create: (state, high) => rigging(high, state.sails === "struck")
  },
  ...OPUS_TRIREME_SAILS.map(sail => ({
    id: sail.id,
    role: sail.id === "main-sail" ? "Main square sail" : "Boat sail (akateion)",
    create: (state: OpusTriremeState, high: boolean) => squareCloth(sail, state, high)
  })),
  { id: "oars", role: "Three oar banks", create: (state, high) => oars(high, state.oars === "stowed") }
];

export function opusTriremeParts(
  quality: OpusTriremeQuality = "high",
  state: OpusTriremeState = {}
): readonly ModelPartFactory[] {
  const high = quality === "high";
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality,
    author: OPUS_TRIREME.author,
    create: () => part.create(state, high)
  }));
}

/** Omitted state is sails set and oars out. */
export function createOpusTrireme(
  quality: OpusTriremeQuality = "high",
  state: OpusTriremeState = {}
): CityStructureMeshes {
  const model = assembleSailingParts("opus-trireme", opusTriremeParts(quality, state));
  model.group.userData.shipState = { sails: state.sails ?? "set", oars: state.oars ?? "out" };
  return model;
}
