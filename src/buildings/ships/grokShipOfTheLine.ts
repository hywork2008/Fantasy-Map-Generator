import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { ModelKit, Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import type { GalleonState } from "./galleonArmament";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

/**
 * First-rate ship of the line in the Trafalgar establishment of HMS Victory, in meters.
 * Bow is +X, waterline is Y=0. As-built figures used for the hull: gun deck 56.7 m,
 * keel 46.5 m, beam 15.7 m, depth in hold 6.55 m. The published truck height is 62.5 m
 * above the waterline. The modelled waterline is illustrative. The 1803 closing of the
 * stern galleries and the beakhead kept at Trafalgar are followed. Royals, studdingsails
 * and the hold are omitted. Flags are plain cloth, and the figurehead is a blank gilt
 * group rather than a royal achievement.
 */
export const GROK_SHIP_OF_THE_LINE = {
  author: "Grok 4.7" as Author,
  name: "Ship of the line",
  length: 80,
  beam: 15.7,
  height: 62.5,
  draft: 6.4,
  guns: 104,
  windows: 23,
  source: "https://en.wikipedia.org/wiki/HMS_Victory",
  note: "First-rate ship of the line after HMS Victory at Trafalgar: three gun decks, black and ochre chequer, beakhead, closed stern, spanker and a wheel. 104 guns, with the 12 quarterdeck 12-pounders shown as 10 broadside ports and 2 stern chase ports. Not a lines plan; interiors are omitted."
} as const;

const BEAM = GROK_SHIP_OF_THE_LINE.beam / 2;
const DRAFT = GROK_SHIP_OF_THE_LINE.draft;
const UPPER_DECK = 5.45;
const FORE_DECK = 7.72;
const QUARTER_DECK = 7.9;
const POOP_DECK = 9.75;
const LOWER_Y = 1.9;
const MIDDLE_Y = 4.05;
const UPPER_Y = 6.2;
const QUARTER_Y = 8.55;
const FORE_Y = 8.35;

export interface GrokShipOfTheLineState extends GalleonState {
  windows?: "open" | "closed";
}
export interface LineMount {
  id: string;
  point: Position;
  normal: Position;
  right: Position;
  up: Position;
  width: number;
  height: number;
}

const COLORS: Partial<Record<string, number>> = {
  oak: 0x6a4630,
  wood: 0xc6a56c,
  dark: 0x1a1814,
  iron: 0x3e4448,
  white: 0xe7e1d2,
  green: 0x2f4a3c,
  cloth: 0x9e1c2c,
  leather: 0x5c4030,
  plaster: 0xe4d3b0,
  tile: 0xd2a64a,
  straw: 0xe1b84a,
  water: 0x9ec4ce,
  earth: 0x6f7d62
};

const rise = (from: number, to: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const sternX = (s: number) => -24.8 - 2.05 * s;
const stemX = (s: number) => 22.2 + 6.1 * s ** 1.22;
function sheer(u: number) {
  return 7.75 + 4.55 * rise(0.56, 0.02, u) + 2.85 * rise(0.66, 1, u) + 1.35 * rise(0.55, 0.74, u);
}
function keelDepth(u: number) {
  const bow = Math.max(0, (u - 0.8) / 0.2);
  const stern = Math.max(0, (0.14 - u) / 0.14);
  return DRAFT * (1 - 0.62 * bow ** 2 - 0.28 * stern ** 2);
}
function halfBreadth(u: number, s: number) {
  const bow = Math.max(0, (u - 0.64) / 0.36);
  const stern = Math.max(0, (0.22 - u) / 0.22);
  const plan = (1 - bow ** 1.75) * (1 - 0.42 * stern ** 1.4);
  let section = 0.015;
  if (s < 0.05) section = 0.015 + 0.12 * (s / 0.05);
  else if (s < 0.4) section = 0.135 + 0.865 * (1 - (1 - (s - 0.05) / 0.35) ** 2);
  else section = 1 - 0.2 * ((s - 0.4) / 0.6) ** 1.2;
  return Math.max(0.06, BEAM * plan * section);
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
export function shipOfTheLinePoint(x: number, y: number, side = 1) {
  return hullPoint(uAt(x, y), y, side);
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
  return { right, up, normal: n };
}
function mountAt(id: string, point: THREE.Vector3, normal: THREE.Vector3, width: number, height: number): LineMount {
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
function onHull(x: number, y: number, side: number, id: string, width: number, height: number): LineMount {
  const u = uAt(x, y);
  const point = hullPoint(u, y, side);
  const du = hullPoint(Math.min(0.99, u + 0.01), y, side).sub(hullPoint(Math.max(0.01, u - 0.01), y, side));
  const dy = hullPoint(u, y + 0.08, side).sub(hullPoint(u, Math.max(-DRAFT + 0.05, y - 0.08), side));
  const normal = du.cross(dy).normalize();
  if (normal.z * side < 0) normal.negate();
  return mountAt(id, point, normal, width, height);
}
function spaced(start: number, end: number, count: number) {
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
}

const LOWER_X = spaced(-17.2, 18.2, 15);
const MIDDLE_X = spaced(-15.6, 16.6, 14);
const UPPER_X = spaced(-16.2, 17.4, 15);
const QUARTER_X = spaced(-20.2, -8.4, 5);
let gunCache: LineMount[] | null = null;
let windowCache: LineMount[] | null = null;
export function shipOfTheLineGunports(): readonly LineMount[] {
  if (gunCache) return gunCache;
  const ports = [-1, 1].flatMap(side => [
    ...LOWER_X.map((x, index) => onHull(x, LOWER_Y, side, `broadside-lower-${side}-${index}`, 1.12, 0.96)),
    ...MIDDLE_X.map((x, index) => onHull(x, MIDDLE_Y, side, `broadside-middle-${side}-${index}`, 1, 0.88)),
    ...UPPER_X.map((x, index) => onHull(x, UPPER_Y, side, `broadside-upper-${side}-${index}`, 0.88, 0.78)),
    ...QUARTER_X.map((x, index) => onHull(x, QUARTER_Y, side, `quarter-${side}-${index}`, 0.8, 0.68)),
    onHull(15.6, FORE_Y, side, `forecastle-${side}`, 0.78, 0.66),
    onHull(18.4, FORE_Y, side, `carronade-${side}`, 0.7, 0.56)
  ]);
  for (const z of [-1.7, 1.7]) {
    const y = MIDDLE_Y;
    ports.push(
      mountAt(`stern-${z}`, new THREE.Vector3(sternFace(y) - 0.05, y, z), new THREE.Vector3(-1, 0, 0), 0.92, 0.8)
    );
  }
  gunCache = ports;
  return ports;
}
export function shipOfTheLineWindows(): readonly LineMount[] {
  if (windowCache) return windowCache;
  const lights: LineMount[] = [];
  const sternRow = (y: number, count: number, half: number, h: number, w: number, name: string) => {
    for (let index = 0; index < count; index++) {
      const z = count === 1 ? 0 : THREE.MathUtils.lerp(-half, half, index / (count - 1));
      lights.push(
        mountAt(`${name}-${index}`, new THREE.Vector3(sternFace(y) - 0.06, y, z), new THREE.Vector3(-1, 0, 0), w, h)
      );
    }
  };
  sternRow(8.2, 7, 3.15, 0.95, 0.62, "great-cabin");
  sternRow(9.75, 5, 2.15, 0.72, 0.56, "upper-cabin");
  sternRow(11.05, 3, 1.15, 0.55, 0.48, "poop");
  for (const side of [-1, 1]) {
    for (const x of [-22.15, -20.85, -19.55]) {
      const z = side * (shipOfTheLinePoint(x, 8.25, 1).z + 0.95);
      lights.push(
        mountAt(`gallery-side-${side}-${x}`, new THREE.Vector3(x, 8.25, z), new THREE.Vector3(0, 0, side), 0.58, 0.82)
      );
    }
    lights.push(
      mountAt(
        `gallery-aft-${side}`,
        new THREE.Vector3(-23.25, 8.25, side * 2.05),
        new THREE.Vector3(-1, 0, 0),
        0.52,
        0.74
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
/** Port-plane frame. Depth is along the outward normal. */
function portFrame(x: number, y: number, z: number, mount: LineMount) {
  const dx = x - mount.point[0];
  const dy = y - mount.point[1];
  const dz = z - mount.point[2];
  return {
    depth: dx * mount.normal[0] + dy * mount.normal[1] + dz * mount.normal[2],
    across: dx * mount.right[0] + dy * mount.right[1] + dz * mount.right[2],
    rise: dx * mount.up[0] + dy * mount.up[1] + dz * mount.up[2]
  };
}
/**
 * Quad against the openings. A leaf that contains a port centre is dropped;
 * a larger overlapping quad is split so the hole stays inside the port rectangle.
 */
function openingCut(corners: THREE.Vector3[], mounts: readonly LineMount[]) {
  let overlap = false;
  let coversCentre = false;
  let span = 0;
  for (const mount of mounts) {
    let minAcross = Infinity;
    let maxAcross = -Infinity;
    let minRise = Infinity;
    let maxRise = -Infinity;
    let near = false;
    for (const corner of corners) {
      const frame = portFrame(corner.x, corner.y, corner.z, mount);
      if (Math.abs(frame.depth) < 2.4) near = true;
      minAcross = Math.min(minAcross, frame.across);
      maxAcross = Math.max(maxAcross, frame.across);
      minRise = Math.min(minRise, frame.rise);
      maxRise = Math.max(maxRise, frame.rise);
    }
    span = Math.max(span, maxAcross - minAcross, maxRise - minRise);
    if (!near) continue;
    if (
      maxAcross > -mount.width * 0.5 - mount.width * 0.06 &&
      minAcross < mount.width * 0.5 + mount.width * 0.06 &&
      maxRise > -mount.height * 0.5 - mount.height * 0.06 &&
      minRise < mount.height * 0.5 + mount.height * 0.06
    )
      overlap = true;
    if (minAcross <= 0 && maxAcross >= 0 && minRise <= 0 && maxRise >= 0) coversCentre = true;
  }
  return { overlap, coversCentre, span };
}
function bandOf(y: number) {
  if (y < 0.4) return { name: "hull-underwater", material: "earth" as const };
  if (Math.abs(y - LOWER_Y) < 0.68) return { name: "hull-band-lower", material: "tile" as const };
  if (Math.abs(y - MIDDLE_Y) < 0.6) return { name: "hull-band-middle", material: "tile" as const };
  if (Math.abs(y - UPPER_Y) < 0.52) return { name: "hull-band-upper", material: "tile" as const };
  return { name: "hull-topsides", material: "dark" as const };
}
function place(
  kit: ModelKit,
  name: string,
  mount: LineMount,
  local: THREE.Vector3,
  size: Position,
  surfaceName: Surface,
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
  const kit = kitOf("grok-ship-of-the-line-hull");
  const sidePorts = shipOfTheLineGunports().filter(port => !port.id.startsWith("stern"));
  const sternOpenings = [
    ...shipOfTheLineGunports().filter(port => port.id.startsWith("stern")),
    ...shipOfTheLineWindows().filter(light => !light.id.startsWith("gallery"))
  ];
  const U = 34;
  const S = 16;
  const pointAt = (u: number, s: number, side: number) => {
    const y = THREE.MathUtils.lerp(-keelDepth(u), sheer(u), s);
    return hullPoint(u, y, side);
  };
  const bands = new Map<string, { material: Surface; points: number[]; indices: number[] }>();
  const band = (name: string, material: Surface) => {
    const existing = bands.get(name);
    if (existing) return existing;
    const entry = { material, points: [] as number[], indices: [] as number[] };
    bands.set(name, entry);
    return entry;
  };
  for (const side of [-1, 1]) {
    const emit = (u0: number, u1: number, s0: number, s1: number, depth: number) => {
      const corners = [pointAt(u0, s0, side), pointAt(u1, s0, side), pointAt(u0, s1, side), pointAt(u1, s1, side)];
      const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
      const cut = openingCut(corners, sidePorts);
      if (cut.overlap && cut.span > 0.16 && depth < 6) {
        const um = (u0 + u1) / 2;
        const sm = (s0 + s1) / 2;
        emit(u0, um, s0, sm, depth + 1);
        emit(um, u1, s0, sm, depth + 1);
        emit(u0, um, sm, s1, depth + 1);
        emit(um, u1, sm, s1, depth + 1);
        return;
      }
      if (cut.coversCentre) return;
      const paint = bandOf(centre.y);
      const entry = band(paint.name, paint.material);
      const base = entry.points.length / 3;
      for (const corner of corners) entry.points.push(corner.x, corner.y, corner.z);
      if (side > 0) entry.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      else entry.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    };
    for (let i = 0; i < U; i++) for (let j = 0; j < S; j++) emit(i / U, (i + 1) / U, j / S, (j + 1) / S, 0);
  }
  const transomBands = new Map<string, { material: Surface; points: number[]; indices: number[] }>();
  const transomBand = (name: string, material: Surface) => {
    const existing = transomBands.get(name);
    if (existing) return existing;
    const entry = { material, points: [] as number[], indices: [] as number[] };
    transomBands.set(name, entry);
    return entry;
  };
  const rows = 10;
  const cols = 14;
  const emitTransom = (row0: number, row1: number, col0: number, col1: number, depth: number) => {
    const at = (row: number, col: number) => {
      const y = THREE.MathUtils.lerp(-keelDepth(0), sheer(0), row / rows);
      const half = hullPoint(0, y).z * 0.98;
      return new THREE.Vector3(sternFace(y) - 0.02, y, THREE.MathUtils.lerp(-half, half, col / cols));
    };
    const corners = [at(row0, col0), at(row1, col0), at(row0, col1), at(row1, col1)];
    const centre = corners[0].clone().add(corners[3]).multiplyScalar(0.5);
    const cut = openingCut(corners, sternOpenings);
    if (cut.overlap && cut.span > 0.16 && depth < 6) {
      const rm = (row0 + row1) / 2;
      const cm = (col0 + col1) / 2;
      emitTransom(row0, rm, col0, cm, depth + 1);
      emitTransom(rm, row1, col0, cm, depth + 1);
      emitTransom(row0, rm, cm, col1, depth + 1);
      emitTransom(rm, row1, cm, col1, depth + 1);
      return;
    }
    if (cut.coversCentre) return;
    const paint = centre.y > 7.2 ? { name: "transom", material: "plaster" as const } : bandOf(centre.y);
    const entry = transomBand(paint.name === "hull-topsides" ? "transom" : paint.name, paint.material);
    const base = entry.points.length / 3;
    for (const corner of corners) entry.points.push(corner.x, corner.y, corner.z);
    entry.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) emitTransom(row, row + 1, col, col + 1, 0);
  for (const [name, entry] of bands) surface(kit, name, entry.points, entry.indices, entry.material);
  for (const [name, entry] of transomBands) surface(kit, name, entry.points, entry.indices, entry.material);
  const stem: number[] = [];
  const stemIndex: number[] = [];
  for (let j = 0; j <= S; j++) {
    const y = THREE.MathUtils.lerp(-keelDepth(1), sheer(1), j / S);
    stem.push(...hullPoint(1, y, -1).toArray(), ...hullPoint(1, y, 1).toArray());
  }
  for (let j = 0; j < S; j++) stemIndex.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
  surface(kit, "stem", stem, stemIndex, "oak");
  const keel: number[] = [];
  const keelIndex: number[] = [];
  const keelSteps = 24;
  for (let i = 0; i <= keelSteps; i++) {
    const u = i / keelSteps;
    const y = -keelDepth(u);
    keel.push(
      THREE.MathUtils.lerp(sternX(0), stemX(0), u),
      y,
      -0.18,
      THREE.MathUtils.lerp(sternX(0), stemX(0), u),
      y,
      0.18
    );
  }
  for (let i = 0; i < keelSteps; i++) keelIndex.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  surface(kit, "keel", keel, keelIndex, "dark");
  for (const y of [
    0.55,
    LOWER_Y - 0.72,
    LOWER_Y + 0.72,
    MIDDLE_Y - 0.64,
    MIDDLE_Y + 0.64,
    UPPER_Y - 0.56,
    UPPER_Y + 0.56
  ])
    for (const side of [-1, 1])
      for (let i = 0; i < 28; i++) {
        const a = hullPoint(i / 28, y, side);
        const b = hullPoint((i + 1) / 28, y, side);
        if (a.distanceTo(b) < 0.05 || a.y > sheer(i / 28) - 0.05) continue;
        kit.beam("wale", P(a), P(b), y < 1 ? 0.28 : 0.16, "dark", true);
      }
  const rudderX = sternFace(-0.4) - 0.55;
  kit.box("rudder", [rudderX, -1.1, 0], [0.28, 7.2, 0.22], "oak");
  kit.beam("rudder-stock", [rudderX, -3.4, 0], [rudderX + 0.2, 6.4, 0], 0.2, "oak", true);
  for (const y of [-3.2, -1.2, 0.8, 2.6, 4.4])
    kit.box("rudder-pintle", [rudderX + 0.12, y, 0], [0.18, 0.1, 0.36], "iron");
  return kit.finish();
}

function deckStrip(kit: SailingKit, name: string, x0: number, x1: number, y: number, inset = 0.4, sideInset = 0) {
  const steps = Math.max(6, Math.round((x1 - x0) / 2.2));
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    const half = Math.max(0.4, shipOfTheLinePoint(x, y).z - inset);
    const inner = sideInset > 0 ? half - sideInset : -half;
    const outer = sideInset > 0 ? half : half;
    points.push(x, y, inner, x, y, outer);
    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  surface(kit, name, points, indices, "wood");
  const seams: [Position, Position][] = [];
  for (let i = 0; i < steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    const nx = THREE.MathUtils.lerp(x0, x1, (i + 1) / steps);
    const half = Math.max(0.4, shipOfTheLinePoint(x, y).z - inset);
    const next = Math.max(0.4, shipOfTheLinePoint(nx, y).z - inset);
    const inner = sideInset > 0 ? half - sideInset : -half * 0.85;
    const outer = sideInset > 0 ? half * 0.98 : half * 0.85;
    const count = sideInset > 0 ? 3 : 7;
    for (let line = 0; line < count; line++) {
      const t = count === 1 ? 0.5 : line / (count - 1);
      seams.push([
        [x, y + 0.012, THREE.MathUtils.lerp(inner, outer, t)],
        [
          nx,
          y + 0.012,
          THREE.MathUtils.lerp(sideInset > 0 ? next - sideInset : -next * 0.85, sideInset > 0 ? next : next * 0.85, t)
        ]
      ]);
    }
  }
  kit.lines(`${name}-seams`, seams, 0x8a6840);
}
function edgeRail(kit: SailingKit, x0: number, x1: number, y: number, zAt: (x: number) => number) {
  const steps = Math.max(3, Math.round(Math.abs(x1 - x0) / 1.35));
  for (let i = 0; i < steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    const nx = THREE.MathUtils.lerp(x0, x1, (i + 1) / steps);
    const z = zAt(x);
    const nz = zAt(nx);
    kit.beam("cap-rail", [x, y + 0.92, z], [nx, y + 0.92, nz], 0.08, "oak", true);
    kit.box("rail-post", [(x + nx) / 2, y + 0.48, (z + nz) / 2], [0.08, 0.9, 0.08], "oak");
  }
}
function bulkhead(kit: SailingKit, x: number, y0: number, y1: number) {
  const half = Math.max(1.2, shipOfTheLinePoint(x, (y0 + y1) / 2).z - 0.55);
  const door = 1.05;
  kit.box("bulkhead", [x, (y0 + y1) / 2, -(half + door / 2) / 2], [0.16, y1 - y0, half - door / 2], "oak");
  kit.box("bulkhead", [x, (y0 + y1) / 2, (half + door / 2) / 2], [0.16, y1 - y0, half - door / 2], "oak");
  kit.box("door-lintel", [x, y1 - 0.4, 0], [0.16, 0.8, door], "oak");
}
function decks() {
  const kit = kitOf("grok-ship-of-the-line-decks");
  deckStrip(kit, "upper-deck", 3.4, 12.2, UPPER_DECK, 0.35);
  deckStrip(kit, "forecastle-deck", 12.3, 26.4, FORE_DECK, 0.42);
  deckStrip(kit, "quarterdeck", -23.6, 3.2, QUARTER_DECK, 0.4);
  deckStrip(kit, "poop-deck", -25.2, -16.4, POOP_DECK, 0.55);
  for (const side of [-1, 1]) {
    const points: number[] = [];
    const indices: number[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const x = THREE.MathUtils.lerp(3.5, 12.1, i / steps);
      const outer = side * Math.max(0.8, shipOfTheLinePoint(x, FORE_DECK).z - 0.28);
      const inner = side * Math.max(0.5, Math.abs(outer) - 1.15);
      points.push(x, FORE_DECK, inner, x, FORE_DECK, outer);
      if (i < steps) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    surface(kit, "gangway", points, indices, "wood");
    edgeRail(kit, 3.6, 12, FORE_DECK, x => side * Math.max(0.7, shipOfTheLinePoint(x, FORE_DECK).z - 1.35));
  }
  edgeRail(kit, 12.5, 25.6, FORE_DECK, x => shipOfTheLinePoint(x, FORE_DECK).z - 0.25);
  edgeRail(kit, 12.5, 25.6, FORE_DECK, x => -(shipOfTheLinePoint(x, FORE_DECK).z - 0.25));
  edgeRail(kit, -23.2, 3, QUARTER_DECK, x => shipOfTheLinePoint(x, QUARTER_DECK).z - 0.25);
  edgeRail(kit, -23.2, 3, QUARTER_DECK, x => -(shipOfTheLinePoint(x, QUARTER_DECK).z - 0.25));
  edgeRail(kit, -24.8, -16.6, POOP_DECK, x => shipOfTheLinePoint(x, POOP_DECK).z - 0.3);
  edgeRail(kit, -24.8, -16.6, POOP_DECK, x => -(shipOfTheLinePoint(x, POOP_DECK).z - 0.3));
  bulkhead(kit, 12.25, UPPER_DECK, FORE_DECK + 0.85);
  bulkhead(kit, 3.3, UPPER_DECK, QUARTER_DECK + 0.85);
  bulkhead(kit, -16.45, QUARTER_DECK, POOP_DECK + 0.75);
  const beak = [27.2, 8.15, -1.55, 27.2, 8.15, 1.55, 33.4, 8.85, -0.42, 33.4, 8.85, 0.42];
  surface(kit, "beakhead-grating", beak, [0, 1, 2, 1, 3, 2], "wood");
  for (const side of [-1, 1]) {
    kit.beam("headrail", [26.8, 9.1, side * 1.7], [33.8, 9.55, side * 0.38], 0.09, "straw", true);
    kit.beam("headrail", [26.6, 7.3, side * 1.45], [33.2, 8.7, side * 0.28], 0.08, "oak", true);
    kit.beam("beakhead-knee", [32.2, 8.35, side * 0.32], [20.4, 2.2, side * 0.28], 0.22, "oak", true);
  }
  for (const x of [6.2, -8.4]) {
    const y = x > 0 ? UPPER_DECK : QUARTER_DECK;
    const z = 0.2;
    kit.box("hatch-coaming", [x, y + 0.08, z], [1.7, 0.16, 1.35], "oak");
    kit.box("hatch-grating", [x, y + 0.12, z], [1.45, 0.04, 1.1], "dark");
    for (let i = -2; i <= 2; i++) kit.box("hatch-batten", [x + i * 0.22, y + 0.16, z], [0.06, 0.04, 1.05], "wood");
  }
  return kit.finish();
}

function boat(kit: SailingKit, x: number, y: number, z: number, length: number) {
  kit.box("ship-boat", [x, y, z], [length, 0.55, length * 0.28], "oak");
  kit.box("ship-boat-sheer", [x, y + 0.32, z], [length * 0.92, 0.12, length * 0.3], "wood");
  for (const dx of [-0.28, 0, 0.28])
    kit.box("ship-boat-thwart", [x + dx * length, y + 0.28, z], [0.08, 0.06, length * 0.24], "wood");
}
function wheelAt(kit: SailingKit, x: number, y: number, z: number) {
  const wheel = kit.ring("helm-wheel", [x, y, z], 0.78, 0.04, "wood", true);
  wheel.rotation.set(0, Math.PI / 2, 0);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 6;
    kit.beam(
      "helm-spoke",
      [x, y + Math.sin(angle) * 0.12, z + Math.cos(angle) * 0.12],
      [x, y + Math.sin(angle) * 0.7, z + Math.cos(angle) * 0.7],
      0.045,
      "oak",
      true
    );
  }
}
function fittings() {
  const kit = kitOf("grok-ship-of-the-line-fittings");
  const capstanY = UPPER_DECK + 0.55;
  kit.cylinder("capstan", [8.4, capstanY, 0], 0.42, 1.05, "oak", 0.34, 12);
  kit.cylinder("capstan-head", [8.4, UPPER_DECK + 1.15, 0], 0.48, 0.16, "wood", 0.48, 12);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    kit.beam(
      "capstan-bar",
      [8.4 + Math.cos(angle) * 0.3, UPPER_DECK + 0.95, Math.sin(angle) * 0.3],
      [8.4 + Math.cos(angle) * 1.7, UPPER_DECK + 0.95, Math.sin(angle) * 1.7],
      0.07,
      "wood",
      true
    );
  }
  wheelAt(kit, -4.6, QUARTER_DECK + 1.05, -0.42);
  wheelAt(kit, -5.15, QUARTER_DECK + 1.05, -0.42);
  const drum = kit.cylinder("helm-drum", [-4.88, QUARTER_DECK + 1.05, -0.42], 0.16, 0.7, "oak", 0.16, 10);
  drum.rotation.z = Math.PI / 2;
  kit.box("binnacle", [-6.3, QUARTER_DECK + 0.55, 0.15], [0.7, 1.05, 0.62], "oak");
  kit.sphere("binnacle-lamp", [-6.3, QUARTER_DECK + 1.2, 0.15], [0.16, 0.18, 0.16], "straw");
  kit.box("belfry-post", [14.2, FORE_DECK + 0.9, -0.45], [0.1, 1.7, 0.1], "oak");
  kit.box("belfry-post", [14.2, FORE_DECK + 0.9, 0.45], [0.1, 1.7, 0.1], "oak");
  kit.beam("belfry-beam", [14.2, FORE_DECK + 1.75, -0.45], [14.2, FORE_DECK + 1.75, 0.45], 0.1, "oak", true);
  kit.sphere("bell", [14.2, FORE_DECK + 1.45, 0], [0.22, 0.2, 0.22], "straw");
  boat(kit, 7.6, UPPER_DECK + 0.85, 0, 7.4);
  boat(kit, 7.7, UPPER_DECK + 1.55, 0, 5.6);
  for (const side of [-1, 1]) {
    const z = side * (shipOfTheLinePoint(20.5, 4.2, 1).z + 0.2);
    kit.beam("anchor-shank", [21.2, 6.4, z], [19.8, 1.5, z + side * 0.35], 0.14, "iron", true);
    kit.beam("anchor-stock", [21.25, 6.35, z - 0.7], [21.25, 6.35, z + 0.7], 0.12, "wood", true);
    kit.box("anchor-fluke", [19.7, 1.35, z + side * 0.35], [0.36, 0.14, 0.48], "iron");
    kit.beam(
      "cathead",
      [24.6, FORE_DECK + 0.4, side * 1.2],
      [26.4, FORE_DECK + 0.85, side * (shipOfTheLinePoint(24.6, FORE_DECK).z + 0.4)],
      0.16,
      "oak",
      true
    );
  }
  for (const [x, y0, y1] of [
    [11.6, UPPER_DECK, FORE_DECK],
    [4.1, UPPER_DECK, QUARTER_DECK],
    [-15.8, QUARTER_DECK, POOP_DECK]
  ] as const) {
    for (const z of [0.55, 0.95]) kit.beam("ladder-rail", [x, y0, z], [x - 0.2, y1, z], 0.06, "oak", true);
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      kit.box(
        "ladder-tread",
        [THREE.MathUtils.lerp(x, x - 0.2, t), THREE.MathUtils.lerp(y0, y1, t), 0.75],
        [0.32, 0.05, 0.42],
        "wood"
      );
    }
  }
  kit.sphere("figurehead-shield", [34.15, 8.55, 0], [0.16, 0.55, 0.42], "straw");
  for (const side of [-1, 1]) {
    kit.box("figurehead-supporter", [33.85, 8.15, side * 0.48], [0.22, 0.85, 0.2], "straw");
    kit.sphere("figurehead-head", [34.05, 8.65, side * 0.48], [0.12, 0.14, 0.12], "straw");
  }
  kit.sphere("figurehead-finial", [34.2, 9.2, 0], [0.12, 0.16, 0.12], "straw");
  for (const side of [-1, 1]) {
    const inner = side * shipOfTheLinePoint(-20.8, QUARTER_DECK, 1).z;
    const outer = side * (Math.abs(inner) + 1.05);
    kit.box(
      "quarter-gallery",
      [-21.15, QUARTER_DECK + 0.85, (inner + outer) / 2],
      [4.4, 1.7, Math.abs(outer - inner)],
      "plaster"
    );
    kit.box(
      "quarter-gallery-roof",
      [-21.15, QUARTER_DECK + 1.75, (inner + outer) / 2],
      [4.6, 0.12, Math.abs(outer - inner) + 0.12],
      "dark"
    );
    kit.beam(
      "gallery-bracket",
      [-22.4, QUARTER_DECK, outer],
      [-22.8, QUARTER_DECK - 1.6, side * shipOfTheLinePoint(-22.6, QUARTER_DECK - 1.4, 1).z],
      0.1,
      "straw",
      true
    );
  }
  for (const z of [-2.4, 0, 2.4])
    kit.beam("stern-pilaster", [sternFace(9.4) - 0.12, 7.5, z], [sternFace(11.2) - 0.2, 11.35, z], 0.1, "straw", true);
  kit.box("stern-rail", [sternFace(11.35) - 0.18, 11.4, 0], [0.16, 0.16, 5.2], "straw");
  for (const z of [-1.6, 0, 1.6]) {
    const base = new THREE.Vector3(sternFace(sheer(0)) - 0.15, sheer(0) + 0.1, z * 0.85);
    kit.beam("lantern-stem", P(base), P(base.clone().add(new THREE.Vector3(-0.18, 0.85, 0))), 0.05, "iron", true);
    kit.sphere(
      "lantern",
      P(base.clone().add(new THREE.Vector3(-0.18, 1.25, 0))),
      z === 0 ? [0.28, 0.36, 0.28] : [0.2, 0.26, 0.2],
      "straw"
    );
  }
  for (const x of [-18.5, -4.5, 6.5, 18.5])
    for (const side of [-1, 1]) {
      const y = x > 10 ? FORE_DECK : x > 2 ? FORE_DECK : QUARTER_DECK;
      const deckY = x > 3.4 && x < 12.2 ? FORE_DECK : y;
      const z = side * (shipOfTheLinePoint(x, deckY).z - 0.15);
      kit.box("hammock-cloth", [x, deckY + 1.15, z], [2.3, 0.38, 0.22], "white");
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
interface TriSpec {
  id: string;
  heel: Position;
  peak: Position;
  clew: Position;
  bundle: number;
  name: string;
}
const SQUARES: SquareSpec[] = [
  {
    id: "spritsail",
    x: 36.2,
    yard: 8.35,
    foot: 5.7,
    headHalf: 5.2,
    footHalf: 6.1,
    belly: 0.7,
    bundle: 0.22,
    sheet: [30.5, 6.2, 0]
  },
  {
    id: "fore-course",
    x: 15.8,
    yard: 16.6,
    foot: 8.35,
    headHalf: 9.4,
    footHalf: 11.2,
    belly: 1.25,
    bundle: 0.36,
    sheet: [12.2, FORE_DECK + 0.4, 0]
  },
  {
    id: "fore-topsail",
    x: 15.8,
    yard: 28.4,
    foot: 17.4,
    headHalf: 6.4,
    footHalf: 7.6,
    belly: 0.8,
    bundle: 0.24,
    sheet: [13.4, 15.2, 0]
  },
  {
    id: "fore-topgallant",
    x: 15.8,
    yard: 40.6,
    foot: 29.4,
    headHalf: 3.8,
    footHalf: 4.6,
    belly: 0.45,
    bundle: 0.16,
    sheet: [14.2, 26.5, 0]
  },
  {
    id: "main-course",
    x: 1.1,
    yard: 18.4,
    foot: 6.7,
    headHalf: 12.6,
    footHalf: 14.8,
    belly: 1.7,
    bundle: 0.44,
    sheet: [-2.4, UPPER_DECK + 0.5, 0]
  },
  {
    id: "main-topsail",
    x: 1.1,
    yard: 33.2,
    foot: 19.4,
    headHalf: 8.2,
    footHalf: 9.8,
    belly: 1,
    bundle: 0.28,
    sheet: [-0.6, 17.2, 0]
  },
  {
    id: "main-topgallant",
    x: 1.1,
    yard: 47.4,
    foot: 34.2,
    headHalf: 4.6,
    footHalf: 5.6,
    belly: 0.5,
    bundle: 0.18,
    sheet: [0.2, 31.5, 0]
  },
  {
    id: "mizzen-topsail",
    x: -11.4,
    yard: 24.2,
    foot: 15.2,
    headHalf: 4.8,
    footHalf: 5.8,
    belly: 0.6,
    bundle: 0.18,
    sheet: [-12.6, 13.5, 0]
  },
  {
    id: "mizzen-topgallant",
    x: -11.4,
    yard: 35.4,
    foot: 25.2,
    headHalf: 2.8,
    footHalf: 3.4,
    belly: 0.35,
    bundle: 0.14,
    sheet: [-12.2, 22.4, 0]
  }
];
const HEADS: TriSpec[] = [
  {
    id: "inner-jib",
    heel: [30.4, 9.6, 0.15],
    peak: [15.8, 27.2, 0.1],
    clew: [18.4, 8.6, 0.9],
    bundle: 0.16,
    name: "jib-sail"
  },
  {
    id: "outer-jib",
    heel: [40.8, 12.2, -0.12],
    peak: [15.8, 39.4, -0.08],
    clew: [22.6, 9.4, -1.05],
    bundle: 0.14,
    name: "jib-sail"
  }
];
const SPANKER: TriSpec = {
  id: "spanker",
  heel: [-11.4, 9.1, 0],
  peak: [-20.6, 16.8, 0],
  clew: [-21.2, 8.15, 0],
  bundle: 0.22,
  name: "spanker"
};
const MASTS = [
  { x: 15.8, head: 26.4, top: 39.2, gallant: 49.5, radius: 0.42 },
  { x: 1.1, head: 31.5, top: 46.2, gallant: 56.8, radius: 0.52 },
  { x: -11.4, head: 22.4, top: 34.2, gallant: 43.6, radius: 0.32 }
] as const;

function spars() {
  const kit = kitOf("grok-ship-of-the-line-spars");
  for (const mast of MASTS) {
    kit.cylinder("mast", [mast.x, mast.head / 2 - 0.5, 0], mast.radius, mast.head + 1, "wood", mast.radius * 0.78, 12);
    kit.cylinder("mast-top", [mast.x, mast.head + 0.2, 0], mast.radius * 2.8, 0.18, "oak", mast.radius * 2.8, 12);
    kit.cylinder(
      "topmast",
      [mast.x, (mast.head + mast.top) / 2, 0],
      mast.radius * 0.62,
      mast.top - mast.head,
      "wood",
      mast.radius * 0.48,
      10
    );
    kit.cylinder("topmast-cap", [mast.x, mast.top + 0.12, 0], mast.radius * 1.7, 0.12, "oak", mast.radius * 1.7, 10);
    kit.cylinder(
      "topgallant-mast",
      [mast.x, (mast.top + mast.gallant) / 2, 0],
      mast.radius * 0.38,
      mast.gallant - mast.top,
      "wood",
      mast.radius * 0.26,
      8
    );
    kit.sphere("truck", [mast.x, mast.gallant + 0.18, 0], [0.14, 0.16, 0.14], "straw");
  }
  for (const sail of SQUARES) {
    const thick = sail.id.endsWith("course") ? 0.28 : sail.id.includes("topgallant") ? 0.12 : 0.18;
    kit.beam("yard", [sail.x, sail.yard, -sail.headHalf], [sail.x, sail.yard, sail.headHalf], thick, "wood", true);
    const mast = MASTS.find(entry => Math.abs(entry.x - sail.x) < 1);
    if (mast) kit.beam("parrel", [mast.x, sail.yard, 0], [sail.x, sail.yard, 0], 0.16, "oak", true);
  }
  const heel = new THREE.Vector3(26.4, 8.5, 0);
  const bowspritTip = new THREE.Vector3(40.2, 11.6, 0);
  const jibboomTip = new THREE.Vector3(47.4, 13.6, 0);
  kit.beam("bowsprit", P(heel), P(bowspritTip), 0.42, "wood", true);
  kit.beam("jibboom", P(bowspritTip.clone().lerp(heel, 0.18)), P(jibboomTip), 0.22, "wood", true);
  kit.beam("dolphin-striker", P(bowspritTip), [38.6, 7.4, 0], 0.1, "wood", true);
  kit.beam("gaff", SPANKER.heel, SPANKER.peak, 0.16, "wood", true);
  kit.beam("spanker-boom", [-11.4, 8.15, 0], [-21.4, 7.7, 0], 0.16, "wood", true);
  return kit.finish();
}

function rigging() {
  const kit = kitOf("grok-ship-of-the-line-rigging");
  const lines: [Position, Position][] = [];
  const stay = (a: THREE.Vector3, b: THREE.Vector3) => lines.push([P(a), P(b)]);
  const jibboomTip = new THREE.Vector3(47.4, 13.6, 0);
  const bowspritTip = new THREE.Vector3(40.2, 11.6, 0);
  stay(jibboomTip, new THREE.Vector3(MASTS[0].x, MASTS[0].top - 0.4, 0));
  stay(bowspritTip, new THREE.Vector3(MASTS[0].x, MASTS[0].head - 0.3, 0));
  stay(new THREE.Vector3(30.2, 4.2, 0), bowspritTip.clone().lerp(new THREE.Vector3(26.4, 8.5, 0), 0.35));
  stay(new THREE.Vector3(MASTS[0].x, MASTS[0].head - 0.2, 0), new THREE.Vector3(MASTS[1].x, 12, 0));
  stay(new THREE.Vector3(MASTS[1].x, MASTS[1].head - 0.2, 0), new THREE.Vector3(MASTS[0].x, MASTS[0].head - 1, 0));
  stay(new THREE.Vector3(MASTS[1].x, MASTS[1].top - 0.2, 0), new THREE.Vector3(MASTS[0].x, MASTS[0].top - 0.6, 0));
  stay(new THREE.Vector3(MASTS[2].x, MASTS[2].head - 0.2, 0), new THREE.Vector3(MASTS[1].x, 14, 0));
  stay(new THREE.Vector3(MASTS[2].x, MASTS[2].top - 0.2, 0), new THREE.Vector3(MASTS[1].x, MASTS[1].head - 0.4, 0));
  for (const sail of SQUARES) {
    const mast = MASTS.find(entry => Math.abs(entry.x - sail.x) < 1);
    const cap = !mast
      ? sail.yard + 3
      : sail.id.includes("topgallant")
        ? mast.gallant
        : sail.id.includes("topsail")
          ? mast.top
          : mast.head;
    for (const side of [-1, 1]) {
      stay(
        new THREE.Vector3(sail.x, sail.yard, side * sail.headHalf),
        new THREE.Vector3(sail.x, cap - 0.3, side * 0.2)
      );
      stay(
        new THREE.Vector3(sail.x, sail.yard, side * sail.headHalf),
        new THREE.Vector3(sail.x - 4.5, Math.max(UPPER_DECK + 1.2, sail.yard - 8), side * 1.1)
      );
    }
  }
  stay(new THREE.Vector3(...SPANKER.peak), new THREE.Vector3(MASTS[2].x, MASTS[2].head - 0.2, 0));
  for (const mast of MASTS) {
    for (const side of [-1, 1]) {
      const footY = 7.35;
      const hullZ = shipOfTheLinePoint(mast.x, footY, 1).z;
      const channelZ = side * (hullZ + 0.85);
      kit.box("channel", [mast.x, footY, side * (hullZ + 0.4)], [2.4, 0.12, 0.95], "oak");
      const count = mast.radius > 0.45 ? 6 : 5;
      const heads = new THREE.Vector3(mast.x, mast.head - 0.4, side * 0.15);
      const feet: THREE.Vector3[] = [];
      for (let i = 0; i < count; i++) {
        const foot = new THREE.Vector3(mast.x + (i - (count - 1) / 2) * 0.22, footY + 0.16, channelZ);
        feet.push(foot);
        stay(foot, heads);
        kit.sphere("deadeye", P(foot), [0.09, 0.09, 0.09], "dark");
        kit.beam(
          "chainplate",
          P(foot),
          [mast.x + (i - (count - 1) / 2) * 0.22, footY - 0.55, side * hullZ],
          0.045,
          "iron",
          true
        );
      }
      for (let t = 0.18; t <= 0.72; t += 0.09)
        for (let i = 0; i < count - 1; i++) stay(feet[i].clone().lerp(heads, t), feet[i + 1].clone().lerp(heads, t));
      stay(
        new THREE.Vector3(mast.x, mast.top - 0.2, side * 0.1),
        new THREE.Vector3(mast.x, footY + 0.3, side * (hullZ + 0.2))
      );
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
  const rows = spec.id.includes("topgallant") ? 6 : 8;
  const cols = spec.id.includes("course") ? 14 : 10;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = THREE.MathUtils.lerp(spec.yard - 0.05, spec.foot, t);
    const half = THREE.MathUtils.lerp(spec.headHalf * 0.96, spec.footHalf, t);
    const belly = Math.sin(Math.PI * t);
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      points.push(spec.x - spec.belly * belly * Math.sin(Math.PI * u), y, THREE.MathUtils.lerp(-half, half, u));
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
        [spec.x - spec.belly * 0.15, spec.foot, -spec.footHalf],
        [spec.sheet[0], spec.sheet[1], -Math.abs(spec.sheet[2]) - 0.8]
      ],
      [
        [spec.x - spec.belly * 0.15, spec.foot, spec.footHalf],
        [spec.sheet[0], spec.sheet[1], Math.abs(spec.sheet[2]) + 0.8]
      ]
    ],
    0x6a5844
  );
  return kit.finish();
}
function triCloth(spec: TriSpec, furled: boolean) {
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
  const rows = spec.name === "spanker" ? 8 : 6;
  const cols = spec.name === "spanker" ? 8 : 5;
  const points: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const head = heel.clone().lerp(peak, t);
    const foot =
      spec.name === "spanker" ? new THREE.Vector3(-11.4, 8.15, 0).lerp(new THREE.Vector3(-21.2, 7.7, 0), t) : clew;
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const belly = Math.sin(Math.PI * t) * Math.sin(Math.PI * u) * (spec.name === "spanker" ? 0.7 : 0.45);
      points.push(...head.clone().lerp(foot, u).addScaledVector(side, belly).toArray());
    }
    if (i < rows)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j;
        indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
      }
  }
  surface(kit, spec.name, points, indices, "white");
  kit.lines("sheet", [[spec.clew, [spec.clew[0] + 0.4, spec.clew[1] - 0.6, spec.clew[2]]]], 0x6a5844);
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
    const droop = t * t * hoist * 0.28;
    points.push(
      origin.x - t * length,
      origin.y + hoist / 2 - droop * 0.2,
      origin.z,
      origin.x - t * length,
      origin.y - hoist / 2 - droop,
      origin.z
    );
    if (i < 4) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  surface(kit, name, points, indices, material);
}
function flags() {
  const kit = kitOf("grok-ship-of-the-line-flags");
  for (const mast of MASTS) {
    kit.beam("pennant-staff", [mast.x, mast.gallant, 0], [mast.x, mast.gallant + 1.1, 0], 0.04, "wood", true);
    flagCloth(
      kit,
      "pennant",
      new THREE.Vector3(mast.x, mast.gallant + 0.85, 0),
      mast === MASTS[1] ? 6.5 : 3.4,
      0.42,
      "cloth"
    );
  }
  const staff = new THREE.Vector3(sternFace(POOP_DECK) - 0.35, POOP_DECK + 1.3, 0);
  kit.beam("ensign-staff", P(staff), P(staff.clone().add(new THREE.Vector3(-0.25, 3.2, 0))), 0.06, "wood", true);
  flagCloth(kit, "ensign", staff.clone().add(new THREE.Vector3(-0.25, 2.7, 0)), 4.2, 2.4, "white");
  return kit.finish();
}

function gunFrames() {
  const kit = kitOf("grok-ship-of-the-line-gun-frames");
  for (const port of shipOfTheLineGunports()) {
    for (const side of [-1, 1]) {
      place(
        kit,
        "port-jamb",
        port,
        new THREE.Vector3(side * (port.width / 2 + 0.07), 0, 0.04),
        [0.11, port.height + 0.18, 0.2],
        "oak"
      );
      place(
        kit,
        "port-sill",
        port,
        new THREE.Vector3(0, side * (port.height / 2 + 0.07), 0.04),
        [port.width + 0.16, 0.11, 0.2],
        "oak"
      );
    }
    place(
      kit,
      "port-chamber",
      port,
      new THREE.Vector3(0, 0, -0.6),
      [port.width * 0.9, port.height * 0.9, 0.75],
      "dark"
    );
  }
  return kit.finish();
}
function armament(closed: boolean) {
  const kit = kitOf("grok-ship-of-the-line-armament");
  for (const port of shipOfTheLineGunports()) {
    const carronade = port.id.startsWith("carronade");
    const lower = port.id.startsWith("broadside-lower");
    const middle = port.id.startsWith("broadside-middle");
    const w = port.width + 0.14;
    const h = port.height + 0.14;
    const hinge = new THREE.Vector3(0, h / 2, 0.16);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), closed ? 0 : -Math.PI * 0.52);
    const centre = new THREE.Vector3(0, -h / 2, 0).applyQuaternion(rotation).add(hinge);
    place(kit, closed ? "gunport-lid-closed" : "gunport-lid-open", port, centre, [w, h, 0.07], "dark", rotation);
    for (const x of [-w * 0.28, w * 0.28])
      place(
        kit,
        "lid-strap",
        port,
        new THREE.Vector3(x, -h * 0.4, 0.05).applyQuaternion(rotation).add(hinge),
        [0.04, h * 0.72, 0.02],
        "iron",
        rotation
      );
    const length = carronade ? 1.15 : lower ? 2.75 : middle ? 2.45 : 1.9;
    const radius = carronade ? 0.22 : lower ? 0.18 : middle ? 0.15 : 0.11;
    const tip = closed ? -0.42 : lower ? 1.15 : 0.75;
    const profile = carronade
      ? [
          [0, 0],
          [radius, 0],
          [radius, length * 0.72],
          [radius * 0.7, length * 0.72],
          [radius * 0.55, length],
          [0, length]
        ]
      : [
          [0, 0],
          [radius, 0],
          [radius * 0.78, length * 0.7],
          [radius * 0.92, length - 0.08],
          [radius * 0.55, length - 0.08],
          [radius * 0.5, length * 0.18],
          [0, length * 0.18]
        ];
    const barrel = kit.add(
      closed ? "cannon-stowed" : "cannon-run-out",
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        10
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
      new THREE.Vector3(0, -0.04, tip - length).applyQuaternion(q).add(new THREE.Vector3(...port.point))
    );
    const carriageZ = closed ? -1.05 : -0.45;
    place(
      kit,
      "gun-carriage",
      port,
      new THREE.Vector3(0, carronade ? -0.16 : -0.32, carriageZ),
      [carronade ? 0.7 : 0.62, carronade ? 0.12 : 0.18, lower ? 0.85 : 0.62],
      "wood"
    );
    if (!carronade)
      for (const side of [-1, 1])
        for (const dz of [-0.2, 0.2]) {
          const truck = place(
            kit,
            "carriage-wheel",
            port,
            new THREE.Vector3(side * 0.34, -0.42, carriageZ + dz),
            [0.18, 0.18, 0.08],
            "dark"
          );
          truck.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        }
  }
  return kit.finish();
}

function windowFrames() {
  const kit = kitOf("grok-ship-of-the-line-window-frames");
  for (const light of shipOfTheLineWindows()) {
    for (const side of [-1, 1]) {
      place(
        kit,
        "window-jamb",
        light,
        new THREE.Vector3(side * (light.width / 2 + 0.045), 0, 0.035),
        [0.07, light.height + 0.12, 0.16],
        "straw"
      );
      place(
        kit,
        "window-sill",
        light,
        new THREE.Vector3(0, side * (light.height / 2 + 0.045), 0.035),
        [light.width + 0.1, 0.07, 0.16],
        "straw"
      );
    }
    place(
      kit,
      "window-reveal",
      light,
      new THREE.Vector3(0, 0, -0.28),
      [light.width * 0.88, light.height * 0.88, 0.32],
      "dark"
    );
  }
  return kit.finish();
}
function windowLeaves(closed: boolean) {
  const kit = kitOf("grok-ship-of-the-line-window-leaves");
  for (const light of shipOfTheLineWindows()) {
    const w = light.width + 0.08;
    const h = light.height + 0.08;
    const hinge = new THREE.Vector3(light.width / 2 + 0.02, 0, 0.08);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), closed ? 0 : 2.85);
    const centre = new THREE.Vector3(-w / 2, 0, 0.03).applyQuaternion(rotation).add(hinge);
    place(kit, closed ? "window-shutter-closed" : "window-shutter-open", light, centre, [w, h, 0.045], "oak", rotation);
    place(
      kit,
      "shutter-strap",
      light,
      new THREE.Vector3(-w * 0.32, 0, 0.055).applyQuaternion(rotation).add(hinge),
      [w * 0.5, 0.04, 0.018],
      "iron",
      rotation
    );
    if (!closed) {
      place(
        kit,
        "window-glass",
        light,
        new THREE.Vector3(0, 0, -0.04),
        [light.width * 0.86, light.height * 0.86, 0.035],
        "water"
      );
      place(kit, "window-mullion", light, new THREE.Vector3(0, 0, -0.01), [0.03, light.height * 0.86, 0.045], "straw");
    }
  }
  return kit.finish();
}

const PARTS: readonly { id: string; role: string; create: (state: GrokShipOfTheLineState) => CityStructureMeshes }[] = [
  { id: "hull", role: "Hull, wales, keel and rudder", create: () => hull() },
  { id: "decks", role: "Decks, gangways, beakhead and rails", create: () => decks() },
  { id: "fittings", role: "Wheel, capstan, boats, galleries and lanterns", create: () => fittings() },
  { id: "spars", role: "Masts, yards, bowsprit and spanker gaff", create: () => spars() },
  { id: "rigging", role: "Standing rigging", create: () => rigging() },
  ...SQUARES.map(spec => ({
    id: spec.id,
    role: spec.id.replaceAll("-", " "),
    create: (state: GrokShipOfTheLineState) => squareCloth(spec, state.sails === "furled")
  })),
  ...HEADS.map(spec => ({
    id: spec.id,
    role: spec.id.replaceAll("-", " "),
    create: (state: GrokShipOfTheLineState) => triCloth(spec, state.sails === "furled")
  })),
  { id: SPANKER.id, role: "Spanker", create: state => triCloth(SPANKER, state.sails === "furled") },
  { id: "flags", role: "Pennants and stern flag", create: () => flags() },
  { id: "gun-frames", role: "Gunport frames and chambers", create: () => gunFrames() },
  { id: "armament", role: "Gunport lids and guns", create: state => armament(state.gunports === "closed") },
  { id: "window-frames", role: "Window frames", create: () => windowFrames() },
  { id: "window-leaves", role: "Window glass and shutters", create: state => windowLeaves(state.windows === "closed") }
];

export function grokShipOfTheLineParts(state: GrokShipOfTheLineState = {}): readonly ModelPartFactory[] {
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality: "high" as const,
    author: GROK_SHIP_OF_THE_LINE.author,
    create: () => part.create(state)
  }));
}

/** High-only assembly. Omitted state is sails set, gunports open and windows open. */
export function createGrokShipOfTheLine(state: GrokShipOfTheLineState = {}): CityStructureMeshes {
  const model = assembleSailingParts("grok-ship-of-the-line", grokShipOfTheLineParts(state));
  model.group.userData.gunports = shipOfTheLineGunports();
  model.group.userData.windows = shipOfTheLineWindows();
  model.group.userData.shipState = {
    sails: state.sails ?? "set",
    gunports: state.gunports ?? "open",
    windows: state.windows ?? "open"
  };
  return model;
}
