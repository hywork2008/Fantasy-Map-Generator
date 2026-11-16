import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { ModelKit, Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

/**
 * Sixteenth-century Mediterranean war galley, in meters. Bow is +X and the waterline is Y=0.
 * The hull follows a light galley's proportions: a long narrow body, a low waist, an above-water
 * spur, and a stern cabin. Oars are one to a bank (a scaloccio), not three oars on one bench.
 * The bow battery fires forward. Two lateen sails share one tack. Royals arms, crosses and a
 * named ship are omitted. Flags are plain cloth.
 */
export const GROK_GALLEY = {
  author: "Grok 4.7" as Author,
  name: "Galley",
  length: 52,
  beam: 5.1,
  height: 21,
  draft: 1.3,
  oars: 48,
  guns: 5,
  source: "https://en.wikipedia.org/wiki/Galley",
  note: "Mediterranean war galley in a 16th-century a scaloccio arrangement: one oar per bank, an above-water spur, a forward battery and two lateen sails. Not a named ship and not a lines plan. Flags are plain cloth."
} as const;

const BEAM = GROK_GALLEY.beam / 2;
const DRAFT = GROK_GALLEY.draft;
const APOSTIS_Y = 1.74;
const APOSTIS_Z = 3.35;
const BREAST_X = 19.35;

const COLORS: Partial<Record<string, number>> = {
  oak: 0x6b4630,
  wood: 0xc2a36c,
  dark: 0x241e1a,
  iron: 0x3e4448,
  white: 0xe6e0d0,
  cloth: 0x8e2430,
  tile: 0x8c2f2c,
  straw: 0xd7b15a,
  water: 0x9ec4ce,
  plaster: 0xe4d3b0,
  leather: 0x5c4030
};

const rise = (from: number, to: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const sternX = (s: number) => -20.2 - 0.85 * s;
const stemX = (s: number) => 20.6 + 1.8 * s ** 1.2;
function sheerY(u: number) {
  return 1.28 + 1.35 * rise(0.22, 0.02, u) + 0.7 * rise(0.82, 1, u);
}
function keelY(u: number) {
  const end = Math.abs(u - 0.48) * 2;
  return -DRAFT * (1 - 0.55 * end ** 1.35);
}
function halfBreadth(u: number, s: number) {
  const bow = Math.max(0, (u - 0.72) / 0.28);
  const stern = Math.max(0, (0.16 - u) / 0.16);
  const plan = (1 - bow ** 1.55) * (1 - 0.48 * stern ** 1.25);
  let section = 0.05;
  if (s < 0.12) section = 0.05 + 0.28 * (s / 0.12);
  else if (s < 0.42) section = 0.33 + 0.67 * (1 - (1 - (s - 0.12) / 0.3) ** 2);
  else section = 1 - 0.06 * ((s - 0.42) / 0.58);
  return Math.max(0.05, BEAM * plan * section);
}
function xAt(u: number, s: number) {
  return THREE.MathUtils.lerp(sternX(s), stemX(s), u);
}
function hullPoint(u: number, y: number, side = 1) {
  const s = THREE.MathUtils.clamp((y - keelY(u)) / (sheerY(u) - keelY(u)), 0, 1);
  return new THREE.Vector3(xAt(u, s), y, side * halfBreadth(u, s));
}

export interface GrokGalleyState {
  sails?: "set" | "furled";
  oars?: "out" | "stowed";
  guns?: "run-out" | "housed";
}
export interface GalleyGun {
  id: string;
  point: Position;
  normal: Position;
  width: number;
  height: number;
  bore: number;
  run: number;
}

const GUNS: readonly Omit<GalleyGun, "point" | "normal">[] = [
  { id: "corsia", width: 0.78, height: 0.62, bore: 0.18, run: 2.15 },
  { id: "flank-inner-1", width: 0.48, height: 0.42, bore: 0.11, run: 1.45 },
  { id: "flank-inner--1", width: 0.48, height: 0.42, bore: 0.11, run: 1.45 },
  { id: "flank-outer-1", width: 0.4, height: 0.36, bore: 0.09, run: 1.2 },
  { id: "flank-outer--1", width: 0.4, height: 0.36, bore: 0.09, run: 1.2 }
];
const GUN_Z: Record<string, number> = {
  corsia: 0,
  "flank-inner-1": 1.05,
  "flank-inner--1": -1.05,
  "flank-outer-1": 1.85,
  "flank-outer--1": -1.85
};
const GUN_Y = 2.42;

export function galleyBowGuns(): readonly GalleyGun[] {
  return GUNS.map(gun => ({
    ...gun,
    point: [BREAST_X, GUN_Y, GUN_Z[gun.id] ?? 0],
    normal: [1, 0, 0]
  }));
}

export interface GalleyLateen {
  id: string;
  heel: Position;
  peak: Position;
  clew: Position;
  bundle: number;
}
export const GALLEY_LATEENS: readonly GalleyLateen[] = [
  {
    id: "fore-lateen",
    heel: [20.4, 4.5, 0],
    peak: [9.2, 12.2, 0],
    clew: [14.6, 2.55, 0.85],
    bundle: 0.16
  },
  {
    id: "main-lateen",
    heel: [7.6, 6.4, 0],
    peak: [-14.8, 18.2, 0],
    clew: [-4.2, 2.7, 1.15],
    bundle: 0.24
  }
];

const OAR_X = Array.from({ length: 24 }, (_, index) => -13.4 + (index * 26) / 23);

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
  const kit = kitOf("grok-galley-hull");
  const U = 36;
  const S = 10;
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
  for (const side of [-1, 1]) {
    for (let i = 0; i < U; i++)
      for (let j = 0; j < S; j++) {
        const corners = [
          pointAt(i / U, j / S, side),
          pointAt((i + 1) / U, j / S, side),
          pointAt(i / U, (j + 1) / S, side),
          pointAt((i + 1) / U, (j + 1) / S, side)
        ];
        const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
        const paint =
          centre.y < 0.12
            ? { name: "hull-underwater", material: "dark" as const }
            : { name: "hull-topsides", material: "oak" as const };
        const entry = band(paint.name, paint.material);
        const base = entry.points.length / 3;
        for (const corner of corners) entry.points.push(corner.x, corner.y, corner.z);
        if (side > 0) entry.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        else entry.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
      }
  }
  const rows = 8;
  const cols = 8;
  const atTransom = (row: number, col: number) => {
    const s = row / rows;
    const y = THREE.MathUtils.lerp(keelY(0), sheerY(0), s);
    const half = halfBreadth(0, s) * 0.96;
    return new THREE.Vector3(sternX(s) - 0.02, y, THREE.MathUtils.lerp(-half, half, col / cols));
  };
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const corners = [
        atTransom(row, col),
        atTransom(row + 1, col),
        atTransom(row, col + 1),
        atTransom(row + 1, col + 1)
      ];
      const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
      const entry = band(centre.y < 0.12 ? "hull-underwater" : "transom", centre.y < 0.12 ? "dark" : "plaster");
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
  for (let i = 0; i <= 28; i++) {
    const u = i / 28;
    keel.push(xAt(u, 0), keelY(u), -0.1, xAt(u, 0), keelY(u), 0.1);
  }
  for (let i = 0; i < 28; i++) keelIndex.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  surface(kit, "keel", keel, keelIndex, "dark");
  for (const y of [0.35, 0.95])
    for (const side of [-1, 1])
      for (let i = 0; i < 24; i++) {
        const a = hullPoint(i / 24, y, side);
        const b = hullPoint((i + 1) / 24, y, side);
        if (a.distanceTo(b) < 0.04) continue;
        kit.beam("wale", P(a), P(b), y < 0.5 ? 0.16 : 0.1, y < 0.5 ? "dark" : "tile", true);
      }
  const rudderX = sternX(0.4) - 0.35;
  kit.box("rudder", [rudderX, 0.15, 0], [0.16, 2.15, 0.18], "oak");
  kit.beam("rudder-stock", [rudderX, -0.7, 0], [rudderX + 0.08, 2.3, 0], 0.1, "oak", true);
  const spurHeel = hullPoint(1, 1.62);
  kit.beam("spur", P(spurHeel), [28.15, 1.42, 0], 0.22, "oak", true);
  kit.box("spur-shoe", [28.05, 1.42, 0], [0.55, 0.16, 0.2], "iron");
  return kit.finish();
}

function deckStrip(kit: SailingKit, name: string, x0: number, x1: number, y: number, half: number) {
  const steps = Math.max(4, Math.round((x1 - x0) / 1.8));
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
  const kit = kitOf("grok-galley-decks");
  deckStrip(kit, "rowing-deck", -14.2, 13.8, 1.16, 2.15);
  deckStrip(kit, "corsia", -14.4, 14.2, 1.48, 0.36);
  deckStrip(kit, "rambade", 14.2, 19.15, 2.08, 2.25);
  deckStrip(kit, "stern-deck", -20.4, -14.6, 2.15, 1.55);
  kit.box("stern-cabin", [-17.7, 2.95, 0], [4.4, 1.45, 2.9], "oak");
  kit.box("cabin-roof", [-17.65, 3.74, 0], [4.7, 0.14, 3.15], "tile");
  for (const z of [-0.72, 0, 0.72]) kit.box("window-glass", [-19.95, 3.05, z], [0.05, 0.38, 0.28], "water");
  for (const z of [-0.96, -0.36, 0.36, 0.96]) kit.box("window-mullion", [-19.98, 3.05, z], [0.05, 0.52, 0.08], "straw");
  kit.box("window-lintel", [-19.98, 3.32, 0], [0.05, 0.08, 2.04], "straw");
  kit.box("window-sill", [-19.98, 2.78, 0], [0.05, 0.08, 2.04], "straw");
  for (const side of [-1, 1]) {
    kit.beam("apostis", [-14.3, APOSTIS_Y, side * APOSTIS_Z], [13.7, APOSTIS_Y, side * APOSTIS_Z], 0.14, "oak", true);
    for (const x of OAR_X) {
      kit.cylinder("thole", [x, APOSTIS_Y + 0.16, side * APOSTIS_Z], 0.035, 0.32, "oak", 0.035, 6);
      kit.beam("apostis-brace", [x, APOSTIS_Y, side * APOSTIS_Z], [x, 0.45, side * 1.15], 0.07, "oak", true);
    }
  }
  for (let i = 0; i < OAR_X.length; i += 2)
    for (const side of [-1, 1])
      kit.box(
        "pavesade",
        [OAR_X[i], APOSTIS_Y + 0.42, side * (APOSTIS_Z + 0.1)],
        [0.72, 0.52, 0.05],
        i % 4 === 0 ? "tile" : "white"
      );
  return kit.finish();
}

function fittings() {
  const kit = kitOf("grok-galley-fittings");
  for (const x of OAR_X)
    for (const side of [-1, 1]) {
      kit.box("rowing-bench", [x - 0.12, 1.34, side * 1.45], [0.4, 0.07, 1.35], "wood");
      kit.box("bench-leg", [x - 0.12, 1.2, side * 0.95], [0.07, 0.28, 0.07], "oak");
      kit.box("bench-leg", [x - 0.12, 1.2, side * 1.95], [0.07, 0.28, 0.07], "oak");
    }
  for (const x of [-8, 0, 8]) kit.box("corsia-hatch", [x, 1.54, 0], [0.7, 0.05, 0.42], "dark");
  kit.box("anchor", [16.4, 2.35, 1.4], [1.5, 0.1, 0.12], "iron");
  kit.box("anchor-stock", [17.05, 2.35, 1.4], [0.1, 0.1, 0.7], "wood");
  for (const z of [-1.15, 0, 1.15]) {
    const base = new THREE.Vector3(-19.7, 3.9, z);
    kit.beam("lantern-stem", P(base), P(base.clone().add(new THREE.Vector3(-0.15, 0.7, 0))), 0.04, "iron", true);
    kit.sphere("lantern", P(base.clone().add(new THREE.Vector3(-0.15, 0.95, 0))), [0.16, 0.2, 0.16], "straw");
  }
  kit.box("gangway-rail", [14.8, 2.55, 0], [0.08, 0.7, 0.7], "oak");
  return kit.finish();
}

const MASTS = [
  { id: "fore", x: 12.4, heel: 2.1, head: 11.6 },
  { id: "main", x: -1.6, heel: 1.4, head: 16.6 }
] as const;

function spars() {
  const kit = kitOf("grok-galley-spars");
  for (const mast of MASTS) {
    kit.beam("mast", [mast.x, mast.heel, 0], [mast.x, mast.head, 0], mast.id === "main" ? 0.34 : 0.24, "oak", true);
    kit.sphere("mast-truck", [mast.x, mast.head + 0.12, 0], [0.12, 0.12, 0.12], "straw");
  }
  for (const sail of GALLEY_LATEENS)
    kit.beam("lateen-yard", sail.heel, sail.peak, sail.id === "main-lateen" ? 0.16 : 0.12, "wood", true);
  return kit.finish();
}

function rigging() {
  const kit = kitOf("grok-galley-rigging");
  const lines: [Position, Position][] = [];
  const stay = (a: THREE.Vector3, b: THREE.Vector3) => lines.push([P(a), P(b)]);
  const fore = MASTS[0];
  const main = MASTS[1];
  stay(new THREE.Vector3(fore.x, fore.head - 0.2, 0), new THREE.Vector3(18.6, 2.3, 0));
  stay(new THREE.Vector3(main.x, main.head - 0.3, 0), new THREE.Vector3(fore.x, fore.heel + 0.4, 0));
  stay(new THREE.Vector3(main.x, main.head - 0.4, 0), new THREE.Vector3(-16.5, 3.2, 0));
  for (const mast of MASTS)
    for (const side of [-1, 1]) {
      const footZ = side * (APOSTIS_Z - 0.15);
      const head = new THREE.Vector3(mast.x, mast.head - 0.5, side * 0.08);
      for (const dx of [-0.7, 0, 0.7]) {
        const foot = new THREE.Vector3(mast.x + dx, APOSTIS_Y + 0.05, footZ);
        stay(foot, head);
        kit.sphere("deadeye", P(foot), [0.07, 0.07, 0.07], "dark");
      }
    }
  kit.lines("standing-rigging", lines, 0x3a322c);
  return kit.finish();
}

function lateenCloth(spec: GalleyLateen, furled: boolean) {
  const kit = kitOf(spec.id);
  const heel = new THREE.Vector3(...spec.heel);
  const peak = new THREE.Vector3(...spec.peak);
  if (furled) {
    addSailBundle(kit, "furled-sail", spec.heel, spec.peak, spec.bundle, true);
    return kit.finish();
  }
  const clew = new THREE.Vector3(...spec.clew);
  const yard = peak.clone().sub(heel);
  const side = yard.clone().cross(clew.clone().sub(heel)).normalize();
  const rows = spec.id === "main-lateen" ? 10 : 7;
  const cols = spec.id === "main-lateen" ? 8 : 6;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const head = heel.clone().lerp(peak, t);
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const belly = Math.sin(Math.PI * t) * Math.sin(Math.PI * u) * (spec.id === "main-lateen" ? 0.85 : 0.45);
      points.push(...head.clone().lerp(clew, u).addScaledVector(side, belly).toArray());
    }
    if (i < rows)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j;
        indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
      }
  }
  surface(kit, "lateen-sail", points, indices, "white");
  const seams: [Position, Position][] = [];
  for (let i = 2; i < rows; i += 2) {
    const row = i * (cols + 1);
    seams.push([
      [points[row * 3], points[row * 3 + 1], points[row * 3 + 2]],
      [points[(row + cols) * 3], points[(row + cols) * 3 + 1], points[(row + cols) * 3 + 2]]
    ]);
  }
  kit.lines("sail-seam", seams, 0xcbb992);
  kit.lines("sheet", [[spec.clew, [spec.clew[0] - 0.3, spec.clew[1] - 1.15, spec.clew[2]]]], 0x6a5844);
  return kit.finish();
}

function flagCloth(kit: SailingKit, name: string, origin: THREE.Vector3, length: number, hoist: number) {
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const droop = t * t * hoist * 0.22;
    points.push(origin.x - t * length, origin.y + hoist / 2 - droop * 0.15, origin.z);
    points.push(origin.x - t * length, origin.y - hoist / 2 - droop, origin.z);
    if (i < 4) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  surface(kit, name, points, indices, "cloth");
}

function flags() {
  const kit = kitOf("grok-galley-flags");
  const main = MASTS[1];
  kit.beam("pennant-staff", [main.x, main.head, 0], [main.x, main.head + 1.15, 0], 0.035, "wood", true);
  flagCloth(kit, "pennant", new THREE.Vector3(main.x, main.head + 0.85, 0), 4.2, 0.32);
  const staff = new THREE.Vector3(-20.15, 4.15, 0);
  kit.beam("ensign-staff", P(staff), P(staff.clone().add(new THREE.Vector3(-0.2, 1.8, 0))), 0.045, "wood", true);
  flagCloth(kit, "ensign", staff.clone().add(new THREE.Vector3(-0.15, 1.35, 0)), 2.4, 1.35);
  return kit.finish();
}

function oarDirection(side: number) {
  return new THREE.Vector3(-0.15, -0.24, side).normalize();
}

function oars(stowed: boolean) {
  const kit = kitOf("grok-galley-oars");
  for (const side of [-1, 1])
    for (const x of OAR_X) {
      if (!stowed) {
        const dir = oarDirection(side);
        const thole = new THREE.Vector3(x, APOSTIS_Y, side * APOSTIS_Z);
        const inner = thole.clone().addScaledVector(dir, -2.25);
        const tip = thole.clone().addScaledVector(dir, 6.45);
        kit.beam("oar-loom", P(inner), P(thole), 0.1, "oak", true);
        kit.beam("oar-shaft", P(thole), P(tip.clone().addScaledVector(dir, -0.85)), 0.07, "wood", true);
        const blade = kit.box("oar-out", [0, 0, 0], [0.28, 0.9, 0.04], "wood");
        blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        blade.position.copy(tip.clone().addScaledVector(dir, -0.42));
        kit.cylinder("oar-leather", P(thole), 0.06, 0.1, "leather", 0.06, 8);
      } else {
        const a = new THREE.Vector3(x - 2.05, 1.62, side * 1.35);
        const b = new THREE.Vector3(x + 2.15, 1.7, side * 1.72);
        const dir = b.clone().sub(a).normalize();
        kit.beam("oar-shaft", P(a), P(b), 0.07, "wood", true);
        const blade = kit.box("oar-stowed", [0, 0, 0], [0.26, 0.85, 0.04], "oak");
        blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        blade.position.copy(b.clone().addScaledVector(dir, -0.4));
      }
    }
  return kit.finish();
}

function bowFrames() {
  const kit = kitOf("grok-galley-bow-frames");
  for (const gun of galleyBowGuns()) {
    const [x, y, z] = gun.point;
    const w = gun.width;
    const h = gun.height;
    kit.box("gun-jamb", [x, y, z - w / 2 - 0.07], [0.18, h + 0.2, 0.12], "oak");
    kit.box("gun-jamb", [x, y, z + w / 2 + 0.07], [0.18, h + 0.2, 0.12], "oak");
    kit.box("gun-lintel", [x, y + h / 2 + 0.08, z], [0.18, 0.12, w + 0.08], "oak");
    kit.box("gun-sill", [x, y - h / 2 - 0.08, z], [0.18, 0.12, w + 0.08], "oak");
  }
  kit.box("breastwork-rail", [BREAST_X, 2.95, 0], [0.16, 0.12, 4.3], "oak");
  return kit.finish();
}

function bowGuns(housed: boolean) {
  const kit = kitOf("grok-galley-bow-guns");
  for (const gun of galleyBowGuns()) {
    const [x, y, z] = gun.point;
    if (housed) {
      kit.beam("cannon-housed", [x - 0.25 - gun.run, y, z], [x - 0.22, y, z], gun.bore, "iron", true);
      kit.box("gun-lid-closed", [x + 0.1, y, z], [0.08, gun.height * 0.9, gun.width * 0.9], "tile");
    } else {
      kit.beam("cannon-run-out", [x - 0.45, y, z], [x + gun.run * 0.55, y, z], gun.bore, "iron", true);
      kit.sphere("cannon-muzzle", [x + gun.run * 0.55, y, z], [gun.bore * 0.7, gun.bore * 0.7, gun.bore * 0.7], "iron");
    }
  }
  return kit.finish();
}

const PARTS: readonly { id: string; role: string; create: (state: GrokGalleyState) => CityStructureMeshes }[] = [
  { id: "hull", role: "Hull, spur, wales and rudder", create: () => hull() },
  { id: "decks", role: "Decks, apostis, cabin and pavesade", create: () => decks() },
  { id: "fittings", role: "Benches, corsia and lanterns", create: () => fittings() },
  { id: "spars", role: "Masts and lateen yards", create: () => spars() },
  { id: "rigging", role: "Standing rigging", create: () => rigging() },
  ...GALLEY_LATEENS.map(spec => ({
    id: spec.id,
    role: spec.id === "main-lateen" ? "Main lateen" : "Fore lateen",
    create: (state: GrokGalleyState) => lateenCloth(spec, state.sails === "furled")
  })),
  { id: "flags", role: "Pennant and stern flag", create: () => flags() },
  { id: "oars", role: "Oars", create: state => oars(state.oars === "stowed") },
  { id: "bow-frames", role: "Bow breastwork", create: () => bowFrames() },
  { id: "bow-guns", role: "Bow guns and lids", create: state => bowGuns(state.guns === "housed") }
];

export function grokGalleyParts(state: GrokGalleyState = {}): readonly ModelPartFactory[] {
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality: "high" as const,
    author: GROK_GALLEY.author,
    create: () => part.create(state)
  }));
}

/** High-only assembly. Omitted state is sails set, oars out and bow guns run out. */
export function createGrokGalley(state: GrokGalleyState = {}): CityStructureMeshes {
  const model = assembleSailingParts("grok-galley", grokGalleyParts(state));
  model.group.userData.shipState = {
    sails: state.sails ?? "set",
    oars: state.oars ?? "out",
    guns: state.guns ?? "run-out"
  };
  return model;
}
