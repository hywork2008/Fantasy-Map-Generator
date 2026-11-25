import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit, type Position, type Surface } from "./modelKit";
import {
  clampTo,
  type ProfileLook,
  VILLAGE_EAVE_METERS,
  VILLAGE_HOUSE_LIMITS,
  VILLAGE_HOUSE_LOOKS,
  VILLAGE_OVERHANG_METERS,
  type VillageHouseProfile,
  type VillageHouseSpec,
  type VillageOpening,
  villageHouseLayout,
  villageHouseSpecKey
} from "./opusVillageHouseProfile";

/**
 * High village houses (roadside village plan §14.4): the plan of the Low model built as a peasant house is built.
 * Walls are laid in rubble courses with quoins and dressed openings, framed in oak over a stone plinth, or raised in
 * saddle-notched logs with log gables; roofs are thatch laid in courses with a ridge pinned by liggers and spars,
 * split shingles, or Roman-style channel and cap tiles. Openings are real holes in the wall with plank doors, diamond
 * mullions and board shutters. Every part stays within the Low model's envelope (the roof's overhang) so CE fits
 * either to the same footprint. Long side along x, front on +z, centred on the origin, ground at y = 0.
 */

const ov = VILLAGE_OVERHANG_METERS;
/** Vertical thickness of a thatch coat, about 0.3 m square to its slope. */
const THATCH_COAT = 0.42;
const LOG_DIAMETER = 0.26;
const LOG_STEP = 0.235;

type Face = VillageOpening["face"];
interface Opening extends VillageOpening {
  /** Along the face's own axis (u). */
  u: number;
}
interface Rect {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

/** A deterministic generator per spec, so one spec always builds the same house and CE can share it. */
function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return (min = 0, max = 1) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return min + (((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max - min);
  };
}
/** Smooth-free lattice noise in [-1, 1]: the same input always gives the same value. */
const hash = (i: number, j: number, k: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

const FACE_ANGLE: Record<Face, number> = {
  front: 0,
  back: Math.PI,
  right: Math.PI / 2,
  left: -Math.PI / 2
};

function grid(nu: number, nv: number, at: (i: number, j: number) => THREE.Vector3) {
  const positions: number[] = [],
    index: number[] = [],
    row = nu + 1;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const p = at(i, j);
      positions.push(p.x, p.y, p.z);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
const strip = (a: readonly THREE.Vector3[], b: readonly THREE.Vector3[]) =>
  grid(a.length - 1, 1, (i, j) => (j ? b[i] : a[i]));

/** Quads as one geometry: each entry four corners in order. */
function quads(list: readonly (readonly THREE.Vector3[])[]) {
  const positions: number[] = [],
    index: number[] = [];
  for (const q of list) {
    const base = positions.length / 3;
    for (const p of q) positions.push(p.x, p.y, p.z);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

class VillageKit extends ModelKit {
  private readonly rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  private readonly logGeometry = new THREE.CylinderGeometry(1, 1, 1, 9);
  /** A thin round rod (hazel spar, ligger, pole) from a to b. */
  rod(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, surface: Surface, closed = false) {
    const mesh = this.add(name, closed ? this.logGeometry : this.rodGeometry, surface),
      dir = b.clone().sub(a);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, dir.length(), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }
}

interface House {
  k: VillageKit;
  spec: VillageHouseSpec;
  profile: VillageHouseProfile;
  look: ProfileLook;
  L: number;
  W: number;
  eave: number;
  t: number;
  rise: number;
  /** Ridge of the roof's underside, over the gable apex. */
  top: number;
  random: (min?: number, max?: number) => number;
  openings: Opening[];
}

/** A point on a face: u along it, y up, `out` from its outer plane outward. */
function at(h: House, face: Face, u: number, y: number, out = 0) {
  const angle = FACE_ANGLE[face],
    s = Math.sin(angle),
    c = Math.cos(angle),
    r = (face === "front" || face === "back" ? h.W / 2 : h.L / 2) + out;
  return new THREE.Vector3(s * r + c * u, y, c * r - s * u);
}
function faceBox(
  h: House,
  face: Face,
  name: string,
  u: number,
  y: number,
  out: number,
  size: Position,
  surface: Surface,
  tilt: readonly [number, number, number] = [0, 0, 0]
) {
  const mesh = h.k.box(name, at(h, face, u, y, out).toArray() as Position, size, surface);
  mesh.rotation.set(tilt[0], FACE_ANGLE[face] + tilt[1], tilt[2], "YXZ");
  return mesh;
}
/** A timber lying in a face's plane from (u0, y0) to (u1, y1), its section square to the wall. */
function faceBeam(
  h: House,
  face: Face,
  name: string,
  [u0, y0]: readonly [number, number],
  [u1, y1]: readonly [number, number],
  out: number,
  width: number,
  depth: number,
  surface: Surface = "oak"
) {
  const du = u1 - u0,
    dy = y1 - y0;
  return faceBox(h, face, name, (u0 + u1) / 2, (y0 + y1) / 2, out, [width, Math.hypot(du, dy), depth], surface, [
    0,
    0,
    Math.atan2(-du, dy)
  ]);
}
const isEnd = (face: Face) => face === "right" || face === "left";
/** Top of a face's wall at u: the eaves on a long wall, the gable's slope on an end wall. */
const faceTop = (h: House, face: Face) => (u: number) =>
  isEnd(face) ? h.eave + h.rise * Math.max(0, 1 - Math.abs(u) / (h.W / 2)) : h.eave;
const faceOpenings = (h: House, face: Face) => h.openings.filter(o => o.face === face);
const hits = (r: Rect, u0: number, u1: number, y0: number, y1: number) =>
  u0 < r.u1 && u1 > r.u0 && y0 < r.y1 && y1 > r.y0;
/** Pieces of [u0, u1] left after cutting out every rect a band [y0, y1] runs through. */
function cut(u0: number, u1: number, y0: number, y1: number, rects: readonly Rect[], min = 0.06) {
  let pieces: [number, number][] = [[u0, u1]];
  for (const r of rects) {
    if (!(y0 < r.y1 && y1 > r.y0)) continue;
    pieces = pieces.flatMap(([a, b]): [number, number][] =>
      r.u1 <= a || r.u0 >= b
        ? [[a, b]]
        : (
            [
              [a, r.u0],
              [r.u1, b]
            ] as [number, number][]
          ).filter(([p, q]) => q - p > 0)
    );
  }
  return pieces.filter(([a, b]) => b - a >= min);
}
const rectOf = (o: Opening, side = 0, top = 0, bottom = 0): Rect => ({
  u0: o.u - o.width / 2 - side,
  u1: o.u + o.width / 2 + side,
  y0: o.base - bottom,
  y1: o.base + o.height + top
});

// ---------------------------------------------------------------- wall body

/** The wall's own mass with its openings cut through, dark behind them, and the gable triangle over an end. */
function wallBody(h: House, face: Face, surface: Surface, inset = 0) {
  const end = isEnd(face),
    span = end ? h.W / 2 - h.t : h.L / 2,
    depth = h.t - inset,
    os = faceOpenings(h, face),
    us = [...new Set([-span, span, ...os.flatMap(o => [o.u - o.width / 2, o.u + o.width / 2])])].sort((a, b) => a - b),
    ys = [...new Set([0, h.eave, ...os.flatMap(o => [o.base, o.base + o.height])])].sort((a, b) => a - b);
  for (let i = 0; i < us.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const u = (us[i] + us[i + 1]) / 2,
        y = (ys[j] + ys[j + 1]) / 2;
      if (os.some(o => Math.abs(u - o.u) < o.width / 2 && y > o.base && y < o.base + o.height)) continue;
      faceBox(h, face, "wall-core", u, y, -inset - depth / 2, [us[i + 1] - us[i], ys[j + 1] - ys[j], depth], surface);
    }
  // The dark room behind each opening, at the wall's inner face, so its reveal reads as the wall's thickness.
  for (const o of os)
    faceBox(
      h,
      face,
      "opening-shadow",
      o.u,
      o.base + o.height / 2,
      -h.t + 0.02,
      [o.width + 0.02, o.height, 0.03],
      "dark"
    );
  if (end) {
    const gable = new THREE.Shape();
    gable.moveTo(-h.W / 2, h.eave);
    gable.lineTo(0, h.top);
    gable.lineTo(h.W / 2, h.eave);
    gable.closePath();
    const geometry = new THREE.ExtrudeGeometry(gable, {
        depth,
        bevelEnabled: false
      }),
      sign = face === "right" ? 1 : -1;
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    geometry.translate(sign > 0 ? h.L / 2 - h.t : -h.L / 2 + inset, 0, 0);
    h.k.add("gable-core", geometry, surface);
  }
}

// ---------------------------------------------------------------- masonry

interface RubbleOptions {
  course: readonly [number, number];
  length: readonly [number, number];
  /** How far the stones stand proud of the wall's plane. */
  proud: number;
  quoins: boolean;
  surface?: Surface;
}
/** Rubble laid in rough courses on a face from y0 to its top, broken round the rects it must leave clear. */
function rubble(
  h: House,
  face: Face,
  y0: number,
  yMax: (u: number) => number,
  avoid: readonly Rect[],
  o: RubbleOptions
) {
  const r = h.random,
    half = (isEnd(face) ? h.W / 2 : h.L / 2) + (o.quoins ? o.proud : 0),
    peak = Math.max(yMax(0), yMax(-half), yMax(half));
  let y = y0,
    row = 0;
  while (y < peak - 0.06) {
    const course = r(...o.course);
    let u = -half,
      first = true;
    while (u < half - 0.04) {
      let length = r(...o.length);
      const quoin = o.quoins && (first || u + length > half - 0.3);
      if (o.quoins && first) length = row % 2 === (isEnd(face) ? 1 : 0) ? 0.62 : 0.36;
      if (u + length > half - 0.12) length = half - u;
      const a = u,
        b = u + length,
        top = Math.min(yMax(a), yMax(b));
      u = b;
      first = false;
      const height = Math.min(course, top - y);
      if (height < 0.08) continue;
      for (const [p, q] of cut(a, b, y, y + height, avoid, 0.1)) {
        const w = q - p,
          seam = quoin ? 0.012 : 0.03,
          tilt: [number, number, number] = row ? [r(-0.03, 0.03), r(-0.03, 0.03), r(-0.04, 0.04)] : [0, 0, 0],
          proud = quoin ? o.proud + 0.015 : r(o.proud * 0.4, o.proud);
        faceBox(
          h,
          face,
          quoin ? "quoin-stone" : "rubble-stone",
          (p + q) / 2,
          y + height / 2,
          proud - 0.07,
          [w - seam * r(0.6, 1.6), height - seam * r(0.6, 1.4), 0.14],
          o.surface ?? "stone",
          tilt
        );
      }
    }
    y += course;
    row++;
  }
}

/** Dressed stones round an opening: alternating jambs, a lintel, a sill or threshold. */
function dressedOpening(h: House, face: Face, o: Opening, proud: number) {
  const r = h.random,
    tall = o.kind === "door";
  for (const side of [-1, 1]) {
    let y = o.base,
      n = 0;
    while (y < o.base + o.height - 0.05) {
      const course = Math.min(r(0.26, 0.36), o.base + o.height - y),
        long = n++ % 2 ? 0.22 : 0.32;
      faceBox(
        h,
        face,
        "jamb-stone",
        o.u + side * (o.width / 2 + long / 2),
        y + course / 2,
        proud - 0.08,
        [long - 0.015, course - 0.015, 0.16],
        "stone"
      );
      y += course;
    }
  }
  faceBox(
    h,
    face,
    "lintel-stone",
    o.u,
    o.base + o.height + 0.13,
    proud - 0.08,
    [o.width + (o.kind === "slit" ? 0.3 : 0.6), 0.26, 0.17],
    "stone"
  );
  if (!tall) faceBox(h, face, "sill-stone", o.u, o.base - 0.05, proud - 0.04, [o.width + 0.2, 0.1, 0.2], "stone");
  else faceBox(h, face, "threshold-stone", o.u, 0.04, 0.1, [o.width + 0.35, 0.08, 0.36], "stone");
}
const stoneClearance = (o: Opening): Rect => rectOf(o, 0.33, 0.27, o.kind === "door" ? 0 : 0.1);

function masonryWalls(h: House) {
  const mortar: Surface = "clay";
  for (const face of ["front", "back", "right", "left"] as const) {
    wallBody(h, face, mortar);
    const os = faceOpenings(h, face),
      proud = 0.05;
    rubble(h, face, 0, faceTop(h, face), os.map(stoneClearance), {
      course: h.profile === "stone-upland" ? [0.3, 0.46] : [0.2, 0.32],
      length: h.profile === "stone-upland" ? [0.45, 1] : [0.28, 0.6],
      proud,
      quoins: true
    });
    for (const o of os) dressedOpening(h, face, o, proud);
  }
}

// ---------------------------------------------------------------- box frame

interface FrameStyle {
  /** Posts between corner posts, and studs between posts. */
  bay: number;
  stud: number;
  rails: readonly number[];
  /** English braces rise from the sill to the post; German Streben from the post foot to the plate in every end bay. */
  braces: "corner" | "bays";
}
const FRAME_STYLE: Partial<Record<VillageHouseProfile, FrameStyle>> = {
  atlantic: { bay: 2.4, stud: 0.62, rails: [1.15], braces: "corner" },
  "northern-urban": {
    bay: 1.25,
    stud: 1.25,
    rails: [0.95, 1.5],
    braces: "bays"
  }
};
const PLINTH = 0.42;
const TIMBER = { width: 0.15, depth: 0.14, out: -0.03 };

function frameWalls(h: House) {
  const style = FRAME_STYLE[h.profile]!,
    k = h.k;
  for (const face of ["front", "back", "right", "left"] as const) {
    wallBody(h, face, "plaster", 0.035);
    const os = faceOpenings(h, face),
      half = isEnd(face) ? h.W / 2 : h.L / 2,
      top = faceTop(h, face),
      plate = h.eave - 0.09,
      clear = os.map(o => rectOf(o, 0.02, 0.02, 0.02)),
      vertical = (name: string, u: number, y0: number, y1: number, width = TIMBER.width) => {
        for (const [a, b] of cut(y0, y1, u - width / 2, u + width / 2, clear.map(swap), 0.08))
          faceBox(h, face, name, u, (a + b) / 2, TIMBER.out, [width, b - a, TIMBER.depth], "oak", [
            0,
            0,
            h.random(-0.006, 0.006)
          ]);
      },
      horizontal = (name: string, y: number, u0: number, u1: number, height = 0.16) => {
        for (const [a, b] of cut(u0, u1, y - height / 2, y + height / 2, clear, 0.1))
          faceBox(h, face, name, (a + b) / 2, y, TIMBER.out, [b - a, height, TIMBER.depth], "oak");
      };
    // The plinth of rubble, the sill beam laid on it, and the plate (a tie beam across an end) at the eaves.
    rubble(
      h,
      face,
      0,
      () => PLINTH,
      os.filter(o => o.kind === "door").map(o => rectOf(o, 0.02)),
      {
        course: [0.19, 0.23],
        length: [0.3, 0.55],
        proud: 0.09,
        quoins: false
      }
    );
    horizontal("sill-beam", PLINTH + 0.08, -half, half);
    horizontal("wall-plate", plate, -half, half, 0.18);
    // Corner and bay posts, studs between them, and the posts that frame each opening.
    const bays = Math.max(1, Math.round((2 * half) / style.bay)),
      posts = Array.from({ length: bays + 1 }, (_, i) => -half + 0.1 + ((2 * half - 0.2) * i) / bays),
      jambs = os.flatMap(o => [o.u - o.width / 2 - 0.08, o.u + o.width / 2 + 0.08]);
    for (const u of posts) vertical("frame-post", u, PLINTH + 0.16, plate - 0.09, 0.2);
    for (const u of jambs) vertical("opening-post", u, PLINTH + 0.16, plate - 0.09, 0.13);
    for (let i = 0; i < bays; i++) {
      const a = posts[i],
        b = posts[i + 1],
        n = Math.max(1, Math.round((b - a) / style.stud));
      for (let j = 1; j < n; j++) {
        const u = a + ((b - a) * j) / n;
        if (jambs.some(v => Math.abs(v - u) < 0.25)) continue;
        vertical("frame-stud", u, PLINTH + 0.16, plate - 0.09, 0.13);
      }
    }
    for (const y of style.rails) horizontal("wall-rail", y, -half + 0.2, half - 0.2, 0.13);
    for (const o of os) {
      horizontal("opening-head", o.base + o.height + 0.07, o.u - o.width / 2 - 0.08, o.u + o.width / 2 + 0.08, 0.14);
      if (o.kind !== "door")
        faceBox(h, face, "opening-sill", o.u, o.base - 0.06, 0.0, [o.width + 0.3, 0.12, 0.2], "oak");
      else faceBox(h, face, "threshold-stone", o.u, 0.04, 0.1, [o.width + 0.35, 0.08, 0.36], "stone");
    }
    // Braces, kept off the openings.
    const brace = (u0: number, y0: number, u1: number, y1: number) => {
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const u = u0 + ((u1 - u0) * i) / steps,
          y = y0 + ((y1 - y0) * i) / steps;
        if (clear.some(r => hits(r, u - 0.12, u + 0.12, y - 0.12, y + 0.12))) return;
      }
      faceBeam(h, face, "frame-brace", [u0, y0], [u1, y1], TIMBER.out, 0.12, TIMBER.depth);
    };
    if (style.braces === "corner")
      for (const side of [-1, 1]) brace(side * (half - 1.15), PLINTH + 0.16, side * (half - 0.2), plate - 0.25);
    else
      for (let i = 0; i < bays; i++) {
        const a = posts[i],
          b = posts[i + 1],
          outer = i === 0 || i === bays - 1;
        if (!outer && bays > 2) continue;
        // A Strebe from the post's foot to the plate at the next post.
        if (i === 0) brace(a + 0.1, PLINTH + 0.2, b - 0.1, plate - 0.15);
        else brace(b - 0.1, PLINTH + 0.2, a + 0.1, plate - 0.15);
      }
    if (!isEnd(face)) continue;
    // The gable: verge rafters on its slope, a collar, a king post, and studs between them.
    const apex = top(0),
      collar = h.eave + h.rise * 0.48,
      owl = h.profile === "northern-urban",
      holeBase = apex - Math.min(0.95, h.rise * 0.4);
    for (const side of [-1, 1])
      faceBeam(
        h,
        face,
        "verge-rafter",
        [side * (half - 0.05), h.eave],
        [0, apex - 0.05],
        TIMBER.out,
        0.16,
        TIMBER.depth
      );
    const collarHalf = (half * (apex - collar)) / (apex - h.eave) - 0.08;
    faceBox(h, face, "gable-collar", 0, collar, TIMBER.out, [2 * collarHalf, 0.15, TIMBER.depth], "oak");
    const postTop = owl ? holeBase - 0.05 : apex - 0.1;
    faceBox(h, face, "king-post", 0, (h.eave + postTop) / 2, TIMBER.out, [0.17, postTop - h.eave, TIMBER.depth], "oak");
    for (let u = style.stud; u < half - 0.35; u += style.stud)
      for (const side of [-1, 1]) {
        const y1 = top(side * u) - 0.12;
        if (y1 - h.eave > 0.35) vertical("gable-stud", side * u, h.eave, y1, 0.12);
      }
    if (owl) {
      // The Uhlenloch: a smoke and owl hole under the apex of the gable.
      const hole = new THREE.Shape(),
        y0 = holeBase;
      hole.moveTo(-0.32, y0);
      hole.lineTo(0.32, y0);
      hole.lineTo(0, apex - 0.3);
      hole.closePath();
      const geometry = new THREE.ExtrudeGeometry(hole, {
          depth: 0.02,
          bevelEnabled: false
        }),
        sign = face === "right" ? 1 : -1;
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      geometry.translate(sign * (h.L / 2 + 0.045), 0, 0);
      k.add("owl-hole", geometry, "dark");
    }
  }
}
const swap = (r: Rect): Rect => ({ u0: r.y0, u1: r.y1, y0: r.u0, y1: r.u1 });

// ---------------------------------------------------------------- log walls

function logWalls(h: House) {
  const k = h.k,
    radius = LOG_DIAMETER / 2,
    projection = 0.22,
    base = 0.28;
  for (const face of ["front", "back", "right", "left"] as const) {
    const end = isEnd(face),
      half = end ? h.W / 2 : h.L / 2,
      os = faceOpenings(h, face),
      clear = os.map(o => rectOf(o, 0.075, 0.05, 0.05));
    // A filled core behind the logs closes the gaps under the roof and holds the openings' shadows.
    wallBody(h, face, "oak", 0.12);
    rubble(
      h,
      face,
      0,
      () => base,
      os.filter(o => o.kind === "door").map(o => rectOf(o, 0.02)),
      { course: [0.13, 0.15], length: [0.35, 0.6], proud: 0.08, quoins: false }
    );
    // Long walls and end walls lie half a log apart, so their ends cross at the corners as saddle notches.
    for (
      let y = base + radius + (end ? LOG_STEP / 2 : 0);
      y < (end ? h.top - 0.15 : h.eave - radius + 0.06);
      y += LOG_STEP
    ) {
      const gable = end && y + radius > h.eave,
        reach = gable ? half * (1 - (y + radius - h.eave) / h.rise) - 0.08 : half + projection;
      if (reach < 0.25) break;
      for (const [a, b] of cut(-reach, reach, y - radius + 0.03, y + radius - 0.03, clear, 0.15)) {
        const r = radius * h.random(0.92, 1.06),
          log = k.rod("wall-log", at(h, face, a, y, -radius), at(h, face, b, y, -radius), r, "wood", true);
        log.rotateY(h.random(0, Math.PI));
      }
    }
    for (const o of os) {
      // Plank cases in the openings (kosyaki), and carved boards round the windows.
      const c0 = Math.max(0, o.base - 0.05),
        c1 = o.base + o.height + 0.05;
      for (const side of [-1, 1])
        faceBox(
          h,
          face,
          "opening-case",
          o.u + side * (o.width / 2 + 0.035),
          (c0 + c1) / 2,
          -h.t / 2 + 0.02,
          [0.07, c1 - c0, h.t + 0.02],
          "oak"
        );
      faceBox(
        h,
        face,
        "opening-case",
        o.u,
        o.base + o.height + 0.03,
        -h.t / 2 + 0.02,
        [o.width + 0.14, 0.07, h.t + 0.02],
        "oak"
      );
      if (o.kind === "door") {
        faceBox(h, face, "threshold-log", o.u, 0.08, 0.1, [o.width + 0.3, 0.16, 0.36], "wood");
        continue;
      }
      faceBox(h, face, "opening-case", o.u, o.base - 0.03, 0, [o.width + 0.24, 0.07, 0.12], "oak");
      if (o.kind !== "window") continue;
      for (const side of [-1, 1])
        faceBox(
          h,
          face,
          "window-trim",
          o.u + side * (o.width / 2 + 0.12),
          o.base + o.height / 2,
          0.02,
          [0.1, o.height + 0.3, 0.04],
          "white"
        );
      const pediment = new THREE.Shape(),
        w = o.width / 2 + 0.22,
        y0 = o.base + o.height + 0.1;
      pediment.moveTo(-w, y0);
      pediment.lineTo(w, y0);
      pediment.lineTo(w * 0.55, y0 + 0.14);
      pediment.lineTo(0, y0 + 0.3);
      pediment.lineTo(-w * 0.55, y0 + 0.14);
      pediment.closePath();
      const geometry = new THREE.ExtrudeGeometry(pediment, {
        depth: 0.04,
        bevelEnabled: false
      });
      const mesh = k.add("window-pediment", geometry, "white"),
        p = at(h, face, o.u, 0, 0.005);
      mesh.position.copy(p);
      mesh.rotation.y = FACE_ANGLE[face];
      faceBox(h, face, "window-trim", o.u, o.base - 0.09, 0.03, [o.width + 0.36, 0.08, 0.06], "white");
    }
  }
  // Purlins and the ridge pole run out through the log gables to the verges.
  const x = h.L / 2 + ov - 0.03;
  for (const f of [1 / 3, 2 / 3, 1]) {
    const y = h.eave + h.rise * f - radius,
      z = (h.W / 2) * (1 - f);
    for (const side of f === 1 ? [0] : [-1, 1])
      k.rod(
        "purlin",
        new THREE.Vector3(-x, y, side * z),
        new THREE.Vector3(x, y, side * z),
        radius * 0.9,
        "wood",
        true
      );
  }
}

// ---------------------------------------------------------------- openings

/** A plank door in its reveal: boards, ledges, strap hinges and a ring; a barn's pair of leaves braced outside. */
function door(h: House, face: Face, o: Opening, recess: number) {
  const r = h.random,
    barn = h.spec.kind === "barn",
    leaves = barn ? 2 : 1,
    out = -recess;
  for (let leaf = 0; leaf < leaves; leaf++) {
    const w = o.width / leaves,
      u0 = o.u - o.width / 2 + leaf * w,
      boards = Math.max(3, Math.round(w / 0.17)),
      hinge = leaves === 2 ? (leaf ? 1 : -1) : -1;
    for (let i = 0; i < boards; i++)
      faceBox(
        h,
        face,
        "door-board",
        u0 + ((i + 0.5) * w) / boards,
        o.height / 2,
        out - 0.03 + r(-0.006, 0.006),
        [w / boards - 0.012, o.height - 0.03, 0.05],
        "wood"
      );
    if (barn) {
      for (const y of [0.35, o.height / 2, o.height - 0.35])
        faceBox(h, face, "door-ledge", u0 + w / 2, y, out + 0.015, [w - 0.08, 0.16, 0.04], "wood");
      for (const [y0, y1] of [
        [0.35, o.height / 2],
        [o.height / 2, o.height - 0.35]
      ]) {
        faceBeam(
          h,
          face,
          "door-brace",
          [u0 + (hinge < 0 ? w - 0.12 : 0.12), y0 + 0.08],
          [u0 + (hinge < 0 ? 0.12 : w - 0.12), y1 - 0.08],
          out + 0.015,
          0.13,
          0.04,
          "wood"
        );
      }
    }
    // Strap hinges from the hinge side, nailed across the boards.
    for (const y of [0.3, o.height - 0.3]) {
      const strap = Math.min(w * 0.8, 0.9),
        u = hinge < 0 ? u0 + strap / 2 : u0 + w - strap / 2;
      faceBox(h, face, "strap-hinge", u, y, out + 0.005, [strap, 0.05, 0.015], "iron");
      faceBox(
        h,
        face,
        "strap-hinge-end",
        hinge < 0 ? u0 + strap : u0 + w - strap,
        y,
        out + 0.005,
        [0.07, 0.09, 0.015],
        "iron"
      );
      for (let n = 1; n < 4; n++)
        faceBox(
          h,
          face,
          "door-nail",
          hinge < 0 ? u0 + (strap * n) / 4 : u0 + w - (strap * n) / 4,
          y,
          out + 0.015,
          [0.025, 0.025, 0.012],
          "iron"
        );
    }
  }
  const ring = h.k.ring(
    "door-ring",
    at(h, face, o.u + (barn ? 0.12 : o.width / 2 - 0.15), 1.0, out + 0.01).toArray() as Position,
    0.05,
    0.008,
    "iron",
    true
  );
  ring.rotation.y = FACE_ANGLE[face];
}

/** Two diamond mullions in an unglazed opening and a board shutter hung open beside it. */
function windowFittings(h: House, face: Face, o: Opening, recess: number, proud: number) {
  for (const du of [-o.width / 6, o.width / 6])
    faceBox(h, face, "diamond-mullion", o.u + du, o.base + o.height / 2, -recess, [0.05, o.height, 0.05], "oak", [
      0,
      Math.PI / 4,
      0
    ]);
  if (o.kind !== "window") return;
  const half = isEnd(face) ? h.W / 2 : h.L / 2,
    clash = (u0: number, u1: number) =>
      Math.abs(u0) > half - 0.2 ||
      Math.abs(u1) > half - 0.2 ||
      faceOpenings(h, face).some(p => p !== o && hits(rectOf(p, 0.35), u0, u1, o.base, o.base + o.height));
  for (const side of [1, -1]) {
    const u0 = o.u + side * (o.width / 2 + 0.3),
      u1 = u0 + side * o.width;
    if (clash(Math.min(u0, u1), Math.max(u0, u1))) continue;
    const u = (u0 + u1) / 2;
    for (let i = 0; i < 3; i++)
      faceBox(
        h,
        face,
        "shutter-board",
        u + ((i - 1) * o.width) / 3,
        o.base + o.height / 2,
        proud + 0.02,
        [o.width / 3 - 0.01, o.height + 0.04, 0.035],
        "wood"
      );
    for (const y of [o.base + 0.1, o.base + o.height - 0.1])
      faceBox(h, face, "shutter-batten", u, y, proud + 0.045, [o.width - 0.04, 0.06, 0.02], "wood");
    return;
  }
}

function openings(h: House) {
  const stone = h.look.wall === "stone",
    logs = h.look.frame === "logs";
  for (const o of h.openings) {
    const recess = stone ? 0.14 : logs ? 0.1 : 0.07,
      proud = stone ? 0.05 : logs ? 0 : 0.03;
    if (o.kind === "door") door(h, o.face, o, recess);
    else windowFittings(h, o.face, o, o.kind === "window" ? recess + 0.05 : recess, proud);
  }
}

// ---------------------------------------------------------------- roofs

interface Slope {
  half: number;
  drip: number;
  x0: number;
  x1: number;
  /** The roof's underside at a along the ridge and b from the ridge (0) to the eaves (1), on side s. */
  under(a: number, b: number, s: number): THREE.Vector3;
}
function slopeOf(h: House, overhang = ov): Slope {
  const half = h.W / 2 + overhang,
    drip = h.eave - (h.rise / (h.W / 2)) * overhang;
  return {
    half,
    drip,
    x0: -h.L / 2 - overhang,
    x1: h.L / 2 + overhang,
    under: (a, b, s) => new THREE.Vector3(a, h.top - b * (h.top - drip), s * b * half)
  };
}

/** Thatch laid in courses, each thickening to its butts, with a ridge laid over it and pinned with liggers. */
function thatch(h: House) {
  const k = h.k,
    sl = slopeOf(h),
    slopeLength = Math.hypot(sl.half, h.top - sl.drip),
    courses = Math.max(4, Math.round(slopeLength / 0.42)),
    phases = [0, 0.38, 0.72, 0.94],
    samples = [
      ...Array.from({ length: courses }, (_, c) => phases.map(f => ({ c, f }))).flat(),
      { c: courses - 1, f: 1 }
    ],
    na = Math.max(8, Math.round((sl.x1 - sl.x0) / 0.24)),
    aOf = (i: number) => sl.x0 + ((sl.x1 - sl.x0) * i) / na,
    sag = (a: number) => 0.035 * Math.sin((Math.PI * (a - sl.x0)) / (sl.x1 - sl.x0)),
    coat = (a: number, b: number, c: number, f: number, i: number, s: number, rough: boolean) =>
      THATCH_COAT +
      0.065 * f * f -
      sag(a) * (1 - b) +
      (rough ? 0.016 * hash(i, c, s) + 0.01 * Math.sin(a * 2.3 + c * 1.7 + s) : 0),
    smooth = (a: number, b: number, s: number) => {
      const u = sl.under(a, b, s),
        x = b * courses,
        c = Math.min(courses - 1, Math.floor(x));
      return u.setY(u.y + coat(a, b, c, x - c, 0, s, false));
    };
  for (const s of [-1, 1]) {
    const topAt = (i: number, j: number) => {
      const { c, f } = samples[j],
        b = (c + f) / courses,
        a = aOf(i),
        u = sl.under(a, b, s);
      u.y += coat(a, b, c, f, i, s, true);
      // The butts at the eaves and verges are cut a little ragged.
      if (j === samples.length - 1) u.z += s * 0.012 * hash(i, 7, s);
      return u;
    };
    k.add("thatch-coat", grid(na, samples.length - 1, topAt), "thatch");
    k.add(
      "thatch-underside",
      grid(na, 1, (i, j) => sl.under(aOf(i), j, s)),
      "thatch"
    );
    const last = samples.length - 1;
    k.add(
      "thatch-eaves-butts",
      strip(
        Array.from({ length: na + 1 }, (_, i) => topAt(i, last)),
        Array.from({ length: na + 1 }, (_, i) => sl.under(aOf(i), 1, s))
      ),
      "straw"
    );
    for (const i of [0, na])
      k.add(
        "thatch-verge",
        strip(
          samples.map((_, j) => topAt(i, j)),
          samples.map(({ c, f }) => sl.under(aOf(i), (c + f) / courses, s))
        ),
        "thatch"
      );
  }
  // The ridge: a block-cut ridge with a pointed lower edge in the west, a plain flush ridge in the uplands, a sod
  // ridge held by crossed riders in the north.
  const style = h.profile === "atlantic" ? "block" : h.profile === "northern-urban" ? "sod" : "flush",
    depth = style === "sod" ? 0.5 : 0.62,
    period = 0.72,
    edge = (a: number) => {
      if (style !== "block") return depth + (style === "sod" ? 0.03 * Math.sin(a * 5.1) : 0);
      const t = ((((a - sl.x0) / period) % 1) + 1) % 1;
      return depth + 0.24 * (1 - Math.abs(2 * t - 1));
    },
    lift = (d: number) => 0.075 + 0.085 * Math.max(0, 1 - (d / depth) ** 2) + 0.03 * Math.max(0, 1 - (d / 0.18) ** 2),
    ra = Math.round((sl.x1 - sl.x0) / 0.09),
    rows = 6,
    ridgeAt = (i: number, j: number, s: number) => {
      const a = sl.x0 + ((sl.x1 - sl.x0) * i) / ra,
        d = (edge(a) * j) / rows,
        p = smooth(a, d / slopeLength, s);
      return p.setY(p.y + lift(d));
    },
    ridgeSurface: Surface = style === "sod" ? "green" : style === "block" ? "straw" : "thatch";
  for (const s of [-1, 1]) {
    k.add(
      "thatch-ridge",
      grid(ra, rows, (i, j) => ridgeAt(i, j, s)),
      ridgeSurface
    );
    const lower = Array.from({ length: ra + 1 }, (_, i) => ridgeAt(i, rows, s)),
      below = lower.map(p => {
        const q = smooth(p.x, Math.abs(p.z) / sl.half, s);
        return q.setY(q.y - 0.01);
      });
    k.add("thatch-ridge-edge", strip(lower, below), ridgeSurface);
    for (const i of [0, ra]) {
      const cap = Array.from({ length: rows + 1 }, (_, j) => ridgeAt(i, j, s));
      k.add(
        "thatch-ridge-end",
        strip(
          cap,
          cap.map(p => smooth(p.x, Math.abs(p.z) / sl.half, s))
        ),
        ridgeSurface
      );
    }
  }
  const on = (a: number, d: number, s: number, up = 0.012) => {
      const p = smooth(a, d / slopeLength, s);
      return p.setY(p.y + lift(d) + up);
    },
    span = sl.x1 - sl.x0 - 0.1,
    pieces = Math.ceil(span / 1.2),
    ligger = (d: number, s: number, onRidge: boolean) => {
      for (let n = 0; n < pieces; n++) {
        const a0 = sl.x0 + 0.05 + (span * n) / pieces,
          a1 = sl.x0 + 0.05 + (span * (n + 1)) / pieces,
          p = (a: number) =>
            onRidge ? on(a, d, s) : smooth(a, d / slopeLength, s).setY(smooth(a, d / slopeLength, s).y + 0.075);
        k.rod("thatch-ligger", p(a0), p(a1), 0.016, "wood");
      }
    };
  if (style === "sod") {
    // Crossed riders straddle the sod ridge.
    for (let a = sl.x0 + 0.3; a < sl.x1 - 0.2; a += 0.85)
      for (const s of [-1, 1])
        k.rod("ridge-rider", on(a, depth * 0.9, s, 0.01), on(a, 0, -s, 0.22).setZ(-s * 0.18), 0.03, "wood", true);
  } else {
    for (const s of [-1, 1]) {
      ligger(depth * 0.3, s, true);
      ligger(depth * 0.88, s, true);
      if (style === "block")
        for (let a = sl.x0 + 0.1; a < sl.x1 - 0.35; a += 0.3) {
          k.rod("thatch-spar", on(a, depth * 0.3, s), on(a + 0.3, depth * 0.88, s), 0.009, "wood");
          k.rod("thatch-spar", on(a + 0.3, depth * 0.3, s), on(a, depth * 0.88, s), 0.009, "wood");
        }
      // Liggers along the eaves.
      for (const d of [slopeLength - 0.45, slopeLength - 0.7]) ligger(d, s, false);
    }
  }
  if (h.profile === "northern-urban") horseHeads(h, smooth);
  return h.top + THATCH_COAT + lift(0);
}

/** The crossed Pferdeköpfe of a Lower Saxon gable: verge boards riding the thatch, crossing over the ridge. */
function horseHeads(h: House, smooth: (a: number, b: number, s: number) => THREE.Vector3) {
  for (const gx of [-1, 1]) {
    const x = gx * (h.L / 2 + ov - 0.12);
    for (const s of [-1, 1]) {
      const foot = smooth(x, 0.92, s).setY(smooth(x, 0.92, s).y + 0.08),
        apex = smooth(x, 0, s).setY(smooth(x, 0, s).y + 0.14),
        dir = new THREE.Vector2(apex.z - foot.z, apex.y - foot.y).normalize(),
        perp0 = new THREE.Vector2(dir.y, -dir.x),
        perp = perp0.y < 0 ? perp0 : perp0.negate(),
        // Board-local outline, p along the board from the eaves, q across it: the board, then the head past the ridge.
        length = Math.hypot(apex.z - foot.z, apex.y - foot.y) + 0.5,
        outline: [number, number][] = [
          [0, -0.12],
          [length - 0.25, -0.1],
          [length - 0.12, -0.2],
          [length + 0.06, -0.24],
          [length + 0.1, -0.15],
          [length - 0.02, -0.06],
          [length, 0.05],
          [length + 0.06, 0.14],
          [length - 0.06, 0.11],
          [length - 0.25, 0.12],
          [0, 0.12]
        ],
        shape = new THREE.Shape(
          outline.map(
            ([p, q]) => new THREE.Vector2(-(foot.z + dir.x * p + perp.x * q), foot.y + dir.y * p + perp.y * q)
          )
        ),
        geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 0.05,
          bevelEnabled: false
        });
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      geometry.translate(x - 0.025 + (s > 0 ? 0.03 : -0.03) * gx, 0, 0);
      h.k.add("horse-head-board", geometry, "oak");
    }
  }
}

/** The roof's own board as a solid under its cover, shaped like the Low roof's. */
function roofDeck(h: House, sl: Slope, thick: number, surface: Surface) {
  const shape = new THREE.Shape();
  shape.moveTo(-sl.half, sl.drip);
  shape.lineTo(-sl.half, sl.drip + thick);
  shape.lineTo(0, h.top + thick);
  shape.lineTo(sl.half, sl.drip + thick);
  shape.lineTo(sl.half, sl.drip);
  shape.lineTo(0, h.top);
  shape.closePath();
  const deck = new THREE.ExtrudeGeometry(shape, {
    depth: sl.x1 - sl.x0,
    bevelEnabled: false
  });
  deck.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  deck.translate(sl.x0, 0, 0);
  h.k.add("roof-deck", deck, surface);
}
/** Rafter feet under the overhang of a boarded roof. */
function rafterFeet(h: House, sl: Slope) {
  const n = Math.max(2, Math.round(h.L / 0.6));
  for (let i = 0; i <= n; i++) {
    const x = -h.L / 2 + 0.1 + ((h.L - 0.2) * i) / n;
    for (const s of [-1, 1]) {
      const a = sl.under(x, (h.W / 2 - h.t) / sl.half, s).setY(sl.under(x, (h.W / 2 - h.t) / sl.half, s).y - 0.06),
        b = sl.under(x, 0.985, s).setY(sl.under(x, 0.985, s).y - 0.06);
      h.k.beam("rafter-foot", a.toArray() as Position, b.toArray() as Position, 0.11, "oak");
    }
  }
}

/** Split shingles in staggered courses, a ridge pole, and verge boards crossing above the ridge. */
function shingles(h: House) {
  const k = h.k,
    sl = slopeOf(h),
    deck = 0.08,
    theta = Math.atan2(h.top - sl.drip, sl.half),
    slopeLength = Math.hypot(sl.half, h.top - sl.drip),
    exposure = 0.26,
    courses = Math.ceil(slopeLength / exposure),
    r = h.random;
  roofDeck(h, sl, deck, "dark");
  rafterFeet(h, sl);
  for (const s of [-1, 1]) {
    const n = new THREE.Vector3(0, Math.cos(theta), s * Math.sin(theta)),
      point = (x: number, v: number, lift: number) =>
        sl
          .under(x, 1 - v / slopeLength, s)
          .add(new THREE.Vector3(0, deck, 0))
          .addScaledVector(n, lift),
      list: THREE.Vector3[][] = [];
    for (let c = 0; c < courses; c++) {
      const v0 = c * exposure,
        v1 = Math.min(slopeLength, v0 + exposure + 0.03);
      let x = sl.x0 + r(0, 0.1);
      while (x < sl.x1 - 0.02) {
        const w = Math.min(r(0.12, 0.23), sl.x1 - x),
          a = x + 0.006,
          b = x + w - 0.006,
          short = r(0, 0.03),
          butt = 0.035 + r(-0.008, 0.008);
        x += w;
        if (b - a < 0.04) continue;
        list.push(
          [point(a, v0 + short, butt), point(b, v0 + short, butt), point(b, v1, 0.012), point(a, v1, 0.012)],
          [point(a, v0 + short, 0), point(b, v0 + short, 0), point(b, v0 + short, butt), point(a, v0 + short, butt)]
        );
      }
    }
    k.add("roof-shingles", quads(list), "wood");
    k.beam(
      "eaves-board",
      point(sl.x0, 0.03, -0.06).toArray() as Position,
      point(sl.x1, 0.03, -0.06).toArray() as Position,
      0.12,
      "oak"
    );
  }
  // The ridge: boards over the meeting courses and a heavy pole (okhlupen) laid on them.
  const ridge = h.top + deck + 0.06;
  for (const s of [-1, 1]) {
    const board = k.box("ridge-board", [0, ridge - 0.04, s * 0.09], [sl.x1 - sl.x0, 0.03, 0.24], "oak");
    board.rotation.x = s * theta;
  }
  k.rod(
    "ridge-pole",
    new THREE.Vector3(sl.x0, ridge + 0.08, 0),
    new THREE.Vector3(sl.x1, ridge + 0.08, 0),
    0.13,
    "wood",
    true
  );
  // Verge boards on each gable, crossing at the apex into horns.
  for (const gx of [-1, 1]) {
    const x = gx * (h.L / 2 + ov - 0.03);
    for (const s of [-1, 1]) {
      const foot = sl.under(x, 0.96, s).setY(sl.under(x, 0.96, s).y + 0.02),
        apex = new THREE.Vector3(x, h.top + deck + 0.1, 0),
        dir = apex.clone().sub(foot).normalize(),
        end = apex.clone().addScaledVector(dir, 0.42),
        board = k.beam("verge-board", foot.toArray() as Position, end.toArray() as Position, 0.26, "oak");
      // The beam turns about x only, so its local x stays across the gable: a board 5 cm thick.
      board.scale.x = 0.05;
    }
  }
  return h.top + deck + 0.21;
}

/** Channel and cap tiles laid in mortar, as the south lays them, with ridge tiles and a mortared verge. */
function tiles(h: House) {
  const k = h.k,
    overhang = 0.3,
    sl = slopeOf(h, overhang),
    deck = 0.06,
    theta = Math.atan2(h.top - sl.drip, sl.half),
    slopeLength = Math.hypot(sl.half, h.top - sl.drip),
    r = h.random,
    pitch = 0.25,
    length = 0.5,
    step = 0.41,
    channel = new THREE.CylinderGeometry(0.1, 0.12, length, 6, 1, true, Math.PI / 2, Math.PI),
    cap = new THREE.CylinderGeometry(0.085, 0.07, length, 5, 1, true, -Math.PI / 2, Math.PI),
    ridgeTile = new THREE.CylinderGeometry(0.14, 0.15, 0.46, 7, 1, true, -Math.PI / 2, Math.PI);
  roofDeck(h, sl, deck, "tile");
  rafterFeet(h, sl);
  for (const s of [-1, 1]) {
    const n = new THREE.Vector3(0, Math.cos(theta), s * Math.sin(theta)),
      down = new THREE.Vector3(0, -Math.sin(theta), s * Math.cos(theta)),
      across = new THREE.Vector3().crossVectors(down, n),
      basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, down, n)),
      point = (x: number, v: number, lift: number) =>
        sl
          .under(x, v / slopeLength, s)
          .add(new THREE.Vector3(0, deck, 0))
          .addScaledVector(n, lift),
      lay = (geometry: THREE.BufferGeometry, name: string, x: number, v: number, lift: number) => {
        const mesh = k.add(name, geometry, "tile");
        mesh.position.copy(point(x, v, lift));
        // Each tile's lower end rests on the one below it.
        mesh.quaternion.copy(basis).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.06));
        mesh.rotateY(r(-0.03, 0.03));
      };
    const columns = Math.floor((sl.x1 - sl.x0 - 0.1) / pitch);
    for (let i = 0; i <= columns; i++) {
      const x = sl.x0 + 0.05 + i * pitch;
      for (let v = slopeLength - length / 2; v > 0.15; v -= step) lay(channel, "channel-tile", x, v, 0.12);
      if (i < columns)
        for (let v = slopeLength - length / 2 - 0.02; v > 0.15; v -= step)
          lay(cap, "cap-tile", x + pitch / 2, v, 0.125);
    }
    // Mortar stopping the eaves under the first caps, and a mortared verge.
    k.beam(
      "eaves-mortar",
      point(sl.x0 + 0.05, slopeLength - 0.04, 0.05).toArray() as Position,
      point(sl.x1 - 0.05, slopeLength - 0.04, 0.05).toArray() as Position,
      0.09,
      "white"
    );
    for (const x of [sl.x0 + 0.04, sl.x1 - 0.04])
      k.beam(
        "verge-mortar",
        point(x, 0.1, 0.07).toArray() as Position,
        point(x, slopeLength - 0.03, 0.07).toArray() as Position,
        0.12,
        "white"
      );
  }
  const ridge = h.top + deck + 0.12;
  k.box("ridge-mortar", [0, ridge - 0.03, 0], [sl.x1 - sl.x0 - 0.04, 0.12, 0.3], "white");
  for (let x = sl.x0 + 0.2; x < sl.x1 - 0.15; x += 0.4) {
    const mesh = k.add("ridge-tile", ridgeTile, "tile");
    mesh.position.set(x, ridge, 0);
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    );
  }
  return ridge + 0.15;
}

// ---------------------------------------------------------------- smoke, extras

/** A louvred smoke hood on the ridge over the hearth. */
function louver(h: House, x: number, y: number) {
  const k = h.k;
  k.box("louver-sill", [x, y + 0.05, 0], [1, 0.1, 0.72], "oak");
  for (const dx of [-0.44, 0.44])
    for (const dz of [-0.3, 0.3]) k.box("louver-post", [x + dx, y + 0.32, dz], [0.08, 0.48, 0.08], "oak");
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++)
      k.box("louver-slat", [x, y + 0.16 + i * 0.1, s * 0.3], [0.84, 0.1, 0.02], "wood").rotation.x = s * 0.6;
  for (const s of [-1, 1]) {
    const board = k.box("louver-roof", [x, y + 0.72, s * 0.22], [1.15, 0.035, 0.52], "wood");
    board.rotation.x = s * 0.62;
  }
  k.box("louver-ridge", [x, y + 0.88, 0], [1.2, 0.06, 0.08], "oak");
}

/** A rubble stack beside the hearth against the back wall, with a little roof of slabs and tiles over its flue. */
function chimney(h: House, x: number, roofTop: number) {
  const k = h.k,
    z = -h.W / 2 + 0.45,
    top = roofTop + 0.6,
    w = 0.72,
    d = 0.62,
    roofAt = h.eave + h.rise * (1 - (h.W / 2 - 0.45 - d / 2) / (h.W / 2));
  k.box("chimney-core", [x, (h.eave + top) / 2, z], [w - 0.06, top - h.eave, d - 0.06], "clay");
  for (let y = roofAt - 0.2, row = 0; y < top - 0.1; row++) {
    const course = Math.min(h.random(0.16, 0.24), top - y);
    for (const [fw, fd, rot] of [
      [w, d, 0],
      [d, w, Math.PI / 2]
    ] as const)
      for (const side of [-1, 1]) {
        let u = -fw / 2;
        let first = true;
        while (u < fw / 2 - 0.05) {
          const len = first ? (row % 2 ? 0.34 : 0.22) : Math.min(h.random(0.18, 0.32), fw / 2 - u);
          first = false;
          const c = new THREE.Vector3(u + len / 2, y + course / 2, side * (fd / 2 - 0.03)).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rot
          );
          const stone = k.box("chimney-stone", [x + c.x, c.y, z + c.z], [len - 0.025, course - 0.025, 0.08], "stone");
          stone.rotation.y = rot;
          u += len;
        }
      }
    y += course;
  }
  for (const dx of [-0.26, 0.26])
    for (const dz of [-0.21, 0.21]) k.box("flue-pier", [x + dx, top + 0.15, z + dz], [0.16, 0.3, 0.16], "stone");
  k.box("flue-slab", [x, top + 0.34, z], [0.9, 0.08, 0.8], "stone");
  for (const s of [-1, 1]) {
    const slab = k.box("flue-tile", [x, top + 0.44, z + s * 0.2], [0.95, 0.04, 0.46], "tile");
    slab.rotation.x = s * 0.4;
  }
}

/** Life under the eaves: a bench by the home's door, a woodpile against the back wall, a jar or a ladder. */
function extras(h: House, homeX: number | undefined) {
  const k = h.k,
    r = h.random,
    freeOn = (face: Face, u0: number, u1: number) =>
      Math.abs(u0) < h.L / 2 - 0.3 &&
      Math.abs(u1) < h.L / 2 - 0.3 &&
      !faceOpenings(h, face).some(o => o.kind === "door" && hits(rectOf(o, 0.25), u0, u1, 0, 1));
  if (homeX !== undefined) {
    const benchX = homeX + 0.2;
    if (freeOn("front", benchX - 0.75, benchX + 0.75)) {
      const z = h.W / 2 + 0.18;
      k.box("bench-seat", [benchX, 0.44, z], [1.4, 0.06, 0.28], "wood");
      for (const dx of [-0.55, 0.55]) k.box("bench-block", [benchX + dx, 0.205, z], [0.16, 0.41, 0.22], "oak");
    }
    // Back faces run u = -x.
    const pileX = homeX,
      rows = 6,
      across = 11;
    if (freeOn("back", -pileX - 0.75, -pileX + 0.75)) {
      const z = -h.W / 2 - 0.19;
      for (const dx of [-0.6, 0.6]) k.box("woodpile-rail", [pileX + dx, 0.05, z], [0.1, 0.1, 0.32], "oak");
      for (let row = 0; row < rows; row++)
        for (let i = 0; i < across - (row % 2); i++) {
          const x = pileX - 0.66 + (i + (row % 2) * 0.5) * 0.132,
            y = 0.16 + row * 0.115,
            rr = 0.058 * r(0.85, 1.1);
          k.rod(
            "split-log",
            new THREE.Vector3(x, y, z - 0.15 + r(-0.02, 0.02)),
            new THREE.Vector3(x, y, z + 0.15 + r(-0.02, 0.02)),
            rr,
            "wood",
            true
          );
        }
    }
    if (h.profile === "mediterranean") {
      const jarX = homeX - 1.1;
      if (freeOn("front", jarX - 0.2, jarX + 0.2)) {
        const profile = [
          [0, 0],
          [0.1, 0],
          [0.15, 0.12],
          [0.17, 0.3],
          [0.14, 0.46],
          [0.08, 0.54],
          [0.09, 0.6],
          [0.07, 0.6]
        ].map(([px, py]) => new THREE.Vector2(px, py));
        const jar = k.add("storage-jar", new THREE.LatheGeometry(profile, 14), "clay");
        jar.position.set(jarX, 0, h.W / 2 + 0.2);
      }
    }
  }
  if (h.spec.kind === "barn") {
    // A ladder leant against the back wall up to the eaves.
    const z0 = -h.W / 2 - 0.34,
      z1 = -h.W / 2 - 0.03,
      x = h.L / 4;
    if (freeOn("back", -x - 0.35, -x + 0.35)) {
      for (const dx of [-0.22, 0.22])
        k.beam("ladder-rail", [x + dx, 0.03, z0], [x + dx, h.eave - 0.2, z1], 0.06, "wood");
      for (let y = 0.3; y < h.eave - 0.3; y += 0.3) {
        const z = z0 + ((z1 - z0) * y) / (h.eave - 0.2);
        k.rod("ladder-rung", new THREE.Vector3(x - 0.22, y, z), new THREE.Vector3(x + 0.22, y, z), 0.02, "wood", true);
      }
    }
  }
}

/** The byre's drain, a stone-lined channel out under its end wall. */
function byreDrain(h: House, end: 1 | -1) {
  const x = end * (h.L / 2 + 0.13);
  h.k.box("drain-floor", [x, 0.02, 0], [0.28, 0.04, 0.26], "stone");
  for (const dz of [-0.16, 0.16]) h.k.box("drain-side", [x, 0.07, dz], [0.28, 0.14, 0.08], "stone");
}

// ---------------------------------------------------------------- assembly

/** Keep each opening inside the wall it is cut in, clear of the corners. */
function placed(o: VillageOpening, L: number, W: number, t: number): Opening {
  const end = o.face === "right" || o.face === "left",
    room = (end ? W / 2 : L / 2) - t - 0.08,
    width = Math.min(o.width, 2 * room - 0.1),
    raw = o.face === "front" ? o.at : o.face === "back" ? -o.at : o.face === "right" ? -o.at : o.at,
    u = clampTo(raw, [-room + width / 2, room - width / 2]);
  return { ...o, width, u };
}

export function createOpusVillageHouseHigh(spec: VillageHouseSpec) {
  const look = VILLAGE_HOUSE_LOOKS[spec.profile],
    L = clampTo(spec.length, VILLAGE_HOUSE_LIMITS.length),
    W = clampTo(spec.width, VILLAGE_HOUSE_LIMITS.width),
    eave = VILLAGE_EAVE_METERS[spec.kind],
    rise = Math.tan((look.pitchDeg * Math.PI) / 180) * (W / 2),
    mortar = spec.profile === "mediterranean" ? 0xb8a78a : 0x8a8274,
    k = new VillageKit(`village-${spec.kind}-high`, {
      ...look.colors,
      clay: look.wall === "stone" ? mortar : 0x9c7756,
      ...(spec.profile === "northern-urban" ? { green: 0x5e6640 } : {}),
      ...(spec.profile === "mediterranean" ? { white: 0xd6ccb4 } : {})
    }),
    layout = villageHouseLayout(spec, L, W),
    h: House = {
      k,
      spec,
      profile: spec.profile,
      look,
      L,
      W,
      eave,
      t: look.wallMeters,
      rise,
      top: eave + rise,
      random: seeded(villageHouseSpecKey(spec)),
      openings: layout.openings.map(o => placed(o, L, W, look.wallMeters))
    };
  if (look.frame === "box") frameWalls(h);
  else if (look.frame === "logs") logWalls(h);
  else masonryWalls(h);
  openings(h);
  const roofTop = look.roof === "thatch" ? thatch(h) : look.roof === "tile" ? tiles(h) : shingles(h);
  if (layout.smokeX !== undefined) {
    if (look.smoke === "chimney") chimney(h, layout.smokeX, roofTop);
    else louver(h, layout.smokeX, roofTop - 0.06);
  }
  if (layout.byre) byreDrain(h, layout.byre.end);
  extras(h, layout.homeX);
  return compactModel(k.finish(), { mergeEquivalentMaterials: true });
}
