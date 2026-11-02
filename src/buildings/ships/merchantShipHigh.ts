import * as THREE from "three";
import { ModelKit, type Position, type Surface } from "../medieval/modelKit";
import type { ModelPartFactory } from "../modelParts";
import { CARAVEL_STATIONS } from "./caravel";
import { CARRACK_STATIONS } from "./carrack";
import {
  addSailBundle,
  assembleSailingParts,
  SailingKit,
  type SailingShipState,
  type ShipHullFrame
} from "./sailingAssembly";

export type MerchantShipKind = "caravel" | "carrack";
const v = (p: Position) => new THREE.Vector3(...p);
const pos = (p: THREE.Vector3): Position => [p.x, p.y, p.z];
const profiles = { caravel: CARAVEL_STATIONS, carrack: CARRACK_STATIONS };
const samples = Object.fromEntries(
  (Object.keys(profiles) as MerchantShipKind[]).map(kind => [
    kind,
    new THREE.CatmullRomCurve3(profiles[kind].map(p => new THREE.Vector3(...p))).getPoints(80).map(p => {
      p.y = Math.min(p.y, Math.max(...profiles[kind].map(s => s[1])));
      return p;
    })
  ])
) as Record<MerchantShipKind, THREE.Vector3[]>;
const sections = (kind: MerchantShipKind) => samples[kind];
const draft = (kind: MerchantShipKind) => (kind === "caravel" ? 1.8 : 3.5);
function section(kind: MerchantShipKind, x: number) {
  const points = sections(kind);
  const found = points.findIndex(p => p.x >= x);
  const i = found < 0 ? points.length - 1 : Math.max(1, found);
  const a = points[i - 1],
    b = points[i];
  return a.clone().lerp(b, THREE.MathUtils.clamp((x - a.x) / (b.x - a.x), 0, 1));
}
function surface(k: ModelKit, name: string, points: number[], indices: number[], material: Surface) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  k.add(name, geometry, material);
}
function hull(kind: MerchantShipKind) {
  const k = new SailingKit(`${kind}-hull`),
    points = sections(kind);
  const depth = draft(kind),
    beamScale = kind === "caravel" ? 0.9 : 0.82;
  const rings = points.map(p => [
    [p.x, p.z, -p.y * beamScale],
    ...Array.from({ length: 21 }, (_, j) => {
      const angle = (Math.PI * j) / 20;
      return [p.x, 0.3 - (depth + 0.3) * Math.sin(angle), -p.y * Math.cos(angle)];
    }),
    [p.x, p.z, p.y * beamScale]
  ]);
  const upper: number[] = [],
    lower: number[] = [];
  for (let i = 0; i < 80; i++)
    for (let j = 0; j < 22; j++) {
      const a = i * 23 + j,
        b = a + 23;
      (j === 0 || j === 21 ? upper : lower).push(a, b, a + 1, b, b + 1, a + 1);
    }
  surface(k, "hull-topsides", rings.flat(2), upper, "oak");
  surface(k, "hull-underwater", rings.flat(2), lower, "dark");
  for (const index of [0, 80]) {
    const indices: number[] = [];
    for (let j = 1; j < 22; j++) indices.push(0, j, j + 1);
    surface(k, index ? "stem" : "transom", rings[index].flat(), indices, "oak");
  }
  const seams: [Position, Position][] = [];
  for (const j of [1, 2, 3, 5, 8, 14, 17, 19, 20, 21])
    for (let i = 0; i < 80; i++)
      seams.push([rings[i][j] as unknown as Position, rings[i + 1][j] as unknown as Position]);
  k.lines("hull-plank-seams", seams, 0x4a3828);
  const aft = points[0].x;
  k.box("rudder", [aft - 0.5, -0.2, 0], [kind === "caravel" ? 0.6 : 0.8, depth * 1.6, 0.22], "oak");
  k.beam("rudder-stock", [aft - 0.45, -depth * 0.6, 0], [aft - 0.45, points[0].z + 0.3, 0], 0.22, "oak", true);
  for (const y of [-depth * 0.4, 0.4, 1.4]) k.box("rudder-strap", [aft - 0.5, y, 0], [0.85, 0.08, 0.26], "iron");
  return k.finish();
}
function deck(kind: MerchantShipKind) {
  const k = new SailingKit(`${kind}-deck`),
    points = sections(kind),
    scale = kind === "caravel" ? 0.9 : 0.82;
  const indices: number[] = [];
  for (let i = 0; i < 80; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  surface(
    k,
    "main-deck",
    points.flatMap(p => [p.x, p.z, -p.y * scale, p.x, p.z, p.y * scale]),
    indices,
    "wood"
  );
  const seams: [Position, Position][] = [];
  for (let t = -0.8; t < 0.81; t += 0.08)
    for (let i = 0; i < 80; i++)
      seams.push([
        [points[i].x, points[i].z + 0.008, points[i].y * t],
        [points[i + 1].x, points[i + 1].z + 0.008, points[i + 1].y * t]
      ]);
  k.lines("deck-plank-seams", seams, 0x755439);
  for (const side of [-1, 1])
    for (let i = 0; i < 80; i++) {
      const a = points[i],
        b = points[i + 1];
      k.beam("cap-rail", [a.x, a.z + 0.15, side * a.y * scale], [b.x, b.z + 0.15, side * b.y * scale], 0.16, "oak");
    }
  return k.finish();
}

/** Conforming castle footprints sit inside the continuous hull; no attachment sockets. */
function castle(
  kind: MerchantShipKind,
  name: string,
  x0: number,
  x1: number,
  width: number,
  bottom: number,
  top: number
) {
  const k = new SailingKit(name),
    count = 12;
  const widthAt = (x: number) => Math.max(0.25, Math.min(width / 2, section(kind, x).y * 0.82 - 0.12));
  const roofPoints: number[] = [],
    roofIndices: number[] = [];
  for (let i = 0; i <= count; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / count),
      w = widthAt(x);
    roofPoints.push(x, top, -w, x, top, w);
    if (i < count) {
      const a = i * 2;
      roofIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  surface(k, "castle-deck", roofPoints, roofIndices, "wood");
  const supportY = (x: number) => (name === "upper-sterncastle" ? bottom : Math.min(bottom, section(kind, x).z - 0.04));
  const panel = (name: string, a: Position, b: Position, lo: number, hi: number, material: Surface = "oak") => {
    const aa = v(a),
      bb = v(b);
    const centre = aa.clone().add(bb).multiplyScalar(0.5);
    const mesh = k.box(name, [centre.x, (lo + hi) / 2, centre.z], [aa.distanceTo(bb), hi - lo, 0.16], material);
    mesh.rotation.y = -Math.atan2(bb.z - aa.z, bb.x - aa.x);
    return mesh;
  };
  for (const side of [-1, 1])
    for (let i = 0; i < count; i++) {
      const a = THREE.MathUtils.lerp(x0, x1, i / count),
        b = THREE.MathUtils.lerp(x0, x1, (i + 1) / count);
      const pa: Position = [a, 0, side * widthAt(a)],
        pb: Position = [b, 0, side * widthAt(b)];
      const middle = (a + b) / 2,
        y = (bottom + top) / 2;
      if (i % 3 === 1) {
        panel("window-sill", pa, pb, supportY(middle), y - 0.23);
        panel("window-head", pa, pb, y + 0.23, top);
        const left = v(pa).lerp(v(pb), 0.16),
          right = v(pa).lerp(v(pb), 0.84);
        panel("window-jamb", pa, pos(left), y - 0.23, y + 0.23, "wood");
        panel("window-jamb", pos(right), pb, y - 0.23, y + 0.23, "wood");
        const innerA = left.clone(),
          innerB = right.clone();
        innerA.z -= side * 0.08;
        innerB.z -= side * 0.08;
        panel("recessed-castle-window", pos(innerA), pos(innerB), y - 0.23, y + 0.23, "dark");
        k.box("window-mullion", [middle, y, side * widthAt(middle)], [0.025, 0.46, 0.18], "iron");
      } else panel("castle-side", pa, pb, supportY(middle), top);
      k.beam("castle-cap", [a, top + 0.8, pa[2]], [b, top + 0.8, pb[2]], 0.1, "wood");
      k.beam("castle-post", [a, top, pa[2]], [a, top + 0.8, pa[2]], 0.08, "oak");
    }
  for (const x of [x0, x1]) {
    const w = widthAt(x);
    const doorWidth = 0.85;
    const floor = supportY(x);
    if (floor < bottom) k.box("castle-skirt", [x, (floor + bottom) / 2, 0], [0.18, bottom - floor, 2 * w], "oak");
    for (const side of [-1, 1])
      k.box(
        "end-wall",
        [x, (bottom + top) / 2, side * (w / 2 + doorWidth / 4)],
        [0.16, top - bottom, Math.max(0.05, w - doorWidth / 2)],
        "oak"
      );
    k.box("door-lintel", [x, top - 0.16, 0], [0.18, 0.32, doorWidth], "oak");
    for (let i = 0; i < 5; i++)
      k.box("door-board", [x, (bottom + top - 0.32) / 2, -0.34 + i * 0.17], [0.12, top - bottom - 0.32, 0.165], "wood");
    for (const y of [bottom + 0.35, top - 0.6])
      k.box("door-strap", [x + (x === x0 ? -0.1 : 0.1), y, 0], [0.025, 0.05, 0.78], "iron");
  }
  const seams: [Position, Position][] = [];
  for (let z = -width / 2; z <= width / 2; z += 0.25)
    for (let i = 0; i < count; i++) {
      const a = THREE.MathUtils.lerp(x0, x1, i / count),
        b = THREE.MathUtils.lerp(x0, x1, (i + 1) / count);
      if (Math.abs(z) < Math.min(widthAt(a), widthAt(b)) - 0.06)
        seams.push([
          [a, top + 0.008, z],
          [b, top + 0.008, z]
        ]);
    }
  k.lines("castle-deck-seams", seams, 0x755439);
  return k.finish();
}
function ladder(k: ModelKit, name: string, a: Position, b: Position, width = 0.8) {
  const av = v(a),
    bv = v(b),
    steps = Math.ceil(av.distanceTo(bv) / 0.28);
  for (const side of [-1, 1])
    k.beam(
      `${name}-stringer`,
      [a[0], a[1], a[2] + (side * width) / 2],
      [b[0], b[1], b[2] + (side * width) / 2],
      0.09,
      "oak"
    );
  for (let i = 0; i <= steps; i++) {
    const p = av.clone().lerp(bv, i / steps);
    k.box(`${name}-tread`, [p.x, p.y, p.z], [0.23, 0.055, width], "wood");
  }
}
function equipment(kind: MerchantShipKind) {
  const k = new ModelKit(`${kind}-equipment`),
    big = kind === "carrack";
  const x = big ? 2.2 : 2,
    y = big ? 5.35 : 2.6,
    w = big ? 4.5 : 2.5,
    d = big ? 3.3 : 2;
  k.box("hatch-coaming", [x, y, 0], [w, 0.4, d], "oak");
  for (let xx = x - w / 2 + 0.15; xx < x + w / 2; xx += 0.25)
    k.box("hatch-board", [xx, y + 0.23, 0], [0.24, 0.06, d - 0.15], "wood");
  for (const xx of [x - w / 3, x + w / 3]) k.box("hatch-strap", [xx, y + 0.28, 0], [0.07, 0.03, d - 0.1], "iron");
  const bx = big ? 7 : 9,
    by = section(kind, bx).z;
  for (const side of [-1, 1]) k.box("windlass-foot", [bx, by + 0.35, side * 0.6], [0.35, 0.7, 0.22], "oak");
  k.beam("windlass-drum", [bx, by + 0.6, -0.85], [bx, by + 0.6, 0.85], 0.3, "wood", true);
  for (const z of [-0.9, 0.9]) k.beam("windlass-handle", [bx, by + 0.2, z], [bx, by + 1, z], 0.07, "iron", true);
  for (const xx of big ? [-5, 5] : [-3, 5])
    for (const side of [-1, 1]) {
      const p = section(kind, xx),
        z = side * p.y * 0.7;
      k.box("cleat-foot", [xx, p.z + 0.13, z], [0.16, 0.26, 0.16], "iron");
      k.beam("cleat-horns", [xx - 0.35, p.z + 0.25, z], [xx + 0.35, p.z + 0.25, z], 0.09, "iron", true);
    }
  if (big) {
    ladder(k, "forecastle-access", [5.5, 5.32, 1.3], [8.5, 9.2, 1.3]);
    ladder(k, "quarterdeck-access", [-5.5, 5.3, 1.4], [-8, 9.0, 1.4]);
    ladder(k, "poop-access", [-9, 9.0, 0], [-11, 11.3, 0]);
  } else {
    ladder(k, "aft-deck-access", [-4.5, 2.4, 1], [-6.2, 4.5, 1]);
    k.beam("tiller", [-12.4, 3.6, 0], [-10.9, 3.6, 0], 0.16, "wood", true);
  }
  return k.finish();
}
const CARAVEL_MASTS = [
  { x: 2.5, top: 20.5, foot: 4, reach: 9 },
  { x: -6, top: 16, foot: 5.3, reach: 6 }
] as const;
const CARRACK_MASTS = [
  { x: 10, top: 27 },
  { x: -2, top: 33 },
  { x: -12.5, top: 24 }
] as const;
function spars(kind: MerchantShipKind) {
  const k = new ModelKit(`${kind}-spars`),
    big = kind === "carrack";
  for (const mast of big ? CARRACK_MASTS : CARAVEL_MASTS) {
    const bottom = section(kind, mast.x).z;
    k.cylinder(
      "mast",
      [mast.x, (bottom + mast.top) / 2, 0],
      big ? 0.32 : 0.23,
      mast.top - bottom,
      "oak",
      big ? 0.15 : 0.1,
      16
    );
    for (const y of [bottom + 0.2, mast.top * 0.7])
      k.ring("mast-band", [mast.x, y, 0], big ? 0.3 : 0.21, 0.035, "iron");
    if (big && mast.x !== -12.5) {
      k.cylinder("fighting-top", [mast.x, mast.top * 0.74, 0], 1, 0.22, "wood", 1.2, 16);
    }
  }
  k.beam(
    "bowsprit",
    big ? [12, 7.5, 0] : [9, 3.3, 0],
    big ? [24, 14, 0] : [15.5, 5.8, 0],
    big ? 0.46 : 0.28,
    "oak",
    true
  );
  return k.finish();
}
function rigging(kind: MerchantShipKind) {
  const k = new SailingKit(`${kind}-standing-rig`),
    big = kind === "carrack";
  const segments: [Position, Position][] = [];
  for (const mast of big ? CARRACK_MASTS : CARAVEL_MASTS)
    for (const side of [-1, 1]) {
      const top: Position = [mast.x, mast.top * 0.75, 0],
        feet: Position[] = [];
      for (const dx of big ? [-1.5, -0.7, 0.1] : [-1.2, 0]) {
        const p = section(kind, mast.x + dx),
          foot: Position = [p.x, p.z + 0.25, side * p.y * (big ? 0.78 : 0.86)];
        feet.push(foot);
        segments.push([top, foot]);
        k.ring("deadeye", foot, big ? 0.12 : 0.09, 0.025, "dark", true);
        k.box("chainplate", [foot[0], foot[1] - 0.2, foot[2]], [0.08, 0.4, 0.05], "iron");
      }
      for (let t = 0.12; t < 0.95; t += 0.06)
        segments.push([pos(v(top).lerp(v(feet[0]), t)), pos(v(top).lerp(v(feet.at(-1)!), t))]);
    }
  const masts = big ? CARRACK_MASTS : CARAVEL_MASTS;
  segments.push([[masts[0].x, masts[0].top - 0.2, 0], big ? [24, 14, 0] : [15.5, 5.8, 0]]);
  for (let i = 1; i < masts.length; i++)
    segments.push([
      [masts[i].x, masts[i].top - 0.2, 0],
      [masts[i - 1].x, masts[i - 1].top * 0.85, 0]
    ]);
  k.lines("standing-rigging", segments, 0x493d30);
  return k.finish();
}

/** One parametric cloth surface and its seams; triangle and square rigs share ownership. */
function cloth(k: SailingKit, name: string, vertex: (u: number, t: number) => Position, triangle = false) {
  const cols = 24,
    rows = 18,
    points: number[] = [],
    indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) points.push(...vertex(c / cols, r / rows));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      if (r || !triangle) indices.push(a, a + 1, a + cols + 1);
      indices.push(a + 1, a + cols + 2, a + cols + 1);
    }
  surface(k, name, points, indices, "white");
  const lines: [Position, Position][] = [];
  for (let c = 0; c <= cols; c += 2)
    for (let r = 0; r < rows; r++) lines.push([vertex(c / cols, r / rows), vertex(c / cols, (r + 1) / rows)]);
  for (let c = 0; c < cols; c++) lines.push([vertex(c / cols, 1), vertex((c + 1) / cols, 1)]);
  k.lines(`${name}-seams`, lines, 0xb6a78c);
}
function lateen(kind: MerchantShipKind, index: number, furled: boolean) {
  const k = new SailingKit(`${kind}-lateen-${index}`);
  let a: Position, b: Position, c: Position, mastX: number, mastTop: number;
  if (kind === "caravel") {
    const m = CARAVEL_MASTS[index];
    mastX = m.x;
    mastTop = m.top;
    a = [m.x - m.reach * 0.55, m.top - 0.4, 0];
    b = [m.x + m.reach * 0.6, m.foot + 1, 0];
    c = [m.x - m.reach * 0.75, m.foot, 0.7];
  } else {
    a = [-18, 14, 0];
    b = [-8, 25, 0];
    c = [-7, 12.5, 0];
    mastX = -12.5;
    mastTop = 24;
  }
  if (kind === "caravel") {
    const offset = index === 0 ? 0.6 : -0.6;
    a = [a[0], a[1], a[2] + offset];
    b = [b[0], b[1], b[2] + offset];
    c = [c[0], c[1], c[2] + offset];
    const t = (mastX - a[0]) / (b[0] - a[0]);
    const y = THREE.MathUtils.lerp(a[1], b[1], t);
    k.beam("yard-parrel", [mastX, y, 0], [mastX, y, offset], 0.07, "leather", true);
  }
  k.beam("lateen-yard", a, b, kind === "caravel" ? 0.2 : 0.28, "wood", true);
  if (furled)
    addSailBundle(
      k,
      "furled-lateen",
      pos(
        v(a)
          .lerp(v(b), 0.03)
          .add(new THREE.Vector3(0, 0.12, 0))
      ),
      pos(
        v(a)
          .lerp(v(b), 0.97)
          .add(new THREE.Vector3(0, 0.12, 0))
      ),
      kind === "caravel" ? 0.2 : 0.28
    );
  else {
    cloth(
      k,
      "lateen-sail",
      (u, t) => {
        const p = v(a)
          .lerp(v(b), t)
          .lerp(v(a).lerp(v(c), t), u);
        p.z += 0.8 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t);
        return pos(p);
      },
      true
    );
    const deckPoint = section(kind, mastX - 1),
      anchor: Position = [deckPoint.x, deckPoint.z + 0.25, deckPoint.y * 0.7];
    k.lines("lateen-sheet", [[c, anchor]]);
    k.ring("sheet-block", anchor, 0.07, 0.02, "iron", true);
    k.box("sheet-anchor", [anchor[0], anchor[1] - 0.14, anchor[2]], [0.1, 0.28, 0.1], "iron");
  }
  k.lines("lateen-halyard", [[[mastX, mastTop - 0.2, 0], pos(v(a).lerp(v(b), 0.5))]]);
  return k.finish();
}
const SQUARES = [
  { x: 10, y: 24, width: 13, drop: 10 },
  { x: -2, y: 24, width: 17, drop: 14 },
  { x: -2, y: 31, width: 9, drop: 5 }
] as const;
function square(index: number, furled: boolean) {
  const k = new SailingKit(`carrack-square-${index}`),
    s = SQUARES[index];
  k.beam("yard", [s.x, s.y, -s.width / 2 - 0.5], [s.x, s.y, s.width / 2 + 0.5], 0.28, "wood", true);
  if (furled) addSailBundle(k, "furled-square", [s.x, s.y + 0.18, -s.width / 2], [s.x, s.y + 0.18, s.width / 2], 0.25);
  else {
    cloth(k, "square-sail", (u, t) => [
      s.x + 1.5 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t),
      s.y - s.drop * t + 0.6 * Math.sin(Math.PI * u) * t,
      (u - 0.5) * s.width * (1 - 0.1 * t)
    ]);
    for (const side of [-1, 1]) {
      const p = section("carrack", s.x - 2),
        anchor: Position = [p.x, p.z + 0.25, side * p.y * 0.7];
      k.lines("square-sheet", [[[s.x, s.y - s.drop, side * s.width * 0.45], anchor]]);
      k.ring("sheet-block", anchor, 0.08, 0.02, "iron", true);
      k.box("sheet-anchor", [anchor[0], anchor[1] - 0.14, anchor[2]], [0.1, 0.28, 0.1], "iron");
    }
  }
  const top = s.x === 10 ? 27 : 33;
  k.lines(
    "yard-lifts",
    [-1, 1].map(
      side =>
        [
          [s.x, s.y, side * (s.width / 2 + 0.5)],
          [s.x, top - 0.15, 0]
        ] as [Position, Position]
    )
  );
  return k.finish();
}
function flags() {
  const k = new ModelKit("carrack-pennants");
  for (const m of CARRACK_MASTS)
    surface(
      k,
      "pennant",
      [
        m.x,
        m.top,
        0,
        m.x - 3.4,
        m.top - 0.4,
        0.15,
        m.x - 2.5,
        m.top - 0.8,
        0,
        m.x - 3.4,
        m.top - 1.2,
        0.15,
        m.x,
        m.top - 1,
        0
      ],
      [0, 1, 2, 0, 2, 4, 2, 3, 4],
      "tile"
    );
  return k.finish();
}
export function merchantShipParts(
  kind: MerchantShipKind,
  { sails = "set" }: SailingShipState = {}
): readonly ModelPartFactory[] {
  const big = kind === "carrack",
    furled = sails === "furled";
  const list: [string, string, ModelPartFactory["create"]][] = [
    ["hull", "Hull and rudder", () => hull(kind)],
    ["deck", "Main deck", () => deck(kind)],
    ...(big
      ? ([
          ["forecastle", "Forecastle", () => castle(kind, "forecastle", 8.5, 16.5, 6.2, 6.2, 9.2)],
          ["sterncastle", "Sterncastle", () => castle(kind, "sterncastle", -17.2, -8, 8, 5.8, 9)],
          ["poop", "Upper sterncastle", () => castle(kind, "upper-sterncastle", -17, -11, 6.6, 9, 11.3)]
        ] as [string, string, ModelPartFactory["create"]][])
      : ([["aft-cabin", "Aft cabin and deck", () => castle(kind, "aft-cabin", -10.8, -6.2, 5, 2.6, 4.5)]] as [
          string,
          string,
          ModelPartFactory["create"]
        ][])),
    ["equipment", "Hatches and deck equipment", () => equipment(kind)],
    ["spars", "Masts and bowsprit", () => spars(kind)],
    ["rigging", "Standing rigging", () => rigging(kind)]
  ];
  if (big) {
    SQUARES.forEach((_, i) => {
      list.push([`square-${i}`, `Square sail ${i + 1}`, () => square(i, furled)]);
    });
    list.push(["mizzen", "Lateen mizzen", () => lateen(kind, 0, furled)], ["flags", "Pennants", flags]);
  } else for (let i = 0; i < 2; i++) list.push([`lateen-${i}`, `Lateen rig ${i + 1}`, () => lateen(kind, i, furled)]);
  return list.map(([id, role, create]) => ({ id, role, create, quality: "high", author: "Codex GPT-6.1 Sol" }));
}
export function createMerchantShipHigh(kind: MerchantShipKind, state: SailingShipState = {}) {
  const model = assembleSailingParts(`${kind}-high`, merchantShipParts(kind, state)),
    points = sections(kind);
  model.group.userData.shipHull = {
    minX: profiles[kind][0][0],
    maxX: profiles[kind].at(-1)![0],
    beam: Math.max(...points.map(p => p.y)) * 2,
    waterline: 0,
    draft: draft(kind)
  } satisfies ShipHullFrame;
  return model;
}
