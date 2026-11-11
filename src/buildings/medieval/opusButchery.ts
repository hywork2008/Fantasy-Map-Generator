import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { TradeKit, type TradeQuality, townHouse } from "./opusTradeKit";
import { OPUS_BUTCHERY } from "./opusTradeProfiles";

export { OPUS_BUTCHERY };

function pig(k: TradeKit, x: number, z: number, heading: number) {
  const c = Math.cos(heading),
    s = Math.sin(heading);
  const at = (f: number, side: number, y: number) => [x + c * f - s * side, y, z + s * f + c * side] as const;
  const body = k.sphere("pig-body", at(0, 0, 0.45), [0.55, 0.3, 0.27], "fat");
  body.rotation.y = -heading;
  const head = k.sphere("pig-head", at(0.55, 0, 0.47), [0.2, 0.17, 0.16], "fat");
  head.rotation.y = -heading;
  k.cylinder("pig-snout", [...at(0.74, 0, 0.44)], 0.07, 0.06, "meat", 0.07, 8).rotation.set(0, -heading, Math.PI / 2);
  for (const f of [-0.32, 0.32])
    for (const side of [-0.13, 0.13]) k.box("pig-leg", [...at(f, side, 0.1)], [0.08, 0.2, 0.08], "fat");
}

function beefSide(k: TradeKit, x: number, z: number, top: number) {
  k.beam("gambrel", [x - 0.22, top, z], [x + 0.22, top, z], 0.04, "iron");
  k.sphere("beef-side", [x, top - 0.8, z], [0.27, 0.8, 0.13], "meat");
  if (k.high) {
    k.sphere("beef-fat-cover", [x, top - 0.72, z + 0.05], [0.24, 0.68, 0.1], "fat");
    k.beam("hock", [x - 0.12, top - 0.05, z], [x - 0.06, top - 0.25, z], 0.07, "meat");
    k.beam("hock", [x + 0.12, top - 0.05, z], [x + 0.06, top - 0.25, z], 0.07, "meat");
  }
}

function joint(k: TradeKit, x: number, y: number, z: number, i: number) {
  k.blob("hanging-joint", [x, y - 0.22, z], [0.11, 0.22, 0.09], i % 3 === 2 ? "fat" : "meat");
}

/** Opus burgage butchery; see OPUS_BUTCHERY for the plot and entrance. */
export function createOpusButchery(quality: TradeQuality): CityStructureMeshes {
  const high = quality === "high";
  const k = new TradeKit(`opus-butchery-${quality}`, high);
  const { width: W, depth: D } = OPUS_BUTCHERY;
  const F = D / 2;
  k.box("yard-paving", [0, 0.02, 0], [W, 0.04, D], "stone");

  // Shop-house: eaves to the street, shop window, door and back door to the yard.
  townHouse(k, {
    x0: -7.6,
    x1: 0.4,
    z0: 0.6,
    z1: 5.55,
    ridge: "x",
    ground: 3,
    upper: 2.6,
    jetty: 0.45,
    pitch: 52,
    shop: { a: -6.9, b: -3.1, y0: 0.8, y1: 2.2 },
    door: { a: -2.2, b: -1.1 },
    backDoor: { a: -2.2, b: -1.2 },
    upperWindows: [-6.3, -3.7, -1.1],
    sideWindows: { right: [2.2, 4.3] },
    chimney: { x: -7.0, z: 1.3 }
  });
  // Stall-board stock and the hanging rail in the shop window.
  for (const [i, x] of [-6.5, -5.9, -5.2, -4.4, -3.6].entries()) {
    k.blob("counter-joint", [x, 0.86, 5.95], [0.17, 0.09, 0.13], i % 2 ? "meat" : "fat");
    if (high) k.box("counter-tray", [x, 0.79, 5.95], [0.42, 0.03, 0.34], "wood");
  }
  k.hookRail(-6.7, -3.3, 2.05, 5.3, high ? 7 : 4, (x, y, i) => joint(k, x, y, 5.3, i));
  k.block(-5.0, 3.9, 0.36, 0.82);
  k.trestleTable(-3.2, 2.0, 2.4, 0.8);
  if (high) {
    k.box("cleaver", [-5.0, 0.85, 3.85], [0.32, 0.02, 0.12], "iron");
    k.hookRail(-7.2, -4.0, 2.75, 1.6, 6, (x, y, i) => joint(k, x, y, 1.6, i + 1));
  }
  k.signBracket(-0.15, 5.55, 2.85, (x, y, z) => {
    k.sphere("ox-head-sign", [x + 0.06, y, z], [0.05, 0.2, 0.17], "leather");
    for (const s of [-1, 1])
      k.beam("ox-horn", [x + 0.07, y + 0.12, z + s * 0.12], [x + 0.07, y + 0.3, z + s * 0.3], 0.04, "fat");
  });

  // Plot boundary and the carriage gateway for driven stock.
  k.boundary("x", 0.4, 8, F - 0.2, 2.3, [[2.3, 5.3]]);
  k.gate(2.3, 5.3, F - 0.2, 2.25);
  k.boundary("z", -F, F - 0.4, W / 2 - 0.2, 2.3);
  k.boundary("x", -W / 2, W / 2, -F + 0.2, 2.3);
  k.boundary("z", -F + 0.4, 0.6, -W / 2 + 0.2, 2.3);

  // Killing floor: a raised stone floor under a lean-to off a heightened back wall.
  k.box("killing-floor", [-4.4, 0.08, -3.98], [6.4, 0.08, 3.55], "stone");
  k.box("shed-back-wall", [-4.4, 1.7, -5.9], [6.4, 3.4, 0.3], "stone");
  k.leanTo("killing-floor-roof", "x", -7.65, -1.15, -5.75, -2.05, 3.42, 2.55);
  for (const x of [-7.4, -4.4, -1.4]) {
    k.box("shed-post-pad", [x, 0.15, -2.35], [0.34, 0.3, 0.34], "stone");
    k.box("shed-post", [x, 1.42, -2.35], [0.2, 2.3, 0.2], "oak");
  }
  k.box("shed-wall-plate", [-4.4, 2.58, -2.35], [6.3, 0.2, 0.2], "oak");
  if (high)
    for (const x of [-7.4, -1.4])
      k.beam("shed-brace", [x, 1.9, -2.35], [x + (x < -4 ? 0.7 : -0.7), 2.5, -2.35], 0.12, "oak");
  // Hoisting frame with a windlass; two sides of beef hang from gambrels.
  for (const x of [-6.9, -4.3]) k.box("hoist-post", [x, 1.38, -4.0], [0.22, 2.6, 0.22], "oak");
  k.box("hoist-beam", [-5.6, 2.62, -4.0], [3.0, 0.22, 0.24], "oak");
  k.beam("windlass-roller", [-6.8, 0.95, -4.0], [-4.4, 0.95, -4.0], 0.2, "wood", true);
  k.beam("windlass-crank", [-4.15, 0.95, -4.0], [-4.15, 0.6, -4.0], 0.05, "iron");
  for (const x of [-6.0, -5.2]) {
    beefSide(k, x, -4.0, 2.4);
    k.beam("hoist-rope", [x, 2.5, -4.0], [x, 2.4, -4.0], 0.025, "cloth");
  }
  if (high) k.beam("hoist-rope", [-5.6, 2.5, -4.0], [-5.6, 1.05, -4.0], 0.025, "cloth");
  k.hearthWithCopper(-2.4, -4.95, 4.2, "water", 0.5);
  k.box("scalding-trough", [-2.5, 0.42, -3.0], [1.9, 0.5, 0.75], "wood");
  k.box("scalding-water", [-2.5, 0.62, -3.0], [1.7, 0.03, 0.55], "water");
  for (const x of [-3.3, -1.7]) k.box("trough-trestle", [x, 0.12, -3.0], [0.12, 0.24, 0.9], "oak");
  k.block(-5.6, -1.7, 0.4, 0.8);
  k.block(-3.9, -1.55, 0.36, 0.78);
  for (const [x, z] of [
    [-7.1, -1.2],
    [-6.45, -0.95]
  ] as const) {
    k.tub(x, z, 0.36, 0.62, "meat");
    if (high) k.box("tub-lid", [x + 0.1, 0.66, z], [0.62, 0.04, 0.5], "wood").rotation.y = 0.4;
  }
  if (high) {
    k.box("blood-gutter", [-1.6, 0.045, -2.0], [6.4, 0.012, 0.18], "dark");
    k.box("sump-grate", [1.7, 0.05, -2.0], [0.55, 0.02, 0.55], "iron");
    k.box("cleaver", [-5.6, 0.82, -1.65], [0.32, 0.02, 0.12], "iron");
    k.box("poleaxe", [-1.8, 1.0, -2.55], [0.06, 1.6, 0.06], "oak").rotation.z = 0.25;
    k.tub(-0.9, -4.6, 0.28, 0.4, "water");
  }

  // Holding pen of wattle hurdles with a feeding trough.
  k.hurdles([2.4, -2.6], [7.55, -2.6]);
  k.hurdles([2.4, -6.05], [2.4, -3.6]);
  k.box("pen-trough", [5.8, 0.18, -5.6], [1.6, 0.36, 0.45], "wood");
  if (high) {
    k.box("pen-straw", [5, 0.06, -4.3], [5, 0.04, 3.3], "straw");
    pig(k, 4.0, -4.6, 0.4);
    pig(k, 5.9, -3.7, 2.6);
    pig(k, 6.6, -5.1, -0.3);
  }
  // Draw well and water trough serve washing and scalding.
  k.vessel("well-head", [5.2, 0, 1.2], 0.72, 0.85, "stone");
  k.cylinder("well-water", [5.2, 0.3, 1.2], 0.62, 0.02, "water", 0.62, high ? 16 : 8);
  for (const s of [-1, 1]) k.box("well-post", [5.2 + s * 0.85, 1.15, 1.2], [0.16, 2.3, 0.16], "oak");
  k.beam("well-windlass", [4.35, 1.75, 1.2], [6.05, 1.75, 1.2], 0.18, "wood", true);
  if (high) {
    k.box("well-roof", [5.2, 2.4, 1.2], [2.0, 0.08, 1.2], "tile");
    k.beam("well-rope", [5.2, 1.7, 1.2], [5.2, 0.95, 1.2], 0.02, "cloth");
    k.tub(5.2, 1.2, 0.15, 0.22, undefined, 0.75);
  }
  k.box("water-trough", [5.3, 0.3, -0.6], [1.7, 0.6, 0.6], "stone");
  k.box("trough-water", [5.3, 0.57, -0.6], [1.5, 0.03, 0.4], "water");
  // Hides salted and stacked for the tanner; tallow barrels for the chandler.
  for (let i = 0; i < (high ? 6 : 2); i++) {
    const hide = k.box(
      "salted-hide",
      [1.6, 0.12 + i * (high ? 0.06 : 0.15), -1.05],
      [1.3, high ? 0.05 : 0.15, 0.9],
      "leather"
    );
    hide.rotation.y = high ? (i % 2 ? 0.12 : -0.08) : 0;
  }
  k.barrel(2.75, -0.9);
  k.barrel(3.4, -1.15);
  if (high) k.barrel(3.05, 0.2, 0.3, 0.78, 0, 0.3);
  k.woodStack(7.2, 4.0, 3.2, 1.2, "z");
  return k.finish();
}
