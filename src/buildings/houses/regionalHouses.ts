import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { BUILDING_PALETTES, type BuildingPaletteId } from "../appearance/palette";
import type { BuildingAppearanceProfile } from "../appearance/types";

export type RegionalHouseProfile = Exclude<BuildingAppearanceProfile, "legacy">;

export const REGIONAL_HOUSES = {
  author: "Claude Opus 5.5",
  /** Same envelope as the CE preview lots: 5 × 8 m, ground 3.2 m + upper 2.9 m, 48° gable along the depth. */
  width: 5,
  depth: 8,
  ground: 3.2,
  upper: 2.9,
  pitchDeg: 48,
  spacing: 8
} as const;

export type RegionalCover = "coppi" | "thatch" | "tile" | "stone";
interface HouseStyle {
  note: string;
  wall: BuildingPaletteId;
  roof: BuildingPaletteId;
  cover: RegionalCover;
  frame?: BuildingPaletteId;
  /** Vertical board-and-batten cladding instead of an infilled frame. */
  boarding?: boolean;
  /** Ground storey in coursed rubble under a framed upper storey. */
  stoneGround?: BuildingPaletteId;
  plinth: BuildingPaletteId;
  jetty: number;
  overhang: number;
  verge: number;
  shutters?: readonly string[];
}

const STYLES: Record<RegionalHouseProfile, HouseStyle> = {
  mediterranean: {
    note: "Limewashed masonry houses with stone quoins, louvred shutters, a double tile-course eave, coppo (barrel) tile roofs, an iron balcony and tile-capped chimneys.",
    wall: "limewash",
    roof: "terracotta",
    cover: "coppi",
    plinth: "limestone",
    jetty: 0,
    overhang: 0.35,
    verge: 0.15,
    shutters: ["#4F6F5C", "#4D6A82", "#6E5B3E"]
  },
  atlantic: {
    note: "Close-studded timber frames with plaster infill and corner braces, a jettied upper storey on carved joist ends, thick straw thatch with a ridge roll and liggers, leaded casements and brick stacks.",
    wall: "plaster",
    frame: "frame",
    roof: "straw",
    cover: "thatch",
    plinth: "rubble",
    jetty: 0.4,
    overhang: 0.6,
    verge: 0.35
  },
  "northern-wooded": {
    note: "Board-and-batten log-house cladding on a raised rubble footing, reed thatch, crossed gable horns, small shuttered windows and a rough stone chimney.",
    wall: "timber",
    boarding: true,
    roof: "reed",
    cover: "thatch",
    plinth: "rubble",
    jetty: 0,
    overhang: 0.6,
    verge: 0.35,
    shutters: ["#5C4634", "#6A4E36", "#4E3D2E"]
  },
  "northern-urban": {
    note: "Gable-fronted burgher houses: dark frames with St Andrew's crosses under the windows, a jettied front, a loft door with hoist beam, plain-tile roofs and a brick stack.",
    wall: "plaster",
    frame: "northern-frame",
    roof: "urban-tile",
    cover: "tile",
    plinth: "brick",
    jetty: 0.4,
    overhang: 0.3,
    verge: 0.2
  },
  "stone-upland": {
    note: "Coursed rubble ground storey with dressed quoins under a framed upper storey and gable gallery, heavy graded stone-slab roofs with low eaves and massive stone chimneys.",
    wall: "plaster",
    frame: "frame",
    stoneGround: "upland-stone",
    roof: "local-stone-roof",
    cover: "stone",
    plinth: "upland-stone",
    jetty: 0,
    overhang: 0.35,
    verge: 0.2,
    shutters: ["#5E4A36", "#6B5741", "#4F4030"]
  }
};

export function regionalHouseNote(profile: RegionalHouseProfile): string {
  return STYLES[profile].note;
}

const GLASS = "#2B3640";
const DOOR = "#5A3B26";
const IRON = "#2E2C2A";
const DRESSED = "#C9BFA8";
const BRICK = "#8E5743";

interface Opening {
  u: number;
  y: number;
  w: number;
  h: number;
  door?: boolean;
}
interface Face {
  x: number;
  z: number;
  angle: number;
}

export type RegionalWallFinish = "frame" | "boarding" | "stone" | "masonry";
/** Everything that shapes one house; CE derives it from a lot's massing and appearance. */
export interface RegionalHouseSpec {
  profile: RegionalHouseProfile;
  storeys: number;
  pitchDeg: number;
  roofForm: "gable" | "hip";
  cover: RegionalCover;
  roof: BuildingPaletteId;
  wall: BuildingPaletteId;
  frame?: BuildingPaletteId;
  finish: RegionalWallFinish;
  quoins: boolean;
  jetty: number;
  shade: 0 | 1 | 2;
  /** Door side, chimney position and per-profile extras (balcony, gallery). */
  variant: 0 | 1 | 2;
}

export function regionalHouseSpecKey(spec: RegionalHouseSpec): string {
  return [
    spec.profile,
    spec.storeys,
    spec.pitchDeg,
    spec.roofForm,
    spec.cover,
    spec.roof,
    spec.wall,
    spec.frame ?? "",
    spec.finish,
    spec.quoins,
    spec.jetty,
    spec.shade,
    spec.variant
  ].join("|");
}

/** The profile's own house, as shown in the BV preview row. */
export function defaultRegionalHouseSpec(profile: RegionalHouseProfile, variant: 0 | 1 | 2): RegionalHouseSpec {
  const style = STYLES[profile];
  return {
    profile,
    storeys: 2,
    pitchDeg: REGIONAL_HOUSES.pitchDeg,
    roofForm: "gable",
    cover: style.cover,
    roof: style.roof,
    wall: style.wall,
    frame: style.frame,
    finish: style.boarding ? "boarding" : style.frame ? "frame" : "masonry",
    quoins: !style.frame && !style.boarding,
    jetty: style.jetty,
    shade: ([2, 0, 1] as const)[variant],
    variant
  };
}

/** A row of three regional houses on the CE preview lots (x = −8, 0, 8), fronts facing +Z. */
export function createRegionalHouses(profile: RegionalHouseProfile): CityStructureMeshes {
  return buildHouses(
    `regional-houses-${profile}`,
    ([0, 1, 2] as const).map(variant => ({
      spec: defaultRegionalHouseSpec(profile, variant),
      ox: (variant - 1) * REGIONAL_HOUSES.spacing
    }))
  );
}

/** One house centred on the origin: 5 m wide on X, 8 m deep on Z with its front gable toward +Z. */
export function createRegionalHouse(spec: RegionalHouseSpec): CityStructureMeshes {
  return buildHouses(`regional-house-${spec.profile}`, [{ spec, ox: 0 }]);
}

function buildHouses(
  name: string,
  houses: ReadonlyArray<{ spec: RegionalHouseSpec; ox: number }>
): CityStructureMeshes {
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const buckets = new Map<THREE.MeshLambertMaterial, THREE.BufferGeometry[]>();
  const cache = new Map<string, THREE.BufferGeometry>();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);

  function material(color: string, doubleSided = false): THREE.MeshLambertMaterial {
    const key = `${color}:${doubleSided}`;
    let found = materials.get(key);
    if (!found) {
      found = new THREE.MeshLambertMaterial({
        color: new THREE.Color(color),
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide
      });
      materials.set(key, found);
      buckets.set(found, []);
    }
    return found;
  }
  function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = cache.get(key);
    if (!geometry) {
      geometry = build();
      cache.set(key, geometry);
    }
    return geometry;
  }
  function put(
    geometry: THREE.BufferGeometry,
    color: string,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    doubleSided = false
  ): void {
    euler.set(rotation[0], rotation[1], rotation[2], "YXZ");
    quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.deleteAttribute("uv");
    copy.applyMatrix4(matrix);
    buckets.get(material(color, doubleSided))?.push(copy);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, angle = 0): void {
    put(unitBox, color, [x, y + h / 2, z], [0, angle, 0], [w, h, d]);
  }
  /** Facade frame: U runs along the wall, the outward normal is local +Z, roll turns within the wall plane. */
  function onFace(
    face: Face,
    geometry: THREE.BufferGeometry,
    color: string,
    u: number,
    y: number,
    out: number,
    scale: [number, number, number],
    roll = 0
  ): void {
    const c = Math.cos(face.angle);
    const s = Math.sin(face.angle);
    put(geometry, color, [face.x + c * u + s * out, y, face.z - s * u + c * out], [0, face.angle, roll], scale);
  }
  function member(face: Face, u0: number, y0: number, u1: number, y1: number, color: string, size = 0.17): void {
    const length = Math.hypot(u1 - u0, y1 - y0);
    if (length < 0.05) return;
    onFace(
      face,
      unitBox,
      color,
      (u0 + u1) / 2,
      (y0 + y1) / 2,
      0.035,
      [length + (y0 === y1 ? 0 : size * 0.5), size, 0.09],
      Math.atan2(y1 - y0, u1 - u0)
    );
  }
  const inside = (openings: readonly Opening[], u: number, y: number, pad = 0) =>
    openings.some(o => Math.abs(u - o.u) < o.w / 2 + pad && y > o.y - pad && y < o.y + o.h + pad);

  /** Half-timber frame over a plastered wall panel, laid out around its openings. */
  function frameWall(
    face: Face,
    width: number,
    y0: number,
    y1: number,
    openings: readonly Opening[],
    color: string,
    crosses: boolean
  ): void {
    const t = 0.17;
    const edge = width / 2 - t / 2;
    member(face, -width / 2, y0 + t / 2, width / 2, y0 + t / 2, color, t * 1.15);
    member(face, -width / 2, y1 - t / 2, width / 2, y1 - t / 2, color, t * 1.15);
    const posts = new Set<number>([-edge, edge]);
    for (const o of openings) {
      posts.add(Math.max(-edge, o.u - o.w / 2 - t / 2));
      posts.add(Math.min(edge, o.u + o.w / 2 + t / 2));
    }
    // Close studding: fill wide panels so no bay exceeds ~0.8 m.
    let sorted = [...posts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const gap = sorted[i + 1] - sorted[i];
      const n = Math.floor(gap / 0.8);
      for (let k = 1; k <= n; k++) {
        const u = sorted[i] + (gap * k) / (n + 1);
        if (!inside(openings, u, (y0 + y1) / 2, t)) posts.add(u);
      }
    }
    sorted = [...posts].sort((a, b) => a - b);
    for (const u of sorted) {
      // Posts beside an opening still run full height; a stud over an opening stops at its head.
      const over = openings.find(o => Math.abs(u - o.u) < o.w / 2);
      if (over) {
        if (over.y + over.h + t < y1 - t) member(face, u, over.y + over.h, u, y1 - t, color);
        if (!over.door && over.y > y0 + t * 2) member(face, u, y0 + t, u, over.y, color);
      } else member(face, u, y0 + t, u, y1 - t, color);
    }
    const rail = y0 + (y1 - y0) * 0.42;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const mid = (a + b) / 2;
      if (!inside(openings, mid, rail, 0.02)) member(face, a, rail, b, rail, color, t * 0.9);
      const opening = openings.find(o => Math.abs(mid - o.u) < o.w / 2);
      if (opening) {
        member(face, a, opening.y + opening.h + t / 2, b, opening.y + opening.h + t / 2, color, t * 0.9);
        if (!opening.door) {
          member(face, a, opening.y - t / 2, b, opening.y - t / 2, color, t * 0.9);
          if (crosses && opening.y - y0 > 0.5) {
            member(face, a, y0 + t, b, opening.y - t, color, t * 0.8);
            member(face, a, opening.y - t, b, y0 + t, color, t * 0.8);
          }
        }
      }
    }
    // Corner braces in the outer bays when they are free of openings.
    for (const [a, b, rising] of [
      [sorted[0], sorted[1], true],
      [sorted.at(-2)!, sorted.at(-1)!, false]
    ] as const) {
      if (a === undefined || b === undefined || inside(openings, (a + b) / 2, (y0 + rail) / 2, 0.05)) continue;
      if (rising) member(face, a, y0 + t, b, rail, color, t * 0.85);
      else member(face, a, rail, b, y0 + t, color, t * 0.85);
    }
  }
  /** Board-and-batten cladding: battens every 0.3 m, skipping openings. */
  function boardWall(
    face: Face,
    width: number,
    y0: number,
    top: (u: number) => number,
    openings: readonly Opening[],
    color: string
  ) {
    const count = Math.floor(width / 0.3);
    for (let i = 0; i <= count; i++) {
      const u = -width / 2 + (width * i) / count;
      const y1 = top(u);
      if (y1 - y0 < 0.1) continue;
      const blocked = openings.filter(o => Math.abs(u - o.u) < o.w / 2 + 0.06);
      if (!blocked.length) {
        onFace(face, unitBox, color, u, (y0 + y1) / 2, 0.03, [0.07, y1 - y0, 0.05]);
        continue;
      }
      let from = y0;
      for (const o of blocked.sort((p, q) => p.y - q.y)) {
        if (o.y - 0.06 > from)
          onFace(face, unitBox, color, u, (from + o.y - 0.06) / 2, 0.03, [0.07, o.y - 0.06 - from, 0.05]);
        from = o.y + o.h + 0.06;
      }
      if (y1 > from) onFace(face, unitBox, color, u, (from + y1) / 2, 0.03, [0.07, y1 - from, 0.05]);
    }
  }
  /** Coursed rubble: offset stones standing proud of the wall, with dressed quoins at the ends. */
  function rubbleWall(
    face: Face,
    width: number,
    y0: number,
    y1: number,
    openings: readonly Opening[],
    seed: number,
    tones: readonly string[]
  ) {
    let course = 0;
    for (let y = y0; y < y1 - 0.1; y += 0.34, course++) {
      const h = Math.min(0.3, y1 - y - 0.04);
      let u = -width / 2 + 0.38 + ((course + seed) % 2) * 0.28;
      let k = 0;
      while (u < width / 2 - 0.38) {
        const w = 0.42 + ((course * 7 + k * 13 + seed * 5) % 5) * 0.09;
        const mid = Math.min(u + w / 2, width / 2 - 0.4);
        if (!inside(openings, mid, y + h / 2, 0.12))
          onFace(face, unitBox, tones[(course + k + seed) % 3], mid, y + h / 2, 0.02, [
            Math.min(w, width / 2 - 0.38 - u) - 0.05,
            h,
            0.06
          ]);
        u += w;
        k++;
      }
      for (const side of [-1, 1]) {
        const long = (course + (side > 0 ? 1 : 0)) % 2 === 0;
        onFace(face, unitBox, DRESSED, side * (width / 2 - (long ? 0.3 : 0.2)), y + h / 2, 0.03, [
          long ? 0.6 : 0.4,
          h,
          0.08
        ]);
      }
    }
  }

  function window(face: Face, o: Opening, frame: string, shutter?: string, leaded = false): void {
    onFace(face, unitBox, GLASS, o.u, o.y + o.h / 2, 0.005, [o.w, o.h, 0.04]);
    const f = 0.08;
    for (const side of [-1, 1])
      onFace(face, unitBox, frame, o.u + side * (o.w / 2 + f / 2), o.y + o.h / 2, 0.05, [f, o.h + f * 2, 0.1]);
    onFace(face, unitBox, frame, o.u, o.y + o.h + f / 2, 0.05, [o.w + f * 2, f, 0.1]);
    onFace(face, unitBox, frame, o.u, o.y - f / 2, 0.08, [o.w + f * 3, f * 1.1, 0.18]);
    // Mullion and transom; leaded casements add a fine lattice.
    onFace(face, unitBox, frame, o.u, o.y + o.h / 2, 0.04, [0.05, o.h, 0.05]);
    onFace(face, unitBox, frame, o.u, o.y + o.h * 0.62, 0.04, [o.w, 0.05, 0.05]);
    if (leaded) {
      for (const k of [-1, 1]) {
        onFace(face, unitBox, IRON, o.u, o.y + o.h / 2, 0.035, [o.w * 1.25, 0.02, 0.02], k * 0.9);
        onFace(face, unitBox, IRON, o.u, o.y + o.h / 2, 0.035, [o.w * 1.25, 0.02, 0.02], k * 0.45);
      }
    }
    if (!shutter) return;
    for (const side of [-1, 1]) {
      const u = o.u + side * (o.w * 0.75 + f);
      onFace(face, unitBox, shutter, u, o.y + o.h / 2, 0.07, [o.w / 2, o.h + 0.05, 0.05]);
      for (let k = 1; k < 6; k++)
        onFace(face, unitBox, IRON, u, o.y + (o.h * k) / 6, 0.1, [o.w / 2 - 0.06, 0.018, 0.02]);
    }
  }
  function door(face: Face, o: Opening, frame: string, arched: boolean): void {
    onFace(face, unitBox, DOOR, o.u, o.y + o.h / 2, 0.01, [o.w, o.h, 0.06]);
    for (let k = 1; k < 4; k++)
      onFace(face, unitBox, "#47301F", o.u - o.w / 2 + (o.w * k) / 4, o.y + o.h / 2, 0.045, [0.025, o.h - 0.05, 0.02]);
    for (const y of [0.3, o.h - 0.4])
      onFace(face, unitBox, IRON, o.u - o.w * 0.15, o.y + y, 0.05, [o.w * 0.6, 0.05, 0.03]);
    const f = 0.12;
    for (const side of [-1, 1])
      onFace(face, unitBox, frame, o.u + side * (o.w / 2 + f / 2), o.y + o.h / 2, 0.05, [f, o.h, 0.12]);
    if (arched) {
      const ring = cached(`door-arch:${o.w}`, () => {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, o.w / 2 + f, 0, Math.PI, false);
        const hole = new THREE.Path();
        hole.absarc(0, 0, o.w / 2, Math.PI, 0, true);
        shape.holes.push(hole);
        return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 10 });
      });
      onFace(face, ring, frame, o.u, o.y + o.h, 0, [1, 1, 1]);
      const lunette = cached(`door-lunette:${o.w}`, () => new THREE.CircleGeometry(o.w / 2, 10, 0, Math.PI));
      onFace(face, lunette, GLASS, o.u, o.y + o.h, 0.01, [1, 1, 1]);
    } else onFace(face, unitBox, frame, o.u, o.y + o.h + f / 2, 0.05, [o.w + f * 2, f, 0.12]);
    if (o.y < 1) onFace(face, unitBox, DRESSED, o.u, 0.08, 0.3, [o.w + 0.5, 0.16, 0.5]);
  }

  /** Coursed covering: each course proud at its butt, flush at its head, extruded along the ridge. */
  function roofSection(run: number, rise: number, length: number, cover: RegionalCover): THREE.BufferGeometry {
    return cached(`roof:${run}:${rise}:${length}:${cover}`, () => {
      const points: THREE.Vector2[] = [];
      if (cover === "thatch") {
        const t = 0.5;
        const slope = rise / run;
        points.push(
          new THREE.Vector2(-run, 0),
          new THREE.Vector2(-run - 0.06, t * 0.45),
          new THREE.Vector2(-run + 0.05, t * 0.85)
        );
        points.push(
          new THREE.Vector2(0, rise + t),
          new THREE.Vector2(run - 0.05, t * 0.85),
          new THREE.Vector2(run + 0.06, t * 0.45)
        );
        points.push(new THREE.Vector2(run, 0), new THREE.Vector2(0, rise - 0.12 - slope * 0.01));
        return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: length, bevelEnabled: false });
      }
      const pitchLength = Math.hypot(run, rise);
      const step = cover === "stone" ? 0.5 : cover === "coppi" ? 0.38 : 0.24;
      const proud = cover === "stone" ? 0.11 : cover === "coppi" ? 0.08 : 0.05;
      const courses = Math.max(4, Math.round(pitchLength / step));
      const side = (sign: number) => {
        const list: THREE.Vector2[] = [];
        const along = new THREE.Vector2(-sign * run, rise);
        const normal = new THREE.Vector2(sign * rise, run).normalize();
        let f = 0;
        for (let k = 0; k < courses; k++) {
          // Stone slates are graded: large at the eaves, small toward the ridge.
          const span = cover === "stone" ? (2 * (courses - k)) / (courses * (courses + 1)) : 1 / courses;
          const a = new THREE.Vector2(sign * run, 0).addScaledVector(along, f);
          f += span;
          const b = new THREE.Vector2(sign * run, 0).addScaledVector(along, Math.min(1, f));
          list.push(a.addScaledVector(normal, proud + 0.04), b.addScaledVector(normal, 0.04));
        }
        return list;
      };
      points.push(...side(-1), new THREE.Vector2(0, rise + proud + 0.06), ...side(1).reverse());
      const t = cover === "stone" ? 0.22 : 0.16;
      points.push(new THREE.Vector2(run, -t), new THREE.Vector2(0, rise - t * 1.4), new THREE.Vector2(-run, -t));
      return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: length, bevelEnabled: false });
    });
  }

  function house(spec: RegionalHouseSpec, ox: number): void {
    const style = STYLES[spec.profile];
    const profile = spec.profile;
    const { width: w, depth: d, ground, upper } = REGIONAL_HOUSES;
    const variant = spec.variant;
    const shade = spec.shade;
    const storeys = Math.max(1, Math.min(5, Math.round(spec.storeys)));
    const wall = BUILDING_PALETTES[spec.wall][shade];
    const roof = BUILDING_PALETTES[spec.roof][shade];
    const capColor = BUILDING_PALETTES[spec.roof][Math.max(0, shade - 1)];
    const frame = spec.frame ? BUILDING_PALETTES[spec.frame][shade] : BUILDING_PALETTES.timber[0];
    const plinth = BUILDING_PALETTES[style.plinth][1];
    const shutter = style.shutters?.[variant];
    const doorSide = variant === 1 ? -1 : 1;
    const j = storeys > 1 ? spec.jetty : 0;
    const eave = ground + (storeys - 1) * upper;
    const pitch = THREE.MathUtils.degToRad(spec.pitchDeg);
    const front = d / 2;
    const boarding = spec.finish === "boarding";
    const masonry = spec.finish === "masonry" || spec.finish === "stone";
    const stoneGround = spec.finish === "frame" && profile === "stone-upland";
    const trim = masonry ? DRESSED : frame;
    const cover = spec.cover;
    const gable = spec.roofForm === "gable";
    const plinthH = boarding ? 0.6 : 0.35;

    // Masses: ground storey, jettied upper storeys, plinth.
    box(ox, 0, 0, w + 0.12, plinthH, d + 0.12, plinth);
    box(ox, 0, 0, w, ground, d, stoneGround ? BUILDING_PALETTES["upland-stone"][0] : wall);
    if (storeys > 1) box(ox, ground, j / 2, w, eave - ground, d + j, wall);
    if (j > 0) {
      // Projecting joist ends carry the jetty; a moulded bressumer caps them.
      for (let k = 0; k < 9; k++)
        box(ox - w / 2 + 0.2 + (k * (w - 0.4)) / 8, ground - 0.16, front + j / 2, 0.12, 0.16, j + 0.1, frame);
      box(ox, ground - 0.02, front + j - 0.04, w + 0.04, 0.2, 0.16, frame);
    }

    for (let s = 0; s < storeys; s++) {
      const upperStorey = s > 0;
      const base = upperStorey ? ground + (s - 1) * upper : 0;
      const shift = upperStorey ? j : 0;
      const sill = base + 0.85;
      const small = boarding ? 0.8 : 1.0;
      const faces: Array<[Face, number, Opening[]]> = [
        [
          { x: ox, z: front + shift, angle: 0 },
          w,
          !upperStorey
            ? [
                { u: doorSide * 1.25, y: plinthH * 0.5, w: 1.0, h: 2.15, door: true },
                { u: -doorSide * 1.1, y: 1.0, w: 0.9, h: 1.15 }
              ]
            : s === 1 && variant === 1 && profile === "mediterranean"
              ? [{ u: 0, y: base + 0.1, w: 1.0, h: 2.2, door: true }]
              : [
                  { u: -1.15, y: sill, w: 0.8, h: boarding ? 0.8 : 1.1 },
                  { u: 1.15, y: sill, w: 0.8, h: boarding ? 0.8 : 1.1 }
                ]
        ],
        [{ x: ox, z: -front, angle: Math.PI }, w, [{ u: 0, y: upperStorey ? sill : 1.05, w: 0.8, h: small }]],
        [
          { x: ox + w / 2, z: shift / 2, angle: Math.PI / 2 },
          d + shift,
          upperStorey
            ? [
                { u: -1.8 - shift / 2, y: sill, w: 0.75, h: small },
                { u: 1.6 - shift / 2, y: sill, w: 0.75, h: small }
              ]
            : [{ u: -1.8, y: 1.05, w: 0.8, h: small }]
        ],
        [
          { x: ox - w / 2, z: shift / 2, angle: -Math.PI / 2 },
          d + shift,
          [{ u: 1.8 + shift / 2, y: upperStorey ? sill : 1.05, w: upperStorey ? 0.75 : 0.8, h: small }]
        ]
      ];
      const y0 = upperStorey ? base : plinthH;
      const y1 = upperStorey ? base + upper : ground;
      for (const [face, length, list] of faces) {
        if (boarding) boardWall(face, length, y0, () => y1, list, frame);
        else if (spec.finish === "stone")
          rubbleWall(face, length, y0, y1, list, variant + s, BUILDING_PALETTES[spec.wall]);
        else if (stoneGround && !upperStorey)
          rubbleWall(face, length, y0, y1, list, variant, BUILDING_PALETTES["upland-stone"]);
        else if (spec.finish === "frame")
          frameWall(face, length, y0, y1, list, frame, profile === "northern-urban" && upperStorey);
        else if (!upperStorey && spec.quoins) {
          // Masonry: quoins on the corners of the whole height.
          for (let y = plinthH, k = 0; y < eave - 0.2; y += 0.36, k++)
            for (const side of [-1, 1])
              onFace(
                face,
                unitBox,
                BUILDING_PALETTES.limestone[2],
                side * (length / 2 - (k % 2 ? 0.2 : 0.3)),
                y + 0.16,
                0.02,
                [k % 2 ? 0.4 : 0.6, 0.3, 0.05]
              );
        }
        for (const o of list) {
          if (o.door) door(face, o, trim, masonry || stoneGround);
          else window(face, o, trim, shutter, profile === "atlantic");
        }
      }
    }
    if (profile === "mediterranean" && variant === 1 && storeys > 1) {
      // Balcony on the upper door: stone slab on brackets with an iron railing.
      box(ox, ground, front + 0.45, 1.8, 0.12, 0.9, DRESSED);
      for (const u of [-0.7, 0.7]) box(ox + u, ground - 0.3, front + 0.2, 0.12, 0.3, 0.4, DRESSED);
      box(ox, ground + 1.0, front + 0.88, 1.8, 0.05, 0.05, IRON);
      for (const side of [-1, 1]) box(ox + side * 0.88, ground + 1.0, front + 0.45, 0.05, 0.05, 0.9, IRON);
      for (let k = 0; k <= 12; k++)
        box(ox - 0.88 + (k * 1.76) / 12, ground + 0.12, front + 0.88, 0.025, 0.9, 0.025, IRON);
      for (let k = 1; k < 6; k++)
        for (const side of [-1, 1])
          box(ox + side * 0.88, ground + 0.12, front + (k * 0.88) / 6, 0.025, 0.9, 0.025, IRON);
    }

    const run = w / 2 + style.overhang;
    const rise = Math.tan(pitch) * (w / 2);
    const roofY = eave - Math.tan(pitch) * style.overhang;
    const ridgeY = roofY + Math.tan(pitch) * run;
    const zFront = front + j + style.verge;
    const zBack = -front - style.verge;
    const length = zFront - zBack;
    const midZ = (zFront + zBack) / 2;
    const thatch = cover === "thatch";

    if (gable) {
      // Gable ends: infill triangle, then frame, boards or masonry detailing above the eave.
      for (const face of [
        { x: ox, z: front + j, angle: 0 },
        { x: ox, z: -front, angle: Math.PI }
      ]) {
        const triangle = cached(`gable:${w}:${rise}`, () => {
          const shape = new THREE.Shape([
            new THREE.Vector2(-w / 2, 0),
            new THREE.Vector2(w / 2, 0),
            new THREE.Vector2(0, rise)
          ]);
          return new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
        });
        onFace(face, triangle, wall, 0, eave, -0.3, [1, 1, 1]);
        const top = (u: number) => eave + rise * (1 - Math.abs(u) / (w / 2)) - 0.08;
        const loftFits = rise > 1.6;
        const loft: Opening[] = !loftFits
          ? []
          : profile === "northern-urban" && face.angle === 0 && rise > 2.1
            ? [{ u: 0, y: eave + 0.3, w: 0.9, h: 1.3, door: true }]
            : [{ u: 0, y: eave + 0.55, w: 0.5, h: 0.7 }];
        const opening = loft[0] ?? { u: 0, y: eave, w: 0, h: 0 };
        if (boarding) boardWall(face, w - 0.1, eave, top, loft, frame);
        else if (spec.finish === "frame") {
          member(face, -w / 2, eave + 0.09, w / 2, eave + 0.09, frame);
          member(face, 0, opening.y + opening.h, 0, eave + rise - 0.1, frame);
          const collar = eave + rise * 0.55;
          member(face, -w * 0.22, collar, -opening.w / 2 - 0.08, collar, frame, 0.15);
          member(face, opening.w / 2 + 0.08, collar, w * 0.22, collar, frame, 0.15);
          for (const side of [-1, 1]) {
            member(face, side * w * 0.42, eave + 0.17, side * w * 0.42, top(side * w * 0.42), frame, 0.15);
            member(face, side * w * 0.42, eave + 0.2, side * (opening.w / 2 + 0.1), collar - 0.05, frame, 0.14);
          }
        }
        for (const o of loft) {
          if (o.door) {
            onFace(face, unitBox, DOOR, o.u, o.y + o.h / 2, 0.01, [o.w, o.h, 0.06]);
            member(face, -o.w / 2 - 0.08, o.y, -o.w / 2 - 0.08, o.y + o.h, frame);
            member(face, o.w / 2 + 0.08, o.y, o.w / 2 + 0.08, o.y + o.h, frame);
            // Hoist beam with pulley block above the loft door.
            onFace(face, unitBox, frame, 0, o.y + o.h + 0.45, 0.6, [0.18, 0.2, 1.3]);
            onFace(face, unitCylinder, IRON, 0, o.y + o.h + 0.2, 1.15, [0.1, 0.12, 0.1], Math.PI / 2);
            onFace(face, unitBox, "#8C7A5A", 0, o.y + o.h - 0.4, 1.15, [0.015, 0.9, 0.015]);
          } else window(face, o, trim, undefined, profile === "atlantic");
        }
      }
      // Roof covering with verges past both gables, plus ridge treatment.
      put(
        roofSection(run, Math.tan(pitch) * run, length, cover),
        roof,
        [ox, roofY, zBack],
        [0, 0, 0],
        [1, 1, 1],
        thatch
      );
      if (thatch) {
        put(unitCylinder, capColor, [ox, ridgeY + 0.45, midZ], [Math.PI / 2, 0, 0], [0.32, length + 0.1, 0.32]);
        // Liggers: hazel rods pinning the ridge roll, with cross spars between them.
        for (const side of [-1, 1]) {
          const surface = (u: number) => ridgeY + 0.5 - u * Math.tan(pitch) + 0.03;
          put(unitBox, "#6E5C3E", [ox + side * 0.62, surface(0.62), midZ], [0, 0, side * -pitch], [0.04, 0.04, length]);
          for (let k = 0; k < Math.floor(length / 0.35); k++) {
            const z = zBack + 0.2 + k * 0.35;
            put(unitBox, "#6E5C3E", [ox + side * 0.45, surface(0.45), z], [0, 0, side * -pitch], [0.35, 0.03, 0.03]);
          }
        }
        if (profile === "northern-wooded") {
          // Each verge board follows its slope and runs on past the apex, so the pair crosses.
          for (const z of [zFront - 0.05, zBack + 0.05])
            for (const side of [-1, 1])
              put(
                unitBox,
                frame,
                [ox - side * Math.cos(pitch) * 0.2, ridgeY + 0.5 + Math.sin(pitch) * 0.2, z],
                [0, 0, side * (Math.PI / 2 - pitch)],
                [0.14, 1.6, 0.08]
              );
        }
      } else {
        // Ridge capping: barrel coppi, half-round ridge tiles or a stone ridge.
        const cap = cached("ridge", () => new THREE.CylinderGeometry(1, 1, 1, 10));
        put(
          cap,
          capColor,
          [ox, ridgeY + 0.08, midZ],
          [Math.PI / 2, 0, 0],
          [cover === "stone" ? 0.2 : 0.15, length + 0.05, 0.15]
        );
        if (cover === "coppi") {
          // Barrel tiles run down each slope in channels; the lower half is buried in the coursed underlayer.
          const slopeLength = Math.hypot(run, Math.tan(pitch) * run);
          const rib = cached("coppo", () => new THREE.CylinderGeometry(0.075, 0.09, 1, 6));
          for (let k = 0; k < Math.floor(length / 0.3); k++) {
            const z = zBack + 0.15 + k * 0.3;
            for (const side of [-1, 1])
              put(
                rib,
                capColor,
                [ox + (side * run) / 2, roofY + (Math.tan(pitch) * run) / 2 + 0.13, z],
                [0, 0, side * (Math.PI / 2 - pitch)],
                [1, slopeLength, 1]
              );
          }
        }
      }
      if (profile === "northern-urban") {
        // Gable apex finial.
        put(unitCylinder, frame, [ox, ridgeY + 0.5, zFront - 0.1], [0, 0, 0], [0.06, 0.8, 0.06]);
        put(
          cached("knob", () => new THREE.SphereGeometry(0.12, 8, 6)),
          frame,
          [ox, ridgeY + 0.95, zFront - 0.1]
        );
      }
    } else hipRoof(ox, roofY, run, zBack, zFront, Math.tan(pitch) * run, roof, capColor, cover);
    if (cover === "coppi")
      // Double tile-course eave (genoise) under each eave line.
      for (const side of [-1, 1])
        for (let r = 0; r < 2; r++)
          box(ox + side * (w / 2 + 0.08 + r * 0.1), eave - 0.18 - r * 0.12, j / 2, 0.16, 0.1, d + j + 0.1, capColor);

    // Chimney stack through the roof slope, kept inside the ridge on hipped roofs.
    const cz = [-2.1, 1.4, -0.9][variant] * (gable ? 1 : 0.5);
    const cxOff = thatch ? 0 : 0.7 * doorSide;
    const stackColor =
      masonry && cover === "coppi"
        ? wall
        : cover === "stone" || profile === "northern-wooded"
          ? BUILDING_PALETTES["upland-stone"][1]
          : BRICK;
    const stackTop = ridgeY + (thatch ? 1.2 : 0.8);
    const stackSize = cover === "stone" ? 1.0 : 0.7;
    box(ox + cxOff, eave - 1, cz, stackSize, stackTop - eave + 1, stackSize, stackColor);
    box(ox + cxOff, stackTop, cz, stackSize + 0.16, 0.12, stackSize + 0.16, cover === "coppi" ? DRESSED : stackColor);
    if (cover === "coppi") {
      put(
        cached("chimney-cap", () => new THREE.CylinderGeometry(0.0, 0.62, 0.4, 4, 1, false, Math.PI / 4)),
        roof,
        [ox + cxOff, stackTop + 0.32, cz]
      );
    } else if (cover === "stone") {
      for (const side of [-1, 1]) box(ox + cxOff + side * 0.32, stackTop + 0.12, cz, 0.16, 0.35, 0.8, stackColor);
      box(ox + cxOff, stackTop + 0.47, cz, 1.2, 0.1, 1.0, BUILDING_PALETTES["local-stone-roof"][0]);
    } else {
      for (const side of [-1, 1])
        put(unitCylinder, "#7A4434", [ox + cxOff + side * 0.16, stackTop + 0.3, cz], [0, 0, 0], [0.11, 0.4, 0.11]);
    }

    if (profile === "stone-upland" && variant !== 1 && storeys > 1) {
      // Gable gallery: timber balcony along the first upper storey of the front.
      box(ox, ground + 0.05, front + 0.55, w + 0.4, 0.1, 1.1, frame);
      for (const u of [-w / 2 - 0.1, w / 2 + 0.1]) box(ox + u, 0.35, front + 1.0, 0.18, ground - 0.3, 0.18, frame);
      box(ox, ground + 1.0, front + 1.05, w + 0.4, 0.08, 0.08, frame);
      for (let k = 0; k <= 16; k++)
        box(ox - w / 2 - 0.15 + (k * (w + 0.3)) / 16, ground + 0.15, front + 1.05, 0.1, 0.85, 0.03, frame);
    }
    // Rainwater barrel by the door for a lived-in touch.
    put(unitCylinder, "#6B5235", [ox + doorSide * 2.2, 0.4, front + 0.45], [0, 0, 0], [0.3, 0.8, 0.3]);
    for (const y of [0.15, 0.65])
      put(unitCylinder, IRON, [ox + doorSide * 2.2, y, front + 0.45], [0, 0, 0], [0.315, 0.04, 0.315]);
  }

  /** Hipped roof: two trapezoids and two triangles, coursed by strips parallel to each eave. */
  function hipRoof(
    ox: number,
    y: number,
    run: number,
    zB: number,
    zF: number,
    rise: number,
    color: string,
    capColor: string,
    cover: RegionalCover
  ): void {
    const inset = Math.min(run, (zF - zB) / 2);
    const v = (x: number, h: number, z: number) => new THREE.Vector3(ox + x, y + h, z);
    const A = v(-run, 0, zB);
    const B = v(run, 0, zB);
    const C = v(run, 0, zF);
    const D = v(-run, 0, zF);
    const R1 = v(0, rise, zB + inset);
    const R2 = v(0, rise, zF - inset);
    const positions: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      // Keep every facet wound so its normal points up and out.
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      const [p, q] = n.y >= 0 ? [b, c] : [c, b];
      positions.push(a.x, a.y, a.z, p.x, p.y, p.z, q.x, q.y, q.z);
    };
    tri(B, C, R2);
    tri(B, R2, R1);
    tri(D, A, R1);
    tri(D, R1, R2);
    tri(C, D, R2);
    tri(A, B, R1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    buckets.get(material(color, true))?.push(geometry);
    const thick = cover === "thatch" ? 0.45 : cover === "stone" ? 0.22 : 0.16;
    // Fascia gives the eaves their covering thickness.
    box(ox, -thick + y, zB, run * 2, thick, 0.1, color);
    box(ox, -thick + y, zF, run * 2, thick, 0.1, color);
    for (const side of [-1, 1]) box(ox + side * run, -thick + y, (zB + zF) / 2, 0.1, thick, zF - zB, color);
    const pitch = Math.atan2(rise, run);
    if (cover !== "thatch") {
      const step = cover === "stone" ? 0.45 : cover === "coppi" ? 0.36 : 0.24;
      const courses = Math.max(3, Math.round(Math.hypot(run, rise) / step));
      for (let k = 0; k < courses; k++) {
        const f = k / courses;
        const h = y + f * rise + 0.03;
        const along = zF - zB - 2 * f * inset;
        for (const side of [-1, 1])
          put(
            unitBox,
            capColor,
            [ox + side * run * (1 - f), h, (zB + zF) / 2],
            [0, 0, side * -pitch],
            [0.2, 0.05, Math.max(0.1, along)]
          );
        const across = 2 * run * (1 - f);
        for (const [z, side] of [
          [zB + f * inset, -1],
          [zF - f * inset, 1]
        ] as const)
          put(unitBox, capColor, [ox, h, z], [side * pitch, 0, 0], [Math.max(0.1, across), 0.05, 0.2]);
      }
    }
    // Ridge and hip rolls.
    const radius = cover === "thatch" ? 0.3 : 0.14;
    const roll = (p: THREE.Vector3, q: THREE.Vector3) => {
      const dir = q.clone().sub(p);
      const len = dir.length();
      if (len < 0.05) return;
      const mid = p.clone().add(q).multiplyScalar(0.5);
      mid.y += cover === "thatch" ? 0.25 : 0.06;
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      matrix.compose(mid, quaternion, new THREE.Vector3(radius, len, radius));
      const copy = unitCylinder.toNonIndexed();
      copy.deleteAttribute("uv");
      copy.applyMatrix4(matrix);
      buckets.get(material(capColor))?.push(copy);
    };
    roll(R1, R2);
    for (const [corner, top] of [
      [A, R1],
      [B, R1],
      [C, R2],
      [D, R2]
    ] as const)
      roll(corner, top);
  }

  for (const { spec, ox } of houses) house(spec, ox);

  const group = new THREE.Group();
  group.name = name;
  const pickables: THREE.Mesh[] = [];
  const merged: THREE.BufferGeometry[] = [];
  for (const [mat, parts] of buckets) {
    if (!parts.length) continue;
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    merged.push(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    group.add(mesh);
    pickables.push(mesh);
  }
  for (const geometry of cache.values()) geometry.dispose();
  unitBox.dispose();
  unitCylinder.dispose();
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of merged) geometry.dispose();
      for (const mat of materials.values()) mat.dispose();
    }
  };
}
