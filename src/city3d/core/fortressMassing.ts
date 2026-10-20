import { KRAK, type KrakPhase } from "../../buildings/fortresses/krak";
import { pointInRing, ringArea } from "../../buildings/geometry";
import type { Point } from "../../buildings/record";
import { type FortressPlacement, fortressPoint } from "../../city-editor/generators/fortressPlacement";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import { catalogueMassing } from "./catalogueMassing";

export interface FortressAssembly {
  structures: StructureMassing[];
  innerBaseMeters: number;
  entrance: Point;
}

const ccw = (ring: Point[]): Point[] => (ringArea(ring) < 0 ? [...ring].reverse() : ring);
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1]
];

/** Shared by CE and BV. Geometry is derived from parts, circuit edges and sampled terrain. */
export function fortressMassing(
  placement: FortressPlacement,
  phase: KrakPhase,
  heightAt: (point: Point) => number,
  foundationAt: (ring: Point[]) => number = ring => Math.max(...ring.map(heightAt))
): FortressAssembly {
  const structures: StructureMassing[] = [];
  const scale = placement.scale;
  const point = (p: Point) => fortressPoint(p, placement);
  const ring = (points: readonly Point[]) => points.map(point);
  const outer = ccw(placement.outer);
  const prefix = "krak:";
  const body = (
    id: string,
    kind: StructureMassing["kind"],
    footprint: Point[],
    base: number,
    height: number
  ): StructureMassing => ({
    id: prefix + id,
    name: `${KRAK.name} / ${id.replaceAll("-", " ")}`,
    kind,
    material: "stone",
    footprint,
    baseElevationMeters: base,
    heightMeters: height,
    roof: "flat",
    parapet: "none",
    parapetMeters: 0,
    parapetWidthMeters: 0,
    spire: false
  });
  const solid = (id: string, kind: StructureMassing["kind"], footprint: Point[], base: number, height: number) => {
    const part = body(id, kind, footprint, base, height);
    structures.push(part);
    return part;
  };
  const loft = (
    id: string,
    bottom: Point[],
    top: Point[],
    lows: number[],
    highs: number[],
    kind: StructureMassing["kind"] = "wall"
  ) => {
    const part = body(id, kind, bottom, Math.min(...lows), Math.max(...highs) - Math.min(...lows));
    part.sections = [
      { footprint: bottom, elevationsMeters: lows },
      { footprint: top, elevationsMeters: highs }
    ];
    structures.push(part);
    return part;
  };
  const talusBottom = ring(KRAK.talusBottom),
    talusTop = ring(KRAK.talusTop);
  const innerBaseMeters = foundationAt(talusBottom) + KRAK.terraceHeight * scale;
  const foundationBottom = Math.min(...talusTop.map(heightAt)) - 0.3;
  solid("inner-terrace", "landmark", talusTop, foundationBottom, innerBaseMeters - foundationBottom);
  // Each battered face is a closed strip. East face leaves room for the entrance.
  for (let i = 0; i < talusBottom.length; i++) {
    const j = (i + 1) % talusBottom.length;
    const strips =
      i === 1
        ? [
            [0, (3 + 45) / 88],
            [(8 + 45) / 88, 1]
          ]
        : [[0, 1]];
    for (const [start, end] of strips) {
      const lower = [
        lerp(talusBottom[i], talusBottom[j], start),
        lerp(talusBottom[i], talusBottom[j], end),
        lerp(talusTop[i], talusTop[j], end),
        lerp(talusTop[i], talusTop[j], start)
      ];
      // A narrow inner edge keeps the stone slope a closed solid rather than a sheet.
      const high = [lerp(lower[0], lower[3], 0.999), lerp(lower[1], lower[2], 0.999), lower[2], lower[3]];
      loft(
        `talus-${i}-${start}`,
        ccw(lower),
        ccw(high),
        lower.map(p => heightAt(p) - 0.3),
        lower.map(() => innerBaseMeters)
      );
    }
  }
  for (const part of catalogueMassing(KRAK.inner))
    structures.push({
      ...part,
      id: prefix + part.id,
      name: `${KRAK.name} / ${part.id.replaceAll("-", " ")}`,
      footprint: ring(part.footprint!),
      holes: part.holes?.map(ring),
      baseElevationMeters: innerBaseMeters + part.baseElevationMeters * scale,
      heightMeters: part.heightMeters * scale,
      ridgeAzimuth: (part.ridgeAzimuth ?? 0) + placement.rotation
    });

  // Find the nearest perimeter point for a fallback gate without inventing a mesh vertex.
  const innerEntrance = point(KRAK.innerEntrance);
  const gates = placement.gates.map(gate => ({ ...gate }));
  if (!gates.length) {
    const target = point([100, 5.5]);
    let closest = outer[0],
      best = Infinity;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i],
        b = outer[(i + 1) % outer.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dy) / length2)) : 0;
      const candidate = lerp(a, b, t),
        d = distance(candidate, target);
      if (d < best) {
        best = d;
        closest = candidate;
      }
    }
    gates.push({ point: closest, widthMeters: 5 * scale });
  }
  const width = KRAK.wallWidth * scale;
  const towerPoints: Point[] = [];
  const towers: Array<{ position: Point; tangent: Point; large: boolean }> = [];
  let untilTower = (KRAK.towerSpacing * scale) / 2;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i],
      b = outer[(i + 1) % outer.length],
      length = distance(a, b);
    if (length < 1e-5) continue;
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const atGate = (p: Point, clearance: number) =>
      gates.some(gate => distance(p, gate.point) < gate.widthMeters / 2 + clearance);
    // Long runs accept towers between cell vertices. Sharp corners get one only when there is room.
    const previous = outer[(i + outer.length - 1) % outer.length];
    const incoming = Math.atan2(a[1] - previous[1], a[0] - previous[0]);
    const turn = Math.abs(
      Math.atan2(
        Math.sin(Math.atan2(tangent[1], tangent[0]) - incoming),
        Math.cos(Math.atan2(tangent[1], tangent[0]) - incoming)
      )
    );
    const placeTower = (position: Point, large: boolean) => {
      if (atGate(position, 9 * scale) || towerPoints.some(other => distance(other, position) < 18 * scale)) return;
      towerPoints.push(position);
      towers.push({ position, tangent, large });
    };
    if (turn > Math.PI / 6) placeTower(a, true);
    while (untilTower < length) {
      placeTower(lerp(a, b, untilTower / length), false);
      untilTower += KRAK.towerSpacing * scale;
    }
    untilTower -= length;
    // Split at gate spans before making short, level wall walks over varying foundations.
    let intervals: Array<[number, number]> = [[0, length]];
    for (const gate of gates) {
      const along = (gate.point[0] - a[0]) * tangent[0] + (gate.point[1] - a[1]) * tangent[1];
      const side = Math.abs((gate.point[0] - a[0]) * tangent[1] - (gate.point[1] - a[1]) * tangent[0]);
      if (side > width + 0.1 || along < -gate.widthMeters || along > length + gate.widthMeters) continue;
      const lo = along - gate.widthMeters / 2,
        hi = along + gate.widthMeters / 2;
      intervals = intervals.flatMap(([start, end]) =>
        hi <= start || lo >= end
          ? [[start, end]]
          : ([
              [start, Math.max(start, lo)],
              [Math.min(end, hi), end]
            ].filter(([x, y]) => y - x > 0.1) as Array<[number, number]>)
      );
    }
    for (const [start, end] of intervals) {
      const count = Math.max(1, Math.ceil((end - start) / (8 * scale)));
      for (let j = 0; j < count; j++) {
        const p = lerp(a, b, (start + ((end - start) * j) / count) / length);
        const q = lerp(a, b, (start + ((end - start) * (j + 1)) / count) / length);
        const footprint = ribbon(p, q, width);
        const top = foundationAt(footprint) + KRAK.wallHeight * scale;
        loft(
          `outer-wall-${i}-${start}-${j}`,
          footprint,
          footprint,
          footprint.map(p => heightAt(p) - 0.3),
          footprint.map(() => top)
        );
        const out: Point = [tangent[1] * width * 0.36, -tangent[0] * width * 0.36];
        const lip = ribbon([p[0] + out[0], p[1] + out[1]], [q[0] + out[0], q[1] + out[1]], width * 0.28);
        solid(`wall-parapet-${i}-${start}-${j}`, "wall", lip, top, 1.2 * scale);
      }
    }
  }
  for (const [i, tower] of towers.entries()) {
    const radius = KRAK.towerRadius * scale * (tower.large ? 1.2 : 1);
    const normal: Point = [tower.tangent[1], -tower.tangent[0]];
    const shape = tower.large
      ? Array.from(
          { length: 12 },
          (_, j): Point => [radius * Math.cos((j * Math.PI) / 6), radius * Math.sin((j * Math.PI) / 6)]
        )
      : ([
          [-radius, -width / 2],
          [radius, -width / 2],
          ...Array.from(
            { length: 9 },
            (_, j): Point => [radius * Math.cos((j * Math.PI) / 8), radius * Math.sin((j * Math.PI) / 8)]
          )
        ] as Point[]);
    const footprint = ccw(
      shape.map(([x, y]) => [
        tower.position[0] + x * tower.tangent[0] + y * normal[0],
        tower.position[1] + x * tower.tangent[1] + y * normal[1]
      ])
    );
    const base = Math.min(...footprint.map(heightAt)) - 0.3;
    solid(
      `${tower.large ? "round" : "semicircular"}-tower-${i}`,
      "tower",
      footprint,
      base,
      foundationAt(footprint) + KRAK.towerHeight * scale - base
    );
  }

  const gateBases: number[] = [];
  for (const [i, gate] of gates.entries()) {
    const nearest = nearestEdge(gate.point, outer);
    const tangent = nearest.tangent;
    const opening = gate.widthMeters;
    const top = foundationAt(orientedBox(gate.point, tangent, opening + 8 * scale, 8 * scale));
    gateBases.push(top);
    for (const sign of [-1, 1]) {
      const center: Point = [
        gate.point[0] + tangent[0] * sign * (opening / 2 + 2 * scale),
        gate.point[1] + tangent[1] * sign * (opening / 2 + 2 * scale)
      ];
      const footprint = orientedBox(center, tangent, 4 * scale, 8 * scale);
      const base = Math.min(...footprint.map(heightAt)) - 0.3;
      solid(`gate-${i}-pier-${sign}`, "gate", footprint, base, top + 14 * scale - base);
    }
    solid(
      `gate-${i}-lintel`,
      "gate",
      orientedBox(gate.point, tangent, opening + 8 * scale, 8 * scale),
      top + 5 * scale,
      9 * scale
    );
  }
  const entrance = gates[0].point;
  const bend = point([38, 5.5]);
  const route = distance(entrance, bend) > 2 * scale ? [entrance, bend, innerEntrance] : [entrance, innerEntrance];
  const total = route.slice(1).reduce((sum, p, i) => sum + distance(p, route[i]), 0);
  let traveled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      span = distance(a, b);
    if (span < 0.1) continue;
    const y0 = gateBases[0] + 0.15 + ((innerBaseMeters - gateBases[0] - 0.15) * traveled) / total;
    traveled += span;
    const y1 = gateBases[0] + 0.15 + ((innerBaseMeters - gateBases[0] - 0.15) * traveled) / total;
    const footprint = ribbon(a, b, Math.min(4 * scale, gates[0].widthMeters));
    const highs = [y0, y1, y1, y0];
    loft(
      `access-ramp-${i}`,
      footprint,
      footprint,
      highs.map((y, index) => Math.min(heightAt(footprint[index]) - 0.3, y - 0.6 * scale)),
      highs,
      "landmark"
    );
    if (phase === "mamluk-1302") {
      loft(
        `covered-ramp-${i}`,
        footprint,
        footprint,
        highs.map(y => y + 4 * scale),
        highs.map(y => y + 4.6 * scale),
        "landmark"
      );
      const tangent: Point = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
      for (const sign of [-1, 1]) {
        const offset = sign * (Math.min(4 * scale, gates[0].widthMeters) / 2 - 0.25 * scale);
        const side = ribbon(
          [a[0] - tangent[1] * offset, a[1] + tangent[0] * offset],
          [b[0] - tangent[1] * offset, b[1] + tangent[0] * offset],
          0.5 * scale
        );
        loft(
          `ramp-side-${i}-${sign}`,
          side,
          side,
          highs,
          highs.map(y => y + 4.6 * scale),
          "wall"
        );
      }
    }
  }
  // Southern additions are only drawn if the adapted circuit leaves sufficient space.
  const south = nearestEdge(point([0, -100]), outer);
  const inward: Point = [-south.tangent[1], south.tangent[0]];
  const stableCenter: Point = [south.point[0] + inward[0] * 8 * scale, south.point[1] + inward[1] * 8 * scale];
  const stable = orientedBox(stableCenter, south.tangent, Math.min(south.length * 0.65, 60 * scale), 7 * scale);
  if (clearOfInner(stable)) {
    const base = Math.min(...stable.map(heightAt)) - 0.3;
    solid("southern-stables", "landmark", stable, base, foundationAt(stable) + 6 * scale - base);
  }
  const pond = ring(rectangle(-17, -55, 17, -47));
  if (clearOfInner(pond)) {
    const base = foundationAt(pond);
    const low = Math.min(...pond.map(heightAt)) - 0.3;
    solid("cistern-basin", "landmark", pond, low, base + 0.25 * scale - low);
    const water = solid(
      "cistern-water",
      "landmark",
      ring(rectangle(-16.3, -54.3, 16.3, -47.7)),
      base + 0.26 * scale,
      0.05
    );
    water.color = [0.27, 0.43, 0.49];
  }
  if (phase === "mamluk-1302") {
    const center: Point = [south.point[0] - inward[0] * 5 * scale, south.point[1] - inward[1] * 5 * scale];
    const footprint = orientedBox(center, south.tangent, 17 * scale, 20 * scale);
    const base = Math.min(...footprint.map(heightAt)) - 0.3;
    solid("qalawun-tower-1285", "tower", footprint, base, foundationAt(footprint) + 19 * scale - base);
  }
  return { structures, innerBaseMeters, entrance };

  function clearOfInner(footprint: Point[]) {
    return (
      footprint.every(p => pointInRing(p, outer) && !pointInRing(p, talusBottom)) &&
      !talusBottom.some(p => pointInRing(p, footprint))
    );
  }
}

function ribbon(a: Point, b: Point, width: number): Point[] {
  const length = distance(a, b) || 1,
    nx = (-(b[1] - a[1]) * width) / (2 * length),
    ny = ((b[0] - a[0]) * width) / (2 * length);
  return ccw([
    [a[0] - nx, a[1] - ny],
    [b[0] - nx, b[1] - ny],
    [b[0] + nx, b[1] + ny],
    [a[0] + nx, a[1] + ny]
  ]);
}

function orientedBox(center: Point, tangent: Point, width: number, depth: number): Point[] {
  return ccw(
    rectangle(-width / 2, -depth / 2, width / 2, depth / 2).map(([x, y]) => [
      center[0] + x * tangent[0] - y * tangent[1],
      center[1] + x * tangent[1] + y * tangent[0]
    ])
  );
}

function nearestEdge(point: Point, ring: Point[]) {
  let result = { point: ring[0], tangent: [1, 0] as Point, length: 0 },
    best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      length = distance(a, b);
    if (!length) continue;
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const t = Math.max(0, Math.min(length, (point[0] - a[0]) * tangent[0] + (point[1] - a[1]) * tangent[1]));
    const candidate: Point = [a[0] + tangent[0] * t, a[1] + tangent[1] * t],
      d = distance(point, candidate);
    if (d < best) {
      best = d;
      result = { point: candidate, tangent, length };
    }
  }
  return result;
}
