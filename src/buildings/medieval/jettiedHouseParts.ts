import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { createExteriorStair } from "./exteriorStair";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";
import { ModelKit } from "./modelKit";
import { cutRoofRectangle } from "./roofCut";
import { addShopShutters } from "./shopHouseComponents";

export type JettiedHouseKind = "jettied-town-house" | "double-jettied-merchant-house" | "corner-jettied-shop-house";
export const JETTY_PROFILE = { width: 5.2, depth: 6, floorHeight: 2.65, projection: 0.48, groundTop: 0.3 };
export const JETTY_STAIR = {
  rise: 2.65,
  run: 3.5,
  width: 0.9,
  landingDepth: 1.4,
  doorWidth: 0.9,
  surface: "wood" as const
};
export function jettiedStorey(kind: JettiedHouseKind, floor: number) {
  const p = JETTY_PROFILE,
    corner = kind === "corner-jettied-shop-house",
    offset = floor * p.projection;
  return {
    floor,
    base: p.groundTop + floor * p.floorHeight,
    x: corner ? offset / 2 : 0,
    z: offset / 2,
    w: p.width + (corner ? offset : 0),
    d: p.depth + offset,
    front: 3 + offset,
    right: 2.6 + (corner ? offset : 0)
  };
}
export const jettiedStoreys = (kind: JettiedHouseKind) => (kind === "double-jettied-merchant-house" ? 3 : 2);
export const jettiedStairHole = (upperFloor: number) => ({
  x: upperFloor % 2 ? 1.55 : -1.55,
  minZ: -1.2,
  maxZ: 2,
  halfWidth: 0.6
});

function facade(k: HouseDetailKit, x: number, z: number, w: number, angle: number, openings: HouseOpening[]) {
  k.facade("jettied-infill-with-openings", x, z, w, 2.65, angle, openings);
  const start = k.pickables.length;
  k.frameWall(x, z, w, 2.65, angle, openings, 0);
  // Per-storey braces join existing studs; the whole-house helper's brace height is not reused.
  for (const mesh of k.pickables.slice(start).filter(m => m.name === "pegged-diagonal-brace")) {
    k.group.remove(mesh);
    k.pickables.splice(k.pickables.indexOf(mesh), 1);
  }
  const studs = [
    ...new Set([
      -w / 2 + 0.07,
      w / 2 - 0.07,
      ...openings.flatMap(o => [o.u - o.width / 2 - 0.12, o.u + o.width / 2 + 0.12])
    ])
  ].sort((a, b) => a - b);
  for (let i = 0; i < studs.length - 1; i++) {
    const a = studs[i],
      b = studs[i + 1];
    if (
      b - a < 0.45 ||
      openings.some(o => o.base < 0.75 && o.base + o.height > 0.2 && o.u - o.width / 2 < b && o.u + o.width / 2 > a)
    )
      continue;
    k.beam(
      "storey-diagonal-brace",
      k.point(x, z, angle, a, 0.25, 0.04),
      k.point(x, z, angle, b, 0.65, 0.04),
      0.1,
      "oak"
    );
  }
}
function floorBody(kind: JettiedHouseKind, floor: number) {
  const s = jettiedStorey(kind, floor),
    k = new HouseDetailKit(`jettied-storey-${floor}`),
    p = JETTY_PROFILE;
  const rectangle = (name: string, minX: number, maxX: number, minZ: number, maxZ: number) => {
    if (maxX > minX && maxZ > minZ)
      k.box(name, [(minX + maxX) / 2, -0.08, (minZ + maxZ) / 2], [maxX - minX, 0.16, maxZ - minZ], "wood");
  };
  const minX = s.x - s.w / 2,
    maxX = s.x + s.w / 2,
    minZ = -3,
    maxZ = s.front;
  if (floor === 0) {
    k.box("stone-foundation", [0, -0.23, 0], [p.width, 0.14, p.depth], "stone");
    rectangle("ground-floor-deck", minX, maxX, minZ, maxZ);
  } else {
    const hole = jettiedStairHole(floor),
      left = hole.x - hole.halfWidth,
      right = hole.x + hole.halfWidth;
    rectangle("upper-floor-deck", minX, left, minZ, maxZ);
    rectangle("upper-floor-deck", right, maxX, minZ, maxZ);
    rectangle("upper-floor-deck", left, right, minZ, hole.minZ);
    rectangle("upper-floor-deck", left, right, hole.maxZ, maxZ);
    for (const x of [left, right]) {
      k.box("stairwell-trimmer", [x, -0.13, (hole.minZ + hole.maxZ) / 2], [0.12, 0.26, hole.maxZ - hole.minZ], "oak");
      k.beam("stairwell-level-guard", [x, 0.95, hole.minZ], [x, 0.95, hole.maxZ], 0.07, "oak");
      for (let z = hole.minZ; z <= hole.maxZ; z += 0.4)
        k.box("stairwell-guard-post", [x, 0.475, z], [0.05, 0.95, 0.05], "wood");
    }
    for (const z of [hole.minZ, hole.maxZ]) k.box("stairwell-header", [hole.x, -0.13, z], [1.32, 0.26, 0.12], "oak");
    k.beam("stairwell-end-guard", [left, 0.95, hole.maxZ], [right, 0.95, hole.maxZ], 0.07, "oak");
  }
  const shop = kind !== "jettied-town-house";
  const front: HouseOpening[] =
    floor === 0
      ? [
          { u: 1.55, base: 0, width: 0.95, height: 2.1, kind: "door" },
          shop
            ? { u: -1, base: 0.8, width: 2.7, height: 1.2, kind: "shop" }
            : { u: -1.1, base: 1, width: 0.85, height: 1.05, kind: "window" }
        ]
      : [-s.w * 0.25, s.w * 0.25].map(u => ({ u, base: 1, width: 0.85, height: 1.05, kind: "window" }));
  facade(k, s.x, s.front, s.w, 0, front);
  facade(k, s.x, -3, s.w, Math.PI, [{ u: 0, base: 1, width: 0.75, height: 1.05, kind: "window" }]);
  for (const side of [-1, 1]) {
    const sideOpenings: HouseOpening[] =
      floor === 0 && side === 1 && kind === "corner-jettied-shop-house"
        ? [{ u: 0, base: 0.8, width: 2.7, height: 1.2, kind: "shop" }]
        : [-1.45, 1.45].map(u => ({ u, base: 1, width: 0.7, height: 1.05, kind: "window" }));
    facade(k, s.x + (side * s.w) / 2, s.z, s.d, (side * Math.PI) / 2, sideOpenings);
  }
  if (floor === 0) {
    for (const step of k.pickables.filter(m => m.name === "doorstep")) step.position.y = -0.1;
    k.box("lower-entrance-step", [1.55, -0.25, 3.4], [1.3, 0.1, 0.9], "stone");
  }
  const result = new ModelKit("fitted-jettied-storey");
  result.attach(k.finish(), [0, s.base, 0]);
  return result.finish();
}
function supports(kind: JettiedHouseKind, floor: number) {
  const s = jettiedStorey(kind, floor),
    lower = jettiedStorey(kind, floor - 1),
    k = new ModelKit(`jetty-supports-${floor}`),
    hole = jettiedStairHole(floor);
  const joist = (x: number, a: number, b: number) =>
    k.box("jetty-joist", [x, s.base - 0.12, (a + b) / 2], [0.16, 0.24, b - a], "oak");
  for (let x = -2.53; x <= lower.right - 0.07 + 0.01; x += 0.55) {
    if (x > hole.x - hole.halfWidth - 0.08 && x < hole.x + hole.halfWidth + 0.08) {
      joist(x, -3.06, hole.minZ);
      joist(x, hole.maxZ, s.front + 0.06);
    } else joist(x, -3.06, s.front + 0.06);
  }
  k.box("jetty-bressummer", [s.x, s.base - 0.06, s.front + 0.04], [s.w + 0.12, 0.24, 0.24], "oak");
  for (const x of [lower.x - lower.w / 2 + 0.07, lower.x + lower.w / 2 - 0.07])
    k.beam("jetty-bracket", [x, s.base - 0.72, lower.front + 0.04], [x, s.base - 0.04, s.front + 0.04], 0.14, "oak");
  if (kind === "corner-jettied-shop-house") {
    k.box("side-jetty-bressummer", [s.right + 0.04, s.base - 0.06, s.z], [0.24, 0.24, s.d + 0.12], "oak");
    for (const z of [lower.z - lower.d / 2 + 0.07, -1.47, 1.47, lower.z + lower.d / 2 - 0.07]) {
      const intervals =
        z > hole.minZ && z < hole.maxZ
          ? [
              [s.x - s.w / 2 - 0.06, hole.x - hole.halfWidth],
              [hole.x + hole.halfWidth, s.right + 0.06]
            ]
          : [[s.x - s.w / 2 - 0.06, s.right + 0.06]];
      for (const [a, b] of intervals)
        k.box("side-jetty-cross-beam", [(a + b) / 2, s.base - 0.12, z], [b - a, 0.24, 0.16], "oak");
      k.beam(
        "side-jetty-bracket",
        [lower.right + 0.04, s.base - 0.72, z],
        [s.right + 0.04, s.base - 0.04, z],
        0.14,
        "oak"
      );
    }
    k.beam(
      "corner-dragon-beam",
      [s.right - 0.8, s.base - 0.12, s.front - 0.8],
      [s.right, s.base - 0.12, s.front],
      0.24,
      "oak"
    );
  }
  return k.finish();
}
function stairs(kind: JettiedHouseKind) {
  const k = new ModelKit("jettied-interior-stairs");
  for (let f = 1; f < jettiedStoreys(kind); f++)
    k.attach(createExteriorStair(JETTY_STAIR), [jettiedStairHole(f).x, jettiedStorey(kind, f - 1).base, -1.9]);
  return k.finish();
}
function roof(kind: JettiedHouseKind) {
  const s = jettiedStorey(kind, jettiedStoreys(kind) - 1),
    k = new HouseDetailKit("jettied-tiled-roof"),
    eave = s.base + 2.65;
  k.roofCover(s.x, s.z, s.w, s.d, eave, 2.5, "tile");
  cutRoofRectangle(
    k,
    k.pickables.filter(m => ["roof-underlay", "overlapping-roof-tile"].includes(m.name)),
    { minX: -0.4, maxX: 0.4, minZ: -2.68, maxZ: -1.92 },
    () => "tile"
  );
  const angle = -Math.atan2(2.5, (s.d + 0.6) / 2);
  for (const [x, z, w, d] of [
    [-0.4025, -2.3, 0.155, 0.92],
    [0.4025, -2.3, 0.155, 0.92],
    [0, -2.68, 0.65, 0.16],
    [0, -1.92, 0.65, 0.16]
  ]) {
    const y = eave + 2.5 * (1 - Math.abs(z - s.z) / ((s.d + 0.6) / 2)) + 0.06;
    const flashing = k.box("chimney-roof-flashing", [x, y, z], [w, 0.025, d / Math.cos(angle)], "iron");
    flashing.rotation.x = angle;
  }
  return k.finish();
}
function chimney(kind: JettiedHouseKind) {
  const s = jettiedStorey(kind, jettiedStoreys(kind) - 1),
    k = new HouseDetailKit("jettied-open-chimney");
  k.chimneyStack(0, -2.3, s.base + 2.65 + 1.7, s.base);
  return k.finish();
}
function shopFittings(kind: JettiedHouseKind) {
  const k = new HouseDetailKit("jettied-shared-shop-shutters");
  addShopShutters(k, 3);
  if (kind === "corner-jettied-shop-house") {
    const side = new HouseDetailKit("corner-side-shop-shutters");
    addShopShutters(side, 2.6);
    const wrapper = new ModelKit("rotated-corner-shop-shutters");
    wrapper.attach(side.finish(), [1, 0, 0]);
    wrapper.group.rotation.y = Math.PI / 2;
    k.attach(wrapper.finish(), [0, 0, 0]);
  }
  return k.finish();
}
export function jettiedHousePartFactories(kind: JettiedHouseKind): ModelPartFactory[] {
  const part = (role: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `${kind}:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create
  });
  const parts: ModelPartFactory[] = [];
  for (let f = 0; f < jettiedStoreys(kind); f++) {
    parts.push(part(`storey-${f}`, () => floorBody(kind, f)));
    if (f > 0) parts.push(part(`jetty-${f}`, () => supports(kind, f)));
  }
  parts.push(
    part("stairs", () => stairs(kind)),
    part("roof", () => roof(kind)),
    part("chimney", () => chimney(kind))
  );
  if (kind !== "jettied-town-house") parts.push(part("shop-fittings", () => shopFittings(kind)));
  return parts;
}
