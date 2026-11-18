import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { BUILDING_PALETTES, type BuildingPaletteId } from "../appearance/palette";
import { compactModel } from "../compactModel";
import type { Surface } from "./modelKit";
import { TradeKit, type TradeQuality, WALL_THICKNESS, type WallOpening } from "./opusTradeKit";
import {
  type OpusWorkhomeLayout,
  type OpusWorkhomeOpening,
  type OpusWorkhomeSpec,
  opusWorkhomeLayout
} from "./opusWorkhomeProfiles";

export * from "./opusWorkhomeProfiles";

const PLINTH = 0.42;
const DOOR_HEIGHT = 2.15;
const SHOP_SILL = 0.8;
const SHOP_HEAD = 2.15;
/** Rise of a segmental arch over a shop or a door: low enough to keep the head under the first floor. */
const ARCH_RISE = 0.5;

const hex = (palette: BuildingPaletteId, shade: number) =>
  Number.parseInt(BUILDING_PALETTES[palette][shade].slice(1), 16);

/** Kit colours from the culture's house style, so the workhome takes its street's look (plan §4.1). */
function colors(l: OpusWorkhomeLayout): Partial<Record<Surface, number>> {
  const s = l.spec.shade;
  return {
    plaster: hex(l.finish === "boarding" ? "timber" : l.colors.wall, s),
    tile: hex(l.colors.roof, s),
    stone: hex(l.colors.plinth, s),
    ...(l.colors.frame ? { oak: hex(l.colors.frame, s) } : {})
  };
}

const archRise = (o: OpusWorkhomeOpening) => Math.min(ARCH_RISE, (o.b - o.a) / 2);

/** Wall fill between a rectangular cut and its segmental arch, plus a dressed arch ring (High). */
function archHead(k: TradeKit, o: OpusWorkhomeOpening, spring: number, face: number) {
  const span = o.b - o.a,
    c = (o.a + o.b) / 2,
    rise = archRise(o),
    radius = (span * span) / 4 / (2 * rise) + rise / 2,
    cy = spring + rise - radius,
    top = spring + rise,
    half = Math.asin(span / 2 / radius),
    segments = k.high ? 8 : 4;
  const arc = (r: number) =>
    Array.from({ length: segments + 1 }, (_, i) => {
      const t = -half + (2 * half * i) / segments;
      return new THREE.Vector2(c + r * Math.sin(t), cy + r * Math.cos(t));
    });
  const fill = new THREE.Shape([new THREE.Vector2(o.a, top), ...arc(radius), new THREE.Vector2(o.b, top)]);
  const t = WALL_THICKNESS;
  const geometry = new THREE.ExtrudeGeometry(fill, { depth: t, bevelEnabled: false });
  geometry.translate(0, 0, face - t);
  k.add("arch-spandrel", geometry, "stone");
  if (!k.high) return;
  const outer = arc(radius + 0.16).reverse();
  const ring = new THREE.Shape([...arc(radius), ...outer]);
  const ringGeometry = new THREE.ExtrudeGeometry(ring, { depth: 0.04, bevelEnabled: false });
  ringGeometry.translate(0, 0, face);
  k.add("arch-voussoirs", ringGeometry, "stone");
}

/** Shop window: open drops the stall board and props the upper shutter (or shows the stone counter of an arched
 * shop); closed shows the shutters flush in the opening. The space behind stays dark until W2's shop bay. */
function shopWindow(k: TradeKit, l: OpusWorkhomeLayout, o: OpusWorkhomeOpening, head: number) {
  const face = l.z1,
    w = o.b - o.a,
    c = (o.a + o.b) / 2,
    t = WALL_THICKNESS;
  if (l.spec.shop === "closed") {
    k.box("closed-shop-shutter", [c, (SHOP_SILL + head) / 2, face - t / 2], [w, head - SHOP_SILL, 0.06], "wood");
    if (k.high)
      for (const y of [SHOP_SILL + 0.3, head - 0.3])
        k.box("shutter-ledge", [c, y, face - t / 2 + 0.05], [w - 0.1, 0.1, 0.04], "oak");
    return;
  }
  k.box("shop-recess", [c, (SHOP_SILL + head) / 2, face - 0.7], [w, head - SHOP_SILL, 0.04], "dark");
  k.box("shop-floor", [c, SHOP_SILL - 0.05, face - 0.35], [w, 0.1, 0.7], "wood");
  if (l.arched) {
    // The étal: a stone counter sill projecting into the street (Garrigou Grandchamp 2002 p.92, fig. 15).
    k.box("stone-counter", [c, SHOP_SILL - 0.06, face + 0.22], [w + 0.1, 0.12, 0.5], "stone");
    return;
  }
  k.shopFront(o.a, o.b, face, SHOP_SILL, SHOP_HEAD);
}

function streetDoor(k: TradeKit, l: OpusWorkhomeLayout, top: number) {
  const { a, b } = l.door,
    face = l.z1,
    c = (a + b) / 2,
    t = WALL_THICKNESS;
  if (l.spec.door === "ajar") {
    k.box("door-void", [c, top / 2, face - 1], [b - a, top, 0.04], "dark");
    k.doorLeaf(a, b, face, top, 0.55);
  } else {
    // An arched door's leaf rises into the arch; the spandrels in front of it cut its corners.
    k.box("door-leaf", [c, top / 2 + 0.01, face - t / 2], [b - a, top - 0.02, 0.06], "wood");
    if (k.high)
      for (const y of [0.45, top - 0.45])
        k.box("door-strap", [c, y, face - t / 2 + 0.04], [(b - a) * 0.75, 0.05, 0.02], "iron");
  }
  k.box("door-step", [c, 0.06, face + 0.18], [b - a + 0.2, 0.12, 0.36], "stone");
}

/** A painted device on the board (signs named the house, rarely the trade: Bennell pp.201–202). */
const DEVICES = ["star", "ring", "key", "bell"] as const;
function device(role: string, mirror: boolean) {
  let h = mirror ? 7 : 3;
  for (const ch of role) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEVICES[h % DEVICES.length];
}

function sign(k: TradeKit, l: OpusWorkhomeLayout) {
  if (l.spec.sign === "none") return;
  // At the shop's outer edge, away from the door, under the jetty or the first-floor band.
  const outer = l.spec.mirror ? l.shops[0].a : l.shops.at(-1)!.b;
  const x = Math.min(l.x1 - 0.15, Math.max(l.x0 + 0.15, outer + (l.spec.mirror ? -0.2 : 0.2)));
  const kind = device(l.spec.role, l.spec.mirror);
  k.signBracket(x, l.z1, l.ground - 0.15, (cx, cy, cz) => {
    if (kind === "ring") k.ring("sign-device", [cx + 0.03, cy, cz], 0.14, 0.035, "amber");
    else if (kind === "bell") k.cylinder("sign-device", [cx + 0.03, cy - 0.02, cz], 0.13, 0.22, "brass", 0.05, 6);
    else if (kind === "key") {
      k.box("sign-device", [cx + 0.03, cy, cz], [0.02, 0.05, 0.32], "iron");
      k.ring("sign-device", [cx + 0.03, cy, cz - 0.17], 0.06, 0.02, "iron");
    } else
      for (const r of [0, Math.PI / 3, -Math.PI / 3]) {
        const arm = k.box("sign-device", [cx + 0.03, cy, cz], [0.02, 0.06, 0.34], "amber");
        arm.rotation.x = r;
      }
  });
}

/** One upper storey: front, back and party walls with its windows; the front may jetty out. */
function upperStorey(k: TradeKit, l: OpusWorkhomeLayout, y0: number, y1: number, front: number, surface: Surface) {
  const t = WALL_THICKNESS,
    windowY = y0 + 1.3,
    cut: WallOpening[] = k.high ? l.windows.map(u => ({ a: u - 0.38, b: u + 0.38, y0: y0 + 0.82, y1: y0 + 1.78 })) : [];
  k.wall("upper-wall", "x", l.x0, l.x1, front - t / 2, y0, y1, cut, surface);
  const back = l.windows.filter((_, i) => i % 2 === 0);
  const backCut: WallOpening[] = k.high ? back.map(u => ({ a: u - 0.3, b: u + 0.3, y0: y0 + 0.95, y1: y0 + 1.7 })) : [];
  k.wall("upper-wall", "x", l.x0, l.x1, l.z0 + t / 2, y0, y1, backCut, surface);
  for (const x of [l.x0 + t / 2, l.x1 - t / 2]) k.wall("party-wall", "z", l.z0 + t, front - t, x, y0, y1, [], surface);
  for (const u of l.windows) k.windowOn("x", front, 1, u, windowY, 0.76, 0.95);
  for (const u of back) k.windowOn("x", l.z0, -1, u, windowY, 0.6, 0.75);
  if (l.finish === "frame") {
    k.framing("x", l.x0, l.x1, front, 1, y0, y1, cut, 0.6);
    k.framing("x", l.x0, l.x1, l.z0, -1, y0, y1, backCut, 0.9);
  } else if (l.finish === "masonry" && k.high)
    k.box("string-course", [(l.x0 + l.x1) / 2, y0 + 0.05, front + 0.03], [l.x1 - l.x0 + 0.04, 0.1, 0.08], "stone");
  else if (l.finish === "boarding" && k.high)
    for (let u = l.x0 + 0.3; u < l.x1 - 0.1; u += 0.5)
      k.box("board-batten", [u, (y0 + y1) / 2, front + 0.02], [0.06, y1 - y0, 0.03], "oak");
}

/** Street gable of a gable-fronted house: framed infill, a loft window or a hoist door with its beam. */
function streetGable(k: TradeKit, l: OpusWorkhomeLayout, front: number, top: number, rise: number) {
  const c = (l.x0 + l.x1) / 2;
  if (l.hoist) {
    // Hanseatic lofts stored goods, hoisted from the street (Garrigou Grandchamp 2002 p.94).
    const y = top + rise * 0.3;
    k.box("loft-door", [c, y, front + 0.02], [0.9, 1.2, 0.05], "wood");
    k.beam("hoist-beam", [c, y + 0.95, front - 0.4], [c, y + 0.95, front + 0.3], 0.18, "oak");
    if (k.high) k.beam("hoist-rope", [c, y + 0.9, front + 0.22], [c, y - 0.3, front + 0.22], 0.03, "cloth");
  } else k.windowOn("x", front, 1, c, top + rise * 0.38, 0.55, 0.7);
}

/** The Opus shop-house workhome of a spec (plan §4): street front only, no interior ledger. */
export function createOpusWorkhome(input: OpusWorkhomeSpec, quality: TradeQuality): CityStructureMeshes {
  const l = opusWorkhomeLayout(input),
    spec = l.spec,
    k = new TradeKit(`opus-workhome-${spec.role}-${quality}`, quality === "high", colors(l)),
    t = WALL_THICKNESS;
  const groundSurface: Surface = l.stoneGround ? "stone" : "plaster";
  const upperSurface: Surface = "plaster";
  // Ground storey: plinth, street front cut by the door and the shops, blank party walls.
  // An arched opening springs lower so its crown keeps the square head's height (plus a little).
  const spring = (o: OpusWorkhomeOpening, head: number) => head + 0.3 - archRise(o);
  const headOf = (head: number) => (l.arched ? head + 0.3 : head);
  const front: WallOpening[] = [
    { a: l.door.a, b: l.door.b, y0: -1, y1: headOf(DOOR_HEIGHT) },
    ...l.shops.map(o => ({ a: o.a, b: o.b, y0: SHOP_SILL, y1: headOf(SHOP_HEAD) }))
  ];
  k.wall("stone-plinth", "x", l.x0, l.x1, l.z1 - t / 2, 0, PLINTH, front, "stone", t + 0.06);
  // The back door to the yard lines up with the street door; a small window lights the back room.
  const backDoor: WallOpening = { a: l.door.a, b: l.door.b, y0: -1, y1: DOOR_HEIGHT - 0.1 };
  const backWindow = (l.x0 + l.x1) / 2 + (spec.mirror ? -1 : 1) * (l.x1 - l.x0) * 0.22;
  const back: WallOpening[] = [
    backDoor,
    ...(k.high ? [{ a: backWindow - 0.3, b: backWindow + 0.3, y0: 1.2, y1: 1.9 }] : [])
  ];
  k.wall("stone-plinth", "x", l.x0, l.x1, l.z0 + t / 2, 0, PLINTH, [backDoor], "stone", t + 0.06);
  for (const x of [l.x0 + t / 2, l.x1 - t / 2])
    k.wall("stone-plinth", "z", l.z0 + t, l.z1 - t, x, 0, PLINTH, [], "stone", t + 0.06);
  k.wall("ground-wall", "x", l.x0, l.x1, l.z1 - t / 2, PLINTH, l.ground, front, groundSurface);
  k.wall("ground-wall", "x", l.x0, l.x1, l.z0 + t / 2, PLINTH, l.ground, back, groundSurface);
  k.box(
    "back-door-leaf",
    [(backDoor.a + backDoor.b) / 2, (DOOR_HEIGHT - 0.1) / 2, l.z0 + t / 2],
    [backDoor.b - backDoor.a, DOOR_HEIGHT - 0.1, 0.06],
    "wood"
  );
  k.windowOn("x", l.z0, -1, backWindow, 1.55, 0.6, 0.7);
  for (const x of [l.x0 + t / 2, l.x1 - t / 2])
    k.wall("party-wall", "z", l.z0 + t, l.z1 - t, x, PLINTH, l.ground, [], groundSurface);
  if (l.arched) {
    archHead(k, l.door, spring(l.door, DOOR_HEIGHT), l.z1);
    for (const o of l.shops) archHead(k, o, spring(o, SHOP_HEAD), l.z1);
  } else if (l.finish === "frame") k.framing("x", l.x0, l.x1, l.z1, 1, PLINTH, l.ground, front);
  streetDoor(k, l, headOf(DOOR_HEIGHT));
  for (const o of l.shops) shopWindow(k, l, o, headOf(SHOP_HEAD));
  // Upper storeys over the first-floor joists; only the first jetties out over the street.
  const front1 = l.z1 + l.jetty;
  k.box(
    "first-floor",
    [(l.x0 + l.x1) / 2, l.ground + 0.1, (l.z0 + front1) / 2],
    [l.x1 - l.x0, 0.2, front1 - l.z0],
    "wood"
  );
  if (k.high && l.jetty > 0) {
    for (let x = l.x0 + 0.2; x <= l.x1 - 0.15; x += 0.45)
      k.box("jetty-joist-end", [x, l.ground - 0.02, l.z1 + l.jetty / 2], [0.14, 0.16, l.jetty + 0.1], "oak");
    for (const x of [l.x0 + 0.1, l.x1 - 0.1])
      k.beam("jetty-bracket", [x, l.ground - 0.75, l.z1 + 0.05], [x, l.ground - 0.05, front1 - 0.1], 0.13, "oak");
  }
  let y = l.ground + 0.2;
  for (let s = 1; s < spec.storeys; s++, y += l.upper) upperStorey(k, l, y, y + l.upper, front1, upperSurface);
  const top = y;
  // Roof: eaves or gable to the street, overhangs ending on the envelope.
  const roof = k.pitchedRoof(
    l.ridge === "x"
      ? {
          ridge: "x",
          along: [l.x0, l.x1],
          across: [l.z0, front1],
          eave: top,
          pitch: l.pitch,
          eaveOverhang: l.eaveOverhang,
          gableOverhang: l.vergeOverhang,
          thickness: l.roofThickness,
          courses: l.cover !== "thatch"
        }
      : {
          ridge: "z",
          along: [l.z0, front1],
          across: [l.x0, l.x1],
          eave: top,
          pitch: l.pitch,
          eaveOverhang: l.eaveOverhang,
          gableOverhang: l.vergeOverhang,
          thickness: l.roofThickness,
          courses: l.cover !== "thatch"
        }
  );
  if (l.ridge === "x") {
    const half = (front1 - l.z0) / 2,
      c = (front1 + l.z0) / 2;
    for (const x of [l.x0 + t / 2, l.x1 - t / 2]) k.gable("x", x, c, half, top, roof.rise, upperSurface);
  } else {
    const half = (l.x1 - l.x0) / 2,
      c = (l.x0 + l.x1) / 2;
    for (const [z, out] of [
      [l.z0 + t / 2, -1],
      [front1 - t / 2, 1]
    ] as const) {
      k.gable("z", z, c, half, top, roof.rise, upperSurface);
      if (l.finish === "frame") k.gableFrame("z", z + (out * t) / 2, out, c, half, top, roof.rise);
    }
    streetGable(k, l, front1, top, roof.rise);
  }
  // The hearth's stack rises against the party wall away from the door.
  const stackX = spec.mirror ? l.x0 + 0.45 : l.x1 - 0.45;
  k.chimneyStack(stackX, l.z0 + 1.2, roof.ridgeY + 0.5, 0.7, 0.6, l.stoneGround ? "stone" : "brick");
  sign(k, l);
  return compactModel(k.finish());
}
