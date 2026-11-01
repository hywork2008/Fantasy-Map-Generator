import * as THREE from "three";
import { pointInPolygon } from "../../city-editor/generators/geom";
import type { Point } from "../../city-editor/types/document";
import { planVertex } from "../../city3d/core/planFrame";
import { ModelKit, type Surface } from "../medieval/modelKit";
import { createMonasterySlab, type MonasteryContext } from "./monasteryComponents";

type Vertex = [number, number, number];
type Opening = {
  u: number;
  base: number;
  width: number;
  height: number;
  door?: boolean;
  unglazed?: boolean;
  round?: boolean;
};
const pitch = Math.tan((32 * Math.PI) / 180);
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const area = (ring: Point[]) => ring.reduce((sum, p, i) => sum + cross(p, ring[(i + 1) % ring.length]), 0);
const ringOf = (ring: Point[]) => (area(ring) < 0 ? ring : [...ring].reverse());
const ordinary = (role: string) => ["church", "apse", "range"].includes(role);

function archPoints(width: number, height: number, round = false): Point[] {
  if (round) {
    const r = width / 2;
    return [
      [-r, 0],
      ...Array.from({ length: 13 }, (_, i): Point => {
        const a = Math.PI - (i * Math.PI) / 12;
        return [Math.cos(a) * r, height - r + Math.sin(a) * r];
      }),
      [r, 0]
    ];
  }
  const w = width / 2,
    spring = height - width * 0.65;
  const points: Point[] = [
    [-w, 0],
    [-w, spring]
  ];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    points.push([
      -w * (1 - t * t),
      (1 - t) ** 2 * spring + 2 * (1 - t) * t * (height - (height - spring) * 0.45) + t * t * height
    ]);
  }
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    points.push([
      w * (2 * t - t * t),
      (1 - t) ** 2 * height + 2 * (1 - t) * t * (height - (height - spring) * 0.45) + t * t * spring
    ]);
  }
  points.push([w, 0]);
  return points;
}

function edgePlacement(mesh: THREE.Object3D, a: Point, b: Point, elevation: number, inset = 0) {
  const dx = b[0] - a[0],
    dz = a[1] - b[1],
    length = Math.hypot(dx, dz);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.position.set(a[0] - (dz / length) * inset, elevation, -a[1] + (dx / length) * inset);
}

function sectionPath(opening: Opening, width = opening.width, height = opening.height, base = opening.base) {
  return archPoints(width, height, opening.round).map(([x, y]) => new THREE.Vector2(x + opening.u, y + base));
}

function wall(
  k: ModelKit,
  a: Point,
  b: Point,
  height: number,
  bottom: number,
  elevation: number,
  scale: number,
  openings: Opening[]
) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const shape = new THREE.Shape([
    new THREE.Vector2(0, bottom),
    new THREE.Vector2(length, bottom),
    new THREE.Vector2(length, height),
    new THREE.Vector2(0, height)
  ]);
  for (const opening of openings) {
    // Keep holes strictly inside the face; the small bottom threshold is below the walking surface.
    shape.holes.push(
      new THREE.Path(sectionPath({ ...opening, base: Math.max(bottom + 0.01 * scale, opening.base) }).reverse())
    );
  }
  const mesh = k.add(
    "friary-open-masonry",
    new THREE.ExtrudeGeometry(shape, { depth: 0.35 * scale, bevelEnabled: false, curveSegments: 4 }),
    "stone"
  );
  edgePlacement(mesh, a, b, elevation);
  for (const opening of openings) {
    const outer = sectionPath(opening, opening.width + 0.24 * scale, opening.height + 0.14 * scale, opening.base);
    const inner = sectionPath(opening);
    // An open U-shaped surround leaves the doorway clear down to its threshold.
    const surround = new THREE.Shape([...outer, ...inner.reverse()]);
    const frame = k.add(
      "pointed-stone-surround",
      new THREE.ExtrudeGeometry(surround, { depth: 0.12 * scale, bevelEnabled: false }),
      "white"
    );
    edgePlacement(frame, a, b, elevation, -0.09 * scale);
    if (opening.door) {
      for (const side of [-1, 1]) {
        const leaf = k.box(
          "open-friary-door",
          [0, 0, 0],
          [0.065 * scale, opening.height * 0.72, opening.width / 2],
          "oak"
        );
        const holder = new THREE.Group();
        holder.add(leaf);
        leaf.position.set(
          opening.u + side * (opening.width / 2 - 0.04 * scale),
          opening.base + opening.height * 0.36,
          opening.width / 4 + 0.38 * scale
        );
        k.group.add(holder);
        edgePlacement(holder, a, b, elevation);
      }
    } else if (!opening.unglazed) {
      const pane = new THREE.Shape(sectionPath(opening, opening.width * 0.94, opening.height * 0.97));
      const glass = k.add("recessed-lancet-glazing", new THREE.ShapeGeometry(pane, 4), "water");
      edgePlacement(glass, a, b, elevation, 0.32 * scale);
      const mullion = k.box("lancet-mullion", [0, 0, 0], [0.045 * scale, opening.height * 0.8, 0.07 * scale], "white");
      const holder = new THREE.Group();
      holder.add(mullion);
      mullion.position.set(opening.u, opening.base + opening.height * 0.4, 0.29 * scale);
      k.group.add(holder);
      edgePlacement(holder, a, b, elevation);
    }
  }
  // Course bands stop at apertures rather than sealing them again.
  for (const y of [0.22, 2.7, height / scale - 0.22].map(y => y * scale)) {
    if (y < bottom) continue;
    const cuts = [
      0,
      length,
      ...openings
        .filter(o => y >= o.base - 0.1 * scale && y <= o.base + o.height + 0.15 * scale)
        .flatMap(o => [
          Math.max(0, o.u - o.width / 2 - 0.13 * scale),
          Math.min(length, o.u + o.width / 2 + 0.13 * scale)
        ])
    ].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const u = (cuts[i - 1] + cuts[i]) / 2;
      if (
        openings.some(
          o =>
            Math.abs(u - o.u) < o.width / 2 + 0.13 * scale &&
            y >= o.base - 0.1 * scale &&
            y <= o.base + o.height + 0.15 * scale
        )
      )
        continue;
      const band = k.box(
        "masonry-course-band",
        [0, 0, 0],
        [cuts[i] - cuts[i - 1], 0.045 * scale, 0.075 * scale],
        "white"
      );
      const holder = new THREE.Group();
      holder.add(band);
      band.position.set(u, y, -0.018 * scale);
      k.group.add(holder);
      edgePlacement(holder, a, b, elevation);
    }
  }
}

/** Exposed intervals of an edge, after removing other connected bodies from the same saved plan. */
function exposed(context: MonasteryContext, index: number, a: Point, b: Point): [number, number][] {
  const d: Point = [b[0] - a[0], b[1] - a[1]],
    length = Math.hypot(...d);
  const others = context.plan.buildings.filter((building, i) => i !== index && ordinary(building.role));
  const cuts = [0, 1];
  for (const other of others)
    for (let i = 0; i < other.polygon.length; i++) {
      const p = other.polygon[i],
        q = other.polygon[(i + 1) % other.polygon.length];
      const e: Point = [q[0] - p[0], q[1] - p[1]],
        delta: Point = [p[0] - a[0], p[1] - a[1]];
      const divisor = cross(d, e);
      if (Math.abs(divisor) > 1e-8) {
        const t = cross(delta, e) / divisor,
          u = cross(delta, d) / divisor;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      } else if (Math.abs(cross(delta, d)) < 1e-6)
        for (const point of [p, q]) {
          const t = ((point[0] - a[0]) * d[0] + (point[1] - a[1]) * d[1]) / length ** 2;
          if (t > 0 && t < 1) cuts.push(t);
        }
    }
  const sorted = [...new Set(cuts)].sort((a, b) => a - b),
    result: [number, number][] = [];
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1],
      end = sorted[i];
    if ((end - start) * length < 0.01) continue;
    const mid = lerp(a, b, (start + end) / 2);
    // For clockwise plan rings, the building interior is to the right; probe just outside it.
    const outside: Point = [mid[0] - (d[1] / length) * 0.02, mid[1] + (d[0] / length) * 0.02];
    if (!others.some(other => pointInPolygon(outside, other.polygon))) result.push([start, end]);
  }
  return result;
}

type Roof = {
  polygon: Point[];
  u: Point;
  v: Point;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  eave: number;
};
function roofInfo(context: MonasteryContext, index: number): Roof {
  const building = context.plan.buildings[index],
    ridge = building.ridge;
  const a = ridge?.[0] ?? building.polygon[0],
    b = ridge?.[1] ?? building.polygon[1];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    v: Point = [-u[1], u[0]];
  const us = building.polygon.map(p => p[0] * u[0] + p[1] * u[1]),
    vs = building.polygon.map(p => p[0] * v[0] + p[1] * v[1]);
  return {
    polygon: ringOf(building.polygon),
    u,
    v,
    minU: Math.min(...us),
    maxU: Math.max(...us),
    minV: Math.min(...vs),
    maxV: Math.max(...vs),
    eave:
      (building.role === "crossing-tower" ? 14 : ordinary(building.role) && building.role !== "range" ? 7.2 : 5.4) *
      context.scale
  };
}
const local = (roof: Roof, u: number, v: number): Point => [
  u * roof.u[0] + v * roof.v[0],
  u * roof.u[1] + v * roof.v[1]
];

function clip(polygon: Vertex[], value: (p: Vertex) => number, positive: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      av = value(a),
      bv = value(b);
    const inside = (n: number) => (positive ? n >= 0 : n <= 0);
    if (inside(av)) result.push(a);
    if (inside(av) !== inside(bv)) {
      const t = av / (av - bv);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return result;
}

function subtract(polygon: Vertex[], planes: ((p: Vertex) => number)[]): Vertex[][] {
  const result: Vertex[][] = [];
  let inside = polygon;
  for (const plane of planes) {
    if (inside.length < 3) break;
    const outside = clip(inside, plane, false);
    if (outside.length >= 3) result.push(outside);
    inside = clip(inside, plane, true);
  }
  return result;
}

function footprintPlanes(polygon: Point[], inset = 1e-7): ((p: Vertex) => number)[] {
  const ring = ringOf(polygon);
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    return (p: Vertex) => -cross([b[0] - a[0], b[1] - a[1]], [p[0] - a[0], -p[2] - a[1]]) - inset;
  });
}

function roofFragments(context: MonasteryContext, index: number, polygon: Vertex[], gable = false): Vertex[][] {
  let fragments = [polygon];
  for (const [otherIndex, other] of context.plan.buildings.entries()) {
    if (otherIndex === index || other.role === "apse" || other.role === "gatehouse") continue;
    if (other.role === "crossing-tower") {
      if (!gable) fragments = fragments.flatMap(part => subtract(part, footprintPlanes(other.polygon)));
    } else if (ordinary(other.role)) {
      const roof = roofInfo(context, otherIndex),
        tolerance = gable || otherIndex < index ? -1e-6 : 1e-6;
      const planes = [
        ...footprintPlanes(other.polygon, gable ? -1e-5 : 1e-7),
        (p: Vertex) =>
          context.elevation + roof.eave + pitch * (p[0] * roof.v[0] - p[2] * roof.v[1] - roof.minV) - p[1] - tolerance,
        (p: Vertex) =>
          context.elevation + roof.eave + pitch * (roof.maxV - p[0] * roof.v[0] + p[2] * roof.v[1]) - p[1] - tolerance
      ];
      fragments = fragments.flatMap(part => subtract(part, planes));
    }
  }
  return fragments;
}

function polygonMesh(k: ModelKit, name: string, polygon: Vertex[], surface: Surface, up = true) {
  if (polygon.length < 3) return;
  const normal = new THREE.Vector3()
    .subVectors(new THREE.Vector3(...polygon[1]), new THREE.Vector3(...polygon[0]))
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...polygon[2]), new THREE.Vector3(...polygon[0])));
  if (up && normal.y < 0) polygon = [...polygon].reverse();
  const positions: number[] = [];
  for (let i = 1; i < polygon.length - 1; i++) positions.push(...polygon[0], ...polygon[i], ...polygon[i + 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  k.add(name, geometry, surface);
}

function roof(k: ModelKit, context: MonasteryContext, index: number) {
  const building = context.plan.buildings[index],
    info = roofInfo(context, index),
    s = context.scale;
  const surface = building.role === "range" || building.role === "gatehouse" ? "tile" : "iron";
  const vertex = (u: number, v: number, lift = 0): Vertex =>
    planVertex(
      local(info, u, v),
      context.elevation + info.eave + pitch * Math.min(v - info.minV, info.maxV - v) + lift
    );
  const middle = (info.minV + info.maxV) / 2;
  for (const [lo, hi] of [
    [info.minV, middle],
    [middle, info.maxV]
  ]) {
    const plane = [vertex(info.minU, lo), vertex(info.maxU, lo), vertex(info.maxU, hi), vertex(info.minU, hi)];
    for (const fragment of roofFragments(context, index, plane))
      polygonMesh(k, "friary-detailed-roof", fragment, surface);
    for (let v = lo + 0.35 * s; v < hi - 0.06 * s; v += 0.4 * s) {
      const strip = [
        vertex(info.minU, v, 0.018 * s),
        vertex(info.maxU, v, 0.018 * s),
        vertex(info.maxU, v + 0.025 * s, 0.018 * s),
        vertex(info.minU, v + 0.025 * s, 0.018 * s)
      ];
      for (const fragment of roofFragments(context, index, strip))
        polygonMesh(k, "roof-course-seam", fragment, surface === "iron" ? "dark" : "stone");
    }
  }
  for (const u of [info.minU, info.maxU]) {
    const gable = [vertex(u, info.minV), vertex(u, middle), vertex(u, info.maxV)];
    for (const fragment of roofFragments(context, index, gable, true))
      polygonMesh(k, "masonry-gable", fragment, "stone", false);
  }
}

function bellcote(context: MonasteryContext, index: number) {
  const k = new ModelKit("friary-detailed-bellcote"),
    s = context.scale;
  const polygon = context.plan.buildings[index].polygon;
  const center = polygon.reduce<Point>(
    (sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length],
    [0, 0]
  );
  const base = context.churchHeight,
    eave = context.churchTop + 2 * s;
  for (const x of [-1.2, 1.2])
    for (const z of [-1.2, 1.2]) {
      k.box("bellcote-oak-post", [x * s, (base + eave) / 2, z * s], [0.2 * s, eave - base, 0.2 * s]);
      k.beam(
        "bellcote-knee-brace",
        [x * s, eave - 0.7 * s, z * s],
        [(x - Math.sign(x) * 0.65) * s, eave, z * s],
        0.12 * s
      );
    }
  k.beam("bellcote-load-bearing-tie", [0, base + 0.1 * s, -5 * s], [0, base + 0.1 * s, 5 * s], 0.22 * s);
  k.beam("bell-yoke", [-1.2 * s, eave - 0.5 * s, 0], [1.2 * s, eave - 0.5 * s, 0], 0.16 * s);
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
  const bell = k.add(
    "hollow-friary-bell",
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r * s, y * s)),
      20
    ),
    "straw"
  );
  bell.position.y = context.churchTop + 0.55 * s;
  k.beam(
    "bell-clapper",
    [0, context.churchTop + 0.35 * s, 0],
    [0, context.churchTop + 1.3 * s, 0],
    0.07 * s,
    "iron",
    true
  );
  k.roof(0, 0, 3.4 * s, 3.4 * s, eave, 0.8 * s, "tile");
  k.group.rotation.y = context.azimuth;
  k.group.position.set(...planVertex(center, context.elevation));
  const result = new ModelKit("friary-bellcote-part");
  // Preserve the component's fitted transform inside an assembly-origin wrapper.
  const model = k.finish();
  result.attach(model, planVertex(center, context.elevation));
  return result.finish();
}

function abbeyCrossingTower(context: MonasteryContext, index: number) {
  const k = new ModelKit("abbey-crossing-tower-high"),
    s = context.scale,
    ring = ringOf(context.plan.buildings[index].polygon);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    wall(
      k,
      a,
      b,
      14 * s,
      7.1 * s,
      context.elevation,
      s,
      [-1, 1].map(side => ({
        u: length / 2 + side * 0.95 * s,
        base: 11.1 * s,
        width: 1.05 * s,
        height: 2.25 * s,
        unglazed: true
      }))
    );
    const holder = new THREE.Group();
    for (const side of [-1, 1])
      for (let y = 11.4; y < 12.65; y += 0.3) {
        const louver = k.box("abbey-belfry-louver", [0, 0, 0], [0.96 * s, 0.09 * s, 0.16 * s], "dark");
        holder.add(louver);
        louver.position.set(length / 2 + side * 0.95 * s, y * s, 0.2 * s);
        louver.rotation.x = 0.35;
      }
    k.group.add(holder);
    edgePlacement(holder, a, b, context.elevation);
    for (const y of [10.5, 13.8]) {
      const cornice = k.box("abbey-tower-cornice", [0, 0, 0], [length, 0.18 * s, 0.48 * s], "white");
      const course = new THREE.Group();
      course.add(cornice);
      cornice.position.set(length / 2, y * s, 0.12 * s);
      k.group.add(course);
      edgePlacement(course, a, b, context.elevation);
    }
    k.box(
      "abbey-tower-corner-pier",
      planVertex(a, context.elevation + 10.55 * s),
      [0.45 * s, 7.1 * s, 0.45 * s],
      "stone"
    );
  }
  roof(k, context, index);
  return k.finish();
}

export function createHighFriaryBuilding(context: MonasteryContext, index: number) {
  const building = context.plan.buildings[index],
    s = context.scale;
  if (building.role === "crossing-tower")
    return context.plan.kind === "abbey" ? abbeyCrossingTower(context, index) : bellcote(context, index);
  const k = new ModelKit(`friary-${building.role}-high`),
    ring = ringOf(building.polygon);
  const sacred = building.role === "church" || building.role === "apse",
    height = (sacred ? 7.2 : 5.4) * s;
  const gate = building.role === "gatehouse",
    bottom = gate ? Math.max(2.1, 2.6 * s) : 0;
  // Domestic ranges overlap at their corners in the saved programme; assign each floor once.
  let floors = [ring.map(point => planVertex(point, 0))];
  for (let otherIndex = 0; otherIndex < index; otherIndex++) {
    const other = context.plan.buildings[otherIndex];
    if (ordinary(other.role)) floors = floors.flatMap(floor => subtract(floor, footprintPlanes(other.polygon)));
  }
  for (const floor of floors)
    k.attach(
      createMonasterySlab(
        "friary-floor",
        floor.map(point => [point[0], -point[2]]),
        [],
        context.elevation + (gate ? bottom : 0.025),
        0.1 * s,
        "stone"
      ),
      [0, 0, 0]
    );
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const intervals = gate ? [[0, 1]] : exposed(context, index, a, b);
    for (const [start, end] of intervals) {
      const p = lerp(a, b, start),
        q = lerp(a, b, end),
        length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const openings: Opening[] = [];
      const entry =
        building === context.nave &&
        Math.hypot((a[0] + b[0]) / 2 - building.ridge![0][0], (a[1] + b[1]) / 2 - building.ridge![0][1]) < 0.1;
      if (entry) openings.push({ u: length / 2, base: 0.08 * s, width: 2.5 * s, height: 3.6 * s, door: true });
      if (context.plan.kind === "orthodoxMonastery" && building.role === "range" && context.plan.courts[0]) {
        const court = context.plan.courts[0].polygon;
        const center = court.reduce<Point>(
          (sum, point) => [sum[0] + point[0] / court.length, sum[1] + point[1] / court.length],
          [0, 0]
        );
        const distance = (edge: number) => {
          const mid = lerp(ring[edge], ring[(edge + 1) % ring.length], 0.5);
          return Math.hypot(mid[0] - center[0], mid[1] - center[1]);
        };
        const entranceEdge = ring.reduce((best, _, edge) => (distance(edge) < distance(best) ? edge : best), 0);
        if (i === entranceEdge && length > 2 * s)
          openings.push({ u: length / 2, base: 0.12 * s, width: 1.25 * s, height: 2.45 * s, door: true });
      }
      const walk = context.plan.walk;
      if (!entry && walk)
        for (let j = 0; j < walk.outer.length; j++) {
          const c = walk.outer[j],
            d = walk.outer[(j + 1) % walk.outer.length];
          const direction: Point = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
          if (
            Math.abs(cross(direction, [c[0] - p[0], c[1] - p[1]])) > 0.01 ||
            Math.abs(cross(direction, [d[0] - p[0], d[1] - p[1]])) > 0.01
          )
            continue;
          const ts = [c, d].map(point => (point[0] - p[0]) * direction[0] + (point[1] - p[1]) * direction[1]);
          const lo = Math.max(0, Math.min(...ts)),
            hi = Math.min(length, Math.max(...ts));
          if (hi - lo > 2 * s && !gate)
            openings.push({ u: (lo + hi) / 2, base: 0.12 * s, width: 1.25 * s, height: 2.45 * s, door: true });
        }
      const count = Math.max(1, Math.floor(length / ((sacred ? 4.2 : 3.2) * s)));
      for (let bay = 0; bay < count; bay++) {
        const u = ((bay + 0.5) * length) / count,
          w = (building.role === "apse" ? 0.58 : sacred ? 1.05 : 0.75) * s;
        if (length < w + 0.5 * s || openings.some(o => Math.abs(o.u - u) < (o.width + w) / 2 + 0.2 * s)) continue;
        for (const base of sacred ? [3.0 * s] : gate ? [3.65 * s] : [1.0 * s, 3.65 * s])
          openings.push({ u, base, width: w, height: (sacred ? 3.2 : 1.25) * s });
      }
      wall(
        k,
        p,
        q,
        height,
        bottom,
        context.elevation,
        s,
        context.plan.kind === "orthodoxMonastery" ? openings.map(o => ({ ...o, round: true })) : openings
      );
      if (sacred && context.plan.kind !== "orthodoxMonastery" && !entry && length > 5 * s)
        for (let bay = 1; bay < count; bay++) {
          const t = bay / count,
            point = lerp(p, q, t),
            dx = (q[0] - p[0]) / length,
            dz = (p[1] - q[1]) / length;
          for (const [h, depth] of [
            [2.8, 0.85],
            [5.7, 0.55]
          ]) {
            const buttress = k.box(
              "stepped-church-buttress",
              [point[0] + (dz * depth * s) / 2, context.elevation + (h * s) / 2, -point[1] - (dx * depth * s) / 2],
              [0.55 * s, h * s, depth * s],
              "stone"
            );
            buttress.rotation.y = -Math.atan2(dz, dx);
          }
        }
    }
  }
  if (gate) {
    const info = roofInfo(context, index),
      width = info.maxU - info.minU,
      depth = info.maxV - info.minV;
    const centerV = (info.minV + info.maxV) / 2;
    for (const side of [-1, 1]) {
      const pierWidth = (width - Math.min(3.4 * s, width * 0.65)) / 2;
      const at = local(info, (info.minU + info.maxU) / 2 + (side * (width - pierWidth)) / 2, centerV);
      const pier = k.box(
        "gatehouse-pier",
        planVertex(at, context.elevation + bottom / 2),
        [pierWidth, bottom, depth],
        "stone"
      );
      pier.rotation.y = -Math.atan2(-info.u[1], info.u[0]);
    }
  }
  if (building.role === "apse") {
    const a = ring[0],
      b = ring[ring.length - 1],
      center = lerp(a, b, 0.5);
    const radius = Math.hypot(a[0] - center[0], a[1] - center[1]);
    for (let i = 0; i < ring.length - 1; i++)
      polygonMesh(
        k,
        "apse-conical-roof",
        [
          planVertex(center, context.elevation + height + radius * pitch),
          planVertex(ring[i], context.elevation + height),
          planVertex(ring[i + 1], context.elevation + height)
        ],
        "iron"
      );
  } else roof(k, context, index);
  return k.finish();
}

export function createHighFriaryCloister(context: MonasteryContext) {
  const k = new ModelKit("friary-cloister-high"),
    s = context.scale,
    walk = context.plan.walk!;
  k.attach(
    createMonasterySlab("cloister-floor", walk.outer, [walk.garth], context.elevation + 0.04, 0.12 * s, "stone"),
    [0, 0, 0]
  );
  for (let i = 0; i < walk.garth.length; i++) {
    const a = walk.garth[i],
      b = walk.garth[(i + 1) % walk.garth.length],
      outerA = walk.outer[i],
      outerB = walk.outer[(i + 1) % walk.outer.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      count = Math.max(1, Math.ceil(length / (2.8 * s))),
      bay = length / count;
    for (let j = 0; j < count; j++) {
      const point = lerp(a, b, j / count);
      k.cylinder(
        "cloister-stone-base",
        planVertex(point, context.elevation + 0.2 * s),
        0.23 * s,
        0.2 * s,
        "stone",
        0.23 * s,
        10
      );
      k.cylinder(
        "cloister-column-shaft",
        planVertex(point, context.elevation + 1.075 * s),
        0.13 * s,
        1.65 * s,
        "stone",
        0.11 * s,
        12
      );
      k.box(
        "cloister-capital",
        planVertex(point, context.elevation + 1.97 * s),
        [0.36 * s, 0.22 * s, 0.36 * s],
        "white"
      );
      const arch = new THREE.Shape();
      arch.moveTo(0, 2.78 * s);
      arch.lineTo(bay, 2.78 * s);
      arch.lineTo(bay, 1.85 * s);
      arch.quadraticCurveTo(bay * 0.82, 2.45 * s, bay / 2, 2.58 * s);
      arch.quadraticCurveTo(bay * 0.18, 2.45 * s, 0, 1.85 * s);
      arch.closePath();
      const stone = k.add(
        "open-pointed-cloister-arch",
        new THREE.ExtrudeGeometry(arch, { depth: 0.24 * s, bevelEnabled: false, curveSegments: 6 }),
        "stone"
      );
      edgePlacement(stone, point, b, context.elevation, -0.24 * s);
      const outside = lerp(outerA, outerB, j / count);
      k.beam(
        "cloister-roof-rafter",
        planVertex(outside, context.elevation + 3.26 * s),
        planVertex(point, context.elevation + 2.76 * s),
        0.1 * s
      );
    }
    const corners = [
      planVertex(outerA, context.elevation + 3.3 * s),
      planVertex(outerB, context.elevation + 3.3 * s),
      planVertex(b, context.elevation + 2.8 * s),
      planVertex(a, context.elevation + 2.8 * s)
    ];
    polygonMesh(k, "cloister-roof", corners, "tile");
    for (let row = 1; row < 6; row++) {
      const t = row / 6,
        delta = 0.008;
      polygonMesh(
        k,
        "cloister-tile-course",
        [
          planVertex(lerp(outerA, a, t), context.elevation + (3.3 - 0.5 * t) * s + 0.012 * s),
          planVertex(lerp(outerB, b, t), context.elevation + (3.3 - 0.5 * t) * s + 0.012 * s),
          planVertex(lerp(outerB, b, t + delta), context.elevation + (3.3 - 0.5 * (t + delta)) * s + 0.012 * s),
          planVertex(lerp(outerA, a, t + delta), context.elevation + (3.3 - 0.5 * (t + delta)) * s + 0.012 * s)
        ],
        "stone"
      );
    }
  }
  return k.finish();
}

export function createHighFriaryWall(context: MonasteryContext) {
  const k = new ModelKit("friary-wall-high"),
    s = context.scale;
  for (let i = 1; i < context.plan.wall.length; i++) {
    const a = context.plan.wall[i - 1],
      b = context.plan.wall[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) continue;
    const body = k.box(
      "precinct-wall",
      planVertex(lerp(a, b, 0.5), context.elevation + 0.9 * s),
      [length, 1.8 * s, 0.5 * s],
      "stone"
    );
    body.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const count = Math.max(1, Math.ceil(length / (1.2 * s)));
    for (let j = 0; j < count; j++) {
      const cap = k.box(
        "wall-coping-stone",
        planVertex(lerp(a, b, (j + 0.5) / count), context.elevation + 1.83 * s),
        [length / count - 0.02 * s, 0.15 * s, 0.6 * s],
        "white"
      );
      cap.rotation.y = body.rotation.y;
    }
  }
  return k.finish();
}

/** Shared perforated masonry used by fitted church and tower programmes. */
export { wall as addMonasteryMasonryWall };
