import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";

export type WarehouseKind = "merchant-warehouse" | "riverside-goods-store";

function doors(k: HouseDetailKit, front: number, base: number, width: number, height: number) {
  for (const side of [-1, 1]) {
    const w = width / 2 - 0.06;
    const point = (u: number, y: number, out = 0): readonly [number, number, number] => [
      side * (width / 2 - u * Math.cos(1.25)),
      y,
      front - u * Math.sin(1.25) + out
    ];
    for (let i = 0; i < 7; i++) {
      const plank = k.box(
        "open-freight-door-plank",
        point(((i + 0.5) * w) / 7, base + height / 2),
        [w / 7 - 0.007, height - 0.07, 0.07],
        "wood"
      );
      plank.rotation.y = -side * 1.25;
    }
    for (const y of [base + 0.35, base + height - 0.35]) {
      k.beam("freight-door-iron-strap", point(0.03, y, 0.055), point(w * 0.9, y, 0.055), 0.06, "iron");
      for (const u of [w * 0.2, w * 0.5, w * 0.8])
        k.sphere("door-rosehead-rivet", point(u, y, 0.075), [0.02, 0.02, 0.02], "iron");
    }
    k.beam(
      "door-compression-brace",
      point(0.08, base + 0.18, -0.08),
      point(w - 0.08, base + height - 0.18, -0.08),
      0.095
    );
  }
}

function wallDetails(
  k: HouseDetailKit,
  x: number,
  z: number,
  width: number,
  height: number,
  angle: number,
  holes: readonly HouseOpening[],
  timber: boolean
) {
  k.facade("warehouse-wall", x, z, width, height, angle, holes, timber ? "wood" : "stone");
  if (timber) k.frameWall(x, z, width, height, angle, holes, 0.3);
  for (let y = 0.45; y < height; y += timber ? 0.45 : 0.32)
    for (let u = -width / 2 + 0.22; u < width / 2 - 0.1; u += 0.5) {
      if (holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.22 && y > o.base - 0.17 && y < o.base + o.height + 0.17))
        continue;
      const patch = k.box(
        timber ? "timber-board-joint" : "warehouse-masonry-course",
        k.point(x, z, angle, u, y, 0.012),
        timber ? [0.008, 0.43, 0.015] : [0.47, 0.018, 0.014],
        timber ? "oak" : "white"
      );
      patch.rotation.y = angle;
    }
  for (const o of holes.filter(o => o.width < 1))
    for (let row = 0; row < 3; row++) {
      const louvre = k.box(
        "warehouse-open-vent-slat",
        k.point(x, z, angle, o.u, o.base + 0.12 + row * 0.22, -0.05),
        [o.width - 0.06, 0.06, 0.15],
        "wood"
      );
      louvre.rotation.set(0.28, angle, 0);
    }
}

function crate(k: HouseDetailKit, x: number, y: number, z: number, size = 0.9) {
  k.box("crate-base", [x, y + 0.07, z], [size, 0.14, size * 0.85], "wood");
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      k.box("crate-front-slat", [x, y + 0.22 + row * 0.17, z + side * size * 0.425], [size, 0.15, 0.045], "wood");
      k.box("crate-end-slat", [x + (side * size) / 2, y + 0.22 + row * 0.17, z], [0.045, 0.15, size * 0.85], "wood");
    }
    for (const zz of [-size * 0.4, size * 0.4])
      k.box("crate-corner-batten", [x + side * (size / 2 - 0.05), y + 0.43, z + zz], [0.075, 0.86, 0.075]);
  }
  for (let i = 0; i < 5; i++)
    k.box("crate-lid-plank", [x - size * 0.4 + i * size * 0.2, y + 0.86, z], [size * 0.19, 0.055, size * 0.9], "wood");
  for (const zz of [-size * 0.27, size * 0.27]) k.box("crate-lid-batten", [x, y + 0.91, z + zz], [size, 0.045, 0.07]);
}

function cask(k: HouseDetailKit, x: number, y: number, z: number) {
  const profile = [
    [0, 0],
    [0.3, 0],
    [0.36, 0.15],
    [0.39, 0.42],
    [0.36, 0.7],
    [0.31, 0.85],
    [0.28, 0.85],
    [0.28, 0.1],
    [0, 0.1]
  ];
  k.add(
    "warehouse-bulging-cask",
    new THREE.LatheGeometry(
      profile.map(([r, h]) => new THREE.Vector2(r, h)),
      28
    ),
    "wood"
  ).position.set(x, y, z);
  for (const [yy, r] of [
    [0.13, 0.355],
    [0.42, 0.39],
    [0.72, 0.35]
  ])
    k.ring("cargo-cask-hoop", [x, y + yy, z], r + 0.008, 0.018, "iron");
  k.cylinder("closed-cask-head", [x, y + 0.85, z], 0.285, 0.045, "wood", 0.285, 28);
  k.cylinder("cargo-cask-bung", [x + 0.07, y + 0.89, z], 0.035, 0.025, "oak", 0.035, 10);
}

function hoist(k: HouseDetailKit, x: number, front: number, top: number, nose: number, loadBase: number) {
  k.beam("hoist-bearing-beam", [x, top, front - 0.8], [x, top, nose + 0.2], 0.2);
  k.beam("hoist-triangular-strut", [x, top - 0.85, front + 0.04], [x, top - 0.04, nose - 0.6], 0.13);
  k.box("hoist-wall-socket", [x, top - 0.75, front + 0.04], [0.36, 0.45, 0.28], "iron");
  const pulley = k.ring("hoist-grooved-sheave", [x, top - 0.16, nose], 0.17, 0.03, "iron", true);
  pulley.rotation.y = Math.PI / 2;
  k.cylinder("hoist-sheave-axle", [x, top - 0.16, nose], 0.045, 0.3, "iron", 0.045, 12).rotation.z = Math.PI / 2;
  k.beam("hoist-return-rope", [x, top - 0.06, front + 0.2], [x, top + 0.03, nose], 0.022, "cloth", true);
  const points = Array.from({ length: 11 }, (_, i): readonly [number, number, number] => [
    x,
    top - 0.16 + 0.19 * Math.cos(((i / 10) * Math.PI) / 2),
    nose + 0.19 * Math.sin(((i / 10) * Math.PI) / 2)
  ]);
  k.tube("rope-around-sheave", points, 0.012, "cloth");
  k.beam("hanging-load-rope", [x, top - 0.16, nose + 0.19], [x, loadBase + 1.17, nose + 0.19], 0.022, "cloth", true);
  k.ring("lifting-hook-eye", [x, loadBase + 1.12, nose + 0.19], 0.06, 0.012, "iron", true);
  for (const side of [-1, 1])
    k.beam(
      "crate-lifting-sling",
      [x, loadBase + 1.1, nose + 0.19],
      [x + side * 0.36, loadBase + 0.75, nose + 0.19],
      0.018,
      "cloth",
      true
    );
  crate(k, x, loadBase, nose + 0.19, 0.7);
}

function rainCanopy(k: HouseDetailKit, front: number, width: number, reach: number, height: number, platform: number) {
  const far = front + reach,
    fall = 0.28,
    angle = Math.atan2(fall, reach);
  for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) {
    k.box("canopy-stone-foot", [x, platform + 0.08, far - 0.15], [0.27, 0.16, 0.27], "stone");
    k.box(
      "canopy-support-post",
      [x, (platform + height - fall) / 2, far - 0.15],
      [0.13, height - fall - platform, 0.13]
    );
    k.beam("canopy-side-rafter", [x, height, front], [x, height - fall, far], 0.12);
    k.beam(
      "canopy-post-brace",
      [x, height - fall - 0.55, far - 0.15],
      [x - Math.sign(x) * 0.45, height - fall, far - 0.15],
      0.085
    );
  }
  k.beam("canopy-wall-ledger", [-width / 2, height, front], [width / 2, height, front], 0.14);
  k.beam("canopy-front-rail", [-width / 2, height - fall, far], [width / 2, height - fall, far], 0.14);
  for (let x = -width / 2 + 0.12; x < width / 2 - 0.1; x += 0.23) {
    const board = k.box(
      "canopy-overlapping-board",
      [x, height - fall / 2, (front + far) / 2],
      [0.24, 0.05, Math.hypot(reach, fall)],
      "wood"
    );
    board.rotation.x = angle;
    k.beam("canopy-board-grain", [x - 0.04, height + 0.03, front], [x - 0.03, height - fall + 0.03, far], 0.006, "oak");
  }
}

export function createHighWarehouse(kind: WarehouseKind) {
  const k = new HouseDetailKit(`${kind}-high`),
    large = kind === "merchant-warehouse",
    width = large ? 10 : 9,
    depth = large ? 7 : 6,
    eave = large ? 7.8 : 4,
    front = -1 + depth / 2,
    platform = large ? 0.6 : 0.2;
  k.box("warehouse-foundation", [0, 0.1, -1], [width, 0.2, depth], "stone");
  const openings: HouseOpening[] = [
    { u: 0, base: large ? 0.65 : 0.25, width: large ? 2.8 : 3, height: large ? 2.2 : 2.5, kind: "shop" }
  ];
  if (large)
    for (const base of [3.4, 5.9])
      openings.push({ u: 0, base, width: 1.8, height: base === 3.4 ? 1.8 : 1.55, kind: "shop" });
  for (const u of large ? [-3.6, 3.6] : [-3, 3])
    for (const base of large ? [1.3, 4, 6.4] : [2.7])
      openings.push({ u, base, width: 0.75, height: 0.8, kind: "shop" });
  for (const [x, z, w, angle, holes] of [
    [0, front, width, 0, openings],
    [
      0,
      -1 - depth / 2,
      width,
      Math.PI,
      [-width * 0.3, width * 0.3].flatMap(u =>
        (large ? [1.3, 4, 6.4] : [2.7]).map(base => ({ u, base, width: 0.75, height: 0.8, kind: "shop" as const }))
      )
    ],
    [
      -width / 2,
      -1,
      depth,
      -Math.PI / 2,
      (large ? [1.3, 4, 6.4] : [2.7]).map(base => ({ u: 0, base, width: 0.75, height: 0.8, kind: "shop" as const }))
    ],
    [
      width / 2,
      -1,
      depth,
      Math.PI / 2,
      (large ? [1.3, 4, 6.4] : [2.7]).map(base => ({ u: 0, base, width: 0.75, height: 0.8, kind: "shop" as const }))
    ]
  ] as const)
    wallDetails(k, x, z, w, eave, angle, holes, !large);
  doors(k, front, large ? 0.65 : 0.25, large ? 2.8 : 3, large ? 2.2 : 2.5);
  if (large) for (const base of [3.4, 5.9]) doors(k, front, base, 1.8, base === 3.4 ? 1.8 : 1.55);
  if (large)
    for (const y of [3.2, 5.65]) k.box("warehouse-upper-floor", [0, y, -1], [width - 0.25, 0.16, depth - 0.25], "wood");
  for (const z of [-1 - depth / 2, front])
    k.box("warehouse-eaves-plate", [0, eave + 0.05, z], [width + 0.1, 0.2, 0.25], large ? "stone" : "oak");
  k.roofCover(0, -1, width, depth, eave + 0.12, large ? 2.8 : 2, large ? "tile" : "wood");
  if (!large) {
    const boardMaterial = k.pickables.find(mesh => mesh.name === "warehouse-wall")!.material;
    for (const mesh of k.pickables) if (mesh.name === "gable-infill") mesh.material = boardMaterial;
  }
  k.box("receiving-platform", [0, platform / 2, front + 1.5], [7.6, platform, 3.4], "stone");
  rainCanopy(k, front + 0.03, large ? 8 : 6.5, large ? 2.3 : 2.65, large ? 3.3 : 3.02, platform);
  if (large) {
    for (let i = 0; i < 3; i++)
      k.box("receiving-step", [0, 0.1 + i * 0.2, front + 3.85 - i * 0.28], [2.4, 0.2, 0.3], "stone");
    hoist(k, 0.8, front, 7.6, 5.05, platform);
    crate(k, -2.7, platform, front + 1.2);
    crate(k, -2.7, platform + 0.94, front + 1.2);
    crate(k, 2.5, platform, front + 1.15);
    cask(k, -2, platform, front + 2.3);
    cask(k, 3, platform, front + 2.4);
  } else {
    k.box("hand-hoist-foot", [3.4, platform + 0.1, front + 0.2], [0.4, 0.2, 0.4], "stone");
    k.box("hand-hoist-post", [3.4, (platform + 3.85) / 2, front + 0.2], [0.2, 3.85 - platform, 0.2]);
    hoist(k, 3.4, front, 3.85, 4.25, platform);
    for (const x of [-2.25, -1.15]) crate(k, x, platform, front + 1.25);
    cask(k, 2, platform, front + 1.1);
  }
  return compactModel(k.finish());
}
