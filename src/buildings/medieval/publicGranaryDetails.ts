import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";

function sack(k: HouseDetailKit, x: number, y: number, z: number) {
  const profile = [
    [0, 0],
    [0.24, 0],
    [0.34, 0.18],
    [0.33, 0.5],
    [0.25, 0.68],
    [0.07, 0.76],
    [0.06, 0.82],
    [0, 0.83]
  ];
  k.add(
    "grain-reserve-sack",
    new THREE.LatheGeometry(
      profile.map(([r, h]) => new THREE.Vector2(r, h)),
      24
    ),
    "cloth"
  ).position.set(x, y, z);
  k.ring("sack-neck-tie", [x, y + 0.77, z], 0.072, 0.012, "oak");
  for (const side of [-1, 1])
    k.tube(
      "sack-seam",
      profile.slice(1, -2).map(([r, h]) => [x + side * (r + 0.005), y + h, z]),
      0.006,
      "white"
    );
}

function doors(k: HouseDetailKit, x: number, front: number, base: number, w: number, h: number) {
  for (const side of [-1, 1]) {
    const p = (u: number, y: number, out = 0): readonly [number, number, number] => [
      x + side * (w / 2 - u * Math.cos(1.28)),
      y,
      front - u * Math.sin(1.28) + out
    ];
    const leaf = w / 2 - 0.06;
    for (let i = 0; i < 6; i++) {
      const board = k.box(
        "open-grain-door-board",
        p(((i + 0.5) * leaf) / 6, base + h / 2),
        [leaf / 6 - 0.006, h - 0.06, 0.075],
        "wood"
      );
      board.rotation.y = -side * 1.28;
    }
    for (const y of [base + 0.3, base + h - 0.3]) {
      k.beam("door-hinge-strap", p(0.02, y, 0.06), p(leaf - 0.08, y, 0.06), 0.065, "iron");
      for (const u of [leaf * 0.2, leaf * 0.5, leaf * 0.8])
        k.sphere("door-strap-rivet", p(u, y, 0.08), [0.021, 0.021, 0.021], "iron");
    }
    k.beam("door-ledger-brace", p(0.08, base + 0.2, -0.07), p(leaf - 0.08, base + h - 0.2, -0.07), 0.1);
  }
}

function wall(
  k: HouseDetailKit,
  x: number,
  z: number,
  w: number,
  h: number,
  angle: number,
  holes: readonly HouseOpening[]
) {
  k.facade("municipal-granary-wall", x, z, w, h, angle, holes, "stone");
  for (let y = 0.35; y < h; y += 0.36)
    for (let u = -w / 2 + 0.3; u < w / 2 - 0.1; u += 0.65) {
      if (holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.3 && y > o.base - 0.2 && y < o.base + o.height + 0.2))
        continue;
      const stone = k.box("dressed-stone-course", k.point(x, z, angle, u, y, 0.012), [0.62, 0.33, 0.035], "stone");
      stone.rotation.y = angle;
    }
  for (const o of holes.filter(o => o.width < 1))
    for (let row = 0; row < 4; row++) {
      const louvre = k.box(
        "ventilation-louvre",
        k.point(x, z, angle, o.u, o.base + 0.08 + row * 0.15, -0.04),
        [o.width - 0.06, 0.055, 0.16],
        "wood"
      );
      louvre.rotation.set(0.28, angle, 0);
    }
}

export function createHighPublicGranary() {
  const k = new HouseDetailKit("public-granary-high");
  const front = 1.5,
    floors = [0.9, 3.55, 6.15];
  k.box("granary-masonry-plinth", [0, 0.4, -2], [14, 0.8, 7], "stone");
  const receiving: HouseOpening[] = [{ u: 0, base: 0.95, width: 3, height: 2.2, kind: "shop" }];
  for (const base of [3.7, 6.3])
    for (const u of [-3.8, 0, 3.8]) receiving.push({ u, base, width: 1.5, height: 1.65, kind: "shop" });
  for (const base of [1.7, 4.3, 6.9])
    for (const u of [-5.8, 5.8]) receiving.push({ u, base, width: 0.6, height: 0.65, kind: "shop" });
  wall(k, 0, front, 14, 8.6, 0, receiving);
  for (const [x, z, w, angle] of [
    [0, -5.5, 14, Math.PI],
    [-7, -2, 7, -Math.PI / 2],
    [7, -2, 7, Math.PI / 2]
  ]) {
    const vents: HouseOpening[] = [];
    for (const base of [1.7, 4.3, 6.9])
      for (const u of w > 10 ? [-4.5, 0, 4.5] : [-2, 0, 2])
        vents.push({ u, base, width: 0.65, height: 0.65, kind: "shop" });
    wall(k, x, z, w, 8.6, angle, vents);
  }
  k.box("granary-ground-floor", [0, 0.85, -2], [13.65, 0.1, 6.65], "wood");
  for (const y of [3.475, 6.075]) {
    k.box("grain-loft-floor", [0, y, -2], [13.65, 0.15, 6.65], "wood");
    for (let x = -6; x <= 6; x += 1.5) k.box("grain-loft-joist", [x, y - 0.17, -2], [0.17, 0.2, 6.6], "oak");
  }
  k.roofCover(0, -2, 14, 7, 8.72, 2.8, "tile");
  for (const x of [-6.8, 6.8])
    for (const z of [-5.55, 1.55]) {
      for (let y = 0.6; y < 8.5; y += 0.42) k.box("corner-quoin", [x, y, z], [0.43, 0.38, 0.3], "stone");
    }
  for (const o of receiving.filter(o => o.width > 1)) doors(k, o.u, front, o.base, o.width, o.height);
  k.box("public-loading-apron", [0, 0.45, 3.75], [12, 0.9, 4.5], "stone");
  for (let i = 0; i < 5; i++)
    k.box("loading-apron-step", [0, 0.09 + i * 0.18, 7.2 - i * 0.3], [3.3, 0.18, 0.32], "stone");
  for (const x of [-3.8, 0, 3.8]) {
    k.beam("hoist-jib", [x + 0.65, 8.15, 0.7], [x + 0.65, 8.15, 4.8], 0.2);
    k.beam("hoist-brace", [x + 0.65, 7.15, 1.55], [x + 0.65, 8.1, 4.15], 0.14);
    const pulley = k.ring("grain-hoist-pulley", [x + 0.65, 7.98, 4.65], 0.17, 0.027, "iron", true);
    pulley.rotation.y = Math.PI / 2;
    k.beam("hoist-rope-return", [x + 0.65, 8.18, 4.65], [x + 0.65, 8.18, 1.8], 0.02, "cloth", true);
    k.tube(
      "rope-on-sheave",
      Array.from({ length: 13 }, (_, i) => [
        x + 0.65,
        7.98 + 0.2 * Math.cos((i * Math.PI) / 24),
        4.65 + 0.2 * Math.sin((i * Math.PI) / 24)
      ]),
      0.01,
      "cloth"
    );
    k.beam("grain-hoist-rope", [x + 0.65, 7.98, 4.85], [x + 0.65, 1.7, 4.85], 0.02, "cloth", true);
    sack(k, x + 0.65, 0.9, 4.85);
    k.ring("sack-lifting-loop", [x + 0.65, 1.7, 4.85], 0.045, 0.012, "iron", true);
    for (const dx of x === 0 ? [-2.1, 2.1] : [-0.28, 0.28]) sack(k, x + dx, 0.9, 2.5);
  }
  for (const base of floors)
    for (const x of [-4.7, 4.7]) {
      k.box("raised-grain-bin-base", [x, base + 0.08, -3.8], [2.3, 0.16, 1.8], "wood");
      for (const side of [-1, 1]) {
        k.box("grain-bin-side", [x + side * 1.15, base + 0.65, -3.8], [0.075, 1.2, 1.8], "wood");
        k.box("grain-bin-end", [x, base + 0.65, -3.8 + side * 0.9], [2.3, 1.2, 0.075], "wood");
      }
    }
  // The receiving office is separate, with a paved link instead of overlapping roof volumes.
  k.box("receiving-wing-base", [9.4, 0.18, -1], [3.4, 0.36, 5], "stone");
  const officeFront: HouseOpening[] = [{ u: 0, base: 0.38, width: 1.25, height: 2.1, kind: "door" }];
  wall(k, 9.4, 1.5, 3.4, 4.25, 0, officeFront);
  wall(k, 9.4, -3.5, 3.4, 4.25, Math.PI, []);
  for (const x of [7.7, 11.1])
    wall(k, x, -1, 5, 4.25, x < 9 ? -Math.PI / 2 : Math.PI / 2, [
      { u: 0, base: 1.3, width: 0.8, height: 0.8, kind: "window" }
    ]);
  k.roofCover(9.4, -1, 3.4, 5, 4.37, 1.5, "tile");
  k.box("receiving-wing-step", [9.4, 0.18, 1.95], [1.5, 0.36, 0.8], "stone");
  k.box("paved-receiving-link", [7.45, 0.07, 2.8], [3.1, 0.14, 1.2], "stone");
  k.box("civic-grain-plaque", [0, 8.18, 1.68], [1.2, 0.48, 0.1], "stone");
  for (let i = 0; i < 3; i++) {
    k.beam("grain-sheaf-stalk", [-0.25 + i * 0.25, 8, 1.75], [-0.33 + i * 0.33, 8.36, 1.75], 0.025, "straw", true);
    k.sphere("grain-sheaf-ear", [-0.33 + i * 0.33, 8.34, 1.75], [0.045, 0.09, 0.025], "straw");
  }
  return compactModel(k.finish());
}
