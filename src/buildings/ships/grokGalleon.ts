import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { ModelKit, Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import type { GalleonState } from "./galleonArmament";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

/**
 * Late-16th-century race-built galleon, in meters. Bow is +X, waterline is Y=0.
 * Proportions follow Matthew Baker's rule in Fragments of Ancient English Shipwrightry:
 * breadth is the free choice, depth to the gun deck stays under half that breadth,
 * and keel length stays between twice and three times the breadth. The midship
 * section is a flat floor, a futtock sweep and tumblehome, fullest forward of
 * amidships. Not a named ship; interiors are omitted.
 */
export const GROK_GALLEON = {
  author: "Grok 4.7" as Author,
  name: "Galleon",
  length: 50,
  beam: 11,
  height: 36,
  draft: 3.8,
  guns: 26,
  windows: 14,
  note: "Illustrative race-built galleon. Razed forecastle, high stern, flat-floored tumblehome hull. Fore and main carry course and topsail only; the mizzen and bonaventure are lateen; a spritsail sets under the bowsprit. Beakhead, open stern gallery, quarter galleries, gilt lion and an unclaimed stern boss. Sixteen lower ports, eight waist ports and two stern chasers, plus shuttered stern and gallery lights. No topgallants and no wheel."
} as const;

const BEAM = GROK_GALLEON.beam / 2;
const DRAFT = GROK_GALLEON.draft;
const GUN_DECK = 1.35;
const WAIST_DECK = 3.45;
const FORE_DECK = 5.05;
const QUARTER_DECK = 6.35;
const POOP_DECK = 8.25;

export interface GrokGalleonState extends GalleonState {
  windows?: "open" | "closed";
}
export interface GrokMount {
  id: string;
  point: Position;
  normal: Position;
  right: Position;
  up: Position;
  width: number;
  height: number;
}

const COLORS: Partial<Record<string, number>> = {
  oak: 0x6b4630,
  wood: 0xc6a56c,
  dark: 0x161311,
  iron: 0x3a4042,
  white: 0xe6dcc4,
  green: 0x6a2a24,
  cloth: 0x8e1c28,
  leather: 0x5c4030,
  plaster: 0xead7ae,
  tile: 0x7a2822,
  straw: 0xc6a15a,
  water: 0x243640,
  earth: 0x2a211c
};

const rise = (from: number, to: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const sternX = (s: number) => -15.2 - 2.15 * s;
const stemX = (s: number) => 15.05 + 5.15 * s ** 1.35;
function deckLine(u: number) {
  return (
    WAIST_DECK +
    (FORE_DECK - WAIST_DECK) * rise(0.7, 0.82, u) +
    (QUARTER_DECK - WAIST_DECK) * rise(0.4, 0.3, u) +
    (POOP_DECK - QUARTER_DECK) * rise(0.2, 0.11, u)
  );
}
function sheer(u: number) {
  return deckLine(u) + 1.08 + 0.35 * rise(0.9, 1, u);
}
function keelDepth(u: number) {
  const bow = Math.max(0, (u - 0.76) / 0.24);
  const stern = Math.max(0, (0.14 - u) / 0.14);
  return DRAFT * (1 - 0.58 * bow ** 2 - 0.42 * stern ** 2);
}
function halfBreadth(u: number, s: number) {
  const bow = Math.max(0, (u - 0.64) / 0.36);
  const stern = Math.max(0, (0.4 - u) / 0.4);
  const tuck = 0.82 * (1 - s) ** 1.15;
  const plan = (1 - bow ** 1.6) * (1 - stern ** 1.2 * (0.22 + 0.78 * tuck));
  const endness = Math.min(1, bow * 0.85 + stern * 0.55);
  const flatS = 0.1 * (1 - 0.65 * endness);
  const flatW = 0.32 * (1 - 0.88 * endness);
  let section = 0.04;
  if (s > 0.02 && s < flatS) section = 0.04 + (flatW - 0.04) * ((s - 0.02) / Math.max(0.02, flatS - 0.02));
  else if (s >= flatS && s < 0.46) section = flatW + (1 - flatW) * (1 - (1 - (s - flatS) / (0.46 - flatS)) ** 2);
  else if (s >= 0.46) section = 1 - 0.24 * ((s - 0.46) / 0.54) ** 1.12;
  return Math.max(0.05, BEAM * plan * section);
}
function hullPoint(u: number, y: number, side = 1) {
  const s = THREE.MathUtils.clamp((y + keelDepth(u)) / (sheer(u) + keelDepth(u)), 0, 1);
  return new THREE.Vector3(THREE.MathUtils.lerp(sternX(s), stemX(s), u), y, side * halfBreadth(u, s));
}
function uAt(x: number, y: number) {
  let u = 0.5;
  for (let i = 0; i < 8; i++) {
    const s = THREE.MathUtils.clamp((y + keelDepth(u)) / (sheer(u) + keelDepth(u)), 0, 1);
    u = THREE.MathUtils.clamp((x - sternX(s)) / (stemX(s) - sternX(s)), 0, 1);
  }
  return u;
}
export function grokBreadth(x: number, y: number) {
  return hullPoint(uAt(x, y), y).z;
}
function sternFace(y: number) {
  const s = THREE.MathUtils.clamp((y + keelDepth(0)) / (sheer(0) + keelDepth(0)), 0, 1);
  return sternX(s);
}

function basisOf(normal: THREE.Vector3) {
  const n = normal.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(n);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = n.clone().cross(right).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
  return { right, up, normal: n, q };
}
function mountAt(id: string, point: THREE.Vector3, normal: THREE.Vector3, width: number, height: number): GrokMount {
  const { right, up, normal: n } = basisOf(normal);
  return {
    id,
    point: [point.x, point.y, point.z],
    normal: [n.x, n.y, n.z],
    right: [right.x, right.y, right.z],
    up: [up.x, up.y, up.z],
    width,
    height
  };
}
function onHull(x: number, y: number, side: number, id: string, width: number, height: number): GrokMount {
  const u = uAt(x, y);
  const point = hullPoint(u, y, side);
  const du = hullPoint(Math.min(0.985, u + 0.012), y, side).sub(hullPoint(Math.max(0.015, u - 0.012), y, side));
  const dy = hullPoint(u, y + 0.08, side).sub(hullPoint(u, Math.max(-DRAFT + 0.05, y - 0.08), side));
  const normal = du.cross(dy).normalize();
  if (normal.z * side < 0) normal.negate();
  return mountAt(id, point, normal, width, height);
}

const LOWER_X = [-11.2, -8.2, -5.2, -2.2, 0.8, 3.8, 6.8, 9.4];
const UPPER_X = [-1.6, 1.1, 3.6, 5.8];
let gunCache: GrokMount[] | null = null;
let windowCache: GrokMount[] | null = null;
export function grokGunportMounts(): readonly GrokMount[] {
  if (gunCache) return gunCache;
  const ports = [-1, 1].flatMap(side => [
    ...LOWER_X.map(x => onHull(x, 2.2, side, `broadside-${side}-${x}`, 1.02, 0.9)),
    ...UPPER_X.map(x => onHull(x, 3.95, side, `waist-${side}-${x}`, 0.78, 0.62))
  ]);
  for (const z of [-1.15, 1.15]) {
    const y = 2.35;
    ports.push(
      mountAt(`stern-${z}`, new THREE.Vector3(sternFace(y) - 0.04, y, z), new THREE.Vector3(-1, 0, 0), 0.86, 0.74)
    );
  }
  gunCache = ports;
  return ports;
}
export function grokWindowMounts(): readonly GrokMount[] {
  if (windowCache) return windowCache;
  const lights: GrokMount[] = [];
  const sternRow = (y: number, zs: number[], h: number, w: number, name: string) => {
    for (const z of zs)
      lights.push(
        mountAt(`${name}-${z}`, new THREE.Vector3(sternFace(y) - 0.06, y, z), new THREE.Vector3(-1, 0, 0), w, h)
      );
  };
  sternRow(7.15, [-2.16, -1.08, 0, 1.08, 2.16], 0.92, 0.72, "great-cabin");
  sternRow(8.7, [-1.15, 0, 1.15], 0.62, 0.58, "poop");
  for (const side of [-1, 1]) {
    const outer = side * (grokBreadth(-13.8, 7.05) + 0.72);
    for (const x of [-14.35, -13.15])
      lights.push(
        mountAt(
          `gallery-side-${side}-${x}`,
          new THREE.Vector3(x, 7.05, outer),
          new THREE.Vector3(0, 0, side),
          0.62,
          0.84
        )
      );
    lights.push(
      mountAt(
        `gallery-aft-${side}`,
        new THREE.Vector3(-15.15, 7.05, side * (grokBreadth(-15.1, 7.05) + 0.38)),
        new THREE.Vector3(-1, 0, 0),
        0.56,
        0.78
      )
    );
  }
  windowCache = lights;
  return lights;
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
function covers(sample: THREE.Vector3, mount: GrokMount, slack = 0.48) {
  const d = sample.clone().sub(new THREE.Vector3(...mount.point));
  const normal = new THREE.Vector3(...mount.normal);
  if (Math.abs(d.dot(normal)) > 0.55) return false;
  return (
    Math.abs(d.dot(new THREE.Vector3(...mount.right))) < mount.width * slack &&
    Math.abs(d.dot(new THREE.Vector3(...mount.up))) < mount.height * slack
  );
}
function place(
  kit: ModelKit,
  name: string,
  mount: GrokMount,
  local: THREE.Vector3,
  size: Position,
  surfaceName: "oak" | "tile" | "iron" | "dark" | "water" | "wood" | "straw" | "plaster",
  localQ = new THREE.Quaternion()
) {
  const mesh = kit.box(name, [0, 0, 0], size, surfaceName);
  const q = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...mount.right),
      new THREE.Vector3(...mount.up),
      new THREE.Vector3(...mount.normal)
    )
  );
  mesh.quaternion.copy(q).multiply(localQ);
  mesh.position.copy(local.applyQuaternion(q).add(new THREE.Vector3(...mount.point)));
  return mesh;
}

function hull() {
  const kit = kitOf("grok-galleon-hull");
  const sidePorts = grokGunportMounts().filter(port => !port.id.startsWith("stern"));
  const sternOpenings = [
    ...grokGunportMounts().filter(port => port.id.startsWith("stern")),
    ...grokWindowMounts().filter(light => light.id.startsWith("great-cabin") || light.id.startsWith("poop"))
  ];
  const U = 28;
  const S = 14;
  const pointAt = (u: number, s: number, side: number) => {
    const y = THREE.MathUtils.lerp(-keelDepth(u), sheer(u), s);
    return hullPoint(u, y, side);
  };
  for (const side of [-1, 1]) {
    const bands = {
      "hull-underwater": [] as number[],
      "hull-topsides": [] as number[]
    };
    const indexBands = {
      "hull-underwater": [] as number[],
      "hull-topsides": [] as number[]
    };
    const emit = (u0: number, u1: number, s0: number, s1: number, depth: number) => {
      const corners = [pointAt(u0, s0, side), pointAt(u1, s0, side), pointAt(u0, s1, side), pointAt(u1, s1, side)];
      const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
      const blocked = sidePorts.some(port => covers(centre, port, 0.5));
      const near = sidePorts.some(
        port => corners.some(corner => covers(corner, port, 0.55)) || covers(centre, port, 0.7)
      );
      if (near && !blocked && depth < 3) {
        const um = (u0 + u1) / 2;
        const sm = (s0 + s1) / 2;
        emit(u0, um, s0, sm, depth + 1);
        emit(um, u1, s0, sm, depth + 1);
        emit(u0, um, sm, s1, depth + 1);
        emit(um, u1, sm, s1, depth + 1);
        return;
      }
      if (blocked) return;
      const name = centre.y < 0.65 ? "hull-underwater" : "hull-topsides";
      const base = bands[name].length / 3;
      for (const corner of corners) bands[name].push(...corner.toArray());
      if (side > 0) indexBands[name].push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      else indexBands[name].push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    };
    for (let i = 0; i < U; i++) for (let j = 0; j < S; j++) emit(i / U, (i + 1) / U, j / S, (j + 1) / S, 0);
    surface(kit, "hull-underwater", bands["hull-underwater"], indexBands["hull-underwater"], "earth");
    surface(kit, "hull-topsides", bands["hull-topsides"], indexBands["hull-topsides"], "oak");
  }
  const transom = (material: "earth" | "oak" | "plaster", y0: number, y1: number) => {
    const rows = 6;
    const cols = 10;
    const points: number[] = [];
    const indices: number[] = [];
    const emit = (row0: number, row1: number, col0: number, col1: number, depth: number) => {
      const at = (row: number, col: number) => {
        const y = THREE.MathUtils.lerp(y0, y1, row / rows);
        const half = hullPoint(0, y).z * 0.98;
        return new THREE.Vector3(sternFace(y) - 0.02, y, THREE.MathUtils.lerp(-half, half, col / cols));
      };
      const corners = [at(row0, col0), at(row1, col0), at(row0, col1), at(row1, col1)];
      const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
      const blocked = sternOpenings.some(opening => covers(centre, opening, 0.5));
      const near = sternOpenings.some(
        opening => corners.some(corner => covers(corner, opening, 0.55)) || covers(centre, opening, 0.7)
      );
      if (near && !blocked && depth < 3 && row1 - row0 > 0.4 && col1 - col0 > 0.4) {
        const rm = (row0 + row1) / 2;
        const cm = (col0 + col1) / 2;
        emit(row0, rm, col0, cm, depth + 1);
        emit(rm, row1, col0, cm, depth + 1);
        emit(row0, rm, cm, col1, depth + 1);
        emit(rm, row1, cm, col1, depth + 1);
        return;
      }
      if (blocked) return;
      const base = points.length / 3;
      for (const corner of corners) points.push(...corner.toArray());
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    };
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) emit(row, row + 1, col, col + 1, 0);
    surface(kit, "transom", points, indices, material);
  };
  transom("earth", -keelDepth(0), 0.7);
  transom("oak", 0.7, 4.6);
  transom("plaster", 4.6, sheer(0));
  const stem: number[] = [];
  const stemIndex: number[] = [];
  for (let j = 0; j <= S; j++) {
    const y = THREE.MathUtils.lerp(-keelDepth(1), sheer(1), j / S);
    stem.push(...hullPoint(1, y, -1).toArray(), ...hullPoint(1, y, 1).toArray());
  }
  for (let j = 0; j < S; j++) stemIndex.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
  surface(kit, "stem", stem, stemIndex, "oak");
  const seams: [Position, Position][] = [];
  for (const s of [0.08, 0.2, 0.34, 0.5, 0.66, 0.82])
    for (let i = 0; i < 28; i++) {
      const yAt = (u: number) => THREE.MathUtils.lerp(-keelDepth(u), sheer(u), s);
      for (const side of [-1, 1])
        seams.push([P(hullPoint(i / U, yAt(i / U), side)), P(hullPoint((i + 1) / U, yAt((i + 1) / U), side))]);
    }
  kit.lines("hull-plank-seams", seams, 0x4a3426);
  for (const y of [0.35, 1.55, 3.15])
    for (const side of [-1, 1])
      for (let i = 0; i < 28; i++) {
        const a = hullPoint(i / 28, y, side);
        const b = hullPoint((i + 1) / 28, y, side);
        if (a.distanceTo(b) < 0.05) continue;
        kit.beam("wale", P(a), P(b), y === 1.55 ? 0.22 : 0.16, "tile", true);
      }
  const rudderX = sternFace(-0.2) - 0.45;
  kit.box("rudder", [rudderX, -0.15, 0], [0.22, 4.4, 0.18], "oak");
  kit.beam("rudder-stock", [rudderX, -1.6, 0], [rudderX + 0.15, 4.3, 0], 0.16, "oak", true);
  for (const y of [-1.3, 0.2, 1.5]) kit.box("rudder-pintle", [rudderX + 0.08, y, 0], [0.16, 0.08, 0.28], "iron");
  return kit.finish();
}

function deckStrip(kit: SailingKit, name: string, x0: number, x1: number, y: number, inset = 0.35) {
  const steps = 10;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    const half = Math.max(0.35, grokBreadth(x, y) - inset);
    points.push(x, y, -half, x, y, half);
    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  surface(kit, name, points, indices, "wood");
  const seams: [Position, Position][] = [];
  for (let t = -0.7; t <= 0.7; t += 0.18)
    for (let i = 0; i < steps; i++) {
      const x = THREE.MathUtils.lerp(x0, x1, i / steps);
      const nx = THREE.MathUtils.lerp(x0, x1, (i + 1) / steps);
      seams.push([
        [x, y + 0.01, t * Math.max(0.35, grokBreadth(x, y) - inset)],
        [nx, y + 0.01, t * Math.max(0.35, grokBreadth(nx, y) - inset)]
      ]);
    }
  kit.lines(`${name}-seams`, seams, 0x8a6840);
}
function rail(kit: SailingKit, x0: number, x1: number, y: number) {
  const steps = 8;
  for (const side of [-1, 1])
    for (let i = 0; i < steps; i++) {
      const x = THREE.MathUtils.lerp(x0, x1, i / steps);
      const nx = THREE.MathUtils.lerp(x0, x1, (i + 1) / steps);
      const z = side * Math.max(0.4, grokBreadth(x, y) - 0.2);
      const nz = side * Math.max(0.4, grokBreadth(nx, y) - 0.2);
      kit.beam("cap-rail", [x, y + 0.95, z], [nx, y + 0.95, nz], 0.1, "straw", true);
      kit.box("rail-post", [(x + nx) / 2, y + 0.5, (z + nz) / 2], [0.08, 0.9, 0.08], "oak");
    }
}
function bulkhead(kit: SailingKit, x: number, y0: number, y1: number) {
  const half = Math.max(0.8, grokBreadth(x, (y0 + y1) / 2) - 0.45);
  const door = 0.85;
  kit.box("bulkhead", [x, (y0 + y1) / 2, -(half + door / 2) / 2], [0.14, y1 - y0, half - door / 2], "oak");
  kit.box("bulkhead", [x, (y0 + y1) / 2, (half + door / 2) / 2], [0.14, y1 - y0, half - door / 2], "oak");
  kit.box("door-lintel", [x, y1 - 0.35, 0], [0.14, 0.7, door], "oak");
}
function decks() {
  const kit = kitOf("grok-galleon-decks");
  deckStrip(kit, "gun-deck", -13.5, 12.5, GUN_DECK, 0.15);
  deckStrip(kit, "main-deck", -4.6, 8.4, WAIST_DECK, 0.28);
  deckStrip(kit, "forecastle-deck", 8.6, 15.4, FORE_DECK, 0.3);
  deckStrip(kit, "quarterdeck", -14.6, -4.8, QUARTER_DECK, 0.32);
  deckStrip(kit, "poop-deck", -16.2, -12.2, POOP_DECK, 0.4);
  rail(kit, -4.4, 8.2, WAIST_DECK);
  rail(kit, 8.8, 15.2, FORE_DECK);
  rail(kit, -14.4, -5, QUARTER_DECK);
  rail(kit, -16, -12.4, POOP_DECK);
  bulkhead(kit, 8.55, WAIST_DECK, FORE_DECK + 0.9);
  bulkhead(kit, -4.7, WAIST_DECK, QUARTER_DECK + 0.9);
  bulkhead(kit, -12.3, QUARTER_DECK, POOP_DECK + 0.8);
  const beak: number[] = [16.2, 5.35, -1.7, 16.2, 5.35, 1.7, 23.6, 6.15, -0.45, 23.6, 6.15, 0.45];
  surface(kit, "beakhead-grating", beak, [0, 1, 2, 1, 3, 2], "wood");
  for (const side of [-1, 1]) {
    kit.beam("headrail", [16.4, 6.15, side * 1.65], [24.2, 6.7, side * 0.4], 0.08, "straw", true);
    kit.beam("beakhead-knee", [22.4, 5.7, side * 0.32], [14.2, 1.85, side * 0.28], 0.18, "oak", true);
  }
  return kit.finish();
}

function fittings() {
  const kit = kitOf("grok-galleon-fittings");
  kit.beam("windlass", [7.4, WAIST_DECK + 0.55, -1.05], [7.4, WAIST_DECK + 0.55, 1.05], 0.32, "wood", true);
  for (const z of [-1.15, 1.15]) kit.box("windlass-bitts", [7.4, WAIST_DECK + 0.45, z], [0.18, 0.9, 0.16], "oak");
  kit.box("ship-boat", [-1.4, WAIST_DECK + 0.32, 0], [5.4, 0.42, 1.45], "oak");
  kit.box("ship-boat-thwart", [-1.4, WAIST_DECK + 0.55, 0], [0.12, 0.08, 1.3], "wood");
  const bowZ = grokBreadth(12.2, 3.2) + 0.15;
  kit.beam("anchor-shank", [12.4, 4.5, bowZ], [11.6, 1.7, bowZ + 0.35], 0.11, "iron", true);
  kit.beam("anchor-stock", [12.45, 4.45, bowZ - 0.45], [12.45, 4.45, bowZ + 0.45], 0.09, "wood", true);
  kit.box("anchor-fluke", [11.55, 1.55, bowZ + 0.35], [0.28, 0.12, 0.36], "iron");
  for (const [x, y0, y1] of [
    [7.8, WAIST_DECK, FORE_DECK],
    [-5.5, WAIST_DECK, QUARTER_DECK]
  ] as const) {
    kit.beam("ladder-rail", [x, y0, 0.55], [x - 0.15, y1, 0.55], 0.06, "oak", true);
    kit.beam("ladder-rail", [x, y0, 0.95], [x - 0.15, y1, 0.95], 0.06, "oak", true);
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      kit.box(
        "ladder-tread",
        [THREE.MathUtils.lerp(x, x - 0.15, t), THREE.MathUtils.lerp(y0, y1, t), 0.75],
        [0.28, 0.05, 0.4],
        "wood"
      );
    }
  }
  kit.sphere("figurehead", [25.15, 6.35, 0], [0.42, 0.34, 0.3], "straw");
  kit.box("figurehead-snout", [25.6, 6.18, 0], [0.5, 0.14, 0.16], "straw");
  for (const z of [-0.16, 0.16]) kit.sphere("figurehead-ear", [24.95, 6.58, z], [0.08, 0.14, 0.06], "straw");
  kit.box("figurehead-mane", [24.75, 6.4, 0], [0.22, 0.42, 0.34], "straw");
  const galleryY = QUARTER_DECK;
  for (const side of [-1, 1]) {
    const inner = side * grokBreadth(-13.8, galleryY);
    const outer = side * (Math.abs(inner) + 0.85);
    kit.box(
      "quarter-gallery-floor",
      [-13.8, galleryY, (inner + outer) / 2],
      [2.5, 0.12, Math.abs(outer - inner)],
      "oak"
    );
    kit.box(
      "quarter-gallery-roof",
      [-13.8, galleryY + 1.7, (inner + outer) / 2],
      [2.6, 0.1, Math.abs(outer - inner) + 0.08],
      "plaster"
    );
    kit.beam(
      "gallery-bracket",
      [-14.8, galleryY, outer],
      [-15.3, galleryY - 1.5, side * grokBreadth(-15.2, galleryY - 1.2)],
      0.1,
      "straw",
      true
    );
    kit.beam(
      "gallery-bracket",
      [-12.7, galleryY, outer],
      [-12.4, galleryY - 1.4, side * grokBreadth(-12.4, galleryY - 1.1)],
      0.1,
      "straw",
      true
    );
  }
  const back = sternFace(QUARTER_DECK) - 1.15;
  const half = Math.min(3.3, hullPoint(0, QUARTER_DECK).z);
  kit.box(
    "stern-gallery-deck",
    [(sternFace(QUARTER_DECK) + back) / 2, QUARTER_DECK, 0],
    [Math.abs(back - sternFace(QUARTER_DECK)), 0.12, half * 2],
    "wood"
  );
  for (const z of [-half, -half / 2, 0, half / 2, half])
    kit.beam("stern-gallery-post", [back, QUARTER_DECK, z], [back, QUARTER_DECK + 0.9, z], 0.06, "straw", true);
  kit.beam(
    "stern-gallery-rail",
    [back, QUARTER_DECK + 0.9, -half],
    [back, QUARTER_DECK + 0.9, half],
    0.07,
    "straw",
    true
  );
  kit.box("stern-boss", [sternFace(8.05) - 0.16, 8.05, 0], [0.12, 1.15, 1.15], "tile");
  kit.sphere("stern-boss-gilt", [sternFace(8.05) - 0.24, 8.05, 0], [0.08, 0.32, 0.32], "straw");
  for (const z of [-1.5, 0, 1.5]) {
    const base = new THREE.Vector3(sternFace(sheer(0)) - 0.2, sheer(0) + 0.15, z * 0.85);
    kit.beam("lantern-stem", P(base), P(base.clone().add(new THREE.Vector3(-0.15, 0.7, 0))), 0.05, "iron", true);
    kit.sphere(
      "lantern",
      P(base.clone().add(new THREE.Vector3(-0.15, 1.05, 0))),
      z === 0 ? [0.22, 0.28, 0.22] : [0.16, 0.2, 0.16],
      "straw"
    );
  }
  for (const side of [-1, 1]) {
    const z = side * (grokBreadth(11.5, FORE_DECK) - 0.35);
    kit.beam("swivel-stock", [11.6, FORE_DECK + 0.95, z], [11.6, FORE_DECK + 1.25, z], 0.05, "iron", true);
    kit.beam("swivel", [11.35, FORE_DECK + 1.25, z], [11.9, FORE_DECK + 1.25, z], 0.05, "iron", true);
  }
  return kit.finish();
}

interface SquareSpec {
  id: string;
  x: number;
  yard: number;
  foot: number;
  headHalf: number;
  footHalf: number;
  belly: number;
  bundle: number;
  sheet: Position;
}
interface LateenSpec {
  id: string;
  heel: Position;
  peak: Position;
  clew: Position;
  bundle: number;
}
const SQUARES: SquareSpec[] = [
  {
    id: "spritsail",
    x: 22.4,
    yard: 7.55,
    foot: 4.7,
    headHalf: 3.5,
    footHalf: 4.3,
    belly: 0.7,
    bundle: 0.2,
    sheet: [18.5, 5.5, 0]
  },
  {
    id: "fore-course",
    x: 10.05,
    yard: 16.4,
    foot: 6.2,
    headHalf: 7.4,
    footHalf: 8.6,
    belly: 1.15,
    bundle: 0.32,
    sheet: [7.2, WAIST_DECK + 0.4, 0]
  },
  {
    id: "fore-topsail",
    x: 10.05,
    yard: 24.6,
    foot: 17.2,
    headHalf: 4.6,
    footHalf: 5.6,
    belly: 0.7,
    bundle: 0.2,
    sheet: [8.4, 14.5, 0]
  },
  {
    id: "main-course",
    x: -0.15,
    yard: 18.2,
    foot: 5.6,
    headHalf: 9.4,
    footHalf: 11,
    belly: 1.45,
    bundle: 0.38,
    sheet: [-3.2, WAIST_DECK + 0.4, 0]
  },
  {
    id: "main-topsail",
    x: -0.15,
    yard: 29.2,
    foot: 19.2,
    headHalf: 5.8,
    footHalf: 7,
    belly: 0.85,
    bundle: 0.24,
    sheet: [-1.8, 16.5, 0]
  }
];
const LATEENS: LateenSpec[] = [
  { id: "mizzen-lateen", heel: [-6.6, 8.4, -0.2], peak: [-13.4, 16.4, -0.35], clew: [-12.2, 6.5, -1.15], bundle: 0.22 },
  {
    id: "bonaventure-lateen",
    heel: [-11.5, 7.8, 0.2],
    peak: [-16.6, 12.4, 0.3],
    clew: [-15.8, 6.7, 1.05],
    bundle: 0.16
  }
];
const MASTS = [
  { x: 9.6, head: 19.6, top: 27.2, radius: 0.28 },
  { x: -0.6, head: 22.6, top: 33.6, radius: 0.34 },
  { x: -9.2, head: 16.4, radius: 0.22 },
  { x: -13.8, head: 12.4, radius: 0.16 }
] as const;

function spars() {
  const kit = kitOf("grok-galleon-spars");
  for (const mast of MASTS) {
    kit.cylinder(
      "mast",
      [mast.x, mast.head / 2 - 0.4, 0],
      mast.radius,
      mast.head + 0.8,
      "wood",
      mast.radius * 0.72,
      12
    );
    kit.cylinder("mast-top", [mast.x, mast.head + 0.15, 0], mast.radius * 2.4, 0.16, "oak", mast.radius * 2.4, 12);
    if ("top" in mast && mast.top) {
      kit.cylinder(
        "topmast",
        [mast.x, (mast.head + mast.top) / 2, 0],
        mast.radius * 0.62,
        mast.top - mast.head,
        "wood",
        mast.radius * 0.4,
        10
      );
      kit.sphere("truck", [mast.x, mast.top + 0.15, 0], [0.12, 0.12, 0.12], "straw");
    }
  }
  for (const sail of SQUARES) {
    kit.beam(
      "yard",
      [sail.x, sail.yard, -sail.headHalf],
      [sail.x, sail.yard, sail.headHalf],
      sail.id.includes("topsail") ? 0.14 : 0.2,
      "wood",
      true
    );
    const mast = MASTS.find(entry => Math.abs(entry.x - sail.x) < 1.2);
    if (mast) kit.beam("parrel", [mast.x, sail.yard, 0], [sail.x, sail.yard, 0], 0.16, "oak", true);
  }
  const heel = new THREE.Vector3(12.6, 5.7, 0);
  const tip = new THREE.Vector3(29.2, 10.6, 0);
  kit.beam("bowsprit", P(heel), P(tip), 0.28, "wood", true);
  const sprit = SQUARES[0];
  kit.beam(
    "spritsail-yard",
    [sprit.x, sprit.yard, -sprit.headHalf],
    [sprit.x, sprit.yard, sprit.headHalf],
    0.12,
    "wood",
    true
  );
  kit.beam("spritsail-parrel", [sprit.x, sprit.yard + 0.45, 0], [sprit.x, sprit.yard, 0], 0.1, "oak", true);
  for (const lateen of LATEENS) kit.beam("lateen-yard", lateen.heel, lateen.peak, 0.14, "wood", true);
  return kit.finish();
}

function rigging() {
  const kit = kitOf("grok-galleon-rigging");
  const lines: [Position, Position][] = [];
  const stay = (a: THREE.Vector3, b: THREE.Vector3) => lines.push([P(a), P(b)]);
  const bowspritTip = new THREE.Vector3(29.2, 10.6, 0);
  stay(bowspritTip, new THREE.Vector3(MASTS[0].x, MASTS[0].head - 0.4, 0));
  stay(new THREE.Vector3(16.8, 3.2, 0), bowspritTip.clone().lerp(new THREE.Vector3(12.6, 5.7, 0), 0.45));
  stay(new THREE.Vector3(MASTS[0].x, MASTS[0].head - 0.3, 0), new THREE.Vector3(MASTS[1].x, 8, 0));
  stay(new THREE.Vector3(MASTS[1].x, MASTS[1].head - 0.3, 0), new THREE.Vector3(MASTS[0].x, MASTS[0].head - 1.2, 0));
  stay(new THREE.Vector3(MASTS[2].x, MASTS[2].head - 0.2, 0), new THREE.Vector3(MASTS[1].x, 10, 0));
  stay(new THREE.Vector3(MASTS[3].x, MASTS[3].head - 0.2, 0), new THREE.Vector3(MASTS[2].x, 8, 0));
  for (const sail of SQUARES) {
    const mast = MASTS.find(entry => Math.abs(entry.x - sail.x) < 1.2);
    const cap = mast && "top" in mast && sail.id.includes("topsail") ? mast.top : (mast?.head ?? sail.yard + 2);
    for (const side of [-1, 1]) {
      stay(
        new THREE.Vector3(sail.x, sail.yard, side * sail.headHalf),
        new THREE.Vector3(sail.x, cap - 0.2, side * 0.15)
      );
      stay(
        new THREE.Vector3(sail.x, sail.yard, side * sail.headHalf),
        new THREE.Vector3(sail.x - 3.2, Math.max(WAIST_DECK + 1, sail.yard - 6), side * 0.8)
      );
    }
  }
  for (const mast of MASTS) {
    for (const side of [-1, 1]) {
      const footY = Math.min(WAIST_DECK + 0.3, 3.6);
      const hullZ = grokBreadth(mast.x, footY);
      const channelZ = side * (hullZ + 0.62);
      kit.box("channel", [mast.x, footY, side * (hullZ + 0.28)], [1.6, 0.1, 0.7], "oak");
      const count = mast.radius > 0.25 ? 4 : 3;
      const heads = new THREE.Vector3(mast.x, mast.head - 0.3, side * 0.12);
      const feet: THREE.Vector3[] = [];
      for (let i = 0; i < count; i++) {
        const foot = new THREE.Vector3(
          mast.x + (i - (count - 1) / 2) * 0.16,
          footY + 0.15,
          channelZ + side * (i - (count - 1) / 2) * 0.08
        );
        feet.push(foot);
        stay(foot, heads);
        kit.sphere("deadeye", P(foot), [0.07, 0.07, 0.07], "dark");
        kit.beam("chainplate", P(foot), [mast.x, footY - 0.85, side * hullZ], 0.04, "iron", true);
      }
      if (mast.radius > 0.2)
        for (let t = 0.18; t <= 0.72; t += 0.09)
          for (let i = 0; i < count - 1; i++) stay(feet[i].clone().lerp(heads, t), feet[i + 1].clone().lerp(heads, t));
    }
  }
  kit.lines("standing-rigging", lines, 0x3a322c);
  return kit.finish();
}

function squareCloth(spec: SquareSpec, furled: boolean) {
  const kit = kitOf(spec.id);
  if (furled) {
    addSailBundle(
      kit,
      "furled-sail",
      [spec.x, spec.yard, -spec.headHalf],
      [spec.x, spec.yard, spec.headHalf],
      spec.bundle,
      true
    );
    return kit.finish();
  }
  const rows = 8;
  const cols = 12;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = THREE.MathUtils.lerp(spec.yard - 0.05, spec.foot, t);
    const half = THREE.MathUtils.lerp(spec.headHalf * 0.96, spec.footHalf, t);
    const belly = Math.sin(Math.PI * t);
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const edge = Math.sin(Math.PI * u);
      points.push(spec.x - spec.belly * belly * edge, y, THREE.MathUtils.lerp(-half, half, u));
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
    }
  surface(kit, "square-sail", points, indices, "white");
  const seams: [Position, Position][] = [];
  for (let i = 2; i < rows; i += 2) {
    const row = i * (cols + 1);
    seams.push([
      [points[row * 3], points[row * 3 + 1], points[row * 3 + 2]],
      [points[(row + cols) * 3], points[(row + cols) * 3 + 1], points[(row + cols) * 3 + 2]]
    ]);
  }
  kit.lines("sail-seam", seams, 0xcbb992);
  kit.lines(
    "sheet",
    [
      [
        [spec.x - spec.belly * 0.2, spec.foot, -spec.footHalf],
        [spec.sheet[0], spec.sheet[1], -Math.abs(spec.sheet[2]) - 0.6]
      ],
      [
        [spec.x - spec.belly * 0.2, spec.foot, spec.footHalf],
        [spec.sheet[0], spec.sheet[1], Math.abs(spec.sheet[2]) + 0.6]
      ]
    ],
    0x6a5844
  );
  return kit.finish();
}
function lateenCloth(spec: LateenSpec, furled: boolean) {
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
  const rows = 7;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const head = heel.clone().lerp(peak, t);
    const cols = 6;
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const belly = Math.sin(Math.PI * t) * Math.sin(Math.PI * u) * 0.55;
      points.push(...head.clone().lerp(clew, u).addScaledVector(side, belly).toArray());
    }
    if (i < rows)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j;
        indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
      }
  }
  surface(kit, "lateen-sail", points, indices, "white");
  kit.lines("sheet", [[spec.clew, [spec.clew[0] - 0.8, QUARTER_DECK + 0.5, spec.clew[2] * 0.4]]], 0x6a5844);
  return kit.finish();
}

function flagCloth(
  kit: SailingKit,
  name: string,
  origin: THREE.Vector3,
  length: number,
  hoist: number,
  material: Surface
) {
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const droop = t * t * hoist * 0.35;
    points.push(origin.x - t * length, origin.y + hoist / 2 - droop, origin.z);
    points.push(origin.x - t * length, origin.y - hoist / 2 - droop, origin.z);
    if (i < 4) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  surface(kit, name, points, indices, material);
}
function flags() {
  const kit = kitOf("grok-galleon-flags");
  for (const mast of MASTS) {
    const y = "top" in mast && mast.top ? mast.top : mast.head;
    kit.beam("pennant-staff", [mast.x, y, 0], [mast.x, y + 0.8, 0], 0.03, "wood", true);
    flagCloth(kit, "pennant", new THREE.Vector3(mast.x, y + 0.7, 0), mast === MASTS[1] ? 3.4 : 2.2, 0.28, "cloth");
  }
  const staff = new THREE.Vector3(sternFace(POOP_DECK) - 0.3, POOP_DECK + 1.1, 0);
  kit.beam("ensign-staff", P(staff), P(staff.clone().add(new THREE.Vector3(-0.2, 1.6, 0))), 0.04, "wood", true);
  flagCloth(kit, "ensign", staff.clone().add(new THREE.Vector3(-0.2, 1.45, 0)), 2.4, 1.15, "cloth");
  return kit.finish();
}

function gunFrames() {
  const kit = kitOf("grok-galleon-gun-frames");
  for (const port of grokGunportMounts()) {
    const w = port.width;
    const h = port.height;
    for (const side of [-1, 1]) {
      place(kit, "port-jamb", port, new THREE.Vector3(side * (w / 2 + 0.06), 0, 0.02), [0.1, h + 0.16, 0.22], "oak");
      place(kit, "port-sill", port, new THREE.Vector3(0, side * (h / 2 + 0.06), 0.02), [w + 0.12, 0.1, 0.22], "oak");
    }
    place(kit, "port-chamber", port, new THREE.Vector3(0, 0, -0.55), [w * 0.92, h * 0.92, 0.7], "dark");
  }
  return kit.finish();
}
function armament(closed: boolean) {
  const kit = kitOf("grok-galleon-armament");
  for (const port of grokGunportMounts()) {
    const lower = port.id.startsWith("broadside");
    const w = port.width + 0.16;
    const h = port.height + 0.16;
    const hinge = new THREE.Vector3(0, h / 2, 0.14);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), closed ? 0 : -Math.PI * 0.52);
    const centre = new THREE.Vector3(0, -h / 2, 0).applyQuaternion(rotation).add(hinge);
    place(kit, closed ? "gunport-lid-closed" : "gunport-lid-open", port, centre, [w, h, 0.08], "tile", rotation);
    for (const x of [-w * 0.28, w * 0.28]) {
      const at = new THREE.Vector3(x, -h * 0.42, 0.055).applyQuaternion(rotation).add(hinge);
      place(kit, "lid-strap", port, at, [0.045, h * 0.78, 0.02], "iron", rotation);
    }
    const length = lower ? 2.05 : 1.45;
    const radius = lower ? 0.16 : 0.11;
    const tip = closed ? -0.38 : lower ? 1.05 : 0.72;
    const profile = [
      [0, 0],
      [radius, 0],
      [radius * 0.78, length * 0.72],
      [radius * 0.9, length - 0.08],
      [radius * 0.55, length - 0.08],
      [radius * 0.5, length * 0.2],
      [0, length * 0.2]
    ];
    const barrel = kit.add(
      closed ? "cannon-stowed" : "cannon-run-out",
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        12
      ),
      "iron"
    );
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...port.right),
        new THREE.Vector3(...port.up),
        new THREE.Vector3(...port.normal)
      )
    );
    barrel.quaternion
      .copy(q)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    barrel.position.copy(
      new THREE.Vector3(0, -0.05, tip - length).applyQuaternion(q).add(new THREE.Vector3(...port.point))
    );
    const carriageZ = closed ? -0.95 : -0.4;
    place(kit, "gun-carriage", port, new THREE.Vector3(0, -0.28, carriageZ), [0.55, 0.16, lower ? 0.7 : 0.55], "wood");
    for (const side of [-1, 1])
      for (const dz of [-0.18, 0.18]) {
        const wheel = place(
          kit,
          "carriage-wheel",
          port,
          new THREE.Vector3(side * 0.3, -0.38, carriageZ + dz),
          [0.16, 0.16, 0.08],
          "dark"
        );
        wheel.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      }
  }
  return kit.finish();
}

function windowFrames() {
  const kit = kitOf("grok-galleon-window-frames");
  for (const light of grokWindowMounts()) {
    const w = light.width;
    const h = light.height;
    for (const side of [-1, 1]) {
      place(
        kit,
        "window-jamb",
        light,
        new THREE.Vector3(side * (w / 2 + 0.045), 0, 0.03),
        [0.07, h + 0.12, 0.16],
        "plaster"
      );
      place(
        kit,
        "window-sill",
        light,
        new THREE.Vector3(0, side * (h / 2 + 0.045), 0.03),
        [w + 0.1, 0.07, 0.16],
        "plaster"
      );
    }
    place(
      kit,
      "window-reveal",
      light,
      new THREE.Vector3(0, 0, -0.28),
      [light.width * 0.9, light.height * 0.9, 0.32],
      "dark"
    );
  }
  return kit.finish();
}
function windowLeaves(closed: boolean) {
  const kit = kitOf("grok-galleon-window-leaves");
  for (const light of grokWindowMounts()) {
    const w = light.width + 0.1;
    const h = light.height + 0.1;
    const hinge = new THREE.Vector3(light.width / 2 + 0.02, 0, 0.08);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), closed ? 0 : 2.85);
    const centre = new THREE.Vector3(-w / 2, 0, 0.03).applyQuaternion(rotation).add(hinge);
    place(kit, closed ? "window-shutter-closed" : "window-shutter-open", light, centre, [w, h, 0.05], "oak", rotation);
    place(
      kit,
      "shutter-strap",
      light,
      new THREE.Vector3(-w * 0.35, 0, 0.06).applyQuaternion(rotation).add(hinge),
      [w * 0.55, 0.045, 0.02],
      "iron",
      rotation
    );
    if (!closed) {
      place(
        kit,
        "window-glass",
        light,
        new THREE.Vector3(0, 0, -0.04),
        [light.width * 0.88, light.height * 0.88, 0.04],
        "water"
      );
      place(kit, "window-mullion", light, new THREE.Vector3(0, 0, -0.01), [0.035, light.height * 0.88, 0.05], "straw");
    }
  }
  return kit.finish();
}

const PARTS: readonly { id: string; role: string; create: (state: GrokGalleonState) => CityStructureMeshes }[] = [
  { id: "hull", role: "Hull, wales and rudder", create: () => hull() },
  { id: "decks", role: "Decks, beakhead and rails", create: () => decks() },
  { id: "fittings", role: "Deck fittings, galleries and lanterns", create: () => fittings() },
  { id: "spars", role: "Masts, yards and bowsprit", create: () => spars() },
  { id: "rigging", role: "Standing rigging", create: () => rigging() },
  ...SQUARES.map(spec => ({
    id: spec.id,
    role: spec.id.replaceAll("-", " "),
    create: (state: GrokGalleonState) => squareCloth(spec, state.sails === "furled")
  })),
  ...LATEENS.map(spec => ({
    id: spec.id,
    role: spec.id.replaceAll("-", " "),
    create: (state: GrokGalleonState) => lateenCloth(spec, state.sails === "furled")
  })),
  { id: "flags", role: "Pennants and stern flag", create: () => flags() },
  { id: "gun-frames", role: "Gunport frames and chambers", create: () => gunFrames() },
  { id: "armament", role: "Gunport lids and guns", create: state => armament(state.gunports === "closed") },
  { id: "window-frames", role: "Window frames", create: () => windowFrames() },
  { id: "window-leaves", role: "Window glass and shutters", create: state => windowLeaves(state.windows === "closed") }
];

export function grokGalleonParts(state: GrokGalleonState = {}): readonly ModelPartFactory[] {
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality: "high" as const,
    author: GROK_GALLEON.author,
    create: () => part.create(state)
  }));
}

/** High-only assembly. Omitted state is sails set, gunports open and windows open. */
export function createGrokGalleon(state: GrokGalleonState = {}): CityStructureMeshes {
  const model = assembleSailingParts("grok-galleon", grokGalleonParts(state));
  model.group.userData.gunports = grokGunportMounts();
  model.group.userData.windows = grokWindowMounts();
  model.group.userData.shipState = {
    sails: state.sails ?? "set",
    gunports: state.gunports ?? "open",
    windows: state.windows ?? "open"
  };
  return model;
}
