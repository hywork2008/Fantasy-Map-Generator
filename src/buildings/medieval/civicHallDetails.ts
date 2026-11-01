import * as THREE from "three";
import { compactModel } from "../compactModel";
import { type CivicHallKind, civicHallProfile } from "./civicHallProfile";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";
import { cutRoofRectangle } from "./roofCut";
import { addCraftBench } from "./workshopDetailKit";

export type { CivicHallKind } from "./civicHallProfile";

function arcade(k: HouseDetailKit, w: number, d: number) {
  const facade = (x: number, z: number, width: number, bays: number, angle: number) => {
    const bay = width / bays;
    for (let i = 0; i <= bays; i++) {
      const u = -width / 2 + i * bay;
      for (const [y, h, size] of [
        [0.15, 0.3, 0.58],
        [1.15, 1.7, 0.38],
        [2.02, 0.16, 0.58]
      ]) {
        const pier = k.box("loggia-pier", k.point(x, z, angle, u, y), [size, h, size], "stone");
        pier.rotation.y = angle;
      }
    }
    for (let i = 0; i < bays; i++) {
      const centre = -width / 2 + (i + 0.5) * bay,
        radius = bay / 2 - 0.22,
        spring = 2.1,
        rise = 0.69;
      const shape = new THREE.Shape();
      shape.moveTo(-bay / 2, 3.12);
      shape.lineTo(bay / 2, 3.12);
      shape.lineTo(bay / 2, spring);
      shape.lineTo(radius, spring);
      for (let j = 1; j <= 32; j++) {
        const a = (j * Math.PI) / 32;
        shape.lineTo(Math.cos(a) * radius, spring + Math.sin(a) * rise);
      }
      shape.lineTo(-bay / 2, spring);
      shape.closePath();
      const arch = k.add(
        "open-loggia-arch",
        new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: false }),
        "stone"
      );
      arch.rotation.y = angle;
      arch.position.set(...k.point(x, z, angle, centre, 0, -0.19));
      for (let j = 1; j < 12; j++) {
        const a = (j * Math.PI) / 12;
        k.beam(
          "arch-radial-joint",
          k.point(x, z, angle, centre + Math.cos(a) * radius, spring + Math.sin(a) * rise, 0.195),
          k.point(x, z, angle, centre + Math.cos(a) * (radius + 0.16), spring + Math.sin(a) * (rise + 0.16), 0.195),
          0.009,
          "earth"
        );
      }
    }
  };
  for (const z of [-d / 2, d / 2]) facade(0, z, w, 4, z > 0 ? 0 : Math.PI);
  for (const x of [-w / 2, w / 2]) facade(x, 0, d, 2, x > 0 ? Math.PI / 2 : -Math.PI / 2);
}

function timberSupports(k: HouseDetailKit, w: number, d: number) {
  for (let i = 0; i <= 5; i++)
    for (const z of [-d / 2, d / 2]) {
      const x = -w / 2 + (i * w) / 5;
      k.box("market-post-pad", [x, 0.14, z], [0.52, 0.28, 0.52], "stone");
      k.box("market-load-bearing-post", [x, 1.7, z], [0.24, 2.9, 0.24], "oak");
      k.box("market-post-cap", [x, 3.08, z], [0.45, 0.2, 0.4], "wood");
      for (const side of [-1, 1])
        if (x + side * 0.65 >= -w / 2 && x + side * 0.65 <= w / 2)
          k.beam("market-knee-brace", [x, 2.35, z], [x + side * 0.65, 3.07, z], 0.14);
      if (z > 0) k.beam("market-cross-tie", [x, 3.04, -d / 2], [x, 3.04, d / 2], 0.2);
    }
}

function balcony(k: HouseDetailKit, front: number) {
  k.box("meeting-balcony-floor", [0, 3.23, front + 0.66], [3, 0.18, 1.5], "stone");
  for (const x of [-1.1, 1.1]) {
    k.box("balcony-support-pier", [x, 1.57, front + 0.98], [0.22, 3.14, 0.28], "stone");
    k.beam("balcony-wall-bracket", [x, 2.45, front], [x, 3.14, front + 0.8], 0.16, "oak");
  }
  for (let i = 0; i < 9; i++)
    k.box("balcony-baluster", [-1.4 + i * 0.35, 3.79, front + 1.35], [0.085, 0.94, 0.085], "wood");
  k.box("balcony-front-rail", [0, 4.28, front + 1.35], [3, 0.1, 0.12], "oak");
  for (const side of [-1, 1]) {
    k.box("balcony-side-rail", [side * 1.45, 4.28, front + 0.65], [0.1, 0.1, 1.4], "oak");
    for (const z of [front + 0.25, front + 0.75])
      k.box("balcony-side-baluster", [side * 1.45, 3.79, z], [0.085, 0.94, 0.085], "wood");
  }
}

function bellTurret(k: HouseDetailKit) {
  // Continuous posts carry the turret down to the assembly floor.
  for (const x of [-0.69, 0.69])
    for (const z of [-0.69, 0.69]) {
      k.box("turret-bearing-post", [x, 7.65, z], [0.17, 8.66, 0.17], "oak");
      for (const y of [9.8, 11.9]) k.beam("turret-brace", [x, y - 0.45, z], [x > 0 ? x - 0.45 : x + 0.45, y, z], 0.1);
    }
  for (const z of [-0.78, 0.78]) k.box("turret-lower-wall", [0, 8.75, z], [1.7, 2.3, 0.16], "stone");
  for (const x of [-0.78, 0.78]) k.box("turret-lower-wall", [x, 8.75, 0], [0.16, 2.3, 1.7], "stone");
  k.box("bell-platform", [0, 9.88, 0], [1.65, 0.16, 1.65], "wood");
  k.beam("bell-yoke", [-0.75, 11.52, 0], [0.75, 11.52, 0], 0.18);
  const profile = [
    [0.34, 0],
    [0.41, 0.06],
    [0.34, 0.16],
    [0.23, 0.46],
    [0.17, 0.62],
    [0, 0.68],
    [0, 0.6],
    [0.12, 0.55],
    [0.18, 0.42],
    [0.29, 0.12],
    [0.34, 0.07],
    [0.34, 0]
  ];
  k.add(
    "hollow-civic-bell",
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      40
    ),
    "iron"
  ).position.set(0, 10.65, 0);
  k.beam("bell-hanger", [0, 11.27, 0], [0, 11.52, 0], 0.065, "iron", true);
  k.beam("bell-clapper", [0, 10.65, 0], [0, 11.1, 0], 0.04, "iron", true);
  k.sphere("clapper-ball", [0, 10.68, 0], [0.075, 0.075, 0.075], "iron");
  for (const z of [-0.69, 0.69]) k.box("turret-eaves-bearing", [0, 12.02, z], [1.7, 0.16, 0.2], "oak");
  for (const x of [-0.69, 0.69]) k.box("turret-eaves-bearing", [x, 12.02, 0], [0.2, 0.16, 1.7], "oak");
  k.roofCover(0, 0, 1.85, 1.85, 12.05, 1.05, "tile");
}

export function createHighCivicHallBody(kind: CivicHallKind, dressing = true) {
  const k = new HouseDetailKit(`${kind}-civic-hall-high`);
  const profile = civicHallProfile(kind),
    w = profile.width,
    d = profile.depth,
    wallH = profile.upperWall;
  k.box("civic-paved-foundation", [0, 0.07, 0], [w + 0.6, 0.14, d + 0.6], "stone");
  if (profile.support === "timber-posts") timberSupports(k, w, d);
  else arcade(k, w, d);
  for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5)
    k.box("upper-floor-joist", [x, 3.05, 0], [0.18, 0.22, d + 0.12], "oak");
  k.box("assembly-floor", [0, 3.23, 0], [w + 0.14, 0.18, d + 0.14], "wood");
  const upper = new HouseDetailKit("upper-assembly-shell");
  const front: HouseOpening[] = [
    { u: 0, base: 0, width: 1.25, height: 2.15, kind: "door" },
    ...[-w * 0.32, -w * 0.16, w * 0.16, w * 0.32].map(u => ({
      u,
      base: 1.05,
      width: 0.85,
      height: 1.3,
      kind: "window" as const
    }))
  ];
  for (const [x, z, width, angle, holes] of [
    [0, d / 2, w, 0, front],
    [
      0,
      -d / 2,
      w,
      Math.PI,
      [-w * 0.3, 0, w * 0.3].map(u => ({ u, base: 1.05, width: 0.85, height: 1.3, kind: "window" as const }))
    ],
    [-w / 2, 0, d, -Math.PI / 2, [{ u: 0, base: 1.05, width: 0.85, height: 1.3, kind: "window" as const }]],
    [w / 2, 0, d, Math.PI / 2, [{ u: -profile.doorZ, base: 0, width: 1.1, height: 2.15, kind: "door" as const }]]
  ] as const) {
    upper.facade("upper-hall-infill", x, z, width, wallH, angle, holes);
    upper.frameWall(x, z, width, wallH, angle, holes, 0.3);
  }
  for (const z of [-d / 2, d / 2])
    upper.box("upper-wall-eaves-bearing", [0, wallH + 0.08, z], [w + 0.1, 0.2, 0.22], "oak");
  for (const x of [-w / 2, w / 2]) upper.box("upper-wall-eaves-bearing", [x, wallH + 0.08, 0], [0.22, 0.2, d], "oak");
  upper.roofCover(0, 0, w, d, wallH + 0.12, profile.roofRise, "tile");
  if (kind === "town") {
    cutRoofRectangle(
      upper,
      upper.pickables.filter(m => /roof|tile|ridge|rafter|batten|verge|fascia/.test(m.name)),
      { minX: -0.86, maxX: 0.86, minZ: -0.86, maxZ: 0.86 },
      mesh => (/verge|fascia/.test(mesh.name) ? "oak" : "tile")
    );
  }
  k.attach(upper.finish(), [0, profile.upperFloor, 0]);
  balcony(k, d / 2);
  if (kind === "town") bellTurret(k);
  if (dressing) addCivicHallDressing(k, kind, w, d);
  return compactModel(k.finish(), { mergeEquivalentMaterials: true });
}

function addCivicHallDressing(k: HouseDetailKit, kind: CivicHallKind, w: number, d: number) {
  if (kind !== "town")
    for (const x of [-w * 0.3, 0, w * 0.3]) {
      addCraftBench(k, x, -0.65, 2.5, 1.1, 0.95);
      if (kind === "cloth") {
        for (let i = 0; i < 4; i++)
          k.box(
            "folded-inspected-cloth",
            [x - 0.75 + i * 0.5, 1.04, -0.65],
            [0.44, 0.18, 0.85],
            i % 2 ? "white" : "cloth"
          );
        k.beam("cloth-measuring-rule", [x - 1.1, 1.15, -0.15], [x + 1.1, 1.15, -0.15], 0.035, "wood");
        for (let i = 0; i < 17; i++)
          k.box("rule-division", [x - 1.04 + i * 0.13, 1.17, -0.15], [0.009, 0.01, 0.035], "dark");
      } else {
        k.vessel("market-measure", [x - 0.5, 0.95, -0.65], 0.2, 0.23, "wood");
        k.box("vendor-counter-divider", [x + 0.65, 1.08, -0.65], [0.08, 0.26, 1.1], "oak");
      }
    }
  for (const x of [-w * 0.32, w * 0.32]) {
    const z = d / 2 + 0.23;
    for (const side of [-1, 1])
      k.beam("banner-wall-bracket", [x + side * 0.35, 6.15, d / 2], [x + side * 0.35, 6.15, z], 0.04, "iron");
    k.beam("banner-hanging-rod", [x - 0.45, 6.15, z], [x + 0.45, 6.15, z], 0.045, "iron", true);
    k.box("civic-cloth-banner", [x, 5.4, z], [0.65, 1.45, 0.025], kind === "cloth" ? "white" : "cloth");
    k.box("woven-banner-emblem", [x, 5.45, z + 0.02], [0.25, 0.45, 0.012], "tile");
  }
}

export function createCivicHallDressing(kind: CivicHallKind) {
  const profile = civicHallProfile(kind),
    k = new HouseDetailKit(`${kind}-trade-dressing`);
  addCivicHallDressing(k, kind, profile.width, profile.depth);
  return compactModel(k.finish());
}
