import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea, polygonCentroid, simplifyPolyline } from "./geom";
import { bounds, corridor, intersectConvex, PlotIndex } from "./parcelGeometry";
import { reconstructRuralBoundaries } from "./ruralFieldBoundaries";
import type { DetailedRuralFieldInput } from "./ruralFieldDetails";
import { clipLines, curvedRows, gatedBoundary } from "./ruralFieldGeometry";
import type { RuralFieldPlan } from "./ruralFieldPlan";

const area = (p: Point[]) => Math.abs(polygonArea(p));
const key = (x: number, y: number) => `${x}:${y}`;
const hash = (s: string) => {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return (n ^ (n >>> 13)) >>> 0;
};
type AccessNode = { point: Point; x: number; y: number };
type Group = { id: string; center: Point; angle: number; seed: number };
interface Context {
  input: DetailedRuralFieldInput;
  result: RuralFieldPlan;
  nodes: Map<string, AccessNode>;
  queue: string[];
  groups: Group[];
  tracks: Point[][];
  q: number;
  clear(p: Point[]): boolean;
  source(p: Point[]): string[];
}

/** Partition all accessible ground. Fields share boundaries instead of being
 * independent rectangles fitted into separate, partially empty envelopes. */
export function finishRuralTerritories({
  input,
  result,
  nodes,
  queue,
  groups,
  tracks,
  clear,
  source,
  q
}: Context): RuralFieldPlan {
  if (!groups.length) return result;
  const timing = input.profiler?.stages("generation/layout");
  timing?.next("territory-ownership");
  const owners = new Map<string, number>();
  const extents = groups.map(() => ({ lo: Infinity, hi: -Infinity }));
  for (const id of queue) {
    const node = nodes.get(id)!;
    let best = 0,
      d = Infinity;
    groups.forEach((g, i) => {
      const next = Math.hypot(node.point[0] - g.center[0], node.point[1] - g.center[1]);
      if (next < d) {
        best = i;
        d = next;
      }
    });
    owners.set(id, best);
    const g = groups[best],
      v = -(node.point[0] - g.center[0]) * Math.sin(g.angle) + (node.point[1] - g.center[1]) * Math.cos(g.angle);
    extents[best].lo = Math.min(extents[best].lo, v - q);
    extents[best].hi = Math.max(extents[best].hi, v + q);
  }
  timing?.next("interior-tracks");
  groups.forEach((g, i) => {
    const at = (v: number): Point => [g.center[0] - v * Math.sin(g.angle), g.center[1] + v * Math.cos(g.angle)];
    const { lo, hi } = extents[i],
      steps = Math.ceil((hi - lo) / q);
    let run: Point[] = [];
    const flush = () => {
      if (run.length > 1) tracks.push([run[0], run.at(-1)!]);
      run = [];
    };
    for (let j = 0; j < steps; j++) {
      const a = at(lo + ((hi - lo) * j) / steps),
        b = at(lo + ((hi - lo) * (j + 1)) / steps);
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (owners.get(key(Math.floor(mid[0] / q), Math.floor(mid[1] / q))) === i && clear(corridor(a, b, 3.8, 1.9))) {
        if (!run.length) run.push(a);
        run.push(b);
      } else flush();
    }
    flush();
  });
  timing?.next("track-reservations");
  const reservations = new PlotIndex<Point[]>();
  for (const line of tracks) {
    const band = corridor(line[0], line[1], 3.8, 1.9);
    if (band.length) reservations.add(band, bounds(band));
  }
  for (const road of input.roads)
    for (let i = 1; i < road.points.length; i++) {
      const band = corridor(road.points[i - 1], road.points[i], road.widthMeters + 2);
      if (band.length) reservations.add(band, bounds(band));
    }
  const laneCells = new Set<string>(),
    boundarySegments: Point[][] = [];
  for (const id of queue) {
    const n = nodes.get(id)!,
      polygon: Point[] = [
        [n.x * q, n.y * q],
        [(n.x + 1) * q, n.y * q],
        [(n.x + 1) * q, (n.y + 1) * q],
        [n.x * q, (n.y + 1) * q]
      ];
    if (reservations.query(bounds(polygon)).some(band => area(intersectConvex(polygon, band)) > 0.01))
      laneCells.add(id);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1]
    ]) {
      const next = key(n.x + dx, n.y + dy);
      if (!owners.has(next) || owners.get(next) === owners.get(id)) continue;
      laneCells.add(id);
      laneCells.add(next);
      const a: Point = dx ? [(n.x + 1) * q, n.y * q] : [n.x * q, (n.y + 1) * q];
      const b: Point = dx ? [(n.x + 1) * q, (n.y + 1) * q] : [(n.x + 1) * q, (n.y + 1) * q];
      if (!input.blocked(corridor(a, b, 2.8))) boundarySegments.push([a, b]);
    }
  }
  timing?.next("boundary-routes");
  const boundaryRoutes = joinSegments(boundarySegments, q, clear);
  for (const line of boundaryRoutes)
    for (let i = 1; i < line.length; i++) {
      const band = corridor(line[i - 1], line[i], 2.8);
      if (band.length) reservations.add(band, bounds(band));
    }
  for (const id of queue) {
    if (laneCells.has(id)) continue;
    const n = nodes.get(id)!;
    const polygon: Point[] = [
      [n.x * q, n.y * q],
      [(n.x + 1) * q, n.y * q],
      [(n.x + 1) * q, (n.y + 1) * q],
      [n.x * q, (n.y + 1) * q]
    ];
    if (reservations.query(bounds(polygon)).some(band => area(intersectConvex(polygon, band)) > 0.01))
      laneCells.add(id);
  }
  timing?.next("strip-labels");
  const labels = new Map<string, string>();
  for (const id of queue) {
    if (laneCells.has(id)) continue;
    const n = nodes.get(id)!,
      index = owners.get(id)!,
      g = groups[index];
    const dx = n.point[0] - g.center[0],
      dy = n.point[1] - g.center[1];
    const u = dx * Math.cos(g.angle) + dy * Math.sin(g.angle),
      v = -dx * Math.sin(g.angle) + dy * Math.cos(g.angle);
    const offset = v - 7 * Math.sin(u / 110 + (g.seed % 7));
    let cut = extents[index].lo - q,
      strip = 0;
    while (cut < offset && strip < 1000) {
      cut += 22 + (hash(`${g.seed}:strip:${strip}`) % 19);
      strip++;
    }
    labels.set(id, `${index}:${strip}`);
  }
  timing?.next("trace-components");
  const components: { label: string; ring: Point[] }[] = [],
    visited = new Set<string>();
  for (const [id, label] of labels) {
    if (visited.has(id)) continue;
    const component = [id];
    visited.add(id);
    for (let i = 0; i < component.length; i++) {
      const n = nodes.get(component[i])!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const next = key(n.x + dx, n.y + dy);
        if (!visited.has(next) && labels.get(next) === label) {
          visited.add(next);
          component.push(next);
        }
      }
    }
    for (const ring of traceFields(component, nodes, q)) if (area(ring) >= 150) components.push({ label, ring });
  }
  const clearsBoundary = (polygon: Point[]) =>
    clear(polygon) && !reservations.query(bounds(polygon)).some(band => area(intersectConvex(polygon, band)) > 0.01);
  timing?.next("reconstruct-boundaries");
  if (input.profiler) input.profiler.counts.rawBoundaryVertices = components.reduce((n, c) => n + c.ring.length, 0);
  const reconstructed = reconstructRuralBoundaries(
    components.map(component => component.ring),
    q,
    clearsBoundary,
    input.profiler
  );
  components.forEach((component, i) => {
    component.ring = reconstructed[i];
  });
  timing?.next("plots-rows-and-boundaries");
  const rows = input.profiler?.wrap("rows", curvedRows) ?? curvedRows;
  const boundary = input.profiler?.wrap("field-boundaries", gatedBoundary) ?? gatedBoundary;
  const sourcesFor = input.profiler?.wrap("source-faces", source) ?? source;
  let remaining = input.areaBudgetM2 === undefined ? Infinity : Math.max(0, input.areaBudgetM2),
    capacity = 0;
  const ordered = components.sort(
    (a, b) =>
      Math.hypot(...polygonCentroid(a.ring)) - Math.hypot(...polygonCentroid(b.ring)) || a.label.localeCompare(b.label)
  );
  for (const [i, component] of ordered.entries()) {
    const index = Number(component.label.split(":")[0]),
      g = groups[index];
    let polygon = removeCollinear(component.ring);
    let visible = input.visibleFrame ? intersectRing(polygon, input.visibleFrame) : polygon,
      size = area(visible);
    capacity += size;
    if (size < 150 || remaining < 150) continue;
    if (size > remaining) {
      const b = bounds(polygon);
      let lo = b[0],
        hi = b[2];
      const clip = (x: number): Point[] => [
        [b[0] - 1, b[1] - 1],
        [x, b[1] - 1],
        [x, b[3] + 1],
        [b[0] - 1, b[3] + 1]
      ];
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2,
          part = intersectRing(polygon, clip(mid));
        if (area(input.visibleFrame ? intersectRing(part, input.visibleFrame) : part) > remaining) hi = mid;
        else lo = mid;
      }
      polygon = intersectRing(polygon, clip(lo));
      visible = input.visibleFrame ? intersectRing(polygon, input.visibleFrame) : polygon;
      size = area(visible);
      if (!isSimplePolygon(visible, 150)) continue;
    }
    const garden =
      input.settings?.gardenRadiusMeters !== undefined &&
      Math.hypot(...polygonCentroid(polygon)) < input.settings.gardenRadiusMeters;
    const system = garden ? "market-garden" : input.system,
      rotation = hash(`${input.seed}:${component.label}`) % 3;
    const state = garden
      ? "horticulture"
      : system === "open-field"
        ? (["winter-crop", "spring-crop", "fallow"] as const)[(rotation + (input.settings?.rotationYear ?? 0)) % 3]
        : "crop";
    const sources = sourcesFor(polygon),
      id = `rural-territory:${component.label}:${i}`,
      boundaryKind = system === "bocage" ? "hedge" : undefined;
    result.farms.push({
      faceId: sources[0] ?? input.land[0].faceId,
      sourceFaceIds: sources,
      plotId: id,
      polygon: visible,
      holdingPolygon: polygon,
      clippedByFrame: area(polygon) - size > 0.01,
      rows: state === "fallow" ? [] : clipLines(rows(polygon, g.angle, garden ? 2.7 : 4, 0), input.visibleFrame),
      system,
      cropState: state,
      rotationGroup: rotation,
      orientationRadians: g.angle,
      managementGroupId: g.id,
      tenureStrips: [],
      boundaryKind,
      boundaries: clipLines(boundary(polygon, polygon[0], 4), input.visibleFrame)
    });
    remaining -= size;
  }
  timing?.next("lanes-and-diagnostics");
  result.lanes = [...tracks, ...boundaryRoutes].flatMap(points =>
    clipLines([points], input.visibleFrame).map(points => ({
      faceId: input.land[0].faceId,
      points,
      widthMeters: 2.8,
      kind: "farm-track" as const
    }))
  );
  const cultivated = result.farms.reduce((sum, farm) => sum + area(farm.polygon), 0),
    budget = input.areaBudgetM2,
    shortfall = budget === undefined ? 0 : Math.max(0, budget - cultivated);
  result.diagnostics = {
    ...result.diagnostics,
    requestedAreaM2: budget,
    cultivatedAreaM2: cultivated,
    shortfallAreaM2: shortfall,
    suitableCapacityM2: capacity,
    profile: input.system,
    unsuitableAreaM2: input.unsuitableAreaM2 ?? 0,
    shortfallReason: shortfall < 0.01 ? undefined : input.unsuitableAreaM2 && capacity === 0 ? "terrain" : "space"
  };
  if (input.profiler)
    Object.assign(input.profiler.counts, {
      components: components.length,
      finalBoundaryVertices: components.reduce((n, c) => n + c.ring.length, 0)
    });
  timing?.end();
  return result;
}
function removeCollinear(ring: Point[]): Point[] {
  return ring.filter((b, i) => {
    const a = ring[(i + ring.length - 1) % ring.length],
      c = ring[(i + 1) % ring.length];
    return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-7;
  });
}
function intersectRing(ring: Point[], clip: Point[]): Point[] {
  return ring.length >= 3 ? intersectConvex(ring, clip) : [];
}
function traceFields(ids: string[], nodes: Map<string, AccessNode>, q: number, depth = 0): Point[][] {
  const members = new Set(ids),
    edges = new Map<string, { a: Point; b: Point }[]>();
  const add = (a: Point, b: Point) => {
    const k = key(a[0], a[1]);
    edges.set(k, [...(edges.get(k) ?? []), { a, b }]);
  };
  for (const id of ids) {
    const { x, y } = nodes.get(id)!;
    if (!members.has(key(x, y - 1))) add([x, y], [x + 1, y]);
    if (!members.has(key(x + 1, y))) add([x + 1, y], [x + 1, y + 1]);
    if (!members.has(key(x, y + 1))) add([x + 1, y + 1], [x, y + 1]);
    if (!members.has(key(x - 1, y))) add([x, y + 1], [x, y]);
  }
  const rings: Point[][] = [];
  while (edges.size) {
    const edge = edges.values().next().value![0],
      ring: Point[] = [];
    let current = edge;
    for (let guard = 0; guard < ids.length * 8 + 8; guard++) {
      ring.push(current.a);
      const k = key(current.a[0], current.a[1]),
        rest = edges.get(k)!.filter(e => e !== current);
      if (rest.length) edges.set(k, rest);
      else edges.delete(k);
      const next = edges.get(key(current.b[0], current.b[1]));
      if (!next) break;
      const dx = current.b[0] - current.a[0],
        dy = current.b[1] - current.a[1];
      const turn = (e: typeof edge) =>
        Math.atan2(dx * (e.b[1] - e.a[1]) - dy * (e.b[0] - e.a[0]), dx * (e.b[0] - e.a[0]) + dy * (e.b[1] - e.a[1]));
      current = [...next].sort((a, b) => turn(b) - turn(a))[0];
    }
    if (ring.length >= 3) rings.push(ring.map(([x, y]) => [x * q, y * q]));
  }
  const hole = rings.find(r => polygonArea(r) > 0);
  if (hole && depth < 8) {
    const cut = polygonCentroid(hole)[1] / q,
      lower = ids.filter(id => nodes.get(id)!.y < cut),
      upper = ids.filter(id => nodes.get(id)!.y >= cut);
    if (lower.length && upper.length)
      return [...traceFields(lower, nodes, q, depth + 1), ...traceFields(upper, nodes, q, depth + 1)];
  }
  return hole ? [] : rings.filter(r => polygonArea(r) < 0);
}
function joinSegments(segments: Point[][], quantum: number, clear: (polygon: Point[]) => boolean): Point[][] {
  const k = (p: Point) => p.map(n => n.toFixed(5)).join(":"),
    graph = new Map<string, { point: Point; edges: number[] }>();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const id = k(p),
        entry = graph.get(id) ?? { point: p, edges: [] };
      entry.edges.push(i);
      graph.set(id, entry);
    }
  });
  const visited = new Set<number>(),
    lines: Point[][] = [];
  for (const [start, entry] of graph) {
    if (entry.edges.length === 2) continue;
    for (const first of entry.edges) {
      if (visited.has(first)) continue;
      const line = [entry.point];
      let id = start,
        index = first;
      while (!visited.has(index)) {
        visited.add(index);
        const segment = segments[index],
          next = k(segment[0]) === id ? segment[1] : segment[0];
        line.push(next);
        id = k(next);
        const node = graph.get(id)!;
        if (node.edges.length !== 2) break;
        index = node.edges.find(i => !visited.has(i)) ?? index;
      }
      let smoothed = line;
      for (let pass = 0; pass < 4; pass++)
        smoothed = smoothed.map(
          (p, i): Point =>
            i === 0 || i === smoothed.length - 1
              ? p
              : [
                  p[0] * 0.5 + (smoothed[i - 1][0] + smoothed[i + 1][0]) * 0.25,
                  p[1] * 0.5 + (smoothed[i - 1][1] + smoothed[i + 1][1]) * 0.25
                ]
        );
      const candidate = simplifyPolyline(smoothed, quantum * 0.65);
      lines.push(
        candidate.slice(1).every((p, i) => clear(corridor(candidate[i], p, 2.8)))
          ? candidate
          : simplifyPolyline(line, 0.5)
      );
    }
  }
  segments.forEach((segment, i) => {
    if (!visited.has(i)) lines.push(segment);
  });
  return lines;
}
