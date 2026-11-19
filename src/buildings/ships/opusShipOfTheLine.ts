import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import type { Position, Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import type { GalleonState } from "./galleonArmament";
import { addSailBundle, assembleSailingParts, SailingKit } from "./sailingAssembly";

export const OPUS_SHIP_OF_THE_LINE_QUALITIES = ["high", "low"] as const;
export type OpusShipOfTheLineQuality = (typeof OPUS_SHIP_OF_THE_LINE_QUALITIES)[number];

/**
 * HMS Victory as fought at Trafalgar (after the 1800-1803 great repair), in meters. Bow is +X, starboard +Z and the
 * waterline Y = 0. The hull follows the published 56.7 m gun deck, 46.5 m keel, 15.8 m beam and 7.8 m draught aft;
 * the main truck stands 62.5 m above the water. Kept from the repair: closed stern, chainwales above the ports, black
 * and yellow "Nelson chequer", coppered bottom, beakhead (rounded only in 1814). The figurehead is a blank gilt group.
 */
export const OPUS_SHIP_OF_THE_LINE = {
  author: "Claude Opus 5.5" as Author,
  name: "Ship of the line",
  length: 72,
  beam: 15.8,
  height: 62.5,
  draft: 7.8,
  guns: 104,
  source: "https://en.wikipedia.org/wiki/HMS_Victory",
  note: "HMS Victory at Trafalgar after the 1800-1803 repair: three gun decks in the Nelson chequer, coppered bottom, beakhead with a gilt figurehead, closed stern with three tiers of lights and quarter galleries, chainwales above the ports, boats on the skids and three stern lanterns. Fore and main carry course, topsail, topgallant and royal; the mizzen topsail and topgallant; spritsail, three headsails and a spanker. White ensign at the gaff and a vice-admiral's flag at the fore. Lines are illustrative; the interior below the weather decks is omitted."
} as const;

export interface OpusShipOfTheLineState extends GalleonState {
  windows?: "open" | "closed";
}

const COLORS: Partial<Record<Surface, number>> = {
  dark: 0x161514,
  tile: 0xc99a45,
  copper: 0xa8673c,
  ruby: 0x8c2a22,
  wood: 0xbfa274,
  oak: 0x7d5e3e,
  white: 0xe8e1cc,
  cloth: 0xd5ccb6,
  iron: 0x2a2d2f,
  brass: 0xc79a3a,
  glass: 0x2e4354,
  azure: 0x1f2c66,
  amber: 0xe2b452,
  earth: 0x0d0c0b,
  plaster: 0xe4d8bb,
  leather: 0x7a6043
};
const TARRED = 0x2b241e;
const RUNNING = 0x8a7559;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
/** Smoothstep that also runs downhill when `from > to`. */
function step(from: number, to: number, x: number) {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): Position => [v.x, v.y, v.z];

// ---------------------------------------------------------------- hull lines

const HALF_BEAM = 7.9;
/** Top of the copper sheathing; the side above is laid out in deck-relative height `v`. */
const WATER = 0.4;
const WIDEST = 1.2;
const STEM_FOOT = 22.6;
const POST_FOOT = -24;
const COUNTER = 2.2;
const UPPER_DECK = 5.15;
const QUARTER_DECK = 7.25;
const POOP_DECK = 9.35;
const HEAD_DECK = 5.6;
const QD_FRONT = -5.4;
const POOP_FRONT = -17.6;
const FORECASTLE_AFT = 12.6;
const BEAKHEAD = 27;

/** Keel trims by the stern: 7.39 m forward, 7.75 m aft. */
const keelY = (x: number) => -7.75 + 0.36 * clamp((x - POST_FOOT) / (STEM_FOOT - POST_FOOT), 0, 1);
function stemX(y: number) {
  const c = clamp((y - keelY(STEM_FOOT)) / 10.5, 0, 1);
  return STEM_FOOT + 7.4 * (1 - (1 - c) ** 2) + 0.1 * Math.max(0, y - 3);
}
const postX = (y: number) => POST_FOOT - 0.2 * (y - keelY(POST_FOOT));
const transomX = (y: number) => postX(COUNTER) - 0.22 * (y - COUNTER);
const aftX = (y: number) => (y < COUNTER ? postX(y) : transomX(y));

/** Moulded half-breadth: round bilge and fine run below, tumblehome above, a broad stern over the counter. */
function halfBreadth(x: number, y: number) {
  const bottom = keelY(x);
  const lift = clamp((y - bottom) / (WIDEST - bottom), 0, 1);
  const fore = x > 6 ? clamp((x - 6) / (stemX(y) - 6), 0, 1) : 0;
  const ramp = step(-1, 4, y);
  const end = lerp(postX(y), -40, ramp);
  const aft = x < -6 ? clamp((-6 - x) / (-6 - end), 0, 1) : 0;
  const plan = (1 - fore ** lerp(1.9, 2.8, lift)) * (1 - aft ** lerp(1.7, 3.2, ramp));
  const fine = Math.max(fore, aft) ** 2;
  const section =
    y <= WIDEST
      ? 1 - (1 - lift) ** lerp(2.6, 1.3, fine)
      : 1 - 0.15 * clamp((y - WIDEST) / (12 - WIDEST), 0, 1.2) ** 1.4;
  return Math.max(0.16, HALF_BEAM * plan * section);
}
const deckSheer = (x: number) => 0.00055 * x * x;
/** Height of a deck-relative level; the sheer fades out toward the flat copper line. */
const heightAt = (x: number, v: number) => v + deckSheer(x) * clamp((v - WATER) / 0.8, 0, 1);
/** Top of the side: waist, quarterdeck, poop and taffrail aft; forecastle, then the low head forward of the beakhead. */
function topV(x: number) {
  return (
    8 +
    0.85 * step(-4.5, -6.5, x) +
    1.95 * step(-16.5, -18.5, x) +
    0.75 * step(-23.5, -27, x) +
    0.85 * step(11.8, 13.6, x) +
    0.35 * step(22, 26.4, x) -
    3.6 * step(26.6, 27.2, x)
  );
}
/** A point on the side above the copper, clamped to the stem and transom and to the top of the side. */
function sidePoint(x: number, v: number, side = 1) {
  const level = Math.min(v, topV(x));
  let y = heightAt(x, level);
  const xc = clamp(x, aftX(y), stemX(y));
  y = heightAt(xc, level);
  return V(xc, y, side * halfBreadth(xc, y));
}
function bottomPoint(x: number, t: number, side = 1) {
  const y = lerp(keelY(x), WATER, t);
  const xc = clamp(x, aftX(y), stemX(y));
  return V(xc, y, side * halfBreadth(xc, y));
}
function sideNormal(x: number, v: number, side: number) {
  const along = sidePoint(x + 0.05, v, side).sub(sidePoint(x - 0.05, v, side));
  const up = sidePoint(x, v + 0.05, side).sub(sidePoint(x, v - 0.05, side));
  const normal = along.cross(up).normalize();
  if (normal.z * side < 0) normal.negate();
  return normal;
}
/** Chequer bands: yellow along each tier of ports, black wales and topsides between. */
const BANDS: readonly (readonly [number, number])[] = [
  [1.25, 2.6],
  [3.35, 4.65],
  [5.4, 6.65]
];
const inBand = (v: number) => BANDS.some(([a, b]) => v > a && v < b);

// ---------------------------------------------------------------- gunports and lights

export interface ShipMount {
  id: string;
  tier: string;
  point: Position;
  normal: Position;
  right: Position;
  up: Position;
  width: number;
  height: number;
}
interface PortSpec {
  tier: "lower" | "middle" | "upper" | "quarterdeck" | "forecastle" | "carronade";
  xs: readonly number[];
  sill: number;
  height: number;
  width: number;
  /** Barrel length, muzzle and breech radii. */
  gun: readonly [number, number, number];
  lidded: boolean;
}
const spaced = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
/** 30 x 32-pdr, 28 x 24-pdr, 30 x 12-pdr, 12 quarterdeck 12-pdr, 2 forecastle 12-pdr and 2 x 68-pdr carronades. */
const PORT_TIERS: readonly PortSpec[] = [
  {
    tier: "lower",
    xs: spaced(-20.6, 19.4, 15),
    sill: 1.45,
    height: 0.9,
    width: 1.05,
    gun: [2.9, 0.15, 0.3],
    lidded: true
  },
  {
    tier: "middle",
    xs: spaced(-19.4, 18.2, 14),
    sill: 3.55,
    height: 0.85,
    width: 1,
    gun: [2.9, 0.13, 0.27],
    lidded: true
  },
  {
    tier: "upper",
    xs: spaced(-20.6, 19.4, 15),
    sill: 5.62,
    height: 0.8,
    width: 0.95,
    gun: [2.3, 0.1, 0.21],
    lidded: true
  },
  {
    tier: "quarterdeck",
    xs: [-21.8, -19.2, -16.6, -12.2, -9.6, -7],
    sill: 7.65,
    height: 0.7,
    width: 0.85,
    gun: [2.3, 0.1, 0.21],
    lidded: false
  },
  { tier: "forecastle", xs: [19.8], sill: 7.65, height: 0.7, width: 0.85, gun: [2.5, 0.1, 0.21], lidded: false },
  { tier: "carronade", xs: [22.8], sill: 7.65, height: 0.7, width: 0.9, gun: [1.6, 0.2, 0.27], lidded: false }
];
interface Port extends ShipMount {
  spec: PortSpec;
  x0: number;
  x1: number;
  v0: number;
  v1: number;
  /** A covered deck lies behind the port, so its chamber is dark. */
  enclosed: boolean;
}
function basisOf(normal: THREE.Vector3) {
  const n = normal.clone().normalize();
  const right = V(0, 1, 0).cross(n);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: n.clone().cross(right).normalize(), normal: n };
}
function mount(id: string, tier: string, point: THREE.Vector3, normal: THREE.Vector3, width: number, height: number) {
  const { right, up, normal: n } = basisOf(normal);
  return { id, tier, point: P(point), normal: P(n), right: P(right), up: P(up), width, height };
}
let portCache: Port[] | null = null;
function ports(): Port[] {
  if (portCache) return portCache;
  portCache = [-1, 1].flatMap(side =>
    PORT_TIERS.flatMap(spec =>
      spec.xs.map((x, index) => {
        const v = spec.sill + spec.height / 2;
        const enclosed =
          spec.tier === "lower" ||
          spec.tier === "middle" ||
          (spec.tier === "upper" && (x < QD_FRONT || x > FORECASTLE_AFT));
        return {
          ...mount(
            `${spec.tier}-${side > 0 ? "starboard" : "larboard"}-${index}`,
            spec.tier,
            sidePoint(x, v, side),
            sideNormal(x, v, side),
            spec.width,
            spec.height
          ),
          spec,
          x0: x - spec.width / 2,
          x1: x + spec.width / 2,
          v0: spec.sill,
          v1: spec.sill + spec.height,
          enclosed
        };
      })
    )
  );
  return portCache;
}
/** Every gunport, both sides; one gun stands at each. */
export function opusShipOfTheLineGunports(): readonly ShipMount[] {
  return ports();
}
const cutByPort = (x: number, v: number) => ports().some(p => x > p.x0 && x < p.x1 && v > p.v0 && v < p.v1);

const STERN_TIERS = [
  { v: 4.15, count: 7, width: 0.62, height: 0.95 },
  { v: 6.25, count: 9, width: 0.68, height: 1.15 },
  { v: 8.3, count: 7, width: 0.6, height: 1 }
] as const;
const GALLERY = { x0: -26.1, x1: -22.7, v0: 4.9, v1: 9.4, out: 0.95 };
function galleryFace(side: number, x: number, v: number) {
  const base = sidePoint(x, v, side);
  return V(base.x, base.y, base.z + side * GALLERY.out);
}
let lightCache: ShipMount[] | null = null;
/** Stern lights in three tiers and the quarter-gallery lights, two per tier on each side. */
export function opusShipOfTheLineWindows(): readonly ShipMount[] {
  if (lightCache) return lightCache;
  const lights: ShipMount[] = [];
  const raked = V(-1, -0.22, 0).normalize();
  for (const [tierIndex, tier] of STERN_TIERS.entries()) {
    const y = heightAt(-27, tier.v);
    const x = transomX(y);
    const half = halfBreadth(x, y) * 0.74;
    for (let i = 0; i < tier.count; i++) {
      const z = lerp(-half, half, i / (tier.count - 1));
      lights.push(
        mount(
          `stern-${tierIndex}-${i}`,
          "stern",
          V(x, y, z).addScaledVector(raked, 0.02),
          raked,
          tier.width,
          tier.height
        )
      );
    }
  }
  for (const side of [-1, 1])
    for (const v of [6.25, 8.3])
      for (const x of [-25.1, -23.7]) {
        const point = galleryFace(side, x, v);
        lights.push(
          mount(`gallery-${side}-${v}-${x}`, "gallery", point.add(V(0, 0, side * 0.02)), V(0, 0, side), 0.55, 0.85)
        );
      }
  lightCache = lights;
  return lights;
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
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    this.indices.push(this.vertex(a), this.vertex(b), this.vertex(c));
  }
  /** A rows x cols grid of vertices with shared corners; `keep` filters cells. */
  grid(
    rows: number,
    cols: number,
    at: (i: number, j: number) => THREE.Vector3,
    keep = (_i: number, _j: number) => true
  ) {
    const base = this.points.length / 3;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) this.vertex(at(i, j));
    const w = cols + 1;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        if (!keep(i, j)) continue;
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
/** Tapered round spar between two points. */
function spar(
  kit: Kit,
  name: string,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r0: number,
  r1: number,
  segments: number,
  surface: Surface = "oak"
) {
  const mesh = kit.add(name, new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), segments), surface);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}
/** Box placed in a mount frame (right, up, normal) at a local offset. */
function inFrame(
  kit: Kit,
  name: string,
  m: ShipMount,
  local: THREE.Vector3,
  size: Position,
  surface: Surface,
  localQ = new THREE.Quaternion()
) {
  const q = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(V(...m.right), V(...m.up), V(...m.normal))
  );
  const mesh = kit.box(name, [0, 0, 0], size, surface);
  mesh.quaternion.copy(q).multiply(localQ);
  mesh.position.copy(local.applyQuaternion(q).add(V(...m.point)));
  return mesh;
}
function uniqueSorted(values: number[], gap: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > gap);
}
function columns(high: boolean) {
  const xs: number[] = [];
  for (let x = -28.8; x <= 31; x += high ? 0.7 : 1.8) xs.push(x);
  xs.push(31, BEAKHEAD - 0.4, BEAKHEAD + 0.2);
  if (high) for (const p of ports()) if (p.normal[2] > 0) xs.push(p.x0, p.x1);
  return uniqueSorted(xs, 0.04);
}
function sideRows(high: boolean) {
  const vs: number[] = [];
  for (let v = WATER; v <= 12.3; v += high ? 0.45 : 0.9) vs.push(v);
  vs.push(12.3, ...BANDS.flat());
  if (high) for (const spec of PORT_TIERS) vs.push(spec.sill, spec.sill + spec.height);
  return uniqueSorted(vs, 0.03);
}

// ---------------------------------------------------------------- hull

function hull(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-hull");
  const xs = columns(high);
  const vs = sideRows(high);
  const bottomRows = high ? 14 : 6;
  const builders = {
    copper: new MeshBuilder(),
    wale: new MeshBuilder(),
    band: new MeshBuilder(),
    stern: new MeshBuilder(),
    sternCopper: new MeshBuilder()
  };
  for (const side of [-1, 1]) {
    const flip = side < 0;
    builders.copper.grid(bottomRows, xs.length - 1, (i, j) =>
      bottomPoint(xs[flip ? xs.length - 1 - j : j], i / bottomRows, side)
    );
    for (let i = 0; i < vs.length - 1; i++) {
      const v0 = vs[i],
        v1 = vs[i + 1],
        mid = (v0 + v1) / 2;
      const target = inBand(mid) ? builders.band : builders.wale;
      for (let j = 0; j < xs.length - 1; j++) {
        const a = xs[j],
          b = xs[j + 1];
        if (v0 >= topV(a) - 1e-4 && v0 >= topV(b) - 1e-4) continue;
        if (high && cutByPort((a + b) / 2, mid)) continue;
        const q = [sidePoint(a, v0, side), sidePoint(b, v0, side), sidePoint(b, v1, side), sidePoint(a, v1, side)];
        if (flip) target.quad(q[1], q[0], q[3], q[2]);
        else target.quad(q[0], q[1], q[2], q[3]);
      }
    }
  }
  builders.copper.emit(kit, "hull-copper", "copper");
  builders.wale.emit(kit, "hull-topsides", "dark");
  builders.band.emit(kit, "hull-band", "tile");

  // Stern: the tuck below the counter and the raked transom above, closing both sides of the skin.
  const sternLevels: number[] = [];
  const rows = high ? 18 : 8;
  for (let i = 0; i <= rows; i++) sternLevels.push(lerp(keelY(POST_FOOT), WATER, i / rows));
  for (const v of vs) if (v > WATER) sternLevels.push(Math.min(heightAt(-27, v), heightAt(-27, topV(-28.5))));
  const levels = uniqueSorted(sternLevels, 0.02);
  for (let i = 0; i < levels.length - 1; i++) {
    const [y0, y1] = [levels[i], levels[i + 1]];
    const w0 = halfBreadth(aftX(y0), y0),
      w1 = halfBreadth(aftX(y1), y1);
    const target = y1 <= WATER + 1e-4 ? builders.sternCopper : builders.stern;
    target.quad(V(aftX(y0), y0, w0), V(aftX(y0), y0, -w0), V(aftX(y1), y1, -w1), V(aftX(y1), y1, w1));
  }
  builders.stern.emit(kit, "hull-stern", "dark");
  builders.sternCopper.emit(kit, "hull-copper", "copper");

  // Keel, stem and sternpost timbers on the centreline.
  kit.beam(
    "keel",
    [POST_FOOT - 0.3, keelY(POST_FOOT) + 0.28, 0],
    [STEM_FOOT + 0.2, keelY(STEM_FOOT) + 0.28, 0],
    0.55,
    "copper"
  );
  const stem: Position[] = [];
  for (let i = 0; i <= (high ? 14 : 6); i++) {
    const y = lerp(keelY(STEM_FOOT) + 0.3, HEAD_DECK + 0.6, i / (high ? 14 : 6));
    stem.push([stemX(y) + 0.12, y, 0]);
  }
  kit.tube("stem", stem, 0.28, "dark");
  kit.beam(
    "sternpost",
    [postX(keelY(POST_FOOT)) - 0.1, keelY(POST_FOOT) + 0.05, 0],
    [postX(COUNTER) - 0.1, COUNTER + 0.4, 0],
    0.5,
    "dark"
  );
  // Rudder hung on the sternpost, coppered below the water.
  const rudder = new MeshBuilder();
  const rudderCopper = new MeshBuilder();
  const steps = high ? 10 : 4;
  for (let i = 0; i < steps; i++) {
    const [y0, y1] = [
      lerp(keelY(POST_FOOT) + 0.1, COUNTER + 0.9, i / steps),
      lerp(keelY(POST_FOOT) + 0.1, COUNTER + 0.9, (i + 1) / steps)
    ];
    const chord = (y: number) => lerp(2.1, 0.7, clamp((y + 7.6) / 13, 0, 1));
    const target = y1 <= WATER + 0.3 ? rudderCopper : rudder;
    for (const z of [-0.3, 0.3])
      target.quad(
        V(postX(y0) - 0.35, y0, z),
        V(postX(y0) - 0.35 - chord(y0), y0, z),
        V(postX(y1) - 0.35 - chord(y1), y1, z),
        V(postX(y1) - 0.35, y1, z)
      );
    target.quad(
      V(postX(y0) - 0.35 - chord(y0), y0, -0.3),
      V(postX(y0) - 0.35 - chord(y0), y0, 0.3),
      V(postX(y1) - 0.35 - chord(y1), y1, 0.3),
      V(postX(y1) - 0.35 - chord(y1), y1, -0.3)
    );
  }
  rudder.emit(kit, "rudder", "dark");
  rudderCopper.emit(kit, "rudder", "copper");

  // Knee of the head: the cutwater carrying the figurehead forward of the stem.
  const shape = new THREE.Shape();
  shape.moveTo(stemX(-1.5), -1.5);
  shape.quadraticCurveTo(stemX(3) + 1.6, 3, 32.1, 6.4);
  shape.lineTo(32.2, 7.5);
  shape.lineTo(stemX(HEAD_DECK + 0.6) - 0.1, HEAD_DECK + 0.6);
  shape.lineTo(stemX(-1.5) - 0.1, -1.5);
  const knee = new THREE.ExtrudeGeometry(shape, { depth: 0.44, bevelEnabled: false, curveSegments: high ? 10 : 4 });
  knee.translate(0, 0, -0.22);
  kit.add("cutwater", knee, "dark");
  // Wale mouldings along the top and bottom of each yellow band.
  if (high)
    for (const side of [-1, 1])
      for (const [a, b] of BANDS)
        for (const v of [a, b]) {
          const points: Position[] = [];
          for (let x = -24.6; x <= 27.6; x += 2.6) points.push(P(sidePoint(x, v, side).add(V(0, 0, side * 0.03))));
          kit.tube("wale-moulding", points, 0.045, v === a ? "dark" : "tile");
        }
  return kit.finish();
}

/** Port linings through the side and the dark chambers of covered decks behind them. */
function gunFrames(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-gun-frames");
  const lining = new MeshBuilder();
  const chamber = new MeshBuilder();
  const painted = new MeshBuilder();
  for (const port of ports()) {
    const n = V(...port.normal);
    const side = Math.sign(port.normal[2]);
    if (!high) {
      // Low tier: the opening is painted on an uncut side.
      const r = V(...port.right).multiplyScalar(port.width / 2),
        u = V(...port.up).multiplyScalar(port.height / 2),
        c = V(...port.point).addScaledVector(n, 0.03);
      const q = [c.clone().sub(r).sub(u), c.clone().add(r).sub(u), c.clone().add(r).add(u), c.clone().sub(r).add(u)];
      if (side < 0) painted.quad(q[1], q[0], q[3], q[2]);
      else painted.quad(q[0], q[1], q[2], q[3]);
      continue;
    }
    const corners = [
      sidePoint(port.x0, port.v0, side),
      sidePoint(port.x1, port.v0, side),
      sidePoint(port.x1, port.v1, side),
      sidePoint(port.x0, port.v1, side)
    ];
    const inner = corners.map(c => c.clone().addScaledVector(n, -0.5));
    for (let k = 0; k < 4; k++) {
      const a = corners[k],
        b = corners[(k + 1) % 4];
      lining.quad(a, b, inner[(k + 1) % 4], inner[k]);
    }
    if (port.enclosed) {
      const r = V(...port.right).multiplyScalar(port.width / 2 + 0.25),
        u = V(...port.up).multiplyScalar(port.height / 2 + 0.25),
        c = V(...port.point).addScaledVector(n, -0.55);
      chamber.quad(c.clone().sub(r).sub(u), c.clone().add(r).sub(u), c.clone().add(r).add(u), c.clone().sub(r).add(u));
    }
  }
  lining.emit(kit, "gunport-lining", "ruby");
  chamber.emit(kit, "gunport-chamber", "earth");
  painted.emit(kit, "gunport-painted", "earth");
  return kit.finish();
}

function armament(high: boolean, closed: boolean) {
  const kit = kitOf("opus-ship-of-the-line-armament");
  const seg = high ? 12 : 7;
  for (const port of ports()) {
    const n = V(...port.normal);
    const level = V(n.x, 0, n.z).normalize();
    const [length, muzzle, breech] = port.spec.gun;
    const housed = closed && port.spec.lidded;
    const tip = V(...port.point)
      .addScaledVector(V(...port.up), -port.height * 0.12)
      .addScaledVector(level, housed ? -0.45 : port.spec.tier === "carronade" ? 0.25 : 0.55);
    const back = tip.clone().addScaledVector(level, -length);
    spar(kit, housed ? "cannon-housed" : "cannon-run-out", back, tip, breech, muzzle, seg, "iron");
    if (high) {
      const swell = kit.add("cannon-swell", new THREE.TorusGeometry(muzzle * 1.15, muzzle * 0.3, 5, 10), "iron");
      swell.position.copy(tip).addScaledVector(level, -0.12);
      swell.quaternion.setFromUnitVectors(V(0, 0, 1), level);
      const knob = kit.add("cascabel", new THREE.SphereGeometry(breech * 0.55, 8, 6), "iron");
      knob.position.copy(back).addScaledVector(level, -0.08);
      const carriage = kit.add("gun-carriage", new THREE.BoxGeometry(0.85, 0.5, length * 0.55), "ruby");
      carriage.position
        .copy(back)
        .addScaledVector(level, length * 0.3)
        .add(V(0, -breech - 0.22, 0));
      carriage.quaternion.setFromUnitVectors(V(0, 0, 1), level);
    }
    if (!port.spec.lidded) continue;
    const lid = port.height * 1.08;
    const width = port.width * 1.08;
    if (closed) {
      inFrame(kit, "gunport-lid-closed", port, V(0, 0, 0.07), [width, lid, 0.09], "dark");
      if (high) inFrame(kit, "gunport-lid-lining", port, V(0, 0, 0.015), [width * 0.94, lid * 0.94, 0.02], "ruby");
    } else {
      // Hinged at the head of the port but raised in a level frame, so lids on the twisted run aft hang alike.
      const hingePoint = V(...port.point)
        .addScaledVector(V(...port.up), port.height / 2 + 0.03)
        .addScaledVector(n, 0.07);
      const levelFrame = mount(port.id, port.tier, hingePoint, level, port.width, port.height);
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -THREE.MathUtils.degToRad(78));
      const hinge = V(0, 0, 0);
      inFrame(
        kit,
        "gunport-lid-open",
        levelFrame,
        hinge.clone().add(V(0, -lid / 2, 0).applyQuaternion(q)),
        [width, lid, 0.09],
        "dark",
        q
      );
      if (high)
        inFrame(
          kit,
          "gunport-lid-lining",
          levelFrame,
          hinge.clone().add(V(0, -lid / 2, -0.055).applyQuaternion(q)),
          [width * 0.94, lid * 0.94, 0.02],
          "ruby",
          q
        );
    }
  }
  return kit.finish();
}

// ---------------------------------------------------------------- decks and bulwarks

function deck(kit: Kit, name: string, x0: number, x1: number, v: number, inset: number, high: boolean, inner = 0) {
  const b = new MeshBuilder();
  const n = Math.max(2, Math.ceil((x1 - x0) / (high ? 0.5 : 1.5)));
  const row = (x: number) => {
    const y = heightAt(x, v);
    return { y, half: Math.max(0.05, halfBreadth(clamp(x, aftX(y), stemX(y)), y) - inset) };
  };
  for (let i = 0; i < n; i++) {
    const xa = lerp(x0, x1, i / n),
      xb = lerp(x0, x1, (i + 1) / n);
    const a = row(xa),
      c = row(xb);
    if (inner > 0) {
      for (const side of [-1, 1]) {
        const q = [
          V(xa, a.y, side * a.half),
          V(xb, c.y, side * c.half),
          V(xb, c.y, side * (c.half - inner)),
          V(xa, a.y, side * (a.half - inner))
        ];
        if (side < 0) b.quad(q[1], q[0], q[3], q[2]);
        else b.quad(q[0], q[1], q[2], q[3]);
      }
    } else b.quad(V(xa, a.y, a.half), V(xb, c.y, c.half), V(xb, c.y, -c.half), V(xa, a.y, -a.half));
  }
  b.emit(kit, name, "wood");
}
/** Red inner face of the bulwark above a weather deck, cut at its ports, and the rail cap over it. */
function bulwark(kit: Kit, x0: number, x1: number, v0: number, high: boolean) {
  const lining = new MeshBuilder();
  const cap = new MeshBuilder();
  const xs = columns(high).filter(x => x > x0 && x < x1);
  xs.unshift(x0);
  xs.push(x1);
  const vs = uniqueSorted([...sideRows(high).filter(v => v > v0), v0], 0.03);
  const inner = (x: number, v: number, side: number) => {
    const p = sidePoint(x, v, side);
    return V(p.x, p.y, p.z - side * 0.4);
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < vs.length - 1; i++)
      for (let j = 0; j < xs.length - 1; j++) {
        const [a, b] = [xs[j], xs[j + 1]];
        if (vs[i] >= topV(a) - 1e-4 && vs[i] >= topV(b) - 1e-4) continue;
        if (high && cutByPort((a + b) / 2, (vs[i] + vs[i + 1]) / 2)) continue;
        lining.quad(inner(a, vs[i], side), inner(b, vs[i], side), inner(b, vs[i + 1], side), inner(a, vs[i + 1], side));
      }
    for (let j = 0; j < xs.length - 1; j++) {
      const [a, b] = [xs[j], xs[j + 1]];
      cap.quad(
        sidePoint(a, 99, side).add(V(0, 0.02, side * 0.05)),
        sidePoint(b, 99, side).add(V(0, 0.02, side * 0.05)),
        inner(b, 99, side).add(V(0, 0.02, -side * 0.05)),
        inner(a, 99, side).add(V(0, 0.02, -side * 0.05))
      );
    }
  }
  lining.emit(kit, "bulwark-lining", "ruby");
  cap.emit(kit, "rail-cap", "oak");
}
/** Flat athwartships face across the hull at x between two deck-relative levels. */
function bulkhead(kit: Kit, name: string, x: number, v0: number, v1: number, inset: number, surface: Surface) {
  const b = new MeshBuilder();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const [va, vb] = [lerp(v0, v1, i / n), lerp(v0, v1, (i + 1) / n)];
    const [ya, yb] = [heightAt(x, va), heightAt(x, vb)];
    const [wa, wb] = [halfBreadth(x, ya) - inset, halfBreadth(x, yb) - inset];
    b.quad(V(x, ya, -wa), V(x, ya, wa), V(x, yb, wb), V(x, yb, -wb));
  }
  b.emit(kit, name, surface);
}
const deckY = (x: number, v: number) => heightAt(x, v);

function decks(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-decks");
  const sternAt = (v: number) => aftX(heightAt(-27, v)) + 0.35;
  deck(kit, "upper-deck", QD_FRONT - 0.6, FORECASTLE_AFT + 0.6, UPPER_DECK, 0.42, high);
  deck(kit, "quarterdeck", sternAt(QUARTER_DECK), QD_FRONT, QUARTER_DECK, 0.42, high);
  deck(kit, "poop-deck", sternAt(POOP_DECK), POOP_FRONT, POOP_DECK, 0.42, high);
  deck(kit, "forecastle-deck", FORECASTLE_AFT, BEAKHEAD, QUARTER_DECK, 0.42, high);
  deck(kit, "gangway", QD_FRONT, FORECASTLE_AFT, QUARTER_DECK, 0.42, high, 2);
  deck(kit, "head-grating", BEAKHEAD, 29.6, HEAD_DECK, 0.3, high);
  bulwark(kit, QD_FRONT, FORECASTLE_AFT, UPPER_DECK, high);
  bulwark(kit, POOP_FRONT, QD_FRONT, QUARTER_DECK, high);
  bulwark(kit, sternAt(POOP_DECK), POOP_FRONT, POOP_DECK, high);
  bulwark(kit, FORECASTLE_AFT, BEAKHEAD - 0.1, QUARTER_DECK, high);
  bulkhead(kit, "breastwork", QD_FRONT, UPPER_DECK, QUARTER_DECK, 2.45, "tile");
  bulkhead(kit, "breastwork", FORECASTLE_AFT, UPPER_DECK, QUARTER_DECK, 2.45, "tile");
  bulkhead(kit, "poop-bulkhead", POOP_FRONT, QUARTER_DECK, POOP_DECK, 0.42, "tile");
  bulkhead(kit, "beakhead-bulkhead", BEAKHEAD - 0.1, HEAD_DECK, topV(BEAKHEAD - 0.6), 0.1, "tile");
  // Doors and dark mouldings on the bulkheads.
  for (const z of [-2.2, 2.2]) {
    kit.box("bulkhead-door", [POOP_FRONT + 0.06, deckY(POOP_FRONT, QUARTER_DECK) + 0.95, z], [0.08, 1.9, 0.95], "dark");
    kit.box("bulkhead-door", [BEAKHEAD - 0.05, deckY(BEAKHEAD, HEAD_DECK) + 0.95, z * 0.7], [0.08, 1.8, 0.85], "dark");
  }
  if (high)
    for (let z = -4.6; z <= 4.6; z += 1.15)
      kit.box(
        "bulkhead-light",
        [POOP_FRONT + 0.06, deckY(POOP_FRONT, QUARTER_DECK) + 1.45, z],
        [0.06, 0.6, 0.45],
        "glass"
      );
  for (const v of [UPPER_DECK + 0.25, QUARTER_DECK - 0.15]) {
    const y = deckY(BEAKHEAD, v);
    const w = halfBreadth(BEAKHEAD, y);
    kit.box("bulkhead-moulding", [BEAKHEAD + 0.02, y, 0], [0.12, 0.22, 2 * w], "dark");
  }
  // Breast rails with stanchions at the deck breaks.
  for (const [x, v, from] of [
    [QD_FRONT, QUARTER_DECK, 2.6],
    [FORECASTLE_AFT, QUARTER_DECK, 2.6],
    [POOP_FRONT, POOP_DECK, 0.5]
  ] as const) {
    const y = deckY(x, v) + 1.05;
    const w = halfBreadth(x, y) - from;
    kit.beam("breast-rail", [x, y, -w], [x, y, w], 0.14, "oak");
    for (let z = -w; z <= w + 0.01; z += high ? 1.2 : 2.4)
      kit.beam("stanchion", [x, y - 1.05, z], [x, y, z], 0.08, "oak");
  }
  // Ladders down from the quarterdeck and forecastle into the waist.
  for (const [x, dir] of [
    [QD_FRONT, 1],
    [FORECASTLE_AFT, -1]
  ] as const)
    for (const z of [-1.5, 1.5]) {
      const top = V(x, deckY(x, QUARTER_DECK), z),
        bottom = V(x + dir * 1.5, deckY(x, UPPER_DECK), z);
      for (const dz of [-0.35, 0.35])
        spar(kit, "ladder", top.clone().add(V(0, 0, dz)), bottom.clone().add(V(0, 0, dz)), 0.05, 0.05, 4, "wood");
      if (high)
        for (let t = 0.12; t < 1; t += 0.14)
          kit.box("ladder-step", P(top.clone().lerp(bottom, t)), [0.22, 0.05, 0.7], "wood");
    }
  // Skid beams over the waist carry the boats.
  for (const x of [-1.6, 2.6, 6.8, 10.8]) {
    const y = deckY(x, QUARTER_DECK) + 0.75;
    const w = halfBreadth(x, y) - 1.2;
    kit.beam("skid-beam", [x, y, -w], [x, y, w], 0.26, "oak");
  }
  // Hatch coamings and gratings in the waist and on the quarterdeck.
  for (const [x, v, len] of [
    [1.2, UPPER_DECK, 2.4],
    [8.4, UPPER_DECK, 2.2],
    [-12.8, QUARTER_DECK, 1.6],
    [17.4, QUARTER_DECK, 1.6]
  ] as const) {
    kit.box("hatch-coaming", [x, deckY(x, v) + 0.18, 0], [len, 0.36, 2.2], "oak");
    kit.box("hatch-grating", [x, deckY(x, v) + 0.37, 0], [len - 0.2, 0.03, 2], "earth");
  }
  // Hammock nettings in canvas along the rails.
  if (high)
    for (const side of [-1, 1])
      for (let x = -24.4; x < 26; x += 1.9) {
        if (Math.abs(x - 22) < 0.2) continue;
        const top = sidePoint(x, 99, side);
        kit.box("hammock-netting", [x + 0.95, top.y + 0.38, top.z - side * 0.22], [1.85, 0.62, 0.48], "cloth");
      }
  return kit.finish();
}

// ---------------------------------------------------------------- fittings

function boat(kit: Kit, centre: THREE.Vector3, length: number, beam: number, depth: number, high: boolean) {
  const b = new MeshBuilder();
  const rows = high ? 14 : 6,
    rings = high ? 5 : 3;
  b.grid(rows, rings * 2, (i, j) => {
    const u = i / rows;
    const t = j / (rings * 2);
    const angle = Math.PI * t;
    const half = (beam / 2) * Math.sin(Math.PI * clamp(u * 0.92 + 0.04, 0, 1)) ** 0.55 * (u < 0.15 ? 0.85 + u : 1);
    return V(
      centre.x + (u - 0.5) * length,
      centre.y - depth * Math.sin(angle) * (1 - 0.25 * Math.abs(u - 0.5)),
      centre.z + half * Math.cos(angle)
    );
  });
  b.emit(kit, "ships-boat", "wood");
  for (const s of [-1, 1]) {
    const rail: Position[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const half = (beam / 2) * Math.sin(Math.PI * clamp(u * 0.92 + 0.04, 0, 1)) ** 0.55;
      rail.push([centre.x + (u - 0.5) * length, centre.y + 0.03, centre.z + s * half]);
    }
    kit.tube("boat-gunwale", rail, 0.06, "dark");
  }
  if (high)
    for (let k = 1; k < 5; k++)
      kit.box(
        "boat-thwart",
        [centre.x + (k / 5 - 0.5) * length * 0.8, centre.y - depth * 0.35, centre.z],
        [0.22, 0.05, beam * 0.85],
        "oak"
      );
}
function lantern(kit: Kit, base: THREE.Vector3, scale: number, high: boolean) {
  const seg = high ? 8 : 6;
  kit.cylinder(
    "lantern-base",
    P(base.clone().add(V(0, 0.12 * scale, 0))),
    0.42 * scale,
    0.24 * scale,
    "brass",
    0.5 * scale,
    seg
  );
  kit.cylinder(
    "lantern-glass",
    P(base.clone().add(V(0, 0.85 * scale, 0))),
    0.44 * scale,
    1.2 * scale,
    "amber",
    0.5 * scale,
    seg
  );
  kit.cylinder(
    "lantern-roof",
    P(base.clone().add(V(0, 1.7 * scale, 0))),
    0.52 * scale,
    0.5 * scale,
    "brass",
    0.08 * scale,
    seg
  );
  kit.sphere(
    "lantern-finial",
    P(base.clone().add(V(0, 2.05 * scale, 0))),
    [0.12 * scale, 0.18 * scale, 0.12 * scale],
    "brass"
  );
}
function anchor(kit: Kit, top: THREE.Vector3, side: number) {
  const crown = top.clone().add(V(0.3, -4.6, 0));
  kit.beam("anchor-shank", P(top), P(crown), 0.2, "iron");
  for (const dir of [-1, 1]) {
    const arm = crown.clone().add(V(dir * 1.35, 1.25, side * 0.15));
    kit.beam("anchor-arm", P(crown), P(arm), 0.18, "iron");
    kit.box("anchor-fluke", P(arm), [0.55, 0.5, 0.08], "iron").rotation.set(0, 0, dir * -0.8);
  }
  kit.beam("anchor-stock", P(top.clone().add(V(0, -0.4, -1.9))), P(top.clone().add(V(0, -0.4, 1.9))), 0.3, "oak");
  kit.ring("anchor-ring", P(top.clone().add(V(0, 0.25, 0))), 0.28, 0.05, "iron", true);
}
interface Channel {
  mast: MastSpec;
  x0: number;
  x1: number;
  v: number;
  shrouds: number;
}
function channelDeadeyes(ch: Channel, side: number) {
  return Array.from({ length: ch.shrouds }, (_, i) => {
    const x = lerp(ch.x1, ch.x0, i / (ch.shrouds - 1));
    const p = sidePoint(x, ch.v, side);
    return V(x, p.y + 0.5, p.z + side * 1.05);
  });
}

function fittings(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-fittings");
  // Double wheel just forward of the poop bulkhead, binnacle and main capstan.
  const wheelX = POOP_FRONT + 0.9;
  const wheelY = deckY(wheelX, QUARTER_DECK) + 1.05;
  for (const z of [-0.45, 0.45]) {
    const rim = kit.add("wheel-rim", new THREE.TorusGeometry(0.88, 0.05, 5, high ? 24 : 12), "oak");
    rim.position.set(wheelX, wheelY, z);
    if (high)
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        kit.beam(
          "wheel-spoke",
          [wheelX, wheelY, z],
          [wheelX + Math.cos(a) * 1.08, wheelY + Math.sin(a) * 1.08, z],
          0.05,
          "oak",
          true
        );
      }
  }
  kit.beam("wheel-axle", [wheelX, wheelY, -0.8], [wheelX, wheelY, 0.8], 0.14, "oak", true);
  for (const z of [-0.8, 0.8])
    kit.box(
      "wheel-stand",
      [wheelX, wheelY / 2 + deckY(wheelX, QUARTER_DECK) / 2, z],
      [0.28, wheelY - deckY(wheelX, QUARTER_DECK), 0.2],
      "oak"
    );
  kit.box("binnacle", [wheelX + 1.6, deckY(wheelX, QUARTER_DECK) + 0.55, 0], [0.7, 1.1, 1.4], "oak");
  const capX = -10.4;
  const capY = deckY(capX, QUARTER_DECK);
  kit.cylinder("capstan", [capX, capY + 0.45, 0], 0.5, 0.9, "oak", 0.42, high ? 12 : 8);
  kit.cylinder("capstan-drumhead", [capX, capY + 1.0, 0], 0.8, 0.22, "oak", 0.8, high ? 16 : 8);
  if (high)
    for (let k = 0; k < 6; k++)
      kit.beam(
        "capstan-bar",
        [capX, capY + 1.0, 0],
        [capX + Math.cos((k * Math.PI) / 3) * 2.2, capY + 1.0, Math.sin((k * Math.PI) / 3) * 2.2],
        0.08,
        "wood",
        true
      );
  // The launch and two cutters on the skids.
  const skid = deckY(5, QUARTER_DECK) + 0.88;
  boat(kit, V(4.6, skid + 1.1, 0), 10.4, 3.1, 1.1, high);
  boat(kit, V(4.2, skid + 0.85, 3.4), 7.6, 2.1, 0.8, high);
  boat(kit, V(4.2, skid + 0.85, -3.4), 7.6, 2.1, 0.8, high);
  // Three stern lanterns on the taffrail; the centre one larger, as a flagship's.
  const taffY = heightAt(-27.4, topV(-28));
  const taffX = transomX(taffY) + 0.55;
  for (const [z, scale] of [
    [0, 1.15],
    [-2.7, 0.9],
    [2.7, 0.9]
  ] as const) {
    lantern(kit, V(taffX, taffY + 0.2, z), scale, high);
    kit.beam("lantern-bracket", [taffX + 0.6, taffY - 0.2, z], [taffX, taffY + 0.25, z], 0.12, "brass");
  }
  kit.box("taffrail", [taffX - 0.2, taffY + 0.06, 0], [0.28, 0.42, 2 * halfBreadth(taffX, taffY) - 0.2], "tile");
  // Rails across the stern between the tiers of lights.
  for (const v of [3.2, 5.25, 7.35, 9.4]) {
    const y = heightAt(-27, v);
    const x = transomX(y) - 0.08;
    kit.box("stern-rail", [x, y, 0], [0.16, 0.2, 2 * halfBreadth(x, y) - 0.05], "tile").rotation.z = -Math.atan(0.22);
  }
  // Closed quarter galleries.
  for (const side of [-1, 1]) {
    const b = new MeshBuilder();
    const ribs = high ? 8 : 4;
    const face = (x: number, v: number, out: number) => {
      const base = sidePoint(x, v, side);
      return V(base.x, base.y, base.z + side * out);
    };
    const bulge = (v: number) =>
      GALLERY.out * Math.sin(Math.PI * clamp((v - GALLERY.v0 + 0.4) / (GALLERY.v1 - GALLERY.v0 + 0.8), 0, 1)) ** 0.4;
    b.grid(ribs, 4, (i, j) =>
      face(
        lerp(GALLERY.x0, GALLERY.x1, j / 4),
        lerp(GALLERY.v0, GALLERY.v1, i / ribs),
        bulge(lerp(GALLERY.v0, GALLERY.v1, i / ribs))
      )
    );
    for (const x of [GALLERY.x0, GALLERY.x1])
      b.grid(ribs, 1, (i, j) => {
        const v = lerp(GALLERY.v0, GALLERY.v1, i / ribs);
        return face(x, v, j * bulge(v));
      });
    b.emit(kit, "quarter-gallery", "dark");
    for (const v of [5.25, 7.35, GALLERY.v1 - 0.1]) {
      const p = face((GALLERY.x0 + GALLERY.x1) / 2, v, bulge(v) + 0.05);
      kit.box("gallery-rail", P(p), [GALLERY.x1 - GALLERY.x0 + 0.1, 0.18, 0.12], "tile");
    }
    const drop = kit.add("gallery-drop", new THREE.ConeGeometry(0.75, 1.9, high ? 10 : 6), "tile");
    drop.position.copy(face(-24.4, GALLERY.v0 - 0.8, 0.45));
    drop.rotation.x = Math.PI;
    drop.scale.set(1.9, 1, 0.75);
    const crown = kit.add(
      "gallery-crown",
      new THREE.SphereGeometry(0.7, high ? 10 : 6, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      "tile"
    );
    crown.position.copy(face(-24.4, GALLERY.v1, 0.45));
    crown.scale.set(2.3, 0.9, 0.85);
  }
  // Chainwales above the ports, with deadeyes and chain plates.
  for (const ch of CHANNELS)
    for (const side of [-1, 1]) {
      const b = new MeshBuilder();
      const n = 6;
      for (let i = 0; i < n; i++) {
        const [xa, xb] = [lerp(ch.x0 - 0.3, ch.x1 + 0.3, i / n), lerp(ch.x0 - 0.3, ch.x1 + 0.3, (i + 1) / n)];
        const [pa, pb] = [sidePoint(xa, ch.v, side), sidePoint(xb, ch.v, side)];
        for (const dy of [0, 0.2]) {
          const q = [
            pa.clone().add(V(0, dy, 0)),
            pb.clone().add(V(0, dy, 0)),
            pb.clone().add(V(0, dy, side * 1.15)),
            pa.clone().add(V(0, dy, side * 1.15))
          ];
          b.quad(q[0], q[1], q[2], q[3]);
        }
        b.quad(
          pa.clone().add(V(0, 0, side * 1.15)),
          pb.clone().add(V(0, 0, side * 1.15)),
          pb.clone().add(V(0, 0.2, side * 1.15)),
          pa.clone().add(V(0, 0.2, side * 1.15))
        );
      }
      b.emit(kit, "chainwale", "dark");
      for (const eye of channelDeadeyes(ch, side)) {
        const deadeye = kit.cylinder(
          "deadeye",
          P(eye.clone().add(V(0, -0.15, 0))),
          0.17,
          0.12,
          "dark",
          0.17,
          high ? 10 : 6
        );
        deadeye.rotation.x = Math.PI / 2;
        const foot = sidePoint(eye.x, ch.v - 1.2, side).add(V(0, 0, side * 0.08));
        kit.beam("chain-plate", P(eye.clone().add(V(0, -0.3, -side * 0.02))), P(foot), 0.07, "iron");
      }
    }
  // Catheads and the bower anchors.
  for (const side of [-1, 1]) {
    const root = sidePoint(25.2, topV(25.2) - 0.2, side);
    const tip = root.clone().add(V(0.9, 0.35, side * 1.7));
    kit.beam("cathead", P(root.clone().add(V(-0.6, 0, -side * 0.6))), P(tip), 0.4, "dark");
    anchor(kit, V(tip.x - 0.2, tip.y - 0.35, tip.z - side * 0.35), side);
  }
  // Head rails from the figurehead to the bows, and the gilt figurehead group.
  for (const [level, drop] of [
    [HEAD_DECK + 2.6, 0],
    [HEAD_DECK + 1.5, 0.7]
  ] as const)
    for (const side of [-1, 1]) {
      const bow = sidePoint(BEAKHEAD - 0.3, level - 0.6, side);
      kit.tube(
        "head-rail",
        [
          [31.7, 7.1 - drop, side * 0.2],
          [30.4, level - 0.35 - drop * 0.6, side * 0.9],
          [28.9, level - 0.2 - drop * 0.3, side * 1.6],
          P(bow)
        ],
        0.09,
        "tile"
      );
    }
  kit.box("figurehead-shield", [32.05, 7.85, 0], [0.35, 1.5, 1.15], "brass").rotation.z = -0.32;
  for (const z of [-0.6, 0.6]) {
    kit.sphere("figurehead-supporter", [31.85, 7.55, z], [0.32, 0.55, 0.26], "brass");
    kit.sphere("figurehead-supporter", [31.95, 8.25, z], [0.2, 0.2, 0.2], "brass");
  }
  kit.sphere("figurehead-crown", [32.2, 8.75, 0], [0.32, 0.26, 0.32], "brass");
  return kit.finish();
}

// ---------------------------------------------------------------- masts and spars

interface YardSpec {
  id: string;
  y: number;
  length: number;
  radius: number;
  sail?: string;
}
interface MastSpec {
  id: "fore" | "main" | "mizzen";
  x: number;
  deck: number;
  platform: number;
  head: number;
  crosstree: number;
  topHead: number;
  gallantHead: number;
  truck: number;
  radius: [number, number, number];
  top: [number, number];
  yards: YardSpec[];
}
const MASTS: readonly MastSpec[] = [
  {
    id: "fore",
    x: 16.4,
    deck: QUARTER_DECK,
    platform: 24.6,
    head: 27.6,
    crosstree: 39.6,
    topHead: 42.2,
    gallantHead: 50.4,
    truck: 56.6,
    radius: [0.5, 0.31, 0.19],
    top: [4, 6],
    yards: [
      { id: "fore-yard", y: 22.9, length: 28.3, radius: 0.33, sail: "fore-course" },
      { id: "fore-topsail-yard", y: 38.4, length: 20.7, radius: 0.24, sail: "fore-topsail" },
      { id: "fore-topgallant-yard", y: 47.6, length: 12.5, radius: 0.15, sail: "fore-topgallant" },
      { id: "fore-royal-yard", y: 53.6, length: 8.4, radius: 0.1, sail: "fore-royal" }
    ]
  },
  {
    id: "main",
    x: -1.2,
    deck: UPPER_DECK,
    platform: 27.2,
    head: 30.4,
    crosstree: 43.6,
    topHead: 46.4,
    gallantHead: 55.6,
    truck: 62.36,
    radius: [0.56, 0.34, 0.2],
    top: [4.4, 6.6],
    yards: [
      { id: "main-yard", y: 25.4, length: 31, radius: 0.36, sail: "main-course" },
      { id: "main-topsail-yard", y: 42.4, length: 22.9, radius: 0.26, sail: "main-topsail" },
      { id: "main-topgallant-yard", y: 52.6, length: 13.8, radius: 0.16, sail: "main-topgallant" },
      { id: "main-royal-yard", y: 59.2, length: 9.4, radius: 0.11, sail: "main-royal" }
    ]
  },
  {
    id: "mizzen",
    x: -15.8,
    deck: QUARTER_DECK,
    platform: 21.2,
    head: 23.8,
    crosstree: 33,
    topHead: 35.2,
    gallantHead: 41.2,
    truck: 44.4,
    radius: [0.37, 0.23, 0.14],
    top: [3, 4.4],
    yards: [
      { id: "crossjack-yard", y: 19.6, length: 21.3, radius: 0.24 },
      { id: "mizzen-topsail-yard", y: 32, length: 15.8, radius: 0.18, sail: "mizzen-topsail" },
      { id: "mizzen-topgallant-yard", y: 39.4, length: 9.6, radius: 0.11, sail: "mizzen-topgallant" }
    ]
  }
];
const mast = (id: MastSpec["id"]) => MASTS.find(m => m.id === id)!;
const CHANNELS: readonly Channel[] = [
  { mast: mast("fore"), x0: 11.9, x1: 17.6, v: 7, shrouds: 8 },
  { mast: mast("main"), x0: -5.9, x1: 0.1, v: 7, shrouds: 9 },
  { mast: mast("mizzen"), x0: -19.8, x1: -15.2, v: 9, shrouds: 6 }
];
/** Topmast and topgallant mast stand forward of the mast below, joined by the caps. */
const topmastX = (m: MastSpec) => m.x + m.radius[0] * 0.85 + m.radius[1] + 0.04;
const gallantX = (m: MastSpec) => topmastX(m) + m.radius[1] * 0.8 + m.radius[2] + 0.03;
function mastXAt(m: MastSpec, y: number) {
  if (y > m.topHead - 0.6) return gallantX(m);
  if (y > m.head - 0.4) return topmastX(m);
  return m.x;
}
function mastRadiusAt(m: MastSpec, y: number) {
  if (y > m.topHead - 0.6) return m.radius[2];
  if (y > m.head - 0.4) return m.radius[1];
  return m.radius[0];
}
const yardX = (m: MastSpec, yard: YardSpec) => mastXAt(m, yard.y) + mastRadiusAt(m, yard.y) + yard.radius + 0.05;
const BOWSPRIT_HEEL = V(24.5, 8.3, 0);
const BOWSPRIT_DIR = V(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0);
const bowsprit = (t: number) => BOWSPRIT_HEEL.clone().addScaledVector(BOWSPRIT_DIR, t);
const BOWSPRIT_END = bowsprit(13.5);
const JIB_BOOM_HEEL = bowsprit(10.5);
const JIB_BOOM_END = bowsprit(18.35);
const SPRITSAIL_YARD = bowsprit(10.8).add(V(0, -0.55, 0));
const GAFF = [V(-16.35, 24.2, 0), V(-26.8, 28.6, 0)] as const;
const BOOM = [V(-16.35, 11.9, 0), V(-29.6, 12.5, 0)] as const;

function spars(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-spars");
  const seg = high ? 14 : 7;
  for (const m of MASTS) {
    const foot = deckY(m.x, m.deck);
    spar(kit, "lower-mast", V(m.x, foot - 0.2, 0), V(m.x, m.head, 0), m.radius[0], m.radius[0] * 0.82, seg);
    spar(
      kit,
      "topmast",
      V(topmastX(m), m.platform - 1.1, 0),
      V(topmastX(m), m.topHead, 0),
      m.radius[1],
      m.radius[1] * 0.78,
      seg
    );
    spar(
      kit,
      "topgallant-mast",
      V(gallantX(m), m.crosstree - 0.9, 0),
      V(gallantX(m), m.truck, 0),
      m.radius[2],
      m.radius[2] * 0.5,
      seg
    );
    kit.sphere("truck", [gallantX(m), m.truck + 0.05, 0], [0.18, 0.08, 0.18], "oak");
    if (high)
      for (let y = foot + 1.5; y < m.platform - 2; y += 1.4)
        kit.ring("mast-woolding", [m.x, y, 0], m.radius[0] * 1.02, 0.035, "dark");
    // The top: platform, rim and trestle trees; caps at the mastheads; crosstrees.
    const [depth, width] = m.top;
    kit.box("fighting-top", [m.x + 0.3, m.platform, 0], [depth, 0.22, width], "oak");
    kit.box("top-rim", [m.x + 0.3 - depth / 2, m.platform + 0.45, 0], [0.12, 0.7, width], "dark");
    for (const z of [-0.45, 0.45])
      kit.box("trestle-tree", [m.x + 0.3, m.platform - 0.2, z], [depth * 0.8, 0.3, 0.2], "oak");
    kit.box(
      "mast-cap",
      [(m.x + topmastX(m)) / 2, m.head + 0.2, 0],
      [topmastX(m) - m.x + m.radius[1] * 2 + 0.6, 0.4, m.radius[0] * 2 + 0.2],
      "dark"
    );
    kit.box(
      "mast-cap",
      [(topmastX(m) + gallantX(m)) / 2, m.topHead + 0.12, 0],
      [gallantX(m) - topmastX(m) + m.radius[2] * 2 + 0.4, 0.28, m.radius[1] * 2 + 0.15],
      "dark"
    );
    kit.box("crosstree", [topmastX(m) + 0.2, m.crosstree, 0], [0.18, 0.18, width * 0.55], "oak");
    for (const z of [-0.3, 0.3])
      kit.box("crosstree-trestle", [topmastX(m) + 0.2, m.crosstree - 0.1, z], [2, 0.18, 0.14], "oak");
    for (const yard of m.yards) {
      const x = yardX(m, yard);
      const c = V(x, yard.y, 0);
      for (const s of [-1, 1])
        spar(kit, "yard", c, V(x, yard.y, (s * yard.length) / 2), yard.radius, yard.radius * 0.45, high ? 10 : 6);
      if (high) kit.beam("yard-sling", [x, yard.y + 0.1, 0], [mastXAt(m, yard.y), yard.y + 0.5, 0], 0.08, "dark");
    }
  }
  spar(kit, "bowsprit", BOWSPRIT_HEEL, BOWSPRIT_END, 0.55, 0.32, seg);
  spar(kit, "jib-boom", JIB_BOOM_HEEL, JIB_BOOM_END, 0.24, 0.12, seg);
  kit.box("bowsprit-cap", P(bowsprit(13.3)), [0.5, 0.75, 0.75], "dark").rotation.z = Math.PI / 6;
  spar(kit, "dolphin-striker", bowsprit(13.1), bowsprit(13.1).add(V(0.3, -2.4, 0)), 0.09, 0.07, 6);
  for (const s of [-1, 1])
    spar(kit, "yard", SPRITSAIL_YARD, SPRITSAIL_YARD.clone().add(V(0, 0, s * 9)), 0.22, 0.1, high ? 10 : 6);
  spar(kit, "spanker-gaff", GAFF[0], GAFF[1], 0.2, 0.12, high ? 10 : 6);
  spar(kit, "spanker-boom", BOOM[0], BOOM[1], 0.24, 0.16, high ? 10 : 6);
  spar(kit, "ensign-staff", V(-27.9, 12.4, 0), V(-28.2, 16.2, 0), 0.08, 0.05, 6);
  return kit.finish();
}

// ---------------------------------------------------------------- rigging

type Segment = readonly [Position, Position];
function along(a: THREE.Vector3, b: THREE.Vector3, y: number) {
  return a.clone().lerp(b, (y - a.y) / (b.y - a.y));
}
function ratlines(segments: Segment[], lines: [THREE.Vector3, THREE.Vector3][], spacing: number) {
  for (let i = 0; i < lines.length - 1; i++) {
    const [a0, a1] = lines[i],
      [b0, b1] = lines[i + 1];
    const y0 = Math.max(a0.y, b0.y) + 0.6,
      y1 = Math.min(a1.y, b1.y) - 0.5;
    for (let y = y0; y < y1; y += spacing) segments.push([P(along(a0, a1, y)), P(along(b0, b1, y))]);
  }
}
function rigging(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-rigging");
  const standing: Segment[] = [];
  const rungs: Segment[] = [];
  const running: Segment[] = [];
  const seg = (list: Segment[], a: THREE.Vector3, b: THREE.Vector3) => list.push([P(a), P(b)]);
  for (const ch of CHANNELS) {
    const m = ch.mast;
    const [depth, width] = m.top;
    for (const side of [-1, 1]) {
      const lower = channelDeadeyes(ch, side).map(
        eye => [eye, V(m.x, m.platform - 0.6, side * (m.radius[0] + 0.15))] as [THREE.Vector3, THREE.Vector3]
      );
      for (const [a, b] of lower) seg(standing, a, b);
      if (high) ratlines(rungs, lower, 0.42);
      const count = m.id === "mizzen" ? 3 : 4;
      const rim = Array.from({ length: count }, (_, i) =>
        V(m.x + 0.3 + depth * 0.15 - i * depth * 0.22, m.platform + 0.1, side * width * 0.48)
      );
      const top = rim.map(
        r => [r, V(topmastX(m), m.crosstree - 0.3, side * (m.radius[1] + 0.12))] as [THREE.Vector3, THREE.Vector3]
      );
      for (const [a, b] of top) seg(standing, a, b);
      if (high) {
        ratlines(rungs, top, 0.4);
        for (const r of rim) seg(standing, r, V(m.x, m.platform - 2.4, side * (m.radius[0] + 0.1)));
      }
      const spread = width * 0.27;
      for (const dx of [-0.6, 0.6])
        seg(standing, V(topmastX(m) + dx, m.crosstree, side * spread), V(gallantX(m), m.gallantHead - 0.4, side * 0.2));
      // Backstays from the topmast and topgallant mastheads to the after end of the chainwale.
      const backstayFoot = sidePoint(ch.x0 - 1.2, ch.v, side).add(V(0, 0.5, side * 1.05));
      seg(standing, V(topmastX(m), m.topHead - 0.5, side * 0.3), backstayFoot);
      seg(standing, V(topmastX(m), m.topHead - 0.5, side * 0.3), backstayFoot.clone().add(V(-0.9, 0, 0)));
      seg(standing, V(gallantX(m), m.gallantHead - 0.3, side * 0.2), backstayFoot.clone().add(V(-1.8, 0, 0)));
    }
  }
  const fore = mast("fore"),
    main = mast("main"),
    miz = mast("mizzen");
  const fcslY = deckY(23.4, QUARTER_DECK) + 0.4;
  for (const [a, b] of [
    [V(fore.x + 0.5, fore.platform - 0.8, 0), bowsprit(5.5)],
    [V(fore.x + 0.5, fore.platform - 1.2, 0), bowsprit(4.6)],
    [V(topmastX(fore), fore.topHead - 0.4, 0), BOWSPRIT_END],
    [V(topmastX(fore), fore.topHead - 0.2, 0), bowsprit(16)],
    [V(gallantX(fore), fore.gallantHead - 0.3, 0), JIB_BOOM_END],
    [V(gallantX(fore), fore.truck - 0.8, 0), JIB_BOOM_END],
    [V(main.x + 0.55, main.platform - 0.8, 0), V(23.4, fcslY, 0)],
    [V(main.x + 0.55, main.platform - 1.3, 0), V(21.8, fcslY, 0)],
    [V(topmastX(main), main.topHead - 0.4, 0), V(fore.x + 0.6, fore.platform + 0.2, 0)],
    [V(gallantX(main), main.gallantHead - 0.3, 0), V(topmastX(fore), fore.crosstree, 0)],
    [V(gallantX(main), main.truck - 0.8, 0), V(gallantX(fore), fore.gallantHead - 0.2, 0)],
    [V(miz.x + 0.4, miz.platform - 0.6, 0), V(main.x - 0.6, 12.4, 0)],
    [V(topmastX(miz), miz.topHead - 0.3, 0), V(main.x - 0.4, main.platform - 0.8, 0)],
    [V(gallantX(miz), miz.gallantHead - 0.3, 0), V(topmastX(main), main.crosstree, 0)],
    [bowsprit(13.3), V(31.5, 4.2, 0)],
    [bowsprit(9), V(30.9, 3, 0)],
    [JIB_BOOM_END, bowsprit(13.1).add(V(0.3, -2.4, 0))],
    [bowsprit(13.1).add(V(0.3, -2.4, 0)), V(31.8, 5.6, 0)]
  ] as const)
    seg(standing, a, b);
  // Lifts and braces on every yard.
  const braceLead: Record<string, (side: number) => THREE.Vector3> = {
    "fore-yard": s => sidePoint(-3, 99, s).add(V(0, 0.4, 0)),
    "fore-topsail-yard": s => V(main.x + 0.3, main.platform, s * 2.6),
    "fore-topgallant-yard": s => V(topmastX(main), main.crosstree, s * 1.4),
    "fore-royal-yard": s => V(gallantX(main), main.gallantHead, s * 0.4),
    "main-yard": s => sidePoint(-22.4, 99, s).add(V(0, 0.4, 0)),
    "main-topsail-yard": s => V(miz.x + 0.3, miz.platform, s * 1.8),
    "main-topgallant-yard": s => V(topmastX(miz), miz.crosstree, s * 1),
    "main-royal-yard": s => V(gallantX(miz), miz.gallantHead, s * 0.3),
    "crossjack-yard": s => sidePoint(-1.5, 99, s).add(V(0, 0.4, 0)),
    "mizzen-topsail-yard": s => V(main.x - 0.4, main.platform - 1, s * 2.4),
    "mizzen-topgallant-yard": s => V(topmastX(main), main.crosstree - 1, s * 1.2)
  };
  for (const m of MASTS)
    for (const yard of m.yards) {
      const x = yardX(m, yard);
      const above = m.yards.find(y => y.y > yard.y)?.y ?? m.truck - 1;
      const liftTop = V(mastXAt(m, Math.min(above, yard.y + 3.2)), Math.min(above - 0.3, yard.y + 3.2), 0);
      for (const s of [-1, 1]) {
        const arm = V(x, yard.y, (s * yard.length) / 2 - s * 0.35);
        seg(running, arm, liftTop.clone().add(V(0, 0, s * 0.25)));
        seg(running, arm, braceLead[yard.id](s));
      }
    }
  for (const s of [-1, 1]) {
    seg(running, SPRITSAIL_YARD.clone().add(V(0, 0, s * 8.6)), bowsprit(12.4));
    seg(running, SPRITSAIL_YARD.clone().add(V(0, 0, s * 8.6)), sidePoint(25, 99, s));
  }
  seg(running, GAFF[1], V(topmastX(miz), miz.crosstree - 1.5, 0));
  seg(running, GAFF[0].clone().lerp(GAFF[1], 0.5), V(topmastX(miz), miz.crosstree - 2.5, 0));
  seg(running, BOOM[1], V(-26.6, deckY(-26.6, POOP_DECK) + 0.2, 0));
  kit.lines("standing-rigging", standing, TARRED);
  kit.lines("ratlines", rungs, TARRED);
  kit.lines("running-rigging", running, RUNNING);
  return kit.finish();
}

// ---------------------------------------------------------------- sails

interface SquareSail {
  id: string;
  mast: MastSpec;
  yard: YardSpec;
  /** Head and foot heights and widths. */
  footY: number;
  footWidth: number;
  course: boolean;
}
const SQUARE_SAILS: readonly SquareSail[] = MASTS.flatMap(m =>
  m.yards.flatMap((yard, index) => {
    if (!yard.sail) return [];
    const below = m.yards[index - 1];
    const course = !below;
    return [
      {
        id: yard.sail,
        mast: m,
        yard,
        course,
        footY: course ? (m.id === "fore" ? 11.2 : 10.8) : below.y + yard.radius + 0.45,
        footWidth: course ? yard.length * 0.98 : below.length * 0.86
      }
    ];
  })
);
function clothGrid(kit: Kit, name: string, rows: number, cols: number, at: (u: number, v: number) => THREE.Vector3) {
  const b = new MeshBuilder();
  b.grid(rows, cols, (i, j) => at(j / cols, i / rows));
  b.emit(kit, name, "white");
}
function squareCloth(sail: SquareSail, furled: boolean, high: boolean) {
  const kit = kitOf(`opus-ship-of-the-line-${sail.id}`);
  const x = yardX(sail.mast, sail.yard);
  const headY = sail.yard.y - sail.yard.radius * 0.4;
  const head = sail.yard.length * 0.88;
  if (furled) {
    const r = 0.06 + 0.011 * sail.yard.length * (sail.course ? 1.2 : 1);
    addSailBundle(
      kit,
      "furled-sail",
      [x + 0.08, sail.yard.y + sail.yard.radius + r * 0.7, -head / 2],
      [x + 0.08, sail.yard.y + sail.yard.radius + r * 0.7, head / 2],
      r,
      high
    );
    return kit.finish();
  }
  const height = headY - sail.footY;
  const depth = height * (sail.course ? 0.13 : 0.11);
  const at = (u: number, v: number) => {
    const half = lerp(head, sail.footWidth, v) / 2;
    const roach = sail.course ? 0.7 * Math.sin(Math.PI * u) * v ** 3 : 0.35 * Math.sin(Math.PI * u) * v ** 3;
    const belly = depth * Math.sin(Math.PI * u) ** 0.7 * Math.sin(Math.PI * v * 0.8);
    return V(x + sail.yard.radius + 0.06 + belly + 0.25 * v, headY - v * height + roach, lerp(-half, half, u));
  };
  clothGrid(kit, "square-sail", high ? 10 : 3, high ? 12 : 4, at);
  if (high)
    for (const u of [0.25, 0.5, 0.75]) {
      const band: Position[] = [];
      for (let v = 0; v <= 1.001; v += 0.125) band.push(P(at(u, v).add(V(0.025, 0, 0))));
      kit.tube("sail-seam", band, 0.02, "cloth");
    }
  if (sail.course) {
    const sheets: Segment[] = [];
    for (const s of [-1, 1]) {
      const clew = at(s < 0 ? 0 : 1, 1);
      sheets.push([P(clew), P(sidePoint(clew.x - 9, 99, s))]);
      sheets.push([P(clew), P(sidePoint(clew.x + 7, 99, s))]);
    }
    kit.lines("sheet", sheets, RUNNING);
  }
  return kit.finish();
}
function spritsail(furled: boolean, high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-spritsail");
  const y = SPRITSAIL_YARD;
  if (furled) {
    addSailBundle(kit, "furled-sail", [y.x + 0.05, y.y + 0.4, -7.6], [y.x + 0.05, y.y + 0.4, 7.6], 0.26, high);
    return kit.finish();
  }
  clothGrid(kit, "square-sail", high ? 8 : 3, high ? 12 : 4, (u, v) => {
    const half = lerp(15.6, 16.8, v) / 2;
    return V(
      y.x + 0.25 + 0.75 * Math.sin(Math.PI * u) ** 0.7 * Math.sin(Math.PI * v * 0.8) + 1.4 * v,
      y.y - 0.2 - v * 5.2,
      lerp(-half, half, u)
    );
  });
  return kit.finish();
}
interface HeadSail {
  id: string;
  stay: readonly [THREE.Vector3, THREE.Vector3];
  luff: readonly [number, number];
  /** Clew offset aft and up from the tack. */
  clew: readonly [number, number];
}
const fore = mast("fore");
const HEAD_SAILS: readonly HeadSail[] = [
  {
    id: "fore-topmast-staysail",
    stay: [V(topmastX(fore), fore.topHead - 0.4, 0), BOWSPRIT_END],
    luff: [0.12, 0.93],
    clew: [-9.5, 3.4]
  },
  { id: "jib", stay: [V(topmastX(fore), fore.topHead - 0.2, 0), bowsprit(16)], luff: [0.08, 0.95], clew: [-11, 4.6] },
  {
    id: "flying-jib",
    stay: [V(gallantX(fore), fore.gallantHead - 0.3, 0), JIB_BOOM_END],
    luff: [0.1, 0.96],
    clew: [-10.5, 6.4]
  }
];
function triangleCloth(
  kit: Kit,
  name: string,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  bulge: number,
  rows: number
) {
  const builder = new MeshBuilder();
  const at = (s: number, t: number) => {
    const p = a.clone().addScaledVector(b.clone().sub(a), s).addScaledVector(c.clone().sub(a), t);
    const r = 1 - s - t;
    p.z += bulge * 27 * s * t * r;
    return p;
  };
  const index: number[][] = [];
  for (let i = 0; i <= rows; i++) {
    index.push([]);
    for (let j = 0; j <= rows - i; j++) index[i].push(builder.vertex(at(i / rows, j / rows)));
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < rows - i; j++) {
      builder.indices.push(index[i][j], index[i + 1][j], index[i][j + 1]);
      if (j < rows - i - 1) builder.indices.push(index[i + 1][j], index[i + 1][j + 1], index[i][j + 1]);
    }
  builder.emit(kit, name, "white");
}
function headCloth(sail: HeadSail, furled: boolean, high: boolean) {
  const kit = kitOf(`opus-ship-of-the-line-${sail.id}`);
  const [top, bottom] = sail.stay;
  const head = bottom.clone().lerp(top, sail.luff[1]);
  const tack = bottom.clone().lerp(top, sail.luff[0]);
  if (furled) {
    addSailBundle(
      kit,
      "furled-sail",
      P(tack.clone().add(V(0, 0.3, 0))),
      P(
        tack
          .clone()
          .lerp(head, 0.3)
          .add(V(0, 0.3, 0))
      ),
      0.24,
      high
    );
    return kit.finish();
  }
  const clew = tack.clone().add(V(sail.clew[0], sail.clew[1], 0));
  triangleCloth(kit, "jib-sail", head, tack, clew, 1.1, high ? 10 : 3);
  kit.lines("sheet", [[P(clew), P(sidePoint(clew.x - 3, 99, 1))]], RUNNING);
  return kit.finish();
}
function spankerCloth(furled: boolean, high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-spanker");
  const throat = GAFF[0].clone().add(V(-0.35, -0.3, 0)),
    peak = GAFF[1].clone().add(V(0.3, -0.25, 0)),
    clew = BOOM[1].clone().add(V(0.5, 0.25, 0)),
    tack = BOOM[0].clone().add(V(-0.35, 0.3, 0));
  if (furled) {
    addSailBundle(
      kit,
      "furled-sail",
      [throat.x - 0.2, tack.y + 0.4, 0],
      [throat.x - 0.2, throat.y - 0.4, 0],
      0.42,
      high
    );
    return kit.finish();
  }
  clothGrid(kit, "spanker", high ? 10 : 3, high ? 10 : 3, (u, v) => {
    const top = throat.clone().lerp(peak, u),
      foot = tack.clone().lerp(clew, u);
    const p = top.lerp(foot, v);
    p.z += 1.2 * Math.sin(Math.PI * u) ** 0.8 * Math.sin(Math.PI * v);
    return p;
  });
  return kit.finish();
}

// ---------------------------------------------------------------- flags

function flagPatch(
  kit: Kit,
  name: string,
  hoist: THREE.Vector3,
  drop: number,
  fly: number,
  dir: THREE.Vector3,
  rect: readonly [number, number, number, number],
  surface: Surface,
  offset: number,
  high: boolean
) {
  const [u0, u1, v0, v1] = rect;
  const normal = dir
    .clone()
    .cross(V(0, 1, 0))
    .normalize();
  const rows = high ? 6 : 2,
    cols = high ? 10 : 3;
  const b = new MeshBuilder();
  b.grid(rows, cols, (i, j) => {
    const u = lerp(u0, u1, j / cols),
      v = lerp(v0, v1, i / rows);
    const wave = 0.32 * u * Math.sin(u * 7.5 + v * 1.4);
    return hoist
      .clone()
      .addScaledVector(dir, u * fly)
      .add(V(0, -v * drop - 0.4 * u * u, 0))
      .addScaledVector(normal, wave + offset);
  });
  b.emit(kit, name, surface);
}
function flags(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-flags");
  const dir = V(0.32, 0, 0.95).normalize();
  // White ensign of 1801 at the gaff peak, with a simplified Union in the canton.
  const ensign = GAFF[1].clone().add(V(0.05, -0.1, 0));
  const [drop, fly] = [3.4, 6.2];
  flagPatch(kit, "ensign", ensign, drop, fly, dir, [0, 1, 0, 1], "white", 0, high);
  for (const offset of [-0.03, 0.03]) {
    flagPatch(kit, "ensign-cross", ensign, drop, fly, dir, [0.47, 0.53, 0.5, 1], "ruby", offset, high);
    flagPatch(kit, "ensign-cross", ensign, drop, fly, dir, [0.5, 1, 0.45, 0.55], "ruby", offset, high);
    flagPatch(kit, "ensign-canton", ensign, drop, fly, dir, [0, 0.5, 0, 0.5], "azure", offset, high);
    flagPatch(kit, "ensign-canton-cross", ensign, drop, fly, dir, [0.21, 0.29, 0, 0.5], "white", offset * 1.5, high);
    flagPatch(kit, "ensign-canton-cross", ensign, drop, fly, dir, [0, 0.5, 0.2, 0.3], "white", offset * 1.5, high);
    flagPatch(kit, "ensign-canton-cross", ensign, drop, fly, dir, [0.23, 0.27, 0, 0.5], "ruby", offset * 2, high);
    flagPatch(kit, "ensign-canton-cross", ensign, drop, fly, dir, [0, 0.5, 0.225, 0.275], "ruby", offset * 2, high);
  }
  // Vice-admiral of the White: the St George's flag at the fore truck.
  const flagHoist = V(gallantX(fore), fore.truck - 0.25, 0);
  flagPatch(kit, "admiral-flag", flagHoist, 2.3, 3.8, dir, [0, 1, 0, 1], "white", 0, high);
  for (const offset of [-0.03, 0.03]) {
    flagPatch(kit, "admiral-flag-cross", flagHoist, 2.3, 3.8, dir, [0.43, 0.57, 0, 1], "ruby", offset, high);
    flagPatch(kit, "admiral-flag-cross", flagHoist, 2.3, 3.8, dir, [0, 1, 0.4, 0.6], "ruby", offset, high);
  }
  kit.lines(
    "halyard",
    [
      [P(ensign), P(V(-23.8, 13, 0))],
      [P(flagHoist), P(V(gallantX(fore), fore.crosstree, 0.3))]
    ],
    RUNNING
  );
  return kit.finish();
}

// ---------------------------------------------------------------- windows

function windowFrames(high: boolean) {
  const kit = kitOf("opus-ship-of-the-line-window-frames");
  for (const light of opusShipOfTheLineWindows()) {
    const w = light.width,
      h = light.height;
    for (const [x, y, sx, sy] of [
      [0, h / 2 + 0.05, w + 0.2, 0.1],
      [0, -h / 2 - 0.05, w + 0.2, 0.1],
      [-w / 2 - 0.05, 0, 0.1, h],
      [w / 2 + 0.05, 0, 0.1, h]
    ] as const)
      inFrame(kit, "window-frame", light, V(x, y, 0.06), [sx, sy, 0.09], "plaster");
    if (high) {
      inFrame(kit, "window-mullion", light, V(0, 0, 0.05), [0.045, h, 0.05], "plaster");
      for (const y of [-h / 6, h / 6]) inFrame(kit, "window-mullion", light, V(0, y, 0.05), [w, 0.04, 0.05], "plaster");
    }
  }
  return kit.finish();
}
function windowLeaves(closed: boolean) {
  const kit = kitOf("opus-ship-of-the-line-window-leaves");
  for (const light of opusShipOfTheLineWindows()) {
    if (closed)
      inFrame(kit, "window-deadlight", light, V(0, 0, 0.1), [light.width + 0.12, light.height + 0.12, 0.06], "dark");
    else inFrame(kit, "window-glass", light, V(0, 0, 0.015), [light.width, light.height, 0.02], "glass");
  }
  return kit.finish();
}

// ---------------------------------------------------------------- assembly

type PartPlan = {
  id: string;
  role: string;
  create: (state: OpusShipOfTheLineState, high: boolean) => CityStructureMeshes;
};
const PARTS: readonly PartPlan[] = [
  {
    id: "hull",
    role: "Hull in the Nelson chequer, copper, keel, stem, rudder and cutwater",
    create: (_, high) => hull(high)
  },
  { id: "gun-frames", role: "Gunport linings and chambers", create: (_, high) => gunFrames(high) },
  {
    id: "decks",
    role: "Weather decks, bulwarks, bulkheads, rails and hammock nettings",
    create: (_, high) => decks(high)
  },
  {
    id: "fittings",
    role: "Wheel, capstan, boats, lanterns, galleries, chainwales, anchors and figurehead",
    create: (_, high) => fittings(high)
  },
  { id: "spars", role: "Masts, tops, yards, bowsprit, jib-boom, gaff and boom", create: (_, high) => spars(high) },
  { id: "rigging", role: "Standing and running rigging", create: (_, high) => rigging(high) },
  ...SQUARE_SAILS.map(sail => ({
    id: sail.id,
    role: sail.id.replaceAll("-", " "),
    create: (state: OpusShipOfTheLineState, high: boolean) => squareCloth(sail, state.sails === "furled", high)
  })),
  { id: "spritsail", role: "spritsail", create: (state, high) => spritsail(state.sails === "furled", high) },
  ...HEAD_SAILS.map(sail => ({
    id: sail.id,
    role: sail.id.replaceAll("-", " "),
    create: (state: OpusShipOfTheLineState, high: boolean) => headCloth(sail, state.sails === "furled", high)
  })),
  { id: "spanker", role: "spanker", create: (state, high) => spankerCloth(state.sails === "furled", high) },
  { id: "flags", role: "White ensign and vice-admiral's flag", create: (_, high) => flags(high) },
  {
    id: "armament",
    role: "Guns and gunport lids",
    create: (state, high) => armament(high, state.gunports === "closed")
  },
  { id: "window-frames", role: "Stern and gallery window frames", create: (_, high) => windowFrames(high) },
  { id: "window-leaves", role: "Window glass or deadlights", create: state => windowLeaves(state.windows === "closed") }
];

export function opusShipOfTheLineParts(
  quality: OpusShipOfTheLineQuality = "high",
  state: OpusShipOfTheLineState = {}
): readonly ModelPartFactory[] {
  const high = quality === "high";
  return PARTS.map(part => ({
    id: part.id,
    role: part.role,
    quality,
    author: OPUS_SHIP_OF_THE_LINE.author,
    create: () => part.create(state, high)
  }));
}

/** Omitted state is sails set, gunports open and stern lights glazed. */
export function createOpusShipOfTheLine(
  quality: OpusShipOfTheLineQuality = "high",
  state: OpusShipOfTheLineState = {}
): CityStructureMeshes {
  const model = assembleSailingParts("opus-ship-of-the-line", opusShipOfTheLineParts(quality, state));
  model.group.userData.gunports = opusShipOfTheLineGunports();
  model.group.userData.windows = opusShipOfTheLineWindows();
  model.group.userData.shipState = {
    sails: state.sails ?? "set",
    gunports: state.gunports ?? "open",
    windows: state.windows ?? "open"
  };
  return model;
}
