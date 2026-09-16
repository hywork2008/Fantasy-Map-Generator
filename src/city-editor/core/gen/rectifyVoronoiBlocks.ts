import { featureGroupVertices } from "../features";
import { clone, facePoints, faceVertices, mergeVertices } from "../mesh";
import type { CityDocument, Id, Mesh, Point } from "../types";
import { polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { makeRng } from "./prng";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const unit = (a: Point, b: Point): Point => {
  const length = distance(a, b) || 1;
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
};
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 1;

function convex(points: Point[]): boolean {
  // polygonArea uses the opposite sign to the conventional cross product.
  const sign = -Math.sign(polygonArea(points));
  return points.every((b, i) => {
    const a = points[(i + points.length - 1) % points.length];
    const c = points[(i + 1) % points.length];
    return sign * ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) >= -1e-7;
  });
}

function topology(mesh: Mesh) {
  const neighbors = new Map<Id, Id[]>();
  const facesAt = new Map<Id, Id[]>();
  for (const edge of Object.values(mesh.edges)) {
    for (const [a, b] of [
      [edge.a, edge.b],
      [edge.b, edge.a]
    ]) {
      if (!neighbors.has(a)) neighbors.set(a, []);
      neighbors.get(a)!.push(b);
    }
  }
  for (const face of Object.values(mesh.faces)) {
    for (const id of faceVertices(mesh, face)) {
      if (!facesAt.has(id)) facesAt.set(id, []);
      facesAt.get(id)!.push(face.id);
    }
  }
  return { neighbors, facesAt };
}

/** Shape the internal shared mesh, after major-route finishing. The original
 * Voronoi topology is retained except for selected pairs of short-linked T/Y
 * junctions that can form a well-shaped four-way crossing. */
export function rectifyVoronoiBlocks(source: CityDocument, seed: string): CityDocument {
  let next = clone(source);
  let mesh = next.mesh;
  let { neighbors, facesAt } = topology(mesh);
  const original = new Map(Object.values(mesh.vertices).map(v => [v.id, v.point]));
  const areas = new Map(Object.values(mesh.faces).map(f => [f.id, polygonArea(facePoints(mesh, f))]));
  const pinned = new Set<Id>();
  const barriers = new Set<Id>();
  const roads = new Set<Id>();
  const half = next.frame.extentMeters / 2;
  for (const v of Object.values(mesh.vertices)) {
    if (v.locked || Math.abs(v.point[0]) >= half - 0.001 || Math.abs(v.point[1]) >= half - 0.001) pinned.add(v.id);
  }
  for (const group of next.featureGroups) {
    for (const id of featureGroupVertices(next, group)) pinned.add(id);
    if (group.kind !== "river") {
      for (const ref of group.segments) {
        barriers.add(ref.edgeId);
        if (group.kind === "road") roads.add(ref.edgeId);
      }
    }
  }
  for (const gate of next.gates) pinned.add(gate.vertexId);
  for (const element of next.elements) {
    if (!element.locked) continue;
    for (const fid of element.faceIds) {
      const face = mesh.faces[fid];
      if (face) for (const id of faceVertices(mesh, face)) pinned.add(id);
    }
  }
  for (const face of Object.values(mesh.faces)) {
    // Existing route smoothing can already have made a cell concave. Protect
    // its whole ring; internal rectification must never introduce concavity.
    if (
      face.properties.locked ||
      !face.properties.buildable ||
      face.properties.water !== "land" ||
      !convex(facePoints(mesh, face))
    ) {
      for (const id of faceVertices(mesh, face)) pinned.add(id);
    }
  }
  for (const edge of Object.values(mesh.edges)) {
    if (edge.locked || !edge.leftFace || !edge.rightFace) pinned.add(edge.a).add(edge.b);
  }
  for (const edge of Object.values(mesh.edges)) {
    if (pinned.has(edge.a) && pinned.has(edge.b)) barriers.add(edge.id);
  }

  const urban = new Set(
    Object.values(mesh.faces)
      .filter(f => f.properties.buildable && f.properties.water === "land" && !f.properties.locked)
      .map(f => f.id)
  );
  const visited = new Set<Id>();
  const pairs = new Map<Id, { a: Id; b: Id; axis: number; scale: number; phase: number; bend: number }>();
  for (const start of urban) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    const vertices = new Set<Id>();
    const boundaryRoads = new Set<Id>();
    const lengths: number[] = [];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const fid = queue[cursor];
      for (const ref of mesh.faces[fid].boundary) {
        const e = mesh.edges[ref.edgeId];
        vertices.add(e.a).add(e.b);
        lengths.push(distance(mesh.vertices[e.a].point, mesh.vertices[e.b].point));
        if (roads.has(e.id)) boundaryRoads.add(e.id);
        const other = e.leftFace === fid ? e.rightFace : e.leftFace;
        if (!barriers.has(e.id) && other && urban.has(other) && !visited.has(other)) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    const scale = median(lengths);
    const rng = makeRng(`${seed}:voronoi-block:${start}`);
    const phase = rng.range(0, Math.PI * 2);
    const fallback = rng.range(0, Math.PI / 2);
    for (const id of vertices) {
      if (pinned.has(id)) continue;
      const ns = neighbors.get(id)!;
      if (ns.length !== 3) continue;
      const p = mesh.vertices[id].point;
      let x = 0;
      let y = 0;
      for (const eid of boundaryRoads) {
        const e = mesh.edges[eid];
        const a = mesh.vertices[e.a].point;
        const b = mesh.vertices[e.b].point;
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const weight = distance(a, b) / (scale * scale * 4 + distance(p, midpoint) ** 2);
        // Fourfold averaging treats perpendicular streets as the same frame.
        x += Math.cos(4 * angle) * weight;
        y += Math.sin(4 * angle) * weight;
      }
      const axis = Math.hypot(x, y) > 1e-8 ? Math.atan2(y, x) / 4 : fallback;
      let best = Infinity;
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = mesh.vertices[ns[i]].point;
          const b = mesh.vertices[ns[j]].point;
          const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const score = 1 + dot(unit(p, a), unit(p, b)) + 0.22 * (1 - Math.cos(4 * (angle - axis)));
          if (score >= best) continue;
          best = score;
          const normal: Point = [-(b[1] - a[1]) / distance(a, b), (b[0] - a[0]) / distance(a, b)];
          const bend = dot([p[0] - a[0], p[1] - a[1]], normal);
          pairs.set(id, { a: ns[i], b: ns[j], axis, scale, phase, bend });
        }
      }
    }
  }

  const validFaces = (candidate: Mesh, fids: Iterable<Id>): boolean => {
    for (const fid of fids) {
      const points = facePoints(candidate, candidate.faces[fid]);
      if (polygonArea(points) / areas.get(fid)! < 0.4 || !convex(points)) return false;
      for (let i = 0; i < points.length; i++) {
        if (distance(points[i], points[(i + 1) % points.length]) < 1.01) return false;
        for (let j = i + 2; j < points.length; j++) {
          if (i === 0 && j === points.length - 1) continue;
          if (segmentSegmentHit(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]))
            return false;
        }
      }
    }
    return true;
  };

  // Fixed through-pairs avoid changing the chosen street at every iteration.
  // Project towards their chord, with a small spatially correlated residual.
  for (let pass = 0; pass < 18; pass++) {
    for (const [id, pair] of pairs) {
      const v = mesh.vertices[id];
      const p = v.point;
      const a = mesh.vertices[pair.a].point;
      const b = mesh.vertices[pair.b].point;
      const along = unit(a, b);
      const normal: Point = [-along[1], along[0]];
      const origin = original.get(id)!;
      const wave = Math.sin(
        (origin[0] * Math.cos(pair.axis) + origin[1] * Math.sin(pair.axis)) / (pair.scale * 3) + pair.phase
      );
      // Retain a fraction of the original bend instead of adding independent
      // per-vertex noise that would recreate a zigzag.
      const residual = pair.bend * (0.12 + 0.035 * wave);
      const offset = dot([p[0] - a[0], p[1] - a[1]], normal) - residual;
      let target: Point = [p[0] - normal[0] * offset, p[1] - normal[1] * offset];
      const displacement = distance(origin, target);
      if (displacement > pair.scale * 0.4) {
        const ratio = (pair.scale * 0.4) / displacement;
        target = [origin[0] + (target[0] - origin[0]) * ratio, origin[1] + (target[1] - origin[1]) * ratio];
      }
      for (let strength = 0.5; strength >= 1 / 128; strength /= 2) {
        v.point = [p[0] + (target[0] - p[0]) * strength, p[1] + (target[1] - p[1]) * strength];
        if (validFaces(mesh, facesAt.get(id)!)) break;
        v.point = p;
      }
    }
  }

  // Only join two degree-three junctions when the resulting four rays form
  // two nearly straight, roughly perpendicular continuations. Never cascade
  // collapses into a five-way (or higher) junction.
  const candidates = Object.values(mesh.edges)
    .filter(e => !pinned.has(e.a) && !pinned.has(e.b))
    .sort(
      (a, b) =>
        distance(mesh.vertices[a.a].point, mesh.vertices[a.b].point) -
        distance(mesh.vertices[b.a].point, mesh.vertices[b.b].point)
    );
  let collapsed = 0;
  const budget = Math.max(1, Math.floor(pairs.size * 0.06));
  for (const candidate of candidates) {
    if (collapsed >= budget) break;
    const e = mesh.edges[candidate.id];
    if (!e || !pairs.has(e.a) || !pairs.has(e.b)) continue;
    const na = neighbors.get(e.a)!;
    const nb = neighbors.get(e.b)!;
    if (na.length !== 3 || nb.length !== 3) continue;
    const a = mesh.vertices[e.a].point;
    const b = mesh.vertices[e.b].point;
    const outer = [...na.filter(id => id !== e.b), ...nb.filter(id => id !== e.a)];
    if (new Set(outer).size !== 4) continue;
    const scale = median([
      ...na.map(id => distance(a, mesh.vertices[id].point)),
      ...nb.map(id => distance(b, mesh.vertices[id].point))
    ]);
    if (distance(a, b) > scale * 0.32) continue;
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const rays = outer.map(id => unit(midpoint, mesh.vertices[id].point));
    const before = (p: Point, ns: Id[]) =>
      Math.min(
        ...ns.flatMap((id, i) =>
          ns.slice(i + 1).map(other => 1 + dot(unit(p, mesh.vertices[id].point), unit(p, mesh.vertices[other].point)))
        )
      );
    const oldError = before(a, na) + before(b, nb);
    const improves = [
      [0, 1, 2, 3],
      [0, 2, 1, 3],
      [0, 3, 1, 2]
    ].some(([i, j, k, l]) => {
      const first = 1 + dot(rays[i], rays[j]);
      const second = 1 + dot(rays[k], rays[l]);
      return first < 0.1 && second < 0.1 && first + second < oldError * 0.8 && Math.abs(dot(rays[i], rays[k])) < 0.45;
    });
    if (!improves) continue;
    const merged = mergeVertices(next, e.a, e.b);
    if (!merged) continue;
    merged.mesh.vertices[e.a].point = midpoint;
    const affected = new Set([...facesAt.get(e.a)!, ...facesAt.get(e.b)!]);
    if (!validFaces(merged.mesh, affected)) continue;
    next = merged;
    mesh = next.mesh;
    ({ neighbors, facesAt } = topology(mesh));
    collapsed++;
  }
  for (const face of Object.values(mesh.faces)) {
    if (faceVertices(mesh, face).some(id => pairs.has(id)) && !face.properties.locked) {
      face.site = polygonCentroid(facePoints(mesh, face));
    }
  }
  for (const element of next.elements) {
    if (element.locked || !element.id.startsWith("gc:") || !element.faceIds.length) continue;
    const face = mesh.faces[element.faceIds[0]];
    if (face) element.point = polygonCentroid(facePoints(mesh, face));
  }
  return next;
}
