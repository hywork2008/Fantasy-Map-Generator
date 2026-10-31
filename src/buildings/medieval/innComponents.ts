import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";

export type InnKind = "roadside-inn" | "courtyard-hostelry";

function lodging(k: HouseDetailKit, large: boolean) {
  const width = large ? 13 : 9,
    height = 5.2;
  k.box("lodging-stone-plinth", [0, 0.1, -3], [width, 0.2, 5], "stone");
  const front: HouseOpening[] = [
    { u: 0, base: 0.25, width: 1.35, height: 2.1, kind: "door" },
    ...(large ? [-5, -2.7, 2.7, 5] : [-3, 3]).map(u => ({
      u,
      base: 1.25,
      width: 0.8,
      height: 1,
      kind: "window" as const
    })),
    ...(large ? [-5, -2.5, 0, 2.5, 5] : [-3, 0, 3]).map(u => ({
      u,
      base: 3.55,
      width: 0.85,
      height: 1.05,
      kind: "window" as const
    }))
  ];
  const rear: HouseOpening[] = [-width * 0.3, 0, width * 0.3].map(u => ({
    u,
    base: 3.55,
    width: 0.75,
    height: 1.05,
    kind: "window"
  }));
  for (const [x, z, w, angle, openings] of [
    [0, -0.5, width, 0, front],
    [0, -5.5, width, Math.PI, rear],
    [-width / 2, -3, 5, -Math.PI / 2, [{ u: 0, base: 3.55, width: 0.75, height: 1.05, kind: "window" as const }]],
    [width / 2, -3, 5, Math.PI / 2, [{ u: 0, base: 3.55, width: 0.75, height: 1.05, kind: "window" as const }]]
  ] as const) {
    k.facade("lodging-plaster-wall", x, z, w, height, angle, openings);
    k.frameWall(x, z, w, height, angle, openings);
  }
  k.box("lodging-upper-floor", [0, 2.65, -3], [width - 0.2, 0.16, 4.8], "wood");
  for (let x = -width / 2 + 0.3; x < width / 2; x += 0.45)
    k.box("upper-floor-joist-end", [x, 2.56, -0.43], [0.11, 0.18, 0.34]);
  k.roofCover(0, -3, width, 5, 5.32, 2, "tile");
  k.chimneyStack(-2, -3, 8.2, 4.6);
}

function stable(k: HouseDetailKit) {
  k.box("stable-compacted-floor", [-6, 0.08, 2], [3, 0.16, 5], "earth");
  // The long open side faces the courtyard (+X), with the stall backs against the west wall.
  for (let z = -0.42; z < 4.5; z += 0.22) k.box("stable-back-board", [-7.44, 1.38, z], [0.075, 2.6, 0.205], "wood");
  for (const x of [-7.45, -4.55])
    for (const z of [-0.45, 1.2, 2.85, 4.45]) {
      k.box("stable-post-foot", [x, 0.1, z], [0.32, 0.2, 0.32], "stone");
      k.box("stable-oak-post", [x, 1.45, z], [0.14, 2.7, 0.14]);
      if (z < 4.4) k.beam("stable-knee-brace", [x, 2.15, z], [x, 2.7, z + 0.5], 0.1);
    }
  for (const z of [-0.45, 1.2, 2.85, 4.45]) {
    for (let x = -7.3; x < -4.6; x += 0.23) k.box("stall-partition-pale", [x, 0.78, z], [0.215, 1.25, 0.06], "wood");
    k.beam("stall-partition-top", [-7.4, 1.45, z], [-4.55, 1.45, z], 0.1);
  }
  for (const [z, postZ] of [
    [0.35, -0.45],
    [2.025, 1.2],
    [3.65, 2.85]
  ]) {
    k.box("manger-bottom", [-7.05, 0.65, z], [0.55, 0.1, 1.05], "wood");
    for (const zz of [z - 0.35, z + 0.35]) k.box("manger-leg", [-7.05, 0.3, zz], [0.09, 0.6, 0.09]);
    for (const side of [-1, 1]) {
      k.box("manger-long-rim", [-7.05 + side * 0.275, 0.85, z], [0.065, 0.4, 1.1], "wood");
      k.box("manger-end", [-7.05, 0.85, z + side * 0.525], [0.55, 0.4, 0.06], "wood");
    }
    for (let i = 0; i < 7; i++) {
      const zz = z - 0.45 + i * 0.15;
      k.beam("stable-hayrack-bar", [-7.25, 1.1, zz], [-7.35, 1.95, zz], 0.035, "wood", true);
      k.beam("manger-hay", [-7.1, 0.77, zz], [-6.9, 0.91, zz + 0.08], 0.025, "straw", true);
    }
    k.beam("hayrack-top", [-7.35, 1.95, z - 0.5], [-7.35, 1.95, z + 0.5], 0.065);
    k.ring("stable-tether-ring", [-4.45, 1.4, postZ], 0.075, 0.015, "iron", true).rotation.y = Math.PI / 2;
  }
  for (const x of [-7.45, -4.55]) k.beam("stable-wall-plate", [x, 2.8, -0.5], [x, 2.8, 4.5], 0.16);
  k.roofCover(-6, 2, 3, 5, 2.9, 1, "wood");
}

function serviceWing(k: HouseDetailKit) {
  k.box("service-wing-plinth", [6, 0.1, 2], [3, 0.2, 5], "stone");
  const court: HouseOpening[] = [
    { u: 0, base: 0.25, width: 1.1, height: 2, kind: "door" },
    ...[-1.55, 1.55].map(u => ({ u, base: 3.1, width: 0.75, height: 0.95, kind: "window" as const }))
  ];
  for (const [x, z, width, angle, holes] of [
    [4.5, 2, 5, -Math.PI / 2, court],
    [7.5, 2, 5, Math.PI / 2, [{ u: 0, base: 3.1, width: 0.75, height: 0.95, kind: "window" as const }]],
    [6, -0.5, 3, Math.PI, []],
    [6, 4.5, 3, 0, [{ u: 0, base: 3.1, width: 0.75, height: 0.95, kind: "window" as const }]]
  ] as const) {
    k.facade("service-wing-wall", x, z, width, 4.6, angle, holes);
    k.frameWall(x, z, width, 4.6, angle, holes, 2.45);
  }
  k.box("service-upper-floor", [6, 2.48, 2], [2.8, 0.14, 4.8], "wood");
  k.roofCover(6, 2, 3, 5, 4.72, 1.5, "tile");
}

function yardTable(k: HouseDetailKit, x: number, z: number) {
  for (let xx = x - 1.18; xx < x + 1.25; xx += 0.22)
    k.box("inn-table-plank", [xx, 0.85, z], [0.21, 0.09, 0.95], "wood");
  for (const xx of [x - 1, x + 1])
    for (const zz of [z - 0.34, z + 0.34]) k.box("table-leg", [xx, 0.4, zz], [0.1, 0.8, 0.1]);
  k.beam("table-stretcher", [x - 1, 0.24, z], [x + 1, 0.24, z], 0.09);
  for (const side of [-1, 1]) {
    k.box("yard-bench-seat", [x, 0.5, z + side * 0.88], [2.7, 0.12, 0.32], "wood");
    for (const xx of [x - 1, x + 1]) k.box("bench-leg", [xx, 0.24, z + side * 0.88], [0.12, 0.48, 0.25]);
  }
  for (const dx of [-0.7, 0.6]) {
    k.vessel("table-drinking-cup", [x + dx, 0.9, z], 0.075, 0.14, "wood");
    k.ring("cup-handle", [x + dx + 0.085, 0.98, z], 0.045, 0.012, "wood", true);
  }
}

function barrel(k: HouseDetailKit, x: number, z: number) {
  const profile = [
    [0, 0],
    [0.3, 0],
    [0.34, 0.12],
    [0.38, 0.4],
    [0.34, 0.7],
    [0.31, 0.82],
    [0.28, 0.82],
    [0.28, 0.08],
    [0, 0.08]
  ];
  k.add(
    "bulging-stave-barrel",
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      32
    ),
    "wood"
  ).position.set(x, 0, z);
  for (const [y, r] of [
    [0.11, 0.34],
    [0.4, 0.38],
    [0.72, 0.337]
  ])
    k.ring("barrel-iron-hoop", [x, y, z], r + 0.008, 0.018, "iron");
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    const points = Array.from({ length: 9 }, (_, j): readonly [number, number, number] => {
      const y = 0.006 + j * 0.1,
        r = 0.31 + 0.07 * Math.sin((y / 0.8) * Math.PI);
      return [x + Math.cos(a) * (r + 0.005), y, z + Math.sin(a) * (r + 0.005)];
    });
    k.tube("barrel-stave-joint", points, 0.005, "oak");
  }
  for (let xx = -0.25; xx <= 0.25; xx += 0.1) {
    const half = Math.sqrt(0.29 ** 2 - xx ** 2);
    k.box("barrel-lid-plank", [x + xx, 0.825, z], [0.095, 0.045, half * 2], "wood");
  }
  k.cylinder("barrel-bung", [x, 0.857, z], 0.035, 0.025, "oak", 0.035, 12);
}

function sign(k: HouseDetailKit) {
  k.beam("inn-sign-wall-arm", [2, 3.2, -0.45], [2, 3.2, 0.95], 0.065, "iron");
  k.beam("sign-arm-brace", [2, 2.7, -0.45], [2, 3.18, 0.55], 0.045, "iron");
  k.beam("sign-crossbar", [1.65, 3.2, 0.95], [2.35, 3.2, 0.95], 0.045, "iron");
  for (const x of [1.72, 2.28]) {
    for (let link = 0; link < 3; link++) {
      const ring = k.ring("sign-suspension-link", [x, 3.12 - link * 0.075, 0.95], 0.045, 0.008, "iron", true);
      if (link % 2) ring.rotation.y = Math.PI / 2;
    }
  }
  for (let board = 0; board < 4; board++)
    k.box("inn-signboard-plank", [1.7 + board * 0.2, 2.6, 0.95], [0.19, 0.7, 0.06], "wood");
  for (const y of [2.32, 2.88]) k.box("signboard-iron-band", [2, y, 0.99], [0.84, 0.035, 0.025], "iron");
  k.box("carved-tankard-symbol", [1.98, 2.61, 1.005], [0.22, 0.28, 0.025], "straw");
  k.ring("tankard-symbol-handle", [2.13, 2.61, 1.02], 0.075, 0.018, "straw", true);
}

export type InnPart =
  | "lodging"
  | "courtyard"
  | "stable"
  | "service-wing"
  | "yard-furniture"
  | "barrel"
  | "sign"
  | "gate";

export function createHighInnComponent(kind: InnKind, part: InnPart) {
  const k = new HouseDetailKit(`${kind}-${part}-high`);
  const large = kind === "courtyard-hostelry";
  if (part === "courtyard") {
    k.box("courtyard-base", [0, 0.035, 2], [large ? 14 : 10, 0.07, 7], "stone");
    // Shallow paving joints do not form raised obstacles across the entrance route.
    for (let z = -1.25; z < 5.5; z += 0.5)
      k.box("paving-cross-joint", [0, 0.071, z], [large ? 14 : 10, 0.003, 0.012], "white");
    for (let x = large ? -6.75 : -4.75; x < (large ? 7 : 5); x += 0.5)
      k.box("paving-long-joint", [x, 0.071, 2], [0.012, 0.003, 7], "white");
  } else if (part === "lodging") lodging(k, large);
  else if (part === "stable") stable(k);
  else if (part === "service-wing" && large) serviceWing(k);
  else if (part === "yard-furniture") {
    yardTable(k, -2.25, 2);
    if (large) yardTable(k, 2.75, 3.2);
  } else if (part === "barrel") barrel(k, 3, 0.6);
  else if (part === "sign") sign(k);
  else if (part === "gate") {
    if (large) {
      k.fence([-4.3, 5.2], [-1.5, 5.2], 1.2);
      k.fence([1.5, 5.2], [4.3, 5.2], 1.2);
      for (const x of [-1.5, 1.5]) k.box("court-gate-pier", [x, 0.65, 5.2], [0.24, 1.3, 0.24], "stone");
    }
  }
  return compactModel(k.finish());
}
