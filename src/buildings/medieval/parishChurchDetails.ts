import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";
import { cutRoofRectangle } from "./roofCut";

export type ParishChurchKind = "parish-church" | "village-chapel";
interface Aperture {
  u: number;
  base: number;
  width: number;
  height: number;
  glass?: boolean;
  door?: boolean;
  pointed?: boolean;
}

function arch(w: number, h: number, base: number, pointed = true) {
  const shape = new THREE.Shape(),
    half = w / 2,
    spring = h * (pointed ? 0.65 : 1 - w / (2 * h));
  shape.moveTo(-half, base);
  shape.lineTo(half, base);
  shape.lineTo(half, base + spring);
  if (pointed) {
    shape.quadraticCurveTo(half * 0.9, base + h * 0.9, 0, base + h);
    shape.quadraticCurveTo(-half * 0.9, base + h * 0.9, -half, base + spring);
  } else shape.absarc(0, base + spring, half, 0, Math.PI, false);
  shape.closePath();
  return shape;
}

function wall(
  k: HouseDetailKit,
  x: number,
  z: number,
  width: number,
  top: number,
  angle: number,
  holes: readonly Aperture[],
  base = 0
) {
  const face = new THREE.Shape();
  face.moveTo(-width / 2, base);
  face.lineTo(width / 2, base);
  face.lineTo(width / 2, top);
  face.lineTo(-width / 2, top);
  face.closePath();
  for (const hole of holes) {
    const points = arch(hole.width, hole.height, hole.base, hole.pointed ?? true)
      .getPoints(18)
      .reverse()
      .map(p => new THREE.Vector2(p.x + hole.u, p.y));
    face.holes.push(new THREE.Path(points));
  }
  const mesh = k.add(
    "arched-stone-wall",
    new THREE.ExtrudeGeometry(face, { depth: 0.22, bevelEnabled: false, curveSegments: 18 }),
    "stone"
  );
  mesh.position.set(...k.point(x, z, angle, 0, 0, -0.22));
  mesh.rotation.y = angle;
  // Split mortar courses at aperture extents; no decorative strip crosses a doorway or light.
  for (let y = base + 0.3; y < top; y += 0.3) {
    let intervals: [number, number][] = [[-width / 2, width / 2]];
    for (const o of holes)
      if (y > o.base - 0.05 && y < o.base + o.height + 0.05)
        intervals = intervals.flatMap(([a, b]) =>
          b < o.u - o.width / 2 || a > o.u + o.width / 2
            ? [[a, b]]
            : [
                [a, Math.min(b, o.u - o.width / 2 - 0.03)],
                [Math.max(a, o.u + o.width / 2 + 0.03), b]
              ].filter(([a, b]) => b > a)
        ) as [number, number][];
    for (const [a, b] of intervals)
      k.beam("masonry-bed-joint", k.point(x, z, angle, a, y, 0.006), k.point(x, z, angle, b, y, 0.006), 0.012, "white");
    for (let u = -width / 2 + 0.32; u < width / 2; u += 0.65) {
      if (holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.08 && y > o.base - 0.3 && y < o.base + o.height + 0.3))
        continue;
      k.beam(
        "staggered-stone-joint",
        k.point(x, z, angle, u, y - 0.25, 0.006),
        k.point(x, z, angle, u, y, 0.006),
        0.009,
        "white"
      );
    }
  }
  for (const hole of holes) {
    const outer = arch(hole.width + 0.26, hole.height + 0.15, hole.base - 0.04, hole.pointed ?? true);
    outer.holes.push(
      new THREE.Path(
        arch(hole.width + 0.025, hole.height + 0.015, hole.base - 0.005, hole.pointed ?? true)
          .getPoints(18)
          .reverse()
      )
    );
    const surround = k.add(
      "dressed-arch-surround",
      new THREE.ExtrudeGeometry(outer, { depth: 0.065, bevelEnabled: false, curveSegments: 18 }),
      "white"
    );
    surround.position.set(...k.point(x, z, angle, hole.u, 0, 0.02));
    surround.rotation.y = angle;
    if (hole.glass) {
      const glass = k.add(
        "recessed-lancet-glass",
        new THREE.ShapeGeometry(
          arch(hole.width - 0.02, hole.height - 0.02, hole.base + 0.01, hole.pointed ?? true),
          18
        ),
        "water"
      );
      glass.position.set(...k.point(x, z, angle, hole.u, 0, -0.12));
      glass.rotation.y = angle;
      k.beam(
        "lancet-mullion",
        k.point(x, z, angle, hole.u, hole.base, -0.08),
        k.point(x, z, angle, hole.u, hole.base + hole.height * 0.85, -0.08),
        0.038,
        "white"
      );
      for (let row = 0; row < 4; row++)
        k.beam(
          "window-leaded-transom",
          k.point(x, z, angle, hole.u - hole.width * 0.44, hole.base + 0.2 + row * 0.25, -0.08),
          k.point(x, z, angle, hole.u + hole.width * 0.44, hole.base + 0.2 + row * 0.25, -0.08),
          0.012,
          "iron"
        );
    }
    if (hole.door) openDoor(k, x, z, angle, hole);
  }
}

function openDoor(k: HouseDetailKit, x: number, z: number, angle: number, o: Aperture) {
  const w = o.width - 0.08,
    a = 1.2;
  const point = (u: number, y: number, out = 0) =>
    k.point(
      x,
      z,
      angle,
      o.u - o.width / 2 + u * Math.cos(a) + out * Math.sin(a),
      y,
      -u * Math.sin(a) + out * Math.cos(a)
    );
  const leafGeometry = new THREE.ExtrudeGeometry(arch(w, o.height - 0.08, o.base + 0.04, o.pointed ?? true), {
    depth: 0.055,
    bevelEnabled: false,
    curveSegments: 18
  });
  leafGeometry.translate(w / 2, 0, 0);
  const leaf = k.add("open-arched-oak-door", leafGeometry, "wood");
  leaf.position.set(...point(0, 0));
  leaf.rotation.y = angle + a;
  for (let i = 1; i < 6; i++)
    k.beam(
      "door-plank-joint",
      point((i * w) / 6, o.base + 0.08, 0.059),
      point((i * w) / 6, o.base + o.height * 0.65, 0.059),
      0.008,
      "oak"
    );
  for (const y of [o.base + 0.4, o.base + o.height * 0.55]) {
    k.beam("portal-strap-hinge", point(0.03, y, 0.07), point(w * 0.85, y, 0.07), 0.055, "iron");
    for (const u of [w * 0.2, w * 0.5, w * 0.75])
      k.sphere("strap-rivet", point(u, y, 0.083), [0.02, 0.02, 0.02], "iron");
  }
  const pull = k.ring("door-ring-pull", point(w * 0.78, o.base + 0.9, 0.09), 0.07, 0.013, "iron", true);
  pull.rotation.y = angle + a;
}

function bell(k: HouseDetailKit, x: number, y: number, z: number, scale: number) {
  const profile = [
    [0.4, 0],
    [0.41, 0.05],
    [0.32, 0.18],
    [0.22, 0.47],
    [0.16, 0.62],
    [0, 0.67],
    [0, 0.61],
    [0.11, 0.56],
    [0.17, 0.4],
    [0.26, 0.15],
    [0.35, 0.04],
    [0.35, 0],
    [0.4, 0]
  ];
  const body = k.add(
    "hollow-cast-bell",
    new THREE.LatheGeometry(
      profile.map(([r, h]) => new THREE.Vector2(r * scale, h * scale)),
      32
    ),
    "iron"
  );
  body.position.set(x, y, z);
  k.cylinder("bell-clapper-stem", [x, y + 0.29 * scale, z], 0.025 * scale, 0.58 * scale, "iron", 0.025 * scale, 12);
  k.sphere("bell-clapper-ball", [x, y - 0.015 * scale, z], [0.065 * scale, 0.065 * scale, 0.065 * scale], "iron");
  k.ring("bell-crown-link", [x, y + 0.73 * scale, z], 0.08 * scale, 0.018 * scale, "iron", true);
}

function tower(k: HouseDetailKit) {
  k.box("tower-foundation", [-6, 0.1, 0], [3.35, 0.2, 3.35], "stone");
  const door: Aperture = { u: 0, base: 0.25, width: 1.4, height: 2.4, door: true, pointed: false };
  wall(k, -7.5, 0, 3, 5.7, -Math.PI / 2, [door]);
  wall(k, -4.5, 0, 3, 5.7, Math.PI / 2, [{ ...door, door: false }]);
  for (const side of [-1, 1])
    wall(k, -6, side * 1.5, 3, 5.7, side > 0 ? 0 : Math.PI, [
      { u: 0, base: 3.1, width: 0.45, height: 1.3, glass: true }
    ]);
  k.box("belfry-floor", [-6, 5.7, 0], [2.7, 0.14, 2.7], "wood");
  const belfry: Aperture[] = [-0.65, 0.65].map(u => ({ u, base: 6, width: 0.68, height: 1.25, pointed: false }));
  for (const [x, z, angle] of [
    [-6, 1.5, 0],
    [-6, -1.5, Math.PI],
    [-7.5, 0, -Math.PI / 2],
    [-4.5, 0, Math.PI / 2]
  ]) {
    wall(k, x, z, 3, 7.5, angle, belfry, 5.7);
    for (const u of [-0.65, 0.65])
      for (let row = 0; row < 4; row++) {
        const louvre = k.box(
          "open-belfry-louvre",
          k.point(x, z, angle, u, 6.12 + row * 0.23, -0.07),
          [0.61, 0.055, 0.16],
          "wood"
        );
        louvre.rotation.set(0.32, angle, 0);
      }
  }
  bell(k, -6, 5.95, 0, 1);
  k.beam("bell-timber-yoke", [-6, 6.78, -1.2], [-6, 6.78, 1.2], 0.14);
  k.box("belfry-ceiling-cornice", [-6, 7.57, 0], [3.2, 0.2, 3.2], "stone");
  k.roofCover(-6, 0, 3.5, 3.5, 7.65, 1.4, "wood");
  k.beam("tower-roof-cross", [-6, 9.2, 0], [-6, 10.15, 0], 0.07, "iron");
  k.beam("tower-cross-arms", [-6.3, 9.88, 0], [-5.7, 9.88, 0], 0.07, "iron");
}

function bellcote(k: HouseDetailKit) {
  k.box("bellcote-ridge-seat", [-3, 5.15, 0], [1.35, 0.14, 1.15], "stone");
  for (const x of [-3.55, -2.45])
    for (const z of [-0.45, 0.45]) {
      k.box("bellcote-oak-post", [x, 5.75, z], [0.1, 1.1, 0.1]);
      k.beam("bellcote-knee-brace", [x, 5.83, z], [x + (x < -3 ? 0.25 : -0.25), 6.25, z], 0.065);
    }
  bell(k, -3, 5.45, 0, 0.7);
  k.beam("small-bell-yoke", [-3.55, 6.02, 0], [-2.45, 6.02, 0], 0.1);
  k.roofCover(-3, 0, 1.5, 1.4, 6.32, 0.6, "wood");
  k.beam("chapel-roof-cross", [-3, 7.04, 0], [-3, 7.73, 0], 0.055, "iron");
  k.beam("chapel-cross-arms", [-3.24, 7.5, 0], [-2.76, 7.5, 0], 0.055, "iron");
}

export function createHighParishChurch(kind: ParishChurchKind) {
  const k = new HouseDetailKit(`${kind}-high`),
    large = kind === "parish-church";
  const length = large ? 11.5 : 8,
    depth = large ? 7 : 5,
    eave = large ? 4.3 : 3.2;
  k.box("nave-foundation", [0, 0.1, 0], [length, 0.2, depth], "stone");
  const west: Aperture = {
    u: 0,
    base: 0.25,
    width: large ? 1.6 : 1.25,
    height: large ? 2.5 : 2.2,
    door: !large,
    pointed: false
  };
  wall(k, -length / 2, 0, depth, eave, -Math.PI / 2, [west]);
  wall(k, length / 2, 0, depth, eave, Math.PI / 2, [{ u: 0, base: 0.25, width: 2, height: 2.55, pointed: true }]);
  const xs = large ? [-3.5, 0, 3.5] : [-2, 1.5];
  for (const side of [-1, 1]) {
    wall(
      k,
      0,
      (side * depth) / 2,
      length,
      eave,
      side > 0 ? 0 : Math.PI,
      xs.map(u => ({ u, base: large ? 1.7 : 1.25, width: 0.6, height: large ? 1.8 : 1.45, glass: true }))
    );
    for (const x of large ? [-4.8, -1.8, 1.8, 4.8] : [-3, 0, 3]) {
      k.box("stepped-stone-buttress", [x, 1.45, side * (depth / 2 + 0.24)], [0.42, 2.9, 0.65], "stone");
      k.box("buttress-upper-step", [x, 3, side * (depth / 2 + 0.13)], [0.34, 0.3, 0.4], "white");
      for (let row = 0; row < 8; row++)
        k.box("buttress-course", [x, 0.3 + row * 0.33, side * (depth / 2 + 0.57)], [0.42, 0.012, 0.012], "white");
    }
  }
  for (const side of [-1, 1]) {
    k.box("nave-eaves-cornice", [0, eave + 0.04, (side * depth) / 2], [length + 0.1, 0.2, 0.28], "stone");
    k.box("nave-gable-cornice", [(side * length) / 2, eave + 0.04, 0], [0.28, 0.2, depth + 0.1], "stone");
  }
  const roofStart = k.pickables.length;
  k.roofCover(0, 0, length, depth, eave + 0.12, large ? 2.5 : 1.8, "tile");
  if (large)
    cutRoofRectangle(
      k,
      k.pickables.slice(roofStart),
      {
        minX: -7.51,
        maxX: -4.49,
        minZ: -1.51,
        maxZ: 1.51
      },
      mesh =>
        mesh.name === "gable-infill"
          ? "plaster"
          : ["roof-underlay", "overlapping-roof-tile", "ridge-roll"].includes(mesh.name)
            ? "tile"
            : "oak"
    );
  const cx = large ? 6.5 : 5.2;
  k.box("chancel-foundation", [cx, 0.1, 0], [3, 0.2, 4.6], "stone");
  for (const side of [-1, 1])
    wall(k, cx, side * 2.3, 3, 3, side > 0 ? 0 : Math.PI, [
      { u: 0, base: 1.2, width: 0.55, height: 1.35, glass: true }
    ]);
  wall(k, cx + 1.5, 0, 4.6, 3, Math.PI / 2, [{ u: 0, base: 1.05, width: 1.05, height: 1.6, glass: true }]);
  for (const side of [-1, 1]) {
    k.box("chancel-eaves-cornice", [cx, 3.04, side * 2.3], [3.1, 0.2, 0.28], "stone");
    k.box("chancel-gable-cornice", [cx + side * 1.5, 3.04, 0], [0.28, 0.2, 4.7], "stone");
  }
  k.roofCover(cx, 0, 3, 4.6, 3.12, 1.4, "tile");
  if (large) tower(k);
  else bellcote(k);
  return compactModel(k.finish());
}

/** Shared masonry apertures and fitted door hardware for small stone buildings. */
export { openDoor as addOpenParishDoor, wall as addParishMasonryWall };
