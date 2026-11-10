import * as THREE from "three";
import { compactModel } from "../compactModel";
import { house } from "./dwellingShell";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";

export type ShopHouseKind = "merchant-shop-house" | "artisan-shop-house";
export type HighShopPart = "shell" | "shutters" | "counter" | "shelves" | "canopy" | "stock";

function shopShutters(k: HouseDetailKit, front: number) {
  for (let i = 0; i < 12; i++) {
    const x = -2.3 + i * 0.235;
    k.box("fold-down-display-plank", [x, 1.03, front + 0.47], [0.225, 0.075, 0.88], "wood");
    const upper = k.box("lifted-shop-shutter-plank", [x, 2.37, front + 0.44], [0.225, 0.065, 0.9], "wood");
    upper.rotation.x = -0.12;
  }
  for (const x of [-2.15, 0.15]) {
    k.beam("display-shutter-bracket", [x, 0.35, front + 0.03], [x, 0.98, front + 0.76], 0.075);
    k.beam("upper-shutter-stay", [x, 2.2, front + 0.03], [x, 2.36, front + 0.83], 0.028, "iron", true);
    for (const y of [1.03, 2.32]) k.box("shop-shutter-hinge", [x, y, front + 0.07], [0.1, 0.12, 0.04], "iron");
  }
}

function shopCounter(k: HouseDetailKit, front: number) {
  for (let x = -2.22; x < 0.3; x += 0.23)
    k.box("outside-counter-plank", [x, 0.9, front + 1.1], [0.22, 0.09, 0.76], "wood");
  for (const x of [-2.1, 0.1])
    for (const z of [front + 0.83, front + 1.37]) k.box("counter-leg", [x, 0.43, z], [0.1, 0.86, 0.1]);
  k.beam("counter-stretcher", [-2.1, 0.25, front + 1.1], [0.1, 0.25, front + 1.1], 0.1);
}

export function createHighShopComponent(kind: ShopHouseKind, part: HighShopPart) {
  const k = new HouseDetailKit(`${kind}-${part}-high`);
  const merchant = kind === "merchant-shop-house";
  const cz = merchant ? -1.5 : -1,
    d = merchant ? 5 : 4.5,
    front = cz + d / 2,
    eave = merchant ? 5.2 : 4.8;
  const openings: HouseOpening[] = [
    { u: 1.9, base: 0.25, width: 0.95, height: 2, kind: "door" },
    { u: -1, base: 1.1, width: 2.7, height: 1.15, kind: "shop" },
    ...[-1.7, 1.7].map(u => ({ u, base: merchant ? 3.65 : 3.25, width: 0.85, height: 1.05, kind: "window" as const }))
  ];
  if (part === "shell") {
    house(k, { x: 0, z: cz, w: 6, d, eave, rise: merchant ? 2 : 1.7, openings });
    k.chimneyStack(1.7, cz - 0.7, merchant ? 7.9 : 7.1, eave);
  } else if (part === "shutters") shopShutters(k, front);
  else if (part === "counter") shopCounter(k, front);
  else if (part === "shelves") {
    for (const y of [0.7, 1.75]) {
      k.box("inside-goods-shelf", [-1, y, front - 0.65], [2.7, 0.08, 0.55], "wood");
      for (const x of [-2.2, 0.2])
        k.beam("shelf-bracket", [x, y - 0.3, front - 0.94], [x, y - 0.05, front - 0.4], 0.06);
    }
  } else if (part === "canopy") {
    if (merchant) {
      k.box("awning-wall-ledger", [0, 3, front + 0.03], [5.7, 0.12, 0.14]);
      k.beam("awning-front-rail", [-2.75, 2.74, front + 1.9], [2.75, 2.74, front + 1.9], 0.12);
      for (const x of [-2.65, 2.65]) k.beam("awning-side-rafter", [x, 3, front + 0.03], [x, 2.74, front + 1.9], 0.09);
      // Canvas apron hangs below upper windows; its supporting posts leave the entrance route clear.
      const positions: number[] = [],
        indices: number[] = [];
      for (let row = 0; row <= 12; row++)
        for (let col = 0; col <= 24; col++) {
          const u = col / 24,
            v = row / 12;
          positions.push(-2.85 + u * 5.7, 3.02 - v * 0.28 - 0.08 * Math.sin(v * Math.PI), front + 0.03 + v * 2.1);
        }
      for (let row = 0; row < 12; row++)
        for (let col = 0; col < 24; col++) {
          const a = row * 25 + col;
          indices.push(a, a + 26, a + 1, a, a + 25, a + 26);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      k.add("draped-shop-awning", geo, "cloth");
      for (let seam = 0; seam <= 6; seam++) {
        const x = -2.85 + seam * 0.95;
        const points = Array.from({ length: 17 }, (_, i): readonly [number, number, number] => [
          x,
          3.03 - (i / 16) * 0.28 - 0.08 * Math.sin((i / 16) * Math.PI),
          front + 0.03 + (i / 16) * 2.1
        ]);
        k.tube("awning-seam", points, 0.009, "white");
      }
      for (let panel = 0; panel < 6; panel++) {
        const x = -2.85 + panel * 0.95;
        const hem = new THREE.Shape();
        hem.moveTo(x, 2.74);
        hem.lineTo(x + 0.95, 2.74);
        hem.lineTo(x + 0.95, 2.61);
        hem.quadraticCurveTo(x + 0.475, 2.42, x, 2.61);
        hem.closePath();
        k.add("scalloped-shop-valance", new THREE.ShapeGeometry(hem, 10), "cloth").position.z = front + 2.13;
      }
    } else {
      k.roofCover(-1, front + 1.15, 3.4, 2.1, 2.7, 0.45, "wood");
    }
    for (const x of merchant ? [-2.65, 2.65] : [-2.55, 0.55]) {
      const z = front + 1.9,
        h = merchant ? 2.74 : 2.7;
      k.box("shop-canopy-post", [x, h / 2, z], [0.12, h, 0.12]);
      k.beam("canopy-knee-brace", [x, h - 0.5, z], [x - Math.sign(x + 1) * 0.4, h, z], 0.09);
    }
  } else if (part === "stock") {
    if (merchant) {
      for (let stack = 0; stack < 5; stack++)
        for (let layer = 0; layer < 3; layer++) {
          const x = -2.05 + stack * 0.46,
            y = 1 + layer * 0.065;
          k.box("folded-shop-textile", [x, y, front + 1.1], [0.42, 0.06, 0.55], stack % 2 ? "cloth" : "white");
          for (let fringe = 0; fringe < 8; fringe++)
            k.beam(
              "textile-fringe",
              [x - 0.17 + fringe * 0.05, y, front + 1.39],
              [x - 0.17 + fringe * 0.05, y - 0.03, front + 1.45],
              0.006,
              "cloth",
              true
            );
        }
      for (let i = 0; i < 8; i++)
        k.box("shelf-stock", [-2.15 + i * 0.31, 1.9, front - 0.65], [0.26, 0.22, 0.4], i % 2 ? "cloth" : "white");
      for (let row = 0; row < 4; row++)
        for (const side of [-1, 1])
          k.box("stock-crate-slat", [-1.85, 0.12 + row * 0.12, front + 2.35 + side * 0.3], [0.9, 0.1, 0.04], "wood");
      for (const x of [-2.25, -1.45])
        for (const z of [front + 2.05, front + 2.65]) k.box("crate-corner", [x, 0.28, z], [0.07, 0.56, 0.07]);
      k.box("stock-crate-lid", [-1.85, 0.56, front + 2.35], [0.95, 0.07, 0.65], "wood");
    } else {
      for (let i = 0; i < 6; i++) {
        const x = -2.1 + i * 0.37;
        k.beam("hanging-tool-handle", [x, 1.4, front - 0.15], [x, 1.9, front - 0.15], 0.045, "wood", true);
        k.box("hammer-or-adze-head", [x, 1.9, front - 0.15], [i % 2 ? 0.2 : 0.1, 0.09, i % 2 ? 0.09 : 0.22], "iron");
        k.beam("tool-peg", [x, 2, front - 0.3], [x, 2, front - 0.05], 0.025, "wood", true);
      }
      k.box("woodworking-vice-jaw", [-1.7, 1.05, front + 1.49], [0.45, 0.32, 0.1], "oak");
      k.beam("vice-screw", [-1.7, 0.98, front + 1.18], [-1.7, 0.98, front + 1.7], 0.055, "wood", true);
      k.beam("vice-handle", [-1.7, 0.82, front + 1.72], [-1.7, 1.14, front + 1.72], 0.035, "wood", true);
      for (let i = 0; i < 4; i++)
        k.box("planed-board", [-0.75, 0.98 + i * 0.055, front + 1.05], [1.25, 0.05, 0.2], "wood");
      k.box("wooden-hand-plane", [-0.7, 1.28, front + 1.03], [0.3, 0.12, 0.11], "oak");
      k.box("plane-blade", [-0.66, 1.38, front + 1.03], [0.035, 0.15, 0.09], "iron");
    }
  }
  return compactModel(k.finish());
}

/** The same fitted shutters can dress other compatible shop apertures. */
export { shopShutters as addShopShutters };
