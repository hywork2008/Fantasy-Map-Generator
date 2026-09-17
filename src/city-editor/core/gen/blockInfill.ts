// Local street/lot geometry. None of these subdivisions become mesh edges.
import { facePoints, indexMeshEdges } from "../mesh";
import type { CityDocument, Face, Id, Point } from "../types";
import type { BuildingLot } from "./buildingLots";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { clipHalfPlane, insetConvexKernel } from "./lotGeometry";
import { makeRng } from "./prng";

export interface InfillLane {
  faceId: Id;
  points: Point[];
  widthMeters: number;
}
export interface CityFabric {
  buildings: BuildingLot[];
  lanes: InfillLane[];
  /** Portals shared by adjacent faces, or opening onto a major road. */
  entrances: Map<Id, Point[]>;
}
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dot = (p: Point, n: Point) => p[0] * n[0] + p[1] * n[1];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p: Point, a: Point, b: Point) => nearestOnPolyline(p, [a, b]).dist < 1e-5;
const boundary = (poly: Point[]) => [...poly, poly[0]];

/** Convex pieces of a simple polygon; triangulation seams remain local to infill. */
export function convexInfillParts(polygon: Point[]): Point[][] {
  const sign = -Math.sign(polygonArea(polygon));
  if (!sign || polygon.length < 3) return [];
  const convex = (ids: number[]) =>
    ids.every(
      (v, i) =>
        sign * cross(polygon[ids[(i + ids.length - 1) % ids.length]], polygon[v], polygon[ids[(i + 1) % ids.length]]) >=
        -1e-7
    );
  const remaining = polygon.map((_, i) => i);
  if (convex(remaining)) return [polygon];
  const pieces: number[][] = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((b, i) => {
      const a = remaining[(i + remaining.length - 1) % remaining.length],
        c = remaining[(i + 1) % remaining.length];
      if (sign * cross(polygon[a], polygon[b], polygon[c]) <= 1e-7) return false;
      return !remaining.some(
        v =>
          v !== a &&
          v !== b &&
          v !== c &&
          sign * cross(polygon[a], polygon[b], polygon[v]) >= -1e-7 &&
          sign * cross(polygon[b], polygon[c], polygon[v]) >= -1e-7 &&
          sign * cross(polygon[c], polygon[a], polygon[v]) >= -1e-7
      );
    });
    if (ear < 0) return []; // Invalid/degenerate edited polygon: don't draw across its exterior.
    pieces.push([
      remaining[(ear + remaining.length - 1) % remaining.length],
      remaining[ear],
      remaining[(ear + 1) % remaining.length]
    ]);
    remaining.splice(ear, 1);
  }
  pieces.push(remaining);
  // Merge triangles into broad convex regions rather than exposing triangulation in the buildings.
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++) {
        const edges = [...pieces[i], ...pieces[j]];
        if (new Set(edges).size !== edges.length - 2) continue;
        const directed = [pieces[i], pieces[j]].flatMap(ids => ids.map((a, k) => [a, ids[(k + 1) % ids.length]]));
        const border = directed.filter(([a, b]) => !directed.some(([c, d]) => a === d && b === c));
        if (!border.length) continue;
        const ring = [border[0][0]];
        while (ring.length < border.length) {
          const edge = border.find(([a]) => a === ring.at(-1));
          if (!edge || ring.includes(edge[1])) break;
          ring.push(edge[1]);
        }
        if (ring.length !== border.length || !convex(ring)) continue;
        pieces[i] = ring;
        pieces.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  return pieces.map(ids => ids.map(i => polygon[i]));
}

/** Reachable face portals form a forest rooted at real major-road frontages. */
export function buildBlockFabric(document: CityDocument): CityFabric {
  const fabric: CityFabric = { buildings: [], lanes: [], entrances: new Map() };
  const { mesh } = document;
  const edges = indexMeshEdges(mesh);
  const roads = new Set<Id>(),
    barriers = new Set<Id>();
  const clearance = new Map<Id, number>();
  const rivers: { points: Point[]; width: number }[] = [];
  for (const group of document.featureGroups) {
    const ids =
      group.kind === "river"
        ? group.vertices.slice(1).flatMap((v, i) => {
            const edge = edges.between(group.vertices[i], v);
            return edge ? [edge.id] : [];
          })
        : group.segments.map(s => s.edgeId);
    for (const id of ids) {
      if (group.kind === "road") roads.add(id);
      if (group.kind === "river" || group.kind === "wall") barriers.add(id);
      clearance.set(id, Math.max(clearance.get(id) ?? 0, group.style.widthMeters / 2 + 3));
    }
    if (group.kind === "river")
      rivers.push({ points: group.vertices.map(v => mesh.vertices[v].point), width: group.style.widthMeters });
  }
  const land = new Set(
    Object.values(mesh.faces)
      .filter(f => f.properties.water === "land" && f.properties.buildable)
      .map(f => f.id)
  );
  const edgeMid = (id: Id) => mid(mesh.vertices[mesh.edges[id].a].point, mesh.vertices[mesh.edges[id].b].point);
  const add = (id: Id, p: Point) => {
    const points = fabric.entrances.get(id) ?? [];
    if (!points.some(q => distance(p, q) < 1e-5)) points.push(p);
    fabric.entrances.set(id, points);
  };
  const queue: Id[] = [];
  for (const id of land) {
    const frontages = mesh.faces[id].boundary.filter(ref => roads.has(ref.edgeId) && !barriers.has(ref.edgeId));
    if (!frontages.length) continue;
    for (const ref of frontages) add(id, edgeMid(ref.edgeId));
    queue.push(id);
  }
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    for (const ref of mesh.faces[id].boundary) {
      const edge = mesh.edges[ref.edgeId],
        other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (!other || !land.has(other) || reached.has(other) || barriers.has(edge.id)) continue;
      // A locked boundary is not opened by procedural infill.
      if (edge.locked || mesh.faces[id].properties.locked || mesh.faces[other].properties.locked) continue;
      add(id, edgeMid(edge.id));
      add(other, edgeMid(edge.id));
      reached.add(other);
      queue.push(other);
    }
  }
  for (const id of queue) {
    const face = mesh.faces[id];
    const polygon = facePoints(mesh, face);
    const parts = convexInfillParts(polygon);
    const entries = fabric.entrances.get(id)!;
    const reserved = document.elements.some(e => ["plaza", "temple"].includes(e.kind) && e.faceIds.includes(id));
    const build = !!face.properties.ward && !["park", "empty"].includes(face.properties.ward) && !reserved;
    for (const part of parts) {
      const portals = entries.filter(p => part.some((a, i) => onSegment(p, a, part[(i + 1) % part.length])));
      // Shared convex-piece seams also carry access, without modifying the face.
      for (let i = 0; i < part.length; i++) {
        const a = part[i],
          b = part[(i + 1) % part.length];
        if (
          parts.some(
            other =>
              other !== part &&
              other.some((c, j) => distance(a, other[(j + 1) % other.length]) < 1e-5 && distance(b, c) < 1e-5)
          )
        )
          portals.push(mid(a, b));
      }
      if (!portals.length) continue;
      const setbacks = part.map((a, i) => {
        const b = part[(i + 1) % part.length];
        const edge = face.boundary.find(
          (_, k) =>
            onSegment(a, polygon[k], polygon[(k + 1) % polygon.length]) &&
            onSegment(b, polygon[k], polygon[(k + 1) % polygon.length])
        );
        if (!edge) return 0;
        const shared = mesh.edges[edge.edgeId];
        const other = mesh.faces[(shared.leftFace === id ? shared.rightFace : shared.leftFace) ?? ""];
        return Math.max(3, clearance.get(edge.edgeId) ?? 0, other && other.properties.water !== "land" ? 6 : 0);
      });
      const safe = insetConvexKernel(part, setbacks);
      if (safe.length < 3 || Math.abs(polygonArea(safe)) < 65) continue;
      const roadFrontages = face.boundary
        .filter(ref => roads.has(ref.edgeId))
        .map(ref => {
          const edge = mesh.edges[ref.edgeId];
          return [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point];
        });
      fillPart(face, safe, portals, roadFrontages, build, fabric);
    }
  }
  // Physical water clearance is independent of mesh scale, including nearby river bends.
  fabric.buildings = fabric.buildings.filter(
    b => !rivers.some(r => b.polygon.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 2))
  );
  return fabric;
}

function chord(poly: Point[], normal: Point, offset: number): [Point, Point] | null {
  const hits: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = dot(a, normal) - offset,
      db = dot(b, normal) - offset;
    if (Math.abs(da) < 1e-6) hits.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  let best: [Point, Point] | null = null;
  for (const a of hits) for (const b of hits) if (distance(a, b) > (best ? distance(...best) : 1e-5)) best = [a, b];
  return best;
}

function fillPart(
  face: Face,
  polygon: Point[],
  entries: Point[],
  roadFrontages: Point[][],
  build: boolean,
  fabric: CityFabric
): void {
  const rng = makeRng(`block-infill-v1:${face.id}:${face.properties.ward}:${polygon[0].join(",")}`);
  const center = polygonCentroid(polygon);
  const lanes: InfillLane[] = [];
  const addLane = (points: Point[], widthMeters: number) => {
    const lane = { faceId: face.id, points, widthMeters };
    lanes.push(lane);
    fabric.lanes.push(lane);
    return lane;
  };
  let regions: Point[][] = [polygon];
  for (const entry of entries) {
    const anchor = nearestOnPolyline(entry, boundary(polygon)).point;
    const length = distance(anchor, center);
    if (length < 1) continue;
    const normal: Point = [(anchor[1] - center[1]) / length, (center[0] - anchor[0]) / length];
    const offset = dot(center, normal);
    const line = chord(polygon, normal, offset);
    if (!line) continue;
    addLane([entry, anchor, center], 3);
    addLane(line, 3);
    regions = regions
      .flatMap(poly => [
        clipHalfPlane(poly, normal, offset - 2),
        clipHalfPlane(poly, [-normal[0], -normal[1]], -offset - 2)
      ])
      .filter(poly => poly.length >= 3 && Math.abs(polygonArea(poly)) >= 65);
  }
  if (!build) return;
  const landmark = face.properties.ward === "castle";
  const target = landmark ? 1200 : face.properties.ward === "merchant" ? 220 : 150;
  const outskirts = face.properties.settlement === "outskirts";
  const subdivide = (poly: Point[], access: InfillLane[], depth: number) => {
    const area = Math.abs(polygonArea(poly));
    if (area < 65) return;
    const frontage = poly
      .map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const lane = access.find(l => nearestOnPolyline(mid(a, b), l.points).dist <= l.widthMeters / 2 + 0.6);
        return { a, b, lane, length: distance(a, b) };
      })
      .filter(e => e.lane)
      .sort((a, b) => b.length - a.length)[0];
    if (!frontage) return;
    if (depth < 14 && area > target * rng.range(1.2, 1.8) && frontage.length > 12) {
      const normal: Point = [
        (frontage.b[0] - frontage.a[0]) / frontage.length,
        (frontage.b[1] - frontage.a[1]) / frontage.length
      ];
      const offset = dot(frontage.a, normal) + frontage.length * rng.range(0.4, 0.6);
      const line = chord(poly, normal, offset);
      const width = area > 5000 ? 3 : 1.8;
      const a = clipHalfPlane(poly, normal, offset - width / 2 - 0.4);
      const b = clipHalfPlane(poly, [-normal[0], -normal[1]], -offset - width / 2 - 0.4);
      if (line && a.length >= 3 && b.length >= 3 && Math.min(Math.abs(polygonArea(a)), Math.abs(polygonArea(b))) > 65) {
        // Extend across the setback into the parent lane, making the T junction real.
        const points = line.map(p => {
          const near = access.map(l => ({ l, ...nearestOnPolyline(p, l.points) })).sort((a, b) => a.dist - b.dist)[0];
          return near && near.dist <= near.l.widthMeters / 2 + 0.7 ? near.point : p;
        });
        const lane = addLane(points, width);
        subdivide(a, [...access, lane], depth + 1);
        subdivide(b, [...access, lane], depth + 1);
        return;
      }
    }
    // Outskirts leave the back of a coarse cell open; dense cores retain occasional courtyards.
    if (outskirts && !roadFrontages.some(line => nearestOnPolyline(polygonCentroid(poly), line).dist < 45)) return;
    if (!landmark && area < 800 && rng() < (outskirts ? 0.18 : 0.035)) return;
    let footprint = insetConvexKernel(
      poly,
      poly.map(() => 0.45)
    );
    // A residual triangular lot can host a smaller rectangular house; never
    // turn every wedge between access lanes into a triangular building.
    if (footprint.length === 3) {
      const axis: Point = [
        (frontage.b[0] - frontage.a[0]) / frontage.length,
        (frontage.b[1] - frontage.a[1]) / frontage.length
      ];
      const normal: Point = [-axis[1], axis[0]];
      const center = polygonCentroid(footprint);
      const extent = (n: Point) =>
        Math.min(
          Math.max(...footprint.map(p => dot(p, n))) - dot(center, n),
          dot(center, n) - Math.min(...footprint.map(p => dot(p, n)))
        );
      const x = extent(axis),
        y = extent(normal);
      const rectangle = (scale: number): Point[] =>
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ].map(([dx, dy]) => [
          center[0] + scale * (dx * x * axis[0] + dy * y * normal[0]),
          center[1] + scale * (dx * x * axis[1] + dy * y * normal[1])
        ]);
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 12; i++) {
        const t = (lo + hi) / 2;
        if (rectangle(t).every(p => pointInPolygon(p, footprint))) lo = t;
        else hi = t;
      }
      footprint = rectangle(lo);
    }
    if (footprint.length < 3 || Math.abs(polygonArea(footprint)) < 50) return;
    // Keep long unpartitioned slivers and oversized recursion leftovers empty.
    const perimeter = footprint.reduce((s, p, i) => s + distance(p, footprint[(i + 1) % footprint.length]), 0);
    if (Math.abs(polygonArea(footprint)) / perimeter < 1.6 || (!landmark && area > target * 4)) return;
    if (!footprint.every(p => pointInPolygon(p, polygon))) return;
    fabric.buildings.push({ faceId: face.id, polygon: footprint, landmark });
  };
  // Each region inherits only the entry network. Sibling regions' lot alleys
  // are unrelated; accumulating them here makes dense-cell infill quadratic.
  const entryLanes = lanes.slice();
  for (const region of regions) subdivide(region, entryLanes, 0);
}
