import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";

export type GranaryKind = "raised-timber-granary" | "stone-grain-store";

function sack(k: HouseDetailKit, x: number, y: number, z: number) {
  const profile = [
    [0, 0],
    [0.22, 0],
    [0.31, 0.15],
    [0.33, 0.4],
    [0.28, 0.65],
    [0.09, 0.73],
    [0.07, 0.8],
    [0, 0.81]
  ];
  k.add(
    "filled-grain-sack",
    new THREE.LatheGeometry(
      profile.map(([r, h]) => new THREE.Vector2(r, h)),
      20
    ),
    "cloth"
  ).position.set(x, y, z);
  k.ring("sack-neck-binding", [x, y + 0.745, z], 0.082, 0.014, "oak");
  for (const a of [0, Math.PI]) {
    const points = profile
      .slice(1, -2)
      .map(([r, h]): readonly [number, number, number] => [
        x + (r + 0.004) * Math.cos(a),
        y + h,
        z + (r + 0.004) * Math.sin(a)
      ]);
    k.tube("sack-stitched-seam", points, 0.006, "white");
  }
  k.beam("sack-tie-tail", [x + 0.07, y + 0.75, z], [x + 0.13, y + 0.69, z + 0.04], 0.013, "oak", true);
}

function vents(k: HouseDetailKit, x: number, z: number, angle: number, openings: readonly HouseOpening[]) {
  for (const o of openings) {
    if (o.kind !== "shop") continue;
    for (let row = 0; row < 4; row++) {
      const slat = k.box(
        "open-ventilation-louvre",
        k.point(x, z, angle, o.u, o.base + 0.08 + row * 0.15, -0.05),
        [o.width - 0.06, 0.055, 0.15],
        "wood"
      );
      slat.rotation.set(0.28, angle, 0);
    }
  }
}

function boardJoints(
  k: HouseDetailKit,
  x: number,
  z: number,
  w: number,
  h: number,
  angle: number,
  holes: readonly HouseOpening[]
) {
  for (let u = -w / 2 + 0.15; u < w / 2; u += 0.23) {
    const cuts = [0, h, ...holes.flatMap(o => [o.base, o.base + o.height])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const y = (cuts[i] + cuts[i + 1]) / 2;
      if (
        cuts[i + 1] - cuts[i] < 0.01 ||
        holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.02 && y > o.base && y < o.base + o.height)
      )
        continue;
      k.beam(
        "weatherboard-joint",
        k.point(x, z, angle, u, cuts[i], 0.012),
        k.point(x, z, angle, u, cuts[i + 1], 0.012),
        0.008,
        "oak"
      );
    }
  }
}

function raisedGranary(k: HouseDetailKit) {
  for (const x of [-2, 0, 2])
    for (const z of [-1.6, 1.6]) {
      k.cylinder("tapered-stone-pier", [x, 0.4, z], 0.22, 0.8, "stone", 0.16, 12);
      k.cylinder("broad-pier-cap", [x, 0.9, z], 0.36, 0.2, "stone", 0.5, 24);
    }
  for (const z of [-1.6, 1.6]) k.box("granary-floor-bearer", [0, 1.07, z], [5.35, 0.14, 0.22]);
  for (let x = -2.5; x < 2.7; x += 0.32) k.box("raised-floorboard", [x, 1.18, 0], [0.31, 0.1, 4.45], "wood");
  const shell = new HouseDetailKit("raised-grain-store-shell");
  const front: HouseOpening[] = [
    { u: 0, base: 0.1, width: 1.1, height: 2.05, kind: "door" },
    ...[-1.65, 1.65].map(u => ({ u, base: 1.4, width: 0.65, height: 0.65, kind: "shop" as const }))
  ];
  for (const [x, z, w, angle, holes] of [
    [0, 2.25, 5.5, 0, front],
    [0, -2.25, 5.5, Math.PI, [{ u: 0, base: 1.4, width: 0.7, height: 0.65, kind: "shop" as const }]],
    [-2.75, 0, 4.5, -Math.PI / 2, [{ u: 0, base: 1.4, width: 0.7, height: 0.65, kind: "shop" as const }]],
    [2.75, 0, 4.5, Math.PI / 2, [{ u: 0, base: 1.4, width: 0.7, height: 0.65, kind: "shop" as const }]]
  ] as const) {
    shell.facade("granary-boarded-wall", x, z, w, 2.65, angle, holes, "wood");
    shell.frameWall(x, z, w, 2.65, angle, holes, 0.3);
    boardJoints(shell, x, z, w, 2.65, angle, holes);
    vents(shell, x, z, angle, holes);
  }
  for (const z of [-2.25, 2.25]) shell.box("granary-eaves-plate", [0, 2.7, z], [5.6, 0.18, 0.23]);
  shell.roofCover(0, 0, 5.5, 4.5, 2.78, 1.8, "wood");
  const boardMaterial = shell.pickables.find(mesh => mesh.name === "granary-boarded-wall")!.material;
  for (const mesh of shell.pickables) if (mesh.name === "gable-infill") mesh.material = boardMaterial;
  for (const x of [-1.4, 1.3]) sack(shell, x, 0, -0.7);
  k.attach(shell.finish(), [0, 1.23, 0]);
  for (const x of [-0.46, 0.46]) {
    k.box("stair-foot", [x, 0.05, 4.07], [0.18, 0.1, 0.18]);
    k.beam("removable-stair-stringer", [x, 0.12, 4.07], [x, 1.2, 2.58], 0.11);
  }
  for (let step = 0; step < 6; step++)
    k.box("separate-granary-tread", [0, 0.18 + step * 0.2, 4.0 - step * 0.28], [1.1, 0.09, 0.3], "wood");
}

function doubleDoors(k: HouseDetailKit) {
  for (const side of [-1, 1]) {
    const point = (u: number, y: number, out = 0): readonly [number, number, number] => [
      side * (1.05 - u * Math.cos(1.2)),
      y,
      2 - u * Math.sin(1.2) + out
    ];
    for (let i = 0; i < 6; i++) {
      const leaf = k.box("open-heavy-door-plank", point((i + 0.5) / 6, 1.53), [1 / 6 - 0.008, 2.34, 0.07], "wood");
      leaf.rotation.y = -side * 1.2;
    }
    for (const y of [0.65, 2.35]) {
      k.beam("door-forged-strap", point(0.03, y, 0.055), point(0.86, y, 0.055), 0.06, "iron");
      for (const u of [0.2, 0.5, 0.8]) k.sphere("door-iron-rivet", point(u, y, 0.07), [0.02, 0.02, 0.02], "iron");
    }
    k.beam("door-back-ledger", point(0.08, 0.5, -0.08), point(0.9, 2.5, -0.08), 0.09);
  }
}

function stoneStore(k: HouseDetailKit) {
  k.box("grain-store-plinth", [0, 0.14, -0.5], [7, 0.28, 5], "stone");
  const front: HouseOpening[] = [
    { u: 0, base: 0.3, width: 2.1, height: 2.5, kind: "shop" },
    { u: 0, base: 3.2, width: 1.3, height: 1.15, kind: "shop" },
    ...[-2.35, 2.35].map(u => ({ u, base: 3.5, width: 0.6, height: 0.65, kind: "shop" as const }))
  ];
  for (const [x, z, w, angle, holes] of [
    [0, 2, 7, 0, front],
    [0, -3, 7, Math.PI, [{ u: 0, base: 3.5, width: 0.7, height: 0.65, kind: "shop" as const }]],
    [
      -3.5,
      -0.5,
      5,
      -Math.PI / 2,
      [-1, 1].map(u => ({ u, base: 3.5, width: 0.6, height: 0.65, kind: "shop" as const }))
    ],
    [3.5, -0.5, 5, Math.PI / 2, [-1, 1].map(u => ({ u, base: 3.5, width: 0.6, height: 0.65, kind: "shop" as const }))]
  ] as const) {
    k.facade("stone-grain-store-wall", x, z, w, 4.8, angle, holes, "stone");
    vents(
      k,
      x,
      z,
      angle,
      holes.filter(o => o.width < 1)
    );
    for (let y = 0.45; y < 4.8; y += 0.3)
      for (let u = -w / 2 + 0.22; u < w / 2 - 0.1; u += 0.5) {
        if (
          holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.22 && y > o.base - 0.15 && y < o.base + o.height + 0.15)
        )
          continue;
        const block = k.box("granary-dressed-stone", k.point(x, z, angle, u, y, 0.012), [0.47, 0.28, 0.035], "stone");
        block.rotation.y = angle;
      }
  }
  k.box("grain-store-upper-floor", [0, 2.95, -0.5], [6.8, 0.14, 4.8], "wood");
  for (const z of [-3, 2]) k.box("stone-store-eaves", [0, 4.86, z], [7.1, 0.2, 0.25], "stone");
  k.roofCover(0, -0.5, 7, 5, 4.92, 1.8, "tile");
  doubleDoors(k);
  for (let i = 0; i < 6; i++)
    k.box("open-loading-hatch-board", [-1.25 + (i - 2.5) * 0.19, 3.77, 2.12], [0.18, 1.1, 0.055], "wood");
  k.box("raised-receiving-apron", [0, 0.15, 3], [3.2, 0.3, 1.9], "stone");
  k.beam("hoist-bearing-jib", [0.9, 4.45, 1.55], [0.9, 4.45, 3.5], 0.15);
  k.beam("hoist-triangular-brace", [0.9, 3.65, 2.05], [0.9, 4.4, 3.25], 0.11);
  const pulley = k.ring("hoist-iron-pulley", [0.9, 4.37, 3.35], 0.13, 0.025, "iron", true);
  pulley.rotation.y = Math.PI / 2;
  k.beam("hoist-rope-tail", [0.9, 4.35, 2.25], [0.9, 4.51, 3.35], 0.02, "cloth", true);
  const points = Array.from({ length: 9 }, (_, i): readonly [number, number, number] => [
    0.9,
    4.37 + 0.14 * Math.cos(((i / 8) * Math.PI) / 2),
    3.35 + 0.14 * Math.sin(((i / 8) * Math.PI) / 2)
  ]);
  k.tube("hoist-rope-on-sheave", points, 0.011, "cloth");
  k.beam("hanging-hoist-rope", [0.9, 4.37, 3.49], [0.9, 1.13, 3.49], 0.02, "cloth", true);
  const hook = k.add("sack-hoist-hook", new THREE.TorusGeometry(0.065, 0.012, 8, 24, Math.PI * 1.65), "iron");
  hook.position.set(0.9, 1.08, 3.49);
  for (const [x, z] of [
    [-1.05, 3],
    [-0.35, 3],
    [0.9, 3.49]
  ])
    sack(k, x, 0.3, z);
}

export function createHighGranary(kind: GranaryKind) {
  const k = new HouseDetailKit(`${kind}-high`);
  if (kind === "raised-timber-granary") raisedGranary(k);
  else stoneStore(k);
  return compactModel(k.finish());
}
