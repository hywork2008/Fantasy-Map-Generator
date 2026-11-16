import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Position, Surface } from "./modelKit";
import { TradeKit, type TradeQuality, townHouse } from "./opusTradeKit";
import { OPUS_TOWN_TRADES, type OpusTownTrade } from "./opusTradeProfiles";

export { OPUS_TOWN_TRADES, type OpusTownTrade };

/** Three-sided masonry work shed open to the yard (+Z), ridge along X, gables at both ends. */
function workShed(
  k: TradeKit,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  eave: number,
  pitch: number,
  options: { front?: { a: number; b: number; y0: number; y1: number }[]; frontWall?: boolean; wall?: Surface } = {}
) {
  const wall = options.wall ?? "stone";
  k.box("shed-floor", [(x0 + x1) / 2, 0.03, (z0 + z1) / 2], [x1 - x0, 0.06, z1 - z0], "earth");
  k.wall("shed-back-wall", "x", x0, x1, z0 + 0.15, 0, eave, [], wall, 0.3);
  for (const x of [x0 + 0.15, x1 - 0.15]) k.wall("shed-end-wall", "z", z0 + 0.3, z1, x, 0, eave, [], wall, 0.3);
  if (options.frontWall) {
    k.wall("shed-front-wall", "x", x0, x1, z1 - 0.09, 0, eave, options.front ?? [], "plaster");
    k.framing("x", x0, x1, z1, 1, 0, eave, options.front ?? []);
  } else {
    const posts = Math.max(2, Math.round((x1 - x0) / 2.6) + 1);
    for (let i = 0; i < posts; i++) {
      const x = x0 + 0.15 + ((x1 - x0 - 0.3) * i) / (posts - 1);
      k.box("shed-post", [x, eave / 2, z1 - 0.12], [0.22, eave, 0.22], "oak");
      if (k.high && i < posts - 1)
        k.beam("shed-brace", [x, eave - 0.7, z1 - 0.12], [x + 0.6, eave - 0.1, z1 - 0.12], 0.12, "oak");
    }
    k.box("shed-plate", [(x0 + x1) / 2, eave - 0.1, z1 - 0.12], [x1 - x0, 0.2, 0.22], "oak");
  }
  const roofed = k.pitchedRoof({
    ridge: "x",
    along: [x0, x1],
    across: [z0, z1],
    eave,
    pitch,
    eaveOverhang: 0.3,
    gableOverhang: 0.2
  });
  const half = (z1 - z0) / 2,
    c = (z0 + z1) / 2;
  for (const x of [x0 + 0.15, x1 - 0.15]) k.gable("x", x, c, half, eave, roofed.rise, wall);
  if (k.high)
    for (const x of [x0 + 1.4, (x0 + x1) / 2, x1 - 1.4])
      k.beam("tie-beam", [x, eave - 0.05, z0 + 0.3], [x, eave - 0.05, z1 - 0.1], 0.16, "oak");
  return roofed;
}

function plotBoundaries(
  k: TradeKit,
  W: number,
  D: number,
  houseX1: number,
  gate: readonly [number, number],
  leftFrom: number,
  height = 2.2
) {
  const F = D / 2;
  k.boundary("x", houseX1, W / 2, F - 0.2, height, [[gate[0], gate[1]]]);
  k.gate(gate[0], gate[1], F - 0.2, height - 0.05);
  k.boundary("z", -F, F - 0.4, W / 2 - 0.2, height);
  k.boundary("x", -W / 2, W / 2, -F + 0.2, height);
  k.boundary("z", -F + 0.4, leftFrom, -W / 2 + 0.2, height);
}

function candle(k: TradeKit, x: number, y: number, z: number, length = 0.3, r = 0.016) {
  k.cylinder("candle", [x, y - length / 2, z], r, length, "fat", r * 0.8, k.high ? 6 : 4);
}

function flagon(k: TradeKit, x: number, y: number, z: number, h = 0.3, surface: Surface = "pewter") {
  if (!k.high) {
    k.cylinder("flagon", [x, y + h / 2, z], h * 0.3, h, surface, h * 0.22, 6);
    return;
  }
  const profile = [
    [0, 0],
    [0.3, 0],
    [0.34, 0.1],
    [0.32, 0.45],
    [0.2, 0.7],
    [0.18, 0.92],
    [0.24, 1],
    [0, 1]
  ].map(([r, t]) => new THREE.Vector2(r * h, t * h));
  k.add("flagon", new THREE.LatheGeometry(profile, 12), surface).position.set(x, y, z);
  k.tube(
    "flagon-handle",
    [
      [x + h * 0.3, y + h * 0.8, z],
      [x + h * 0.5, y + h * 0.6, z],
      [x + h * 0.32, y + h * 0.3, z]
    ],
    0.012,
    surface
  );
}

function plate(k: TradeKit, x: number, y: number, z: number, r = 0.15, upright = false, surface: Surface = "pewter") {
  const p = k.cylinder("plate", [x, y + (upright ? r : 0.01), z], r, 0.02, surface, r * 0.92, k.high ? 14 : 8);
  if (upright) p.rotation.x = Math.PI / 2 - 0.25;
}

function knife(k: TradeKit, x: number, y: number, z: number, angle = 0, length = 0.32) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const blade = k.box(
    "knife-blade",
    [x + c * length * 0.25, y, z - s * length * 0.25],
    [length * 0.55, 0.008, 0.035],
    "pewter"
  );
  blade.rotation.y = angle;
  const haft = k.box(
    "knife-haft",
    [x - c * length * 0.25, y + 0.005, z + s * length * 0.25],
    [length * 0.42, 0.025, 0.03],
    "oak"
  );
  haft.rotation.y = angle;
}

/** Leaded panel: a lead border, came grid and coloured quarries, standing in the X-Y plane facing +Z. */
function leadedPanel(k: TradeKit, x: number, y: number, z: number, w: number, h: number, tilt = 0, seed = 0) {
  const colours: Surface[] = ["glass", "azure", "ruby", "amber", "green", "glass"];
  const group = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(-tilt));
  k.placed(group, () => {
    if (!k.high) {
      k.box("leaded-panel", [0, h / 2, 0], [w, h, 0.02], colours[seed % colours.length]);
      return;
    }
    const cols = Math.max(2, Math.round(w / 0.16)),
      rows = Math.max(3, Math.round(h / 0.18));
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        k.box(
          "glass-quarry",
          [-w / 2 + ((i + 0.5) * w) / cols, ((j + 0.5) * h) / rows, 0],
          [w / cols - 0.012, h / rows - 0.012, 0.008],
          colours[(i * 3 + j * 5 + seed) % colours.length]
        );
    for (let i = 0; i <= cols; i++)
      k.box("lead-came", [-w / 2 + (i * w) / cols, h / 2, 0.006], [0.014, h, 0.014], "dark");
    for (let j = 0; j <= rows; j++) k.box("lead-came", [0, (j * h) / rows, 0.006], [w, 0.014, 0.014], "dark");
  });
}

// ---------------------------------------------------------------------------------------------

function chandlery(k: TradeKit) {
  const { width: W, depth: D } = OPUS_TOWN_TRADES.chandlery;
  const high = k.high;
  k.box("yard-ground", [0, 0.02, 0], [W, 0.04, D], "earth");
  k.box("house-forecourt", [-2.5, 0.046, 4.6], [6, 0.012, 0.8], "stone");
  townHouse(k, {
    x0: -5.4,
    x1: 0.5,
    z0: -1.4,
    z1: 4.2,
    ridge: "z",
    ground: 2.9,
    upper: 2.5,
    jetty: 0.4,
    pitch: 55,
    shop: { a: -4.9, b: -2.0, y0: 0.8, y1: 2.1 },
    door: { a: -1.2, b: -0.2 },
    backDoor: { a: -1.2, b: -0.3 },
    upperWindows: [-4.2, -1.6],
    sideWindows: { right: [1.0, 3.0] },
    chimney: { x: -4.9, z: -0.4 }
  });
  // Shop window: bunches of dipped candles on hooks, soap cakes and a balance on the stall-board.
  k.hookRail(-4.7, -2.2, 1.95, 3.95, high ? 6 : 3, (x, y) => {
    for (let i = 0; i < (high ? 6 : 2); i++)
      candle(k, x + (i % 3) * 0.04 - 0.04, y, 3.95 + (i < 3 ? 0.03 : -0.03), 0.34);
  });
  for (let i = 0; i < (high ? 8 : 3); i++)
    k.box("soap-cake", [-4.6 + i * 0.32, 0.81, 4.45 + (i % 2) * 0.12], [0.2, 0.08, 0.12], i % 3 ? "fat" : "white");
  if (high) {
    k.beam("balance-post", [-2.4, 0.78, 4.6], [-2.4, 1.15, 4.6], 0.03, "brass");
    k.beam("balance-beam", [-2.65, 1.15, 4.6], [-2.15, 1.15, 4.6], 0.02, "brass");
    for (const x of [-2.62, -2.18]) k.cylinder("balance-pan", [x, 0.98, 4.6], 0.08, 0.015, "brass", 0.08, 10);
  }
  k.signBracket(0.15, 4.2, 2.7, (x, y, z) => {
    k.cylinder("candle-sign", [x + 0.06, y - 0.05, z], 0.05, 0.3, "fat", 0.05, 8);
    k.add("candle-sign-flame", new THREE.ConeGeometry(0.04, 0.12, 8), "amber").position.set(x + 0.06, y + 0.16, z);
  });
  plotBoundaries(k, W, D, 0.5, [1.6, 4.2], -1.4);
  // Rendering house: tallow is melted away from the dwelling, under its own masonry and stack.
  workShed(k, 0.9, 5.6, -4.55, -1.6, 2.6, 45);
  k.hearthWithCopper(3.2, -3.7, 5.0, "fat", 0.55);
  for (let i = 0; i < (high ? 6 : 2); i++)
    k.box(
      "tallow-cake",
      [1.55 + (i % 2) * 0.5, 0.15 + Math.floor(i / 2) * (high ? 0.2 : 0.3), -3.9],
      [0.42, high ? 0.18 : 0.28, 0.42],
      "fat"
    );
  k.tub(4.75, -2.5, 0.38, 0.6, "fat");
  if (high) {
    k.beam("skimming-ladle", [3.2, 1.25, -3.6], [3.9, 1.6, -3.2], 0.03, "iron");
    k.tub(1.7, -2.4, 0.3, 0.45, "water");
  }
  // Dipping frames: wicks hang from broach rods laid across trestles, dipped and left to set.
  for (const x of [1.25, 4.55]) {
    for (const s of [-1, 1]) k.beam("dipping-trestle-leg", [x, 0.04, 0.5 + s * 0.55], [x, 1.62, 0.5], 0.08, "oak");
    k.box("dipping-trestle-head", [x, 1.62, 0.5], [0.12, 0.08, 0.9], "oak");
  }
  for (const [r, z] of [0.15, 0.35, 0.55, 0.75].entries()) {
    k.beam("candle-broach", [1.1, 1.69, z], [4.7, 1.69, z], 0.035, "wood", true);
    const count = high ? 12 : 4;
    for (let i = 0; i < count; i++) {
      const x = 1.55 + (i * 2.6) / (count - 1);
      if (high) k.beam("candle-wick", [x, 1.67, z], [x, 1.58, z], 0.006, "cloth");
      candle(k, x, 1.58, z, 0.28 - r * 0.04, high ? 0.016 : 0.03);
    }
  }
  // Lye for soft soap: wood ash leached through a barrel on a stand into a tub.
  k.box("leaching-stand", [5.1, 0.45, 3.1], [0.8, 0.9, 0.8], "oak");
  k.barrel(5.1, 3.1, 0.3, 0.7, 0.9);
  k.tub(5.1, 2.35, 0.25, 0.32, "dark");
  if (high) k.beam("lye-spout", [5.1, 1.0, 2.8], [5.1, 0.85, 2.45], 0.03, "wood", true);
  k.barrel(1.3, 2.9);
  k.barrel(1.95, 3.25);
  if (high) k.barrel(1.6, 1.9, 0.3, 0.78, 0, 1.2);
  k.woodStack(5.35, 0.6, 1.8, 1.0, "z");
}

function metalwares(k: TradeKit) {
  const { width: W, depth: D } = OPUS_TOWN_TRADES.metalwares;
  const high = k.high;
  k.box("yard-ground", [0, 0.02, 0], [W, 0.04, D], "earth");
  k.box("yard-cobbles", [3.9, 0.035, 1.6], [6, 0.02, 7.6], "stone");
  townHouse(k, {
    x0: -6.6,
    x1: 0.8,
    z0: 0.6,
    z1: 5.05,
    ridge: "x",
    ground: 3,
    upper: 2.6,
    jetty: 0.45,
    pitch: 52,
    shop: { a: -5.9, b: -2.3, y0: 0.8, y1: 2.2 },
    door: { a: -1.4, b: -0.3 },
    backDoor: { a: -1.4, b: -0.4 },
    upperWindows: [-5.5, -3.1, -0.7],
    chimney: { x: -6.0, z: 1.3 }
  });
  // Stall-board: pewter chargers propped up, flagons and brass candlesticks.
  for (const [i, x] of [-5.6, -5.2, -4.8].entries()) plate(k, x, 0.78, 5.35 - i * 0.02, 0.17, true);
  for (const x of [-4.2, -3.8, -3.4]) flagon(k, x, 0.78, 5.5, 0.28);
  for (const x of [-2.9, -2.6]) {
    k.cylinder("candlestick-base", [x, 0.8, 5.45], 0.06, 0.03, "brass", 0.07, 8);
    k.beam("candlestick-stem", [x, 0.8, 5.45], [x, 1.05, 5.45], 0.025, "brass", true);
    k.cylinder("candlestick-pan", [x, 1.06, 5.45], 0.04, 0.015, "brass", 0.04, 8);
  }
  k.box("ware-shelf", [-4.1, 1.55, 4.6], [3.4, 0.05, 0.3], "wood");
  if (high) for (let i = 0; i < 9; i++) plate(k, -5.6 + i * 0.37, 1.58, 4.62, 0.15, true, i % 3 ? "pewter" : "brass");
  k.signBracket(0.5, 5.05, 2.85, (x, y, z) => flagon(k, x + 0.06, y - 0.17, z, 0.34));
  plotBoundaries(k, W, D, 0.8, [2.0, 4.6], 0.6);
  // Rear range: closed finishing shop with a door and windows, and an open casting bay.
  const front = -2.0;
  k.box("range-floor", [0, 0.03, -3.8], [13.2, 0.06, 3.6], "earth");
  k.wall("range-back-wall", "x", -6.6, 6.6, -5.45, 0, 2.8, [], "stone", 0.3);
  for (const x of [-6.45, 6.45]) k.wall("range-end-wall", "z", -5.3, front, x, 0, 2.8, [], "stone", 0.3);
  const shopOpen = [
    { a: -5.6, b: -4.4, y0: 1.0, y1: 2.0 },
    { a: -3.8, b: -2.8, y0: 1.0, y1: 2.0 },
    { a: -2.2, b: -1.2, y0: -1, y1: 2.1 }
  ];
  k.wall("range-front-wall", "x", -6.3, -0.6, front - 0.09, 0, 2.8, shopOpen);
  k.framing("x", -6.3, -0.6, front, 1, 0, 2.8, shopOpen);
  for (const o of shopOpen.slice(0, 2)) k.windowOn("x", front, 1, (o.a + o.b) / 2, 1.5, o.b - o.a, 1.0);
  k.doorLeaf(-2.2, -1.2, front, 2.1);
  k.wall("range-partition", "z", -5.3, front, -0.6, 0, 2.8, [{ a: -4.4, b: -3.4, y0: -1, y1: 2.0 }], "plaster");
  for (const x of [1.8, 4.2, 6.3]) k.box("bay-post", [x, 1.4, front - 0.12], [0.22, 2.8, 0.22], "oak");
  k.box("bay-plate", [2.85, 2.7, front - 0.12], [7.0, 0.2, 0.22], "oak");
  const roofed = k.pitchedRoof({
    ridge: "x",
    along: [-6.6, 6.6],
    across: [-5.55, front],
    eave: 2.8,
    pitch: 45,
    eaveOverhang: 0.3,
    gableOverhang: 0.2
  });
  for (const x of [-6.45, 6.45]) k.gable("x", x, (-5.55 + front) / 2, (front + 5.55) / 2, 2.8, roofed.rise, "stone");
  // Casting bay: furnace with crucible and bellows, stone moulds, ingots, scrap.
  k.box("casting-furnace", [4.9, 0.55, -4.4], [1.4, 1.1, 1.3], "brick");
  k.cylinder("crucible", [4.9, 1.25, -4.4], 0.22, 0.3, "clay", 0.17, high ? 12 : 6);
  k.cylinder("molten-pewter", [4.9, 1.41, -4.4], 0.19, 0.02, "ember", 0.19, high ? 12 : 6);
  k.box("furnace-mouth", [4.9, 0.4, -3.74], [0.5, 0.35, 0.02], "dark");
  k.chimneyStack(4.9, -5.05, roofed.ridgeY + 0.9, 0.7, 0.6, "brick");
  k.bellows(3.3, -4.4, 0.7);
  k.trestleTable(2.4, -2.85, 2.4, 0.8);
  for (let i = 0; i < 4; i++) {
    k.box("stone-mould", [1.6 + i * 0.52, 0.94, -2.85], [0.4, 0.1, 0.32], "stone");
    if (high) k.cylinder("mould-cavity", [1.6 + i * 0.52, 0.995, -2.85], 0.11, 0.004, "dark", 0.11, 10);
  }
  for (let i = 0; i < (high ? 8 : 2); i++)
    k.box(
      "pewter-ingot",
      [5.8, (high ? 0.03 : 0.09) + Math.floor(i / 2) * (high ? 0.07 : 0.2), -2.9 + (i % 2) * 0.24],
      [0.45, high ? 0.06 : 0.18, 0.18],
      "pewter"
    );
  // Pole lathe for skimming cast ware.
  for (const z of [-4.3, -4.6]) k.beam("lathe-bed", [-0.1, 0.95, z], [2.1, 0.95, z], 0.1, "oak");
  for (const x of [0.0, 2.0]) for (const z of [-4.3, -4.6]) k.beam("lathe-leg", [x, 0, z], [x, 0.95, z], 0.09, "oak");
  for (const x of [0.5, 1.6]) k.box("lathe-poppet", [x, 1.15, -4.45], [0.14, 0.4, 0.3], "oak");
  k.beam("lathe-work", [0.6, 1.25, -4.45], [1.5, 1.25, -4.45], 0.2, "pewter", true);
  k.beam("lathe-pole", [-0.4, 2.0, -5.2], [1.05, 2.6, -2.6], 0.08, "wood", true);
  k.beam("lathe-cord", [1.05, 2.55, -2.65], [1.05, 1.25, -4.4], 0.015, "cloth");
  k.beam("lathe-treadle", [1.05, 0.08, -4.45], [1.05, 0.3, -3.3], 0.12, "wood");
  if (high) {
    k.box("brass-shelf", [-2.5, 1.7, -5.15], [3.4, 0.05, 0.3], "wood");
    for (let i = 0; i < 5; i++) flagon(k, -3.9 + i * 0.6, 1.72, -5.15, 0.26, i % 2 ? "brass" : "copper");
    k.trestleTable(-4.2, -3.6, 2.0, 0.75);
    for (let i = 0; i < 4; i++) plate(k, -4.8 + i * 0.4, 0.9, -3.6, 0.14);
    for (let i = 0; i < 7; i++)
      k.box(
        "scrap-metal",
        [6.0 + (i % 3) * 0.18, 0.1 + Math.floor(i / 3) * 0.08, -0.7 + (i % 2) * 0.2],
        [0.24, 0.06, 0.12],
        i % 2 ? "brass" : "pewter"
      ).rotation.y = i * 0.7;
  }
  // Charcoal bin and quench water in the yard.
  k.box("charcoal-bin", [6.0, 0.45, 0.6], [1.0, 0.9, 1.4], "wood");
  k.box("charcoal", [6.0, 0.88, 0.6], [0.86, 0.04, 1.26], "dark");
  k.tub(3.4, -1.0, 0.36, 0.55, "water");
  k.woodStack(6.3, 3.6, 3.0, 1.0, "z");
}

function fishmongery(k: TradeKit) {
  const { width: W, depth: D } = OPUS_TOWN_TRADES.fishmongery;
  const high = k.high;
  k.box("yard-paving", [0, 0.02, 0], [W, 0.04, D], "stone");
  // Open market hall on the street: posts on pads, tie beams, and a boarded back toward the yard.
  const z0 = 1.6,
    z1 = 5.2,
    eave = 2.7;
  k.box("hall-floor", [0, 0.06, (z0 + z1) / 2], [13.2, 0.08, z1 - z0], "stone");
  for (const x of [-6.3, -3.15, 0, 3.15, 6.3])
    for (const z of [z0 + 0.12, z1 - 0.12]) {
      k.box("hall-post-pad", [x, 0.16, z], [0.36, 0.32, 0.36], "stone");
      k.box("hall-post", [x, (eave + 0.3) / 2, z], [0.22, eave - 0.3, 0.22], "oak");
      if (high)
        for (const s of [-1, 1])
          if (Math.abs(x + s * 0.7) < 6.6)
            k.beam("hall-brace", [x, eave - 0.75, z], [x + s * 0.7, eave - 0.1, z], 0.12, "oak");
    }
  for (const z of [z0 + 0.12, z1 - 0.12]) k.box("hall-plate", [0, eave - 0.08, z], [12.9, 0.2, 0.22], "oak");
  for (const x of [-6.3, -3.15, 0, 3.15, 6.3])
    k.box("hall-tie-beam", [x, eave + 0.05, (z0 + z1) / 2], [0.2, 0.2, z1 - z0], "oak");
  k.wall(
    "boarded-back",
    "x",
    -6.3,
    6.3,
    z0 + 0.12,
    0.3,
    eave - 0.2,
    [{ a: -0.8, b: 0.8, y0: 0, y1: 2.2 }],
    "wood",
    0.06
  );
  if (high)
    for (let x = -6.1; x < 6.2; x += 0.3)
      if (Math.abs(x) > 0.85) k.box("board-batten", [x, 1.35, z0 + 0.16], [0.05, eave - 0.6, 0.02], "oak");
  const roofed = k.pitchedRoof({
    ridge: "x",
    along: [-6.4, 6.4],
    across: [z0, z1],
    eave,
    pitch: 40,
    gableOverhang: 0.15
  });
  for (const x of [-6.3, 6.3]) {
    k.gable("x", x, (z0 + z1) / 2, (z1 - z0) / 2, eave, roofed.rise, "wood");
    k.gableFrame("x", x + Math.sign(x) * 0.09, Math.sign(x) as 1 | -1, (z0 + z1) / 2, (z1 - z0) / 2, eave, roofed.rise);
  }
  // Fish slabs slope toward the buyer so water runs off the front.
  for (const x of [-3.5, 3.5]) {
    for (const dx of [-2.2, 0, 2.2]) k.box("slab-pier", [x + dx, 0.4, 4.4], [0.3, 0.8, 0.8], "stone");
    const slab = k.box("fish-slab", [x, 0.86, 4.4], [5.3, 0.1, 1.05], "stone");
    slab.rotation.x = 0.1;
    const rows = high ? 3 : 1,
      per = high ? 14 : 4;
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < per; i++) {
        const fx = x - 2.3 + ((i + 0.5) * 4.6) / per,
          fz = 4.1 + r * 0.3;
        const fish = k.blob(
          "fresh-fish",
          [fx, 0.95 - (fz - 4.4) * 0.1, fz],
          high ? [0.07, 0.035, 0.16] : [0.5, 0.04, 0.12],
          (i + r) % 4 ? "fish" : "white"
        );
        if (high) fish.rotation.y = ((i * 7 + r * 3) % 5) * 0.12 - 0.24;
      }
  }
  for (const x of [-5.8, -1.2, 1.2, 5.8]) k.tub(x, 2.6, 0.38, 0.55, "water");
  if (high) {
    for (const x of [-1.2, 1.2])
      for (let i = 0; i < 3; i++)
        k.blob("live-fish", [x - 0.12 + i * 0.12, 0.43, 2.6 + (i - 1) * 0.1], [0.05, 0.02, 0.13], "fish");
    k.beam("scale-hanger", [0, eave - 0.05, 3.6], [0, 2.0, 3.6], 0.02, "iron");
    k.beam("scale-beam", [-0.35, 2.0, 3.6], [0.35, 2.0, 3.6], 0.03, "iron");
    for (const x of [-0.33, 0.33]) {
      k.beam("scale-cord", [x, 2.0, 3.6], [x, 1.6, 3.6], 0.01, "cloth");
      k.cylinder("scale-pan", [x, 1.6, 3.6], 0.14, 0.02, "brass", 0.14, 10);
    }
    for (let i = 0; i < 6; i++)
      k.cylinder(
        "eel-basket",
        [-6.0 + (i % 2) * 0.5, 0.25, 3.5 + Math.floor(i / 2) * 0.45],
        0.2,
        0.42,
        "straw",
        0.16,
        10
      );
  }
  // Salting house: the store for barrelled herring and salt.
  townHouse(k, {
    x0: -6.6,
    x1: 1.2,
    z0: -5.4,
    z1: -2.2,
    ridge: "x",
    ground: 3.0,
    upper: 0,
    jetty: 0,
    pitch: 50,
    door: { a: -3.0, b: -1.7 }
  });
  k.windowOn("x", -2.2, 1, -5.0, 1.7);
  k.windowOn("x", -2.2, 1, 0.2, 1.7);
  k.boundary("x", -W / 2, W / 2, -D / 2 + 0.2, 2.2);
  for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) k.boundary("z", -D / 2 + 0.4, z0, x, 2.2);
  // Herring tuns in a stack, salt bin, gutting table and the stockfish rack.
  for (let i = 0; i < 3; i++) k.barrel(2.7 + i * 0.68, -5.0, 0.32, 0.8, 0, Math.PI / 2);
  for (let i = 0; i < 2; i++) k.barrel(3.04 + i * 0.68, -5.0, 0.32, 0.8, 0.6, Math.PI / 2);
  for (const [x, z] of [
    [5.6, -5.0],
    [5.6, -4.25],
    [4.9, -3.9]
  ] as const)
    k.barrel(x, z, 0.32, 0.8);
  k.box("salt-bin", [-4.7, 0.42, -1.2], [1.4, 0.84, 0.8], "wood");
  k.box("salt", [-4.7, 0.83, -1.2], [1.26, 0.04, 0.66], "white");
  k.trestleTable(3.5, -0.6, 2.6, 0.8);
  for (let i = 0; i < (high ? 6 : 2); i++)
    k.blob("gutted-fish", [2.6 + i * 0.32, 0.92, -0.6], [0.07, 0.03, 0.15], "fish");
  if (high) {
    knife(k, 4.2, 0.9, -0.45, 0.3);
    k.tub(5.4, -0.5, 0.3, 0.45, "meat");
    k.tub(1.7, -0.4, 0.3, 0.45, "water");
    k.box("blood-gutter", [0, 0.045, -1.6], [12.6, 0.012, 0.16], "dark");
  }
  for (const x of [2.2, 5.6]) {
    for (const s of [-1, 1]) k.beam("rack-leg", [x, 0.04, -2.6 + s * 0.45], [x, 2.0, -2.6], 0.09, "oak");
  }
  for (const z of [-2.75, -2.45]) {
    k.beam("rack-pole", [2.0, 1.95, z], [5.8, 1.95, z], 0.06, "wood", true);
    for (let i = 0; i < (high ? 10 : 3); i++) {
      const x = 2.4 + (i * 3.0) / (high ? 9 : 2);
      k.box("stockfish", [x, 1.6, z], [0.12, 0.6, 0.02], "fish");
    }
  }
}

function cutlery(k: TradeKit) {
  const { width: W, depth: D } = OPUS_TOWN_TRADES.cutlery;
  const high = k.high;
  k.box("yard-ground", [0, 0.02, 0], [W, 0.04, D], "earth");
  k.box("house-forecourt", [-2.5, 0.046, 4.6], [6, 0.012, 0.8], "stone");
  townHouse(k, {
    x0: -5.4,
    x1: 0.5,
    z0: -1.0,
    z1: 4.2,
    ridge: "z",
    ground: 2.8,
    upper: 2.5,
    jetty: 0.4,
    pitch: 56,
    shop: { a: -4.9, b: -2.1, y0: 0.8, y1: 2.05 },
    door: { a: -1.2, b: -0.2 },
    backDoor: { a: -1.2, b: -0.3 },
    upperWindows: [-4.1, -1.7],
    sideWindows: { right: [0.5, 2.6] }
  });
  // Stall-board: knives laid out with their sheaths, shears, and a rack of hafted blades.
  for (let i = 0; i < (high ? 9 : 3); i++) knife(k, -4.6 + i * 0.3, 0.79, 4.5 + (i % 2) * 0.12, Math.PI / 2 - 0.1, 0.3);
  if (high) {
    for (let i = 0; i < 4; i++) k.box("knife-sheath", [-4.6 + i * 0.25, 0.8, 4.2], [0.05, 0.03, 0.3], "leather");
    k.box("blade-rack", [-3.5, 1.7, 3.9], [2.4, 0.08, 0.06], "oak");
    for (let i = 0; i < 8; i++) k.box("hanging-blade", [-4.5 + i * 0.28, 1.5, 3.92], [0.04, 0.36, 0.01], "pewter");
  }
  k.signBracket(0.15, 4.2, 2.6, (x, y, z) => {
    for (const s of [-1, 1]) {
      const b = k.box("knife-sign", [x + 0.06, y, z], [0.02, 0.5, 0.06], "pewter");
      b.rotation.x = s * 0.6;
    }
  });
  plotBoundaries(k, W, D, 0.5, [1.4, 3.6], -1.0);
  // Forge: hearth, bellows, anvil and quench in a masonry shed.
  workShed(k, 0.9, 5.6, -4.55, -1.4, 2.6, 45);
  k.box("forge-hearth", [3.4, 0.42, -3.85], [1.5, 0.84, 1.1], "stone");
  k.box("forge-fire", [3.4, 0.86, -3.85], [0.6, 0.04, 0.5], "ember");
  if (high) {
    const hood = k.add("forge-hood", new THREE.CylinderGeometry(0.3, 0.85, 0.85, 4, 1, true), "brick");
    hood.position.set(3.4, 1.9, -4.0);
    hood.rotation.y = Math.PI / 4;
  } else k.box("forge-hood", [3.4, 1.9, -4.0], [1.2, 0.85, 0.9], "brick");
  k.chimneyStack(3.4, -4.15, 5.0, 0.6, 0.5, "brick");
  k.bellows(1.6, -3.85, 0.75);
  k.anvil(3.6, -2.4);
  k.tub(4.75, -2.3, 0.3, 0.55, "water");
  if (high) {
    k.box("tool-rack", [5.2, 1.4, -3.6], [0.06, 0.08, 1.2], "oak");
    for (let i = 0; i < 4; i++)
      k.beam("tongs", [5.2, 1.38, -4.0 + i * 0.25], [5.15, 0.9, -4.0 + i * 0.25], 0.025, "iron");
    k.box("hammer-head", [3.75, 0.9, -2.4], [0.12, 0.05, 0.05], "iron");
    k.beam("hammer-handle", [3.75, 0.9, -2.4], [3.75, 0.9, -2.05], 0.03, "oak");
  }
  // Grinding shed: a crank-turned grindstone running in its water trough, and a treadle whetstone.
  k.leanTo("grinding-pentice", "z", -0.2, 2.6, 5.6, 2.3, 2.6, 2.0);
  for (const z of [-0.1, 2.5]) k.box("pentice-post", [2.5, 1.0, z], [0.18, 2.0, 0.18], "oak");
  k.box("pentice-plate", [2.5, 2.02, 1.2], [0.2, 0.16, 2.8], "oak");
  k.box("grinding-trough", [3.8, 0.35, 1.2], [0.4, 0.5, 1.5], "wood");
  k.box("trough-water", [3.8, 0.58, 1.2], [0.32, 0.03, 1.36], "water");
  k.wheelOnEdge("grindstone", 3.8, 0.85, 1.2, 0.55, 0.16, "stone", true);
  k.beam("grindstone-axle", [3.8, 0.85, 0.3], [3.8, 0.85, 2.1], 0.06, "iron", true);
  for (const z of [0.4, 2.0]) k.box("axle-bearer", [3.8, 0.45, z], [0.16, 0.9, 0.16], "oak");
  k.beam("crank-arm", [3.8, 0.85, 0.28], [3.8, 0.55, 0.28], 0.05, "iron");
  k.beam("crank-handle", [3.8, 0.55, 0.28], [3.8, 0.55, 0.0], 0.04, "oak", true);
  k.box("grinders-horse", [3.0, 0.32, 1.2], [1.3, 0.08, 0.35], "wood").rotation.z = 0.35;
  if (high) {
    k.wheelOnEdge("whetstone", 5.0, 0.75, 1.0, 0.25, 0.08, "stone", true);
    k.box("whetstone-frame", [5.0, 0.4, 1.0], [0.5, 0.8, 0.45], "oak");
    k.beam("treadle", [5.0, 0.08, 1.4], [5.0, 0.2, 2.0], 0.1, "wood");
    for (let i = 0; i < 10; i++)
      k.beam(
        "haft-blank",
        [1.2 + (i % 5) * 0.06, 0.04 + Math.floor(i / 5) * 0.06, 2.3],
        [1.2 + (i % 5) * 0.06, 0.04 + Math.floor(i / 5) * 0.06, 3.0],
        0.05,
        "wood"
      );
    for (let i = 0; i < 5; i++)
      k.add("horn-stock", new THREE.ConeGeometry(0.05, 0.35, 6), "fat").position.set(1.3 + i * 0.12, 0.18, 3.4);
  }
  k.box("charcoal-bin", [5.2, 0.4, -0.6], [0.9, 0.8, 1.0], "wood");
  k.box("charcoal", [5.2, 0.78, -0.6], [0.78, 0.04, 0.88], "dark");
}

/** Brick hack: green bricks set on edge in an open lattice to dry, capped with straw. */
function brickHack(k: TradeKit, x: number, z: number, length: number) {
  if (!k.high) {
    k.box("brick-hack", [x, 0.6, z], [length, 1.2, 0.55], "brick");
  } else {
    for (let layer = 0; layer < 8; layer++) {
      const y = 0.08 + layer * 0.145,
        cross = layer % 2 === 1;
      const count = cross ? Math.floor(length / 0.2) : Math.floor(length / 0.26);
      for (let i = 0; i < count; i++) {
        const bx = x - length / 2 + ((i + 0.5) * length) / count;
        if (cross) k.box("green-brick", [bx, y, z], [0.07, 0.13, 0.5], "brick");
        else for (const s of [-1, 1]) k.box("green-brick", [bx, y, z + s * 0.16], [0.23, 0.13, 0.11], "brick");
      }
    }
  }
  k.box("hack-straw-cap", [x, 1.28, z], [length + 0.2, 0.12, 0.8], "straw");
}

function limeTileYard(k: TradeKit) {
  const { width: W, depth: D } = OPUS_TOWN_TRADES["lime-tile-yard"];
  const high = k.high;
  const F = D / 2;
  k.box("yard-ground", [0, 0.02, 0], [W, 0.04, D], "earth");
  k.box("cart-track", [0, 0.035, 4.5], [3.6, 0.02, 11], "clay");
  // Boundary: post-and-rail fence with a cart gate on the road.
  const fence = (a: readonly [number, number], b: readonly [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      k.box("fence-post", [a[0] + (b[0] - a[0]) * t, 0.65, a[1] + (b[1] - a[1]) * t], [0.14, 1.3, 0.14], "oak");
    }
    for (const y of high ? [0.55, 1.1] : [0.9]) k.beam("fence-rail", [a[0], y, a[1]], [b[0], y, b[1]], 0.09, "wood");
  };
  const e = W / 2 - 0.1;
  fence([-e, F - 0.1], [-1.9, F - 0.1]);
  fence([1.9, F - 0.1], [e, F - 0.1]);
  fence([-e, -F + 0.1], [e, -F + 0.1]);
  fence([-e, -F + 0.1], [-e, F - 0.1]);
  fence([e, -F + 0.1], [e, F - 0.1]);
  for (const x of [-1.9, 1.9]) k.box("gate-post", [x, 1.1, F - 0.12], [0.24, 2.2, 0.24], "oak");
  if (high) k.box("gate-head", [0, 2.25, F - 0.12], [4.3, 0.2, 0.22], "oak");

  // Tile kiln: a brick updraft kiln with two arched fire tunnels under the loading chamber.
  const kx = -5.4,
    kz = -6.2,
    kw = 4.6,
    kd = 5.0,
    kh = 2.5;
  const arches = [
    { a: kx - 1.3, b: kx - 0.6, y0: -1, y1: 0.85 },
    { a: kx + 0.6, b: kx + 1.3, y0: -1, y1: 0.85 }
  ];
  k.wall("kiln-front", "x", kx - kw / 2, kx + kw / 2, kz + kd / 2 - 0.35, 0, kh, arches, "brick", 0.7);
  k.wall("kiln-back", "x", kx - kw / 2, kx + kw / 2, kz - kd / 2 + 0.35, 0, kh, [], "brick", 0.7);
  for (const s of [-1, 1])
    k.wall("kiln-side", "z", kz - kd / 2 + 0.7, kz + kd / 2 - 0.7, kx + s * (kw / 2 - 0.35), 0, kh, [], "brick", 0.7);
  for (const o of arches) {
    const c = (o.a + o.b) / 2;
    k.box("fire-tunnel", [c, 0.43, kz], [0.7, 0.85, kd - 0.8], "dark");
    k.box("stoke-glow", [c, 0.12, kz + kd / 2 - 0.75], [0.5, 0.1, 0.2], "ember");
    const head = new THREE.Shape();
    head.absarc(0, 0, 0.35, 0, Math.PI, false);
    k.add("tunnel-arch-head", new THREE.ShapeGeometry(head, high ? 8 : 3), "dark").position.set(
      c,
      0.85,
      kz + kd / 2 + 0.005
    );
    if (high) {
      const ring = new THREE.Shape();
      ring.absarc(0, 0, 0.5, 0, Math.PI, false);
      ring.lineTo(-0.35, 0);
      ring.absarc(0, 0, 0.35, Math.PI, 0, true);
      k.add("arch-voussoirs", new THREE.ShapeGeometry(ring, 10), "clay").position.set(c, 0.85, kz + kd / 2 + 0.01);
    }
  }
  k.box("kiln-floor", [kx, 0.9, kz], [kw - 1.4, 0.1, kd - 1.4], "brick");
  // The charge of green tiles set on edge, topped with a temporary cover of waster sherds.
  if (high)
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 11; i++)
        k.box(
          "kiln-charge-tile",
          [kx - 1.3 + i * 0.26, 1.4 + r * 0.02, kz - 1.3 + r * 0.85],
          [0.03, 0.9, 0.62],
          "tile"
        );
  else k.box("kiln-charge", [kx, 1.4, kz], [kw - 1.5, 0.9, kd - 1.5], "tile");
  k.box("waster-cover", [kx - 0.6, 1.9, kz - 0.4], [2.0, 0.12, 2.6], "clay");
  // Stoking shelter over the stoke pit in front of the arches.
  k.leanTo("stoke-shelter", "x", kx - 2.5, kx + 2.5, kz + kd / 2, kz + kd / 2 + 2.2, 2.6, 2.0, "wood");
  for (const x of [kx - 2.3, kx + 2.3]) k.box("shelter-post", [x, 1.0, kz + kd / 2 + 2.0], [0.18, 2.0, 0.18], "oak");
  k.box("stoke-pit-kerb", [kx, 0.08, kz + kd / 2 + 0.8], [3.4, 0.16, 1.4], "brick");
  k.box("stoke-pit-ash", [kx, 0.17, kz + kd / 2 + 0.8], [3.1, 0.02, 1.1], "dark");

  // Lime kiln: a round rubble kiln loaded from an earth ramp, drawn through an arch at the foot.
  const lx = 5.6,
    lz = -6.3,
    lr = 2.1,
    lh = 3.5;
  const pot = lr * 0.9 - 0.5;
  const shell = [
    [0, 0],
    [lr, 0],
    [lr * 0.9, lh],
    [pot, lh],
    [pot, lh - 0.3],
    [0, lh - 0.3]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  k.add("lime-kiln", new THREE.LatheGeometry(shell, high ? 20 : 10), "stone").position.set(lx, 0, lz);
  k.cylinder("burning-charge", [lx, lh - 0.27, lz], pot - 0.02, 0.05, "white", pot - 0.02, high ? 16 : 8);
  if (high)
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4,
        r = 0.3 + (i % 4) * 0.3;
      k.blob("limestone-lump", [lx + Math.cos(a) * r, lh - 0.18, lz + Math.sin(a) * r], [0.17, 0.11, 0.15], "white");
    }
  k.box("draw-arch", [lx, 0.65, lz + lr - 0.02], [1.0, 1.3, 0.12], "dark");
  k.box("draw-arch-lintel", [lx, 1.38, lz + lr + 0.04], [1.5, 0.22, 0.3], "stone");
  {
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(3.0, 0),
      new THREE.Vector2(3.0, lh - 0.1)
    ]);
    const ramp = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
    ramp.translate(lx - lr - 3.0 + 0.4, 0, lz - 1.1);
    ramp.computeVertexNormals();
    k.add("loading-ramp", ramp, "earth");
    if (high) {
      const foot = new THREE.Vector3(lx - lr - 2.6, 0, lz),
        head = new THREE.Vector3(lx - lr + 0.4, lh - 0.1, lz);
      const u = head.clone().sub(foot).normalize(),
        n = new THREE.Vector3(-u.y, u.x, 0);
      for (const dz of [-0.35, 0, 0.35])
        k.oriented(
          "ramp-plank",
          foot
            .clone()
            .add(head)
            .multiplyScalar(0.5)
            .addScaledVector(n, 0.04)
            .add(new THREE.Vector3(0, 0, dz)),
          u,
          n,
          [foot.distanceTo(head), 0.05, 0.3],
          "wood"
        );
    }
  }
  // Quicklime under cover, limestone and clay heaps.
  k.heap("limestone-heap", 1.5, -6.5, 1.3, 0.8, 1.1, "stone");
  k.box("quicklime-bin", [8.3, 0.5, -1.8], [2.4, 1.0, 1.6], "wood");
  k.box("quicklime", [8.3, 0.98, -1.8], [2.2, 0.05, 1.4], "white");
  k.leanTo("bin-cover", "x", 7.0, 9.6, -2.8, -0.8, 1.8, 1.4, "wood");

  // Drying shed: low thatched roof over three tiers of tile racks.
  const sx0 = -9.3,
    sx1 = -7.0,
    sz0 = -0.6,
    sz1 = 8.8;
  for (const x of [sx0 + 0.15, sx1 - 0.15])
    for (let z = sz0 + 0.15; z <= sz1 - 0.1; z += (sz1 - sz0 - 0.3) / 4)
      k.box("drying-shed-post", [x, 1.0, z], [0.16, 2.0, 0.16], "oak");
  const shedRoof = k.pitchedRoof({
    ridge: "z",
    along: [sz0, sz1],
    across: [sx0, sx1],
    eave: 1.9,
    pitch: 45,
    eaveOverhang: 0.25,
    gableOverhang: 0.25,
    surface: "thatch",
    thickness: 0.3
  });
  void shedRoof;
  for (const y of [0.35, 0.85, 1.35]) {
    k.box("drying-rack", [(sx0 + sx1) / 2, y, (sz0 + sz1) / 2], [1.7, 0.04, sz1 - sz0 - 0.6], "wood");
    if (high)
      for (let i = 0; i < 26; i++)
        k.box("green-tile", [(sx0 + sx1) / 2, y + 0.13, sz0 + 0.5 + i * 0.33], [1.5, 0.22, 0.02], "clay");
    else k.box("green-tiles", [(sx0 + sx1) / 2, y + 0.12, (sz0 + sz1) / 2], [1.5, 0.2, sz1 - sz0 - 0.8], "clay");
  }
  // Brick hacks drying in the open.
  brickHack(k, -3.6, 1.6, 4.4);
  brickHack(k, -3.6, 3.4, 4.4);
  // Moulding shelter, clay pit and the puddled clay heap.
  const mx = 6.2,
    mz = 6.0;
  for (const x of [mx - 1.9, mx + 1.9])
    for (const z of [mz - 1.4, mz + 1.4]) k.box("moulding-shelter-post", [x, 1.1, z], [0.16, 2.2, 0.16], "oak");
  k.pitchedRoof({
    ridge: "x",
    along: [mx - 2.0, mx + 2.0],
    across: [mz - 1.5, mz + 1.5],
    eave: 2.2,
    pitch: 35,
    eaveOverhang: 0.25,
    gableOverhang: 0.2,
    surface: "thatch",
    thickness: 0.25
  });
  k.trestleTable(mx, mz, 2.6, 0.9);
  k.box("sand-tray", [mx - 0.8, 0.92, mz], [0.6, 0.04, 0.6], "straw");
  k.box("tile-mould", [mx + 0.1, 0.94, mz], [0.32, 0.04, 0.4], "oak");
  for (let i = 0; i < (high ? 8 : 1); i++)
    k.box("pallet-tile", [mx + 0.9, 0.9 + i * (high ? 0.02 : 0.08), mz], [0.3, high ? 0.018 : 0.14, 0.38], "clay");
  k.box("clay-pit-rim", [3.0, 0.15, 1.2], [3.2, 0.3, 2.4], "earth");
  k.box("puddled-clay", [3.0, 0.29, 1.2], [2.8, 0.04, 2.0], "clay");
  if (high) k.box("pit-water", [2.3, 0.315, 0.8], [1.2, 0.02, 0.9], "water");
  k.heap("clay-heap", 6.3, 1.6, 1.5, 0.9, 1.2, "clay");
  // Fuel: brushwood faggots and split cordwood between the kilns.
  k.woodStack(0, -8.6, 4.2, 1.2, "x");
  for (let i = 0; i < (high ? 9 : 3); i++) {
    const r = Math.floor(i / 3),
      x = -1.4 + (i % 3) * 1.4;
    const faggot = k.cylinder("brushwood-faggot", [x, 0.25 + r * 0.42, -6.0], 0.22, 1.2, "straw", 0.22, high ? 8 : 5);
    faggot.rotation.x = Math.PI / 2;
  }
  // Fired stock waiting for carts: roof tiles stacked on edge and bricks on pallets.
  for (let i = 0; i < (high ? 5 : 2); i++)
    k.box("fired-tile-stack", [-4.6 + i * 0.75, 0.45, 6.6], [0.32, 0.9, 0.62], "tile");
  for (let i = 0; i < 2; i++) k.box("fired-brick-stack", [-3.7 + i * 1.3, 0.5, 8.3], [1.0, 1.0, 1.0], "brick");
}

function glaziersWorkshop(k: TradeKit) {
  const { width: W, depth: D } = OPUS_TOWN_TRADES["glaziers-workshop"];
  const high = k.high;
  k.box("yard-ground", [0, 0.02, 0], [W, 0.04, D], "earth");
  k.box("yard-cobbles", [3.4, 0.035, 1.0], [5, 0.02, 6], "stone");
  townHouse(k, {
    x0: -5.5,
    x1: 0.7,
    z0: 0.4,
    z1: 3.85,
    ridge: "x",
    ground: 2.9,
    upper: 2.5,
    jetty: 0.4,
    pitch: 52,
    shop: { a: -4.9, b: -2.2, y0: 0.8, y1: 2.1 },
    door: { a: -1.4, b: -0.4 },
    backDoor: { a: -1.2, b: -0.3 },
    upperWindows: [-4.6, -2.4, -0.2],
    chimney: { x: -4.95, z: 1.0 }
  });
  // Stall-board: finished panels in a little rack and roundels laid out.
  leadedPanel(k, -4.3, 0.8, 4.2, 0.5, 0.8, 0.2, 1);
  leadedPanel(k, -3.6, 0.8, 4.2, 0.45, 0.9, 0.2, 3);
  for (const [i, x] of [-2.95, -2.55].entries()) {
    const roundel = k.cylinder(
      "glass-roundel",
      [x, 0.79, 4.3],
      0.15,
      0.015,
      i ? "amber" : "azure",
      0.15,
      high ? 14 : 8
    );
    roundel.rotation.x = 0.02;
  }
  k.signBracket(0.4, 3.85, 2.7, (x, y, z) => {
    const q = k.box("quarry-sign", [x + 0.06, y, z], [0.02, 0.3, 0.3], "azure");
    q.rotation.x = Math.PI / 4;
  });
  plotBoundaries(k, W, D, 0.7, [1.8, 4.2], 0.4);
  // Rear workshop: a long timber-framed range lit by wide shutter openings toward the yard.
  const z0 = -4.55,
    z1 = -1.4,
    eave = 2.7;
  k.box("workshop-floor", [0, 0.03, (z0 + z1) / 2], [11.2, 0.06, z1 - z0], "wood");
  const openings = [
    { a: -4.8, b: -3.2, y0: 0.95, y1: 2.15 },
    { a: -2.6, b: -1.0, y0: 0.95, y1: 2.15 },
    { a: -0.3, b: 0.8, y0: -1, y1: 2.15 },
    { a: 1.5, b: 3.1, y0: 0.95, y1: 2.15 },
    { a: 3.7, b: 5.0, y0: 0.95, y1: 2.15 }
  ];
  k.wall("workshop-back", "x", -5.6, 5.6, z0 + 0.15, 0, eave, [], "stone", 0.3);
  for (const x of [-5.45, 5.45]) k.wall("workshop-end", "z", z0 + 0.3, z1, x, 0, eave, [], "plaster");
  k.wall("workshop-front", "x", -5.6, 5.6, z1 - 0.09, 0, eave, openings);
  k.framing("x", -5.6, 5.6, z1, 1, 0, eave, openings);
  k.framing("z", z0, z1, -5.6, -1, 0, eave);
  k.framing("z", z0, z1, 5.6, 1, 0, eave);
  for (const o of openings.filter(o => o.y0 > 0)) {
    k.box("light-sill", [(o.a + o.b) / 2, o.y0 - 0.05, z1 + 0.04], [o.b - o.a + 0.2, 0.08, 0.16], "oak");
    const w = o.b - o.a;
    const lower = k.box("drop-shutter", [(o.a + o.b) / 2, o.y0 - 0.32, z1 + 0.04], [w - 0.05, 0.55, 0.04], "wood");
    lower.rotation.x = 0.08;
    const upper = k.box("lifted-shutter", [(o.a + o.b) / 2, o.y1 + 0.2, z1 + 0.28], [w - 0.05, 0.04, 0.55], "wood");
    upper.rotation.x = -0.35;
  }
  k.doorLeaf(-0.3, 0.8, z1, 2.15);
  const roofed = k.pitchedRoof({
    ridge: "x",
    along: [-5.6, 5.6],
    across: [z0, z1],
    eave,
    pitch: 45,
    eaveOverhang: 0.3,
    gableOverhang: 0.2
  });
  for (const x of [-5.45, 5.45]) k.gable("x", x, (z0 + z1) / 2, (z1 - z0) / 2, eave, roofed.rise);
  // Glazing table, whitened so the cartoon can be drawn on it; cut quarries laid out on the design.
  k.trestleTable(-2.6, -3.1, 4.4, 1.2, 0.9, "white");
  if (high) {
    const colours: Surface[] = ["azure", "ruby", "amber", "green", "glass"];
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 3; j++)
        if ((i + j) % 3 !== 1)
          k.box(
            "cut-quarry",
            [-4.3 + i * 0.3, 0.912, -3.4 + j * 0.3],
            [0.24, 0.006, 0.24],
            colours[(i + j * 2) % colours.length]
          );
    for (let i = 0; i < 4; i++) k.box("lead-came-strip", [-1.5 + i * 0.05, 0.915, -2.9], [0.012, 0.012, 0.9], "dark");
    leadedPanel(k, -0.9, 0.9, -3.2, 0.5, 0.06, 1.45, 2);
  } else k.box("laid-out-glass", [-3.2, 0.912, -3.1], [2.4, 0.01, 0.8], "azure");
  // Came rack and glass crates against the back wall; panels finished and leaning.
  k.box("came-rack", [1.0, 1.7, z0 + 0.35], [2.4, 0.06, 0.12], "oak");
  if (high)
    for (let i = 0; i < 10; i++)
      k.beam("came-bundle", [0.0 + i * 0.22, 1.7, z0 + 0.38], [0.0 + i * 0.22, 0.6, z0 + 0.45], 0.02, "dark");
  for (const [i, x] of [1.4, 2.3].entries()) {
    k.box("glass-crate", [x, 0.35, -3.9], [0.75, 0.7, 0.5], "wood");
    if (high)
      for (let s = 0; s < 6; s++)
        k.box("crown-glass-sheet", [x - 0.25 + s * 0.1, 0.62, -3.9], [0.01, 0.4, 0.42], i ? "green" : "glass");
    else k.box("glass-sheets", [x, 0.72, -3.9], [0.6, 0.05, 0.4], "glass");
  }
  leadedPanel(k, 3.4, 0.06, -4.1, 0.6, 1.1, 0.12, 4);
  leadedPanel(k, 4.1, 0.06, -4.1, 0.5, 1.0, 0.15, 5);
  // Lead-melting and soldering stove with its flue.
  k.box("solder-stove", [-4.6, 0.45, -3.9], [0.8, 0.9, 0.7], "brick");
  k.cylinder("lead-pot", [-4.6, 0.98, -3.9], 0.18, 0.16, "iron", 0.15, high ? 12 : 6);
  k.chimneyStack(-4.6, -4.2, roofed.ridgeY + 0.6, 0.45, 0.4, "brick");
  if (high)
    for (let i = 0; i < 3; i++)
      k.beam("soldering-iron", [-4.25, 0.92, -4.05 + i * 0.1], [-3.9, 1.2, -4.05 + i * 0.1], 0.018, "iron");
  // Painting kiln for firing grisaille, cullet heap and a water butt in the yard.
  k.box("firing-kiln-base", [3.6, 0.35, -0.3], [1.3, 0.7, 1.3], "brick");
  const dome = k.add(
    "firing-kiln-dome",
    new THREE.SphereGeometry(0.62, high ? 14 : 8, high ? 8 : 4, 0, Math.PI * 2, 0, Math.PI / 2),
    "brick"
  );
  dome.position.set(3.6, 0.7, -0.3);
  k.box("kiln-door", [3.6, 0.85, 0.32], [0.32, 0.26, 0.04], "dark");
  k.cylinder("kiln-flue", [3.6, 1.55, -0.3], 0.12, 0.6, "brick", 0.12, 8);
  k.heap("cullet-heap", 5.2, 0.9, 0.6, 0.3, 0.5, "glass");
  k.barrel(1.4, -0.6, 0.32, 0.85);
  for (let i = 0; i < (high ? 3 : 1); i++)
    k.box("straw-packed-crate", [5.0, 0.3 + i * 0.55, 3.0], [0.8, 0.55, 0.6], "wood");
  if (high) k.box("packing-straw", [4.3, 0.1, 3.6], [0.8, 0.2, 0.7], "straw");
}

const BUILDERS: Record<OpusTownTrade, (k: TradeKit) => void> = {
  chandlery,
  metalwares,
  fishmongery,
  cutlery,
  "lime-tile-yard": limeTileYard,
  "glaziers-workshop": glaziersWorkshop
};

export function createOpusTownTrade(trade: OpusTownTrade, quality: TradeQuality): CityStructureMeshes {
  const k = new TradeKit(`opus-${trade}-${quality}`, quality === "high");
  BUILDERS[trade](k);
  return k.finish();
}

/** Lot corners for tests: every Opus town trade fills exactly its plot. */
export function opusTownTradeBounds(trade: OpusTownTrade): readonly [Position, Position] {
  const { width, depth, height } = OPUS_TOWN_TRADES[trade];
  return [
    [-width / 2, 0, -depth / 2],
    [width / 2, height, depth / 2]
  ];
}
