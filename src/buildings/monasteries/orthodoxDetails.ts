import * as THREE from "three";
import type { Point } from "../../city-editor/types/document";
import { planVertex } from "../../city3d/core/planFrame";
import { HouseDetailKit } from "../medieval/houseDetailKit";
import { ModelKit } from "../medieval/modelKit";
import { addMonasteryMasonryWall, createHighFriaryBuilding } from "./friaryDetails";
import type { MonasteryContext } from "./monasteryComponents";

function centerOf(ring: Point[]): Point {
  return ring.reduce<Point>((sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length], [0, 0]);
}

function dome(context: MonasteryContext, index: number) {
  const k = new ModelKit("orthodox-drum-dome-high"),
    s = context.scale;
  const polygon = context.plan.buildings[index].polygon,
    center = centerOf(polygon);
  const radius = Math.max(...polygon.map(p => Math.hypot(p[0] - center[0], p[1] - center[1])));
  const drumRadius = radius * 0.75,
    crown = context.churchTop + 2 * s;
  // Embed the continuous drum below the intersecting roof surfaces; do not cut a bespoke roof socket.
  const bottom = context.churchHeight + 0.2 * s;
  const ring = Array.from({ length: 12 }, (_, i): Point => {
    const a = context.azimuth - (i * Math.PI) / 6;
    return [center[0] + Math.cos(a) * drumRadius, center[1] + Math.sin(a) * drumRadius];
  });
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    addMonasteryMasonryWall(k, a, b, crown, bottom, context.elevation, s, [
      {
        u: length / 2,
        base: context.churchTop + 0.12 * s,
        width: 0.52 * s,
        height: 1.45 * s,
        round: true
      }
    ]);
  }
  const cap = new ModelKit("orthodox-dome-cap");
  cap.cylinder(
    "drum-upper-cornice",
    [0, crown - 0.06 * s, 0],
    drumRadius + 0.12 * s,
    0.16 * s,
    "white",
    drumRadius + 0.12 * s,
    48
  );
  const curve = new THREE.SplineCurve(
    [
      [0.75, 0],
      [1, 0.45],
      [1.04, 0.95],
      [0.78, 1.55],
      [0.28, 2.15],
      [0, 2.6]
    ].map(([r, y]) => new THREE.Vector2(r * radius, y * s))
  );
  const profile = curve.getPoints(32).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
  const shell = cap.add("bulbous-church-dome", new THREE.LatheGeometry(profile, 48), "green");
  shell.position.y = crown;
  for (let rib = 0; rib < 12; rib++) {
    const a = (rib * Math.PI) / 6;
    for (let j = 0; j < profile.length - 1; j += 2) {
      const p = profile[j],
        q = profile[Math.min(j + 2, profile.length - 1)];
      cap.beam(
        "dome-standing-seam",
        [Math.cos(a) * p.x, crown + p.y, Math.sin(a) * p.x],
        [Math.cos(a) * q.x, crown + q.y, Math.sin(a) * q.x],
        0.025 * s,
        "iron"
      );
    }
  }
  const top = crown + 2.6 * s;
  cap.sphere("cross-finial", [0, top + 0.03 * s, 0], [0.13 * s, 0.13 * s, 0.13 * s], "straw");
  cap.beam("orthodox-cross-upright", [0, top, 0], [0, top + 1.7 * s, 0], 0.075 * s, "iron");
  for (const [y, half] of [
    [1.1, 0.5],
    [1.45, 0.25]
  ])
    cap.beam("orthodox-cross-bar", [-half * s, top + y * s, 0], [half * s, top + y * s, 0], 0.065 * s, "iron");
  cap.beam("orthodox-sloping-footbar", [-0.3 * s, top + 0.4 * s, 0], [0.3 * s, top + 0.2 * s, 0], 0.06 * s, "iron");
  cap.group.rotation.y = context.azimuth;
  k.attach(cap.finish(), planVertex(center, context.elevation));
  return k.finish();
}

function bellTower(context: MonasteryContext, index: number) {
  const k = new ModelKit("orthodox-bell-tower-high"),
    s = context.scale;
  const source = context.plan.buildings[index].polygon;
  const area = source.reduce(
    (sum, p, i) => sum + p[0] * source[(i + 1) % source.length][1] - p[1] * source[(i + 1) % source.length][0],
    0
  );
  const ring = area < 0 ? source : [...source].reverse(),
    center = centerOf(ring);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    addMonasteryMasonryWall(k, a, b, 10 * s, 0, context.elevation, s, [
      { u: length / 2, base: 6.8 * s, width: 1.7 * s, height: 2.35 * s, round: true, unglazed: true },
      ...(i === 0 ? [{ u: length / 2, base: 0.08 * s, width: 1.2 * s, height: 2.3 * s, round: true, door: true }] : [])
    ]);
  }
  const tower = new HouseDetailKit("orthodox-belfry-fittings");
  const width = Math.hypot(source[1][0] - source[0][0], source[1][1] - source[0][1]);
  const depth = Math.hypot(source[2][0] - source[1][0], source[2][1] - source[1][1]);
  for (const y of [6.5, 9.8]) {
    for (const side of [-1, 1]) {
      tower.box("belfry-cornice", [0, y * s, (side * depth) / 2], [width + 0.15 * s, 0.16 * s, 0.45 * s], "white");
      tower.box("belfry-cornice", [(side * width) / 2, y * s, 0], [0.45 * s, 0.16 * s, depth + 0.15 * s], "white");
    }
  }
  tower.beam("bell-load-bearing-yoke", [-width / 2, 8.9 * s, 0], [width / 2, 8.9 * s, 0], 0.2 * s, "oak");
  const profile = [
    [0.11, 0.9],
    [0.22, 0.8],
    [0.28, 0.4],
    [0.5, 0],
    [0.44, 0],
    [0.23, 0.42],
    [0.17, 0.77],
    [0.1, 0.82]
  ];
  const bell = tower.add(
    "hollow-orthodox-bell",
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r * s, y * s)),
      24
    ),
    "straw"
  );
  bell.position.y = 7.9 * s;
  tower.beam("bell-hanger", [0, 8.7 * s, 0], [0, 8.95 * s, 0], 0.1 * s, "iron", true);
  tower.beam("bell-clapper", [0, 7.75 * s, 0], [0, 8.65 * s, 0], 0.06 * s, "iron", true);
  tower.roofCover(0, 0, width, depth, 10 * s, 2.5 * s, "tile");
  tower.group.rotation.y = context.azimuth;
  k.attach(tower.finish(), planVertex(center, context.elevation));
  return k.finish();
}

export function createHighOrthodoxBuilding(context: MonasteryContext, index: number) {
  const role = context.plan.buildings[index].role;
  return role === "dome"
    ? dome(context, index)
    : role === "bell-tower"
      ? bellTower(context, index)
      : createHighFriaryBuilding(context, index);
}
