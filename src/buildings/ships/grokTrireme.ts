import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { ModelKit, Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

/**
 * Olympias, the full-size reconstruction of an Athenian trireme, in meters.
 * Bow is +X and the waterline is Y=0. Three oar banks share one room spacing.
 * The ram lies on the waterline. Two square sails, two quarter rudders, and a plain
 * stern streamer. No gunports, lateen sails, crosses, or ensign devices.
 */
export const GROK_TRIREME = {
  author: "Grok 4.7" as Author,
  name: "Trireme",
  length: 36.9,
  beam: 5.5,
  height: 13,
  draft: 1.25,
  oars: 170,
  thranites: 62,
  zygites: 54,
  thalamites: 54,
  source: "https://en.wikipedia.org/wiki/Olympias_(trireme)",
  note: "Olympias, a full-size reconstruction of an Athenian trireme: three oar banks, two square sails, a waterline bronze ram and two quarter rudders. Not the Renaissance galley and not a lines plan. The streamer is plain cloth."
} as const;

const HULL_BEAM = 3.7;
const DRAFT = GROK_TRIREME.draft;
const ROOM = 0.89;
const OUTRIGGER_Y = 1.24;
const OUTRIGGER_Z = GROK_TRIREME.beam / 2;

const COLORS: Partial<Record<string, number>> = {
  oak: 0x6b4630,
  wood: 0xc4a36a,
  dark: 0x1c1816,
  leather: 0x3a2b24,
  iron: 0x3e4448,
  white: 0xe7e1d4,
  cloth: 0x7d2a32,
  straw: 0xa8743a,
  water: 0x9ec4ce
};

const rise = (from: number, to: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const sternX = (s: number) => -16.45 - 0.45 * s;
const stemX = (s: number) => 15.55 + 1.15 * s ** 1.15;
function sheerY(u: number) {
  return 1.32 + 0.9 * rise(0.16, 0, u) + 0.42 * rise(0.84, 1, u);
}
function keelY(u: number) {
  const end = Math.abs(u - 0.5) * 2;
  return -DRAFT * (1 - 0.4 * end ** 1.45);
}
function halfBreadth(u: number, s: number) {
  const bow = Math.max(0, (u - 0.78) / 0.22);
  const stern = Math.max(0, (0.1 - u) / 0.1);
  const plan = (1 - bow ** 1.65) * (1 - 0.42 * stern ** 1.2);
  let section = 0.05;
  if (s < 0.16) section = 0.05 + 0.4 * (s / 0.16);
  else if (s < 0.58) section = 0.45 + 0.55 * (1 - (1 - (s - 0.16) / 0.42) ** 2);
  else section = 1 - 0.1 * ((s - 0.58) / 0.42);
  return Math.max(0.05, (HULL_BEAM / 2) * plan * section);
}
function xAt(u: number, s: number) {
  return THREE.MathUtils.lerp(sternX(s), stemX(s), u);
}
function hullPoint(u: number, y: number, side = 1) {
  const s = THREE.MathUtils.clamp((y - keelY(u)) / (sheerY(u) - keelY(u)), 0, 1);
  return new THREE.Vector3(xAt(u, s), y, side * halfBreadth(u, s));
}
function portOnHull(x: number, y: number, side: number) {
  let low = 0;
  let high = 1;
  const section = (u: number) => THREE.MathUtils.clamp((y - keelY(u)) / (sheerY(u) - keelY(u)), 0, 1);
  for (let step = 0; step < 18; step++) {
    const mid = (low + high) / 2;
    if (xAt(mid, section(mid)) < x) low = mid;
    else high = mid;
  }
  const u = (low + high) / 2;
  const s = section(u);
  return new THREE.Vector3(xAt(u, s), THREE.MathUtils.lerp(keelY(u), sheerY(u), s), side * halfBreadth(u, s));
}

export interface TriremeBank {
  id: "thranite" | "zygite" | "thalamite";
  perSide: number;
  y: number;
  reach: number;
  stagger: number;
  fixedZ?: number;
}
export const TRIREME_BANKS: readonly TriremeBank[] = [
  { id: "thranite", perSide: 31, y: 1.26, reach: 3.3, stagger: 0, fixedZ: OUTRIGGER_Z },
  { id: "zygite", perSide: 27, y: 0.9, reach: 4.15, stagger: 0.3 },
  { id: "thalamite", perSide: 27, y: 0.45, reach: 4.3, stagger: 0.59 }
];
function bankX(bank: TriremeBank) {
  const span = (bank.perSide - 1) * ROOM;
  const start = -span / 2 + bank.stagger;
  return Array.from({ length: bank.perSide }, (_, index) => start + index * ROOM);
}

export interface TriremeSail {
  id: string;
  yardA: Position;
  yardB: Position;
  footY: number;
  bundle: number;
}
export const TRIREME_SAILS: readonly TriremeSail[] = [
  { id: "main-sail", yardA: [0.4, 9.7, -4.3], yardB: [0.4, 9.7, 4.3], footY: 2.35, bundle: 0.22 },
  { id: "fore-sail", yardA: [8.2, 6.5, -2.5], yardB: [8.2, 6.5, 2.5], footY: 2.55, bundle: 0.14 }
];

export interface GrokTriremeState {
  sails?: "set" | "furled";
  oars?: "out" | "stowed";
}

const kitOf = (name: string) => new SailingKit(name, COLORS);
const P = (v: THREE.Vector3): Position => [v.x, v.y, v.z];
function surface(kit: ModelKit, name: string, points: number[], indices: number[], material: Surface) {
  if (!indices.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  kit.add(name, geometry, material);
}

function hull() {
  const kit = kitOf("grok-trireme-hull");
  const U = 32;
  const S = 8;
  const pointAt = (u: number, s: number, side: number) =>
    new THREE.Vector3(xAt(u, s), THREE.MathUtils.lerp(keelY(u), sheerY(u), s), side * halfBreadth(u, s));
  const bands = new Map<string, { material: Surface; points: number[]; indices: number[] }>();
  const band = (name: string, material: Surface) => {
    const existing = bands.get(name);
    if (existing) return existing;
    const entry = { material, points: [] as number[], indices: [] as number[] };
    bands.set(name, entry);
    return entry;
  };
  const paintOf = (y: number) =>
    y < 0.05
      ? { name: "hull-underwater", material: "dark" as const }
      : { name: "hull-topsides", material: "leather" as const };
  for (const side of [-1, 1])
    for (let i = 0; i < U; i++)
      for (let j = 0; j < S; j++) {
        const corners = [
          pointAt(i / U, j / S, side),
          pointAt((i + 1) / U, j / S, side),
          pointAt(i / U, (j + 1) / S, side),
          pointAt((i + 1) / U, (j + 1) / S, side)
        ];
        const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
        const paint = paintOf(centre.y);
        const entry = band(paint.name, paint.material);
        const base = entry.points.length / 3;
        for (const corner of corners) entry.points.push(corner.x, corner.y, corner.z);
        if (side > 0) entry.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        else entry.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
      }
  const rows = 6;
  const cols = 6;
  const atStern = (row: number, col: number) => {
    const s = row / rows;
    const y = THREE.MathUtils.lerp(keelY(0), sheerY(0), s);
    const half = halfBreadth(0, s) * 0.96;
    return new THREE.Vector3(sternX(s) - 0.02, y, THREE.MathUtils.lerp(-half, half, col / cols));
  };
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const corners = [atStern(row, col), atStern(row + 1, col), atStern(row, col + 1), atStern(row + 1, col + 1)];
      const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
      const entry = band(centre.y < 0.05 ? "hull-underwater" : "stern", centre.y < 0.05 ? "dark" : "oak");
      const base = entry.points.length / 3;
      for (const corner of corners) entry.points.push(corner.x, corner.y, corner.z);
      entry.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  for (const [name, entry] of bands) surface(kit, name, entry.points, entry.indices, entry.material);
  const stem: number[] = [];
  const stemIndex: number[] = [];
  for (let j = 0; j <= S; j++) {
    const s = j / S;
    const y = THREE.MathUtils.lerp(keelY(1), sheerY(1), s);
    stem.push(stemX(s), y, -halfBreadth(1, s), stemX(s), y, halfBreadth(1, s));
  }
  for (let j = 0; j < S; j++) stemIndex.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
  surface(kit, "stem", stem, stemIndex, "oak");
  const keel: number[] = [];
  const keelIndex: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    keel.push(xAt(u, 0), keelY(u), -0.08, xAt(u, 0), keelY(u), 0.08);
  }
  for (let i = 0; i < 24; i++) keelIndex.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  surface(kit, "keel", keel, keelIndex, "dark");
  for (const y of [0.18, 0.82])
    for (const side of [-1, 1])
      for (let i = 0; i < 22; i++) {
        const a = hullPoint(i / 22, y, side);
        const b = hullPoint((i + 1) / 22, y, side);
        if (a.distanceTo(b) < 0.04) continue;
        kit.beam("wale", P(a), P(b), y < 0.4 ? 0.12 : 0.08, y < 0.4 ? "dark" : "white", true);
      }
  const ramHeel = hullPoint(1, 0.12);
  kit.beam("ram", P(ramHeel), [18.2, -0.02, 0], 0.26, "straw", true);
  kit.box("ram-head", [18.15, -0.02, 0], [0.48, 0.36, 0.32], "straw");
  for (const z of [-0.1, 0, 0.1]) kit.box("ram-fin", [18.42, -0.02, z], [0.18, 0.28, 0.045], "straw");
  const stemHeel = hullPoint(1, 0.35);
  const stemHead = hullPoint(1, sheerY(1) - 0.08);
  kit.beam("stem-post", P(stemHeel), P(stemHead), 0.14, "oak", true);
  const fanRoot = hullPoint(0, sheerY(0) - 0.08);
  for (const tip of [
    [-17.42, 3.35, 0],
    [-17.15, 3.05, 0.32],
    [-17.15, 3.05, -0.32],
    [-17.2, 2.65, 0.5],
    [-17.2, 2.65, -0.5]
  ] as const)
    kit.beam("aphlaston", P(fanRoot), [...tip], 0.06, "oak", true);
  for (const side of [-1, 1]) {
    const eye = hullPoint(0.93, 0.95, side);
    const outward = side * 0.05;
    kit.sphere("ophthalmos", [eye.x, eye.y, eye.z + outward], [0.16, 0.12, 0.04], "white");
    kit.sphere("ophthalmos-pupil", [eye.x + 0.02, eye.y, eye.z + outward * 2], [0.055, 0.055, 0.025], "dark");
  }
  return kit.finish();
}

function deckStrip(kit: SailingKit, name: string, x0: number, x1: number, y: number, half: number) {
  const steps = Math.max(4, Math.round((x1 - x0) / 1.6));
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    points.push(x, y, -half, x, y, half);
    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  surface(kit, name, points, indices, "wood");
}

function decks() {
  const kit = kitOf("grok-trireme-decks");
  deckStrip(kit, "fighting-deck", -14.4, 14.6, 1.5, 1.35);
  const thranites = bankX(TRIREME_BANKS[0]);
  for (const side of [-1, 1]) {
    kit.beam(
      "parexeiresia",
      [thranites[0] - 0.4, OUTRIGGER_Y, side * OUTRIGGER_Z],
      [thranites[thranites.length - 1] + 0.4, OUTRIGGER_Y, side * OUTRIGGER_Z],
      0.14,
      "oak",
      true
    );
    for (let index = 0; index < thranites.length; index += 2) {
      const x = thranites[index];
      const skin = portOnHull(x, 1.05, side);
      kit.beam("outrigger-brace", [x, OUTRIGGER_Y, side * OUTRIGGER_Z], [x, 0.46, side * 0.4], 0.06, "oak", true);
      kit.beam(
        "outrigger-beam",
        [x, 1.16, side * (Math.abs(skin.z) + 0.08)],
        [x, OUTRIGGER_Y, side * OUTRIGGER_Z],
        0.06,
        "oak",
        true
      );
      kit.cylinder("thole", [x, OUTRIGGER_Y + 0.14, side * OUTRIGGER_Z], 0.03, 0.24, "oak", 0.03, 6);
    }
  }
  return kit.finish();
}

function fittings() {
  const kit = kitOf("grok-trireme-fittings");
  kit.box("helm-deck", [-15.15, 1.7, 0], [2.1, 0.08, 1.45], "wood");
  for (const side of [-1, 1]) {
    const head = new THREE.Vector3(-15.35, 1.74, side * 0.7);
    const tip = new THREE.Vector3(-15.8, -0.02, side * 1.4);
    const dir = tip.clone().sub(head).normalize();
    kit.beam("steering-oar", P(head), P(tip.clone().addScaledVector(dir, -0.3)), 0.08, "oak", true);
    const blade = kit.box("steering-blade", [0, 0, 0], [0.14, 0.5, 0.035], "wood");
    blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    blade.position.copy(tip.clone().addScaledVector(dir, -0.2));
  }
  for (const z of [-0.35, 0.35]) kit.box("bollard", [14.15, 1.7, z], [0.14, 0.26, 0.14], "oak");
  return kit.finish();
}

const MASTS = [
  { id: "fore", x: 8.2, heel: 1.55, head: 7.55 },
  { id: "main", x: 0.4, heel: 1.5, head: 11.55 }
] as const;

function spars() {
  const kit = kitOf("grok-trireme-spars");
  for (const mast of MASTS) {
    kit.beam("mast", [mast.x, mast.heel, 0], [mast.x, mast.head, 0], mast.id === "main" ? 0.28 : 0.18, "oak", true);
    kit.sphere("mast-truck", [mast.x, mast.head + 0.1, 0], [0.1, 0.1, 0.1], "straw");
  }
  for (const sail of TRIREME_SAILS)
    kit.beam("yard", sail.yardA, sail.yardB, sail.id === "main-sail" ? 0.12 : 0.08, "wood", true);
  return kit.finish();
}

function rigging() {
  const kit = kitOf("grok-trireme-rigging");
  const lines: [Position, Position][] = [];
  const stay = (a: THREE.Vector3, b: THREE.Vector3) => lines.push([P(a), P(b)]);
  const fore = MASTS[0];
  const main = MASTS[1];
  stay(new THREE.Vector3(fore.x, fore.head - 0.15, 0), new THREE.Vector3(14.5, 1.7, 0));
  stay(new THREE.Vector3(main.x, main.head - 0.2, 0), new THREE.Vector3(fore.x, fore.heel + 0.5, 0));
  stay(new THREE.Vector3(main.x, main.head - 0.25, 0), new THREE.Vector3(-15.2, 2.15, 0));
  for (const mast of MASTS)
    for (const side of [-1, 1])
      for (const dx of [-0.55, 0, 0.55]) {
        const foot = new THREE.Vector3(mast.x + dx, OUTRIGGER_Y + 0.04, side * (OUTRIGGER_Z - 0.05));
        stay(foot, new THREE.Vector3(mast.x, mast.head - 0.35, side * 0.06));
        kit.sphere("deadeye", P(foot), [0.06, 0.06, 0.06], "dark");
      }
  kit.lines("standing-rigging", lines, 0x3a322c);
  kit.lines(
    "hypozoma",
    [
      [
        [-14.4, 1.28, -0.18],
        [14.5, 1.28, -0.18]
      ],
      [
        [-14.4, 1.28, 0.18],
        [14.5, 1.28, 0.18]
      ]
    ],
    0x2c2824
  );
  return kit.finish();
}

function sailPoint(spec: TriremeSail, t: number, u: number) {
  const yardA = new THREE.Vector3(...spec.yardA);
  const yardB = new THREE.Vector3(...spec.yardB);
  const mid = yardA.clone().lerp(yardB, 0.5);
  const across = yardA
    .clone()
    .lerp(yardB, u)
    .sub(mid)
    .multiplyScalar(1 - 0.16 * t);
  const belly = Math.sin(Math.PI * t) * Math.sin(Math.PI * u) * (spec.id === "main-sail" ? 0.7 : 0.4);
  return new THREE.Vector3(mid.x + across.x - belly, THREE.MathUtils.lerp(yardA.y, spec.footY, t), mid.z + across.z);
}

function squareCloth(spec: TriremeSail, furled: boolean) {
  const kit = kitOf(spec.id);
  if (furled) {
    addSailBundle(kit, "furled-sail", spec.yardA, spec.yardB, spec.bundle, true);
    return kit.finish();
  }
  const rows = spec.id === "main-sail" ? 8 : 6;
  const cols = spec.id === "main-sail" ? 10 : 7;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) points.push(...sailPoint(spec, i / rows, j / cols).toArray());
    if (i < rows)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j;
        indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
      }
  }
  surface(kit, "square-sail", points, indices, "white");
  const seams: [Position, Position][] = [];
  for (let i = 2; i < rows; i += 2) {
    const from = sailPoint(spec, i / rows, 0);
    const to = sailPoint(spec, i / rows, 1);
    seams.push([P(from), P(to)]);
  }
  kit.lines("sail-seam", seams, 0xcbb992);
  const sheets: [Position, Position][] = [0, 1].map(u => {
    const clew = sailPoint(spec, 1, u);
    return [P(clew), [clew.x - 0.35, 1.55, Math.sign(clew.z) * 1.15]];
  });
  kit.lines("sheet", sheets, 0x6a5844);
  return kit.finish();
}

function flagCloth(kit: SailingKit, name: string, origin: THREE.Vector3, length: number, hoist: number) {
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const droop = t * t * hoist * 0.2;
    points.push(origin.x - t * length, origin.y + hoist / 2 - droop * 0.1, origin.z);
    points.push(origin.x - t * length, origin.y - hoist / 2 - droop, origin.z);
    if (i < 4) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  surface(kit, name, points, indices, "cloth");
}

function flags() {
  const kit = kitOf("grok-trireme-flags");
  const staff = new THREE.Vector3(-16.85, 3.4, 0);
  kit.beam("stylis", P(staff), [-16.9, 4.55, 0], 0.035, "wood", true);
  flagCloth(kit, "pennant", new THREE.Vector3(-16.85, 4.35, 0), 0.85, 0.28);
  return kit.finish();
}

function placeBlade(kit: SailingKit, name: string, tip: THREE.Vector3, dir: THREE.Vector3) {
  const blade = kit.box(name, [0, 0, 0], [0.18, 0.68, 0.03], "wood");
  blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  blade.position.copy(tip.clone().addScaledVector(dir, -0.3));
}

function oars(stowed: boolean) {
  const kit = kitOf("grok-trireme-oars");
  for (const bank of TRIREME_BANKS)
    for (const side of [-1, 1])
      for (const x of bankX(bank)) {
        if (stowed) {
          const start = new THREE.Vector3(x - 1.55, 1.6, side * 0.62);
          const end = new THREE.Vector3(x + 1.95, 1.68, side * 0.98);
          const dir = end.clone().sub(start).normalize();
          kit.beam("oar-shaft", P(start), P(end), 0.05, "wood", true);
          placeBlade(kit, "oar-stowed", end, dir);
          continue;
        }
        const pivot =
          bank.fixedZ === undefined ? portOnHull(x, bank.y, side) : new THREE.Vector3(x, bank.y, side * bank.fixedZ);
        const tip = new THREE.Vector3(pivot.x + 0.1, 0.12, side * (Math.abs(pivot.z) + bank.reach));
        const dir = tip.clone().sub(pivot).normalize();
        if (bank.id === "thranite") {
          const skin = portOnHull(x, 1.02, side);
          const inner = new THREE.Vector3(x, 1.14, side * (Math.abs(skin.z) + 0.16));
          kit.beam("thranite-loom", P(inner), P(pivot), 0.06, "oak", true);
        }
        kit.beam(`${bank.id}-shaft`, P(pivot), P(tip.clone().addScaledVector(dir, -0.5)), 0.05, "wood", true);
        placeBlade(kit, `oar-${bank.id}`, tip, dir);
        kit.cylinder("oar-leather", [pivot.x, pivot.y, pivot.z], 0.045, 0.07, "leather", 0.045, 6);
      }
  return kit.finish();
}

const PARTS: readonly { id: string; role: string; create: (state: GrokTriremeState) => CityStructureMeshes }[] = [
  { id: "hull", role: "Hull, ram and aphlaston", create: () => hull() },
  { id: "decks", role: "Deck, outrigger and tholes", create: () => decks() },
  { id: "fittings", role: "Quarter rudders and helm", create: () => fittings() },
  { id: "spars", role: "Masts and yards", create: () => spars() },
  { id: "rigging", role: "Standing rigging and hypozomata", create: () => rigging() },
  ...TRIREME_SAILS.map(spec => ({
    id: spec.id,
    role: spec.id === "main-sail" ? "Main square sail" : "Fore square sail",
    create: (state: GrokTriremeState) => squareCloth(spec, state.sails === "furled")
  })),
  { id: "flags", role: "Stern streamer", create: () => flags() },
  { id: "oars", role: "Three oar banks", create: state => oars(state.oars === "stowed") }
];

export function grokTriremeParts(state: GrokTriremeState = {}): readonly ModelPartFactory[] {
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality: "high" as const,
    author: GROK_TRIREME.author,
    create: () => part.create(state)
  }));
}

/** High-only assembly. Omitted state is sails set and oars out. */
export function createGrokTrireme(state: GrokTriremeState = {}): CityStructureMeshes {
  const model = assembleSailingParts("grok-trireme", grokTriremeParts(state));
  model.group.userData.shipState = { sails: state.sails ?? "set", oars: state.oars ?? "out" };
  return model;
}
