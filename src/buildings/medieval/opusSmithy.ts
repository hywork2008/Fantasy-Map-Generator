import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import { TradeKit, type TradeQuality } from "./opusTradeKit";
import { OPUS_SMITHY } from "./opusTradeProfiles";

export { OPUS_SMITHY };

const HALF_W = OPUS_SMITHY.width / 2,
  HALF_D = OPUS_SMITHY.depth / 2;
/** The smithy, 8 x 5 m over its stone footings as at Newington: x X0–X1, z Z0 (back) to Z1 (the open front). */
const X0 = -4.7,
  X1 = 3.3,
  Z0 = -3.5,
  Z1 = 1.5,
  EAVE = 2.3,
  PITCH = 45;
/** Rubble footings carrying the daubed timber walls. */
const FOOTING = 0.5,
  FOOTING_T = 0.45,
  WALL_T = 0.2;
const inX0 = X0 + FOOTING_T,
  inX1 = X1 - FOOTING_T,
  inZ0 = Z0 + FOOTING_T,
  inZ1 = Z1 - FOOTING_T;
/** The open front between its corner walls, carried on posts. */
const OPEN = [-3.9, 2.5] as const,
  FRONT_POSTS = [-3.8, -1.2, 2.4] as const;
/** The doorway in the east gable into the fuel store. */
const STORE_DOOR = [-1, 0] as const;
/** The fuel store against the east gable, open to the yard. */
const STORE_X1 = 4.85,
  STORE_Z0 = -3.3,
  STORE_Z1 = 0.3;
/** The two raised hearths at right angles: one on the back wall, one on the west gable. */
const HEARTH_Y = 0.75,
  BACK_HEARTH = { x: -2.6, z: inZ0 + 0.6, size: [1.5, 1.2] as const },
  GABLE_HEARTH = { x: inX0 + 0.6, z: -0.75, size: [1.2, 1.5] as const };
/** The anvil on its stone block, between both hearths. */
const ANVIL = [-2.3, -0.9] as const;

function walls(k: TradeKit) {
  const footing = (axis: "x" | "z", from: number, to: number, at: number) => {
    const c = (from + to) / 2,
      len = to - from;
    k.box(
      "stone-footing",
      axis === "x" ? [c, FOOTING / 2, at] : [at, FOOTING / 2, c],
      axis === "x" ? [len, FOOTING, FOOTING_T] : [FOOTING_T, FOOTING, len],
      "stone"
    );
  };
  const daub = (axis: "x" | "z", from: number, to: number, at: number, openings: { a: number; b: number }[] = []) =>
    k.wall(
      "daubed-wall",
      axis,
      from,
      to,
      at,
      FOOTING,
      EAVE,
      openings.map(o => ({ ...o, y0: -1, y1: 1.95 })),
      "plaster",
      WALL_T
    );
  const back = Z0 + FOOTING_T / 2,
    front = Z1 - FOOTING_T / 2,
    west = X0 + FOOTING_T / 2,
    east = X1 - FOOTING_T / 2;
  k.box("smithy-floor", [(X0 + X1) / 2, 0.04, (Z0 + Z1) / 2], [X1 - X0, 0.08, Z1 - Z0], "earth");
  // Back wall and west gable unbroken; the east gable opens into the fuel store.
  footing("x", X0, X1, back);
  daub("x", X0, X1, back);
  footing("z", Z0 + FOOTING_T, Z1 - FOOTING_T, west);
  daub("z", Z0 + FOOTING_T, Z1 - FOOTING_T, west);
  footing("z", Z0 + FOOTING_T, STORE_DOOR[0], east);
  footing("z", STORE_DOOR[1], Z1 - FOOTING_T, east);
  daub("z", Z0 + FOOTING_T, Z1 - FOOTING_T, east, [{ a: STORE_DOOR[0], b: STORE_DOOR[1] }]);
  // The front: short walls at the corners, the rest open onto the yard under the wall plate.
  for (const [a, b] of [
    [X0, OPEN[0]],
    [OPEN[1], X1]
  ] as const) {
    footing("x", a, b, front);
    daub("x", a, b, front);
  }
  for (const x of FRONT_POSTS) {
    k.box("padstone", [x, 0.08, front], [0.4, 0.16, 0.4], "stone");
    k.box("front-post", [x, (0.16 + EAVE) / 2, front], [0.22, EAVE - 0.16, 0.22], "oak");
  }
  k.box("wall-plate", [(X0 + X1) / 2, EAVE - 0.1, front], [X1 - X0, 0.2, 0.24], "oak");
  // The frame on the daubed walls' outer faces: Low its principal timbers, High the studs and braces as well.
  k.framing("x", X0, X1, back - WALL_T / 2, -1, FOOTING, EAVE);
  k.framing("z", Z0, Z1, west - WALL_T / 2, -1, FOOTING, EAVE);
  k.framing("z", Z0, Z1, east + WALL_T / 2, 1, FOOTING, EAVE, [
    { a: STORE_DOOR[0], b: STORE_DOOR[1], y0: -1, y1: 1.95 }
  ]);
  const roof = k.pitchedRoof({
    ridge: "x",
    along: [X0, X1],
    across: [Z0, Z1],
    eave: EAVE,
    pitch: PITCH,
    eaveOverhang: 0.3,
    gableOverhang: 0.25,
    // Stone slates, as the Oxfordshire stone country roofed: no thatch over a forge.
    surface: "stone"
  });
  const c = (Z0 + Z1) / 2,
    half = (Z1 - Z0) / 2;
  for (const [x, out] of [
    [west, -1],
    [east, 1]
  ] as const) {
    k.gable("x", x, c, half, EAVE, roof.rise, "plaster");
    k.gableFrame("x", x + (out * WALL_T) / 2, out, c, half, EAVE, roof.rise);
  }
  // A louvre on the ridge over the back hearth lets the smoke out; a smithy of the time had no chimney.
  k.box("smoke-louvre", [BACK_HEARTH.x, roof.ridgeY + 0.2, c], [0.75, 0.55, 0.75], "wood");
  k.box("louvre-cap", [BACK_HEARTH.x, roof.ridgeY + 0.52, c], [1.0, 0.09, 1.0], "stone");
  if (k.high)
    for (const s of [-1, 1])
      k.box("louvre-slats", [BACK_HEARTH.x, roof.ridgeY + 0.25, c + s * 0.38], [0.6, 0.3, 0.02], "dark");
}

/** A raised hearth of stone, its fire bed on top, at waist height for the smith. */
function hearth(k: TradeKit, h: { x: number; z: number; size: readonly [number, number] }) {
  k.box("raised-hearth", [h.x, HEARTH_Y / 2, h.z], [h.size[0], HEARTH_Y, h.size[1]], "stone");
  k.box("fire-bed", [h.x, HEARTH_Y + 0.03, h.z], [h.size[0] * 0.55, 0.06, h.size[1] * 0.55], "dark");
  if (k.high) {
    k.blob("hearth-embers", [h.x, HEARTH_Y + 0.07, h.z], [0.22, 0.05, 0.18], "ember");
    k.box("hearth-kerb", [h.x, HEARTH_Y + 0.05, h.z], [h.size[0], 0.1, 0.08], "stone");
  }
}

/** The forge: two hearths at right angles with their bellows, the anvil between them and the trough at hand. */
function forge(k: TradeKit) {
  hearth(k, BACK_HEARTH);
  hearth(k, GABLE_HEARTH);
  // The back hearth's bellows from its east side; the gable hearth's from the front, both nozzles into the fire.
  k.bellows(BACK_HEARTH.x + BACK_HEARTH.size[0] / 2 + 1.2, BACK_HEARTH.z, HEARTH_Y, true);
  k.placed(
    new THREE.Matrix4()
      .makeTranslation(GABLE_HEARTH.x - 0.1, 0, inZ1 - 0.1)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)),
    () => k.bellows(0, 0, HEARTH_Y)
  );
  // Newington's anvil stood on a stone base.
  const [ax, az] = ANVIL;
  k.box("anvil-base", [ax, 0.225, az], [0.6, 0.45, 0.6], "stone");
  k.box("anvil-waist", [ax, 0.55, az], [0.22, 0.2, 0.18], "iron");
  k.box("anvil-face", [ax, 0.71, az], [0.55, 0.12, 0.24], "iron");
  if (k.high) {
    const horn = k.add("anvil-horn", new THREE.ConeGeometry(0.07, 0.3, 8), "iron");
    horn.position.set(ax + 0.42, 0.72, az);
    horn.rotation.z = -Math.PI / 2;
    // Hammerscale trodden into the floor round the anvil, a hammer left on its face.
    k.box("hammerscale-floor", [ax + 0.3, 0.085, az], [1.8, 0.01, 1.5], "dark");
    k.beam("hand-hammer", [ax - 0.05, 0.79, az + 0.05], [ax + 0.25, 0.79, az + 0.25], 0.035, "wood", true);
    k.box("hammer-head", [ax - 0.05, 0.8, az + 0.05], [0.12, 0.06, 0.06], "iron");
  }
  // The water trough in the corner between the hearths, to quench and to cool the tongs.
  k.box("water-trough", [inX0 + 0.4, 0.275, -2.3], [0.5, 0.55, 1.0], "stone");
  k.box("trough-water", [inX0 + 0.4, 0.5, -2.3], [0.36, 0.02, 0.86], "water");
  // Charcoal to hand in a basket by the back hearth.
  k.vessel("charcoal-basket", [-1.3, 0, -1.5], 0.28, 0.42, "wood");
  k.cylinder("basket-charcoal", [-1.3, 0.37, -1.5], 0.21, 0.04, "dark", 0.21, k.high ? 12 : 6);
  if (k.high) {
    // Tongs and a poker resting on the hearths' edges.
    for (const dz of [-0.06, 0.06])
      k.beam(
        "tongs",
        [BACK_HEARTH.x + 0.3, HEARTH_Y + 0.04, BACK_HEARTH.z + 0.62 + dz],
        [BACK_HEARTH.x + 0.95, HEARTH_Y + 0.04, BACK_HEARTH.z + 0.62],
        0.025,
        "iron"
      );
    k.beam(
      "poker",
      [GABLE_HEARTH.x + 0.62, HEARTH_Y + 0.04, GABLE_HEARTH.z - 0.3],
      [GABLE_HEARTH.x + 0.62, HEARTH_Y + 0.04, GABLE_HEARTH.z + 0.45],
      0.03,
      "iron"
    );
  }
}

/** The bench under the back wall with the tools hung over it, and the bar iron stood against the east gable. */
function bench(k: TradeKit) {
  const z = inZ0 + 0.35,
    rail = Z0 + FOOTING_T / 2 + WALL_T / 2 + 0.05,
    x0 = 0.2,
    x1 = 2.6;
  k.box("work-bench", [(x0 + x1) / 2, 0.8, z], [x1 - x0, 0.08, 0.6], "oak");
  for (const x of [x0 + 0.15, x1 - 0.15]) k.box("bench-leg", [x, 0.38, z], [0.1, 0.76, 0.5], "oak");
  k.hookRail(x0 + 0.1, x1 - 0.1, 1.75, rail, 6, (x, y, i) => {
    if (i % 2) {
      k.beam("hung-hammer", [x, y, rail + 0.02], [x, y - 0.4, rail + 0.02], 0.03, "wood");
      k.box("hung-hammer-head", [x, y - 0.42, rail + 0.02], [0.13, 0.06, 0.06], "iron");
    } else
      for (const dx of [-0.03, 0.03])
        k.beam("hung-tongs", [x, y, rail + 0.02], [x + dx * 2, y - 0.55, rail + 0.02], 0.02, "iron");
  });
  k.box("swage-block", [x0 + 0.5, 0.92, z], [0.3, 0.16, 0.3], "iron");
  if (k.high) {
    for (let i = 0; i < 5; i++) k.box("nail-rod", [1.3 + i * 0.12, 0.85, z + 0.1], [0.012, 0.012, 0.4], "iron");
    k.box("nail-header", [2.2, 0.88, z], [0.3, 0.06, 0.08], "iron");
  }
  for (let i = 0; i < 5; i++)
    k.beam("bar-iron", [inX1 - 0.45, 0.09, -1.9 + i * 0.2], [inX1 - 0.06, 1.7, -1.9 + i * 0.2], 0.04, "iron");
}

/** The fuel store: a boarded lean-to against the east gable, charcoal heaped in it and wood stacked, open to the yard. */
function fuelStore(k: TradeKit) {
  k.box(
    "store-floor",
    [(X1 + STORE_X1) / 2, 0.03, (STORE_Z0 + STORE_Z1) / 2],
    [STORE_X1 - X1, 0.06, STORE_Z1 - STORE_Z0],
    "earth"
  );
  k.wall("boarded-wall", "x", X1, STORE_X1, STORE_Z0 + 0.05, 0, 1.6, [], "wood", 0.08);
  k.wall("boarded-wall", "z", STORE_Z0, STORE_Z1, STORE_X1 - 0.05, 0, 1.6, [], "wood", 0.08);
  k.box("store-post", [STORE_X1 - 0.08, 0.8, STORE_Z1 - 0.08], [0.14, 1.6, 0.14], "oak");
  k.leanTo("store-roof", "z", STORE_Z0 - 0.1, STORE_Z1 + 0.1, X1, STORE_X1 + 0.1, 2.05, 1.6, "wood");
  k.heap("charcoal-heap", 4.05, -2.3, 0.65, 0.6, 0.85, "dark");
  k.woodStack(4.1, -0.5, 1.2, 0.8, "z");
}

/** The yard before the open front: beaten earth fenced on its sides, the slag and cinder heap, a water butt and the
 * grindstone. The way in from the road is its open front. */
function yard(k: TradeKit) {
  k.box("yard-ground", [0, 0.02, (Z1 + HALF_D) / 2], [2 * HALF_W, 0.04, HALF_D - Z1], "earth");
  k.hurdles([-HALF_W + 0.1, Z1 + 0.2], [-HALF_W + 0.1, HALF_D - 0.1]);
  k.hurdles([HALF_W - 0.1, STORE_Z1 + 0.3], [HALF_W - 0.1, HALF_D - 0.1]);
  k.heap("slag-heap", -3.7, 3.0, 0.75, 0.35, 0.6, "dark");
  k.barrel(3.1, 2.2, 0.32, 0.85);
  // The grindstone in its frame, turned by a crank.
  const gx = -1.9,
    gz = 2.9;
  for (const dx of [-0.25, 0.25]) k.box("grindstone-frame", [gx + dx, 0.3, gz], [0.08, 0.6, 0.9], "oak");
  k.wheelOnEdge("grindstone", gx, 0.62, gz, 0.42, 0.14, "stone", true);
  k.beam("grindstone-axle", [gx - 0.35, 0.62, gz], [gx + 0.45, 0.62, gz], 0.04, "iron", true);
  if (k.high) {
    k.beam("grindstone-crank", [gx + 0.45, 0.62, gz], [gx + 0.45, 0.85, gz + 0.1], 0.035, "iron");
    k.box("grindstone-trough", [gx, 0.17, gz], [0.3, 0.2, 0.95], "wood");
  }
}

/** The Opus smithy at Low or High. Low and High share every envelope, wall, opening and fitting position. */
export function createOpusSmithy(quality: TradeQuality): CityStructureMeshes {
  const k = new TradeKit(`opus-smithy-${quality}`, quality === "high");
  walls(k);
  forge(k);
  bench(k);
  fuelStore(k);
  yard(k);
  return compactModel(k.finish());
}
