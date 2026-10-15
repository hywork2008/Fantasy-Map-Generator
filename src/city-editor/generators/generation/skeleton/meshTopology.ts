// Assemble an exact shared topology after local subdivision. Insert all hanging
// vertices in neighboring boundaries; metre-scale meshFromCells merging would
// move constraints and erase narrow river bands here.
import type { EdgeRef, Mesh } from "../../../types/document";
import type { Point } from "../../../types/geometry";
import { isSimplePolygon, polygonArea, polygonCentroid } from "../../geom";
import { meshEdgesChanged } from "../../mesh";
import type { SkeletonMeshChain, SkeletonMeshLine } from "./contracts";
import {
  clipMeshSegment,
  type MeshSegment,
  meshSegments,
  SegmentGrid,
  segmentDistance,
  segmentParameter
} from "./meshSegments";
import { dist } from "./vector";

export function assembleConformingMesh(
  polygons: Point[][],
  lines: SkeletonMeshLine[],
  half: number,
  cellSize: number,
  eps: number
): { mesh: Mesh; lines: SkeletonMeshChain[] } {
  const mesh: Mesh = { vertices: {}, edges: {}, faces: {} };
  const bins = new Map<string, string[]>();
  let vertexNo = 0;
  const key = (x: number, y: number) => `${x},${y}`;
  const vertex = (p: Point): string => {
    const x = Math.floor(p[0] / eps),
      y = Math.floor(p[1] / eps);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of bins.get(key(x + dx, y + dy)) ?? []) if (dist(p, mesh.vertices[id].point) <= eps) return id;
      }
    const id = `v${vertexNo++}`;
    mesh.vertices[id] = { id, point: [...p], locked: false };
    const k = key(x, y);
    bins.set(k, [...(bins.get(k) ?? []), id]);
    return id;
  };
  const rings = polygons.map(p => p.map(vertex));
  for (const line of lines)
    for (const s of meshSegments(line)) {
      const c = clipMeshSegment(s, half);
      if (c) {
        vertex(c.a);
        vertex(c.b);
      }
    }
  const spatial = new Map<string, string[]>();
  for (const v of Object.values(mesh.vertices)) {
    const k = key(Math.floor(v.point[0] / cellSize), Math.floor(v.point[1] / cellSize));
    spatial.set(k, [...(spatial.get(k) ?? []), v.id]);
  }
  const edgeByEnds = new Map<string, string>();
  let edgeNo = 0;
  rings.forEach((ring, i) => {
    const ids: string[] = [];
    for (let j = 0; j < ring.length; j++) {
      const a = mesh.vertices[ring[j]].point,
        b = mesh.vertices[ring[(j + 1) % ring.length]].point;
      if (dist(a, b) <= eps) continue;
      const s = { a, b },
        found: { id: string; t: number }[] = [];
      for (
        let x = Math.floor((Math.min(a[0], b[0]) - eps) / cellSize);
        x <= Math.floor((Math.max(a[0], b[0]) + eps) / cellSize);
        x++
      ) {
        for (
          let y = Math.floor((Math.min(a[1], b[1]) - eps) / cellSize);
          y <= Math.floor((Math.max(a[1], b[1]) + eps) / cellSize);
          y++
        ) {
          for (const id of spatial.get(key(x, y)) ?? []) {
            const p = mesh.vertices[id].point,
              t = segmentParameter(p, s);
            if (t >= 0 && t < 1 && segmentDistance(p, s) <= eps) found.push({ id, t });
          }
        }
      }
      found.sort((a, b) => a.t - b.t);
      for (const v of found) if (ids.at(-1) !== v.id) ids.push(v.id);
    }
    if (ids.at(-1) === ids[0]) ids.pop();
    for (let j = 0; j < ids.length; j++) {
      const again = ids.indexOf(ids[j], j + 1);
      if (again < 0) continue;
      const loop = ids.slice(j, again).map(id => mesh.vertices[id].point);
      if (loop.length > 2 && Math.abs(polygonArea(loop)) > eps * cellSize) throw new Error(`K6 collapsed loop ${i}`);
      ids.splice(j, again - j);
      j--;
    }
    if (ids.length < 3) return;
    if (new Set(ids).size !== ids.length) throw new Error(`K6 degenerate ring ${i}`);
    const faceId = `f${i}`,
      boundary: EdgeRef[] = [];
    for (let j = 0; j < ids.length; j++) {
      const from = ids[j],
        to = ids[(j + 1) % ids.length];
      const k = from < to ? `${from}:${to}` : `${to}:${from}`;
      let id = edgeByEnds.get(k);
      if (!id) {
        id = `e${edgeNo++}`;
        edgeByEnds.set(k, id);
        mesh.edges[id] = { id, a: from, b: to, leftFace: null, rightFace: null, locked: false };
      }
      const e = mesh.edges[id],
        forward = e.a === from;
      const side = forward ? "leftFace" : "rightFace";
      if (e[side]) throw new Error(`K6 non-manifold edge ${id}`);
      e[side] = faceId;
      boundary.push({ edgeId: id, forward });
    }
    mesh.faces[faceId] = {
      id: faceId,
      boundary,
      site: polygonCentroid(ids.map(id => mesh.vertices[id].point)),
      properties: { elevation: 1, water: "land", ward: null, buildable: true, locked: false }
    };
  });
  for (const e of Object.values(mesh.edges)) {
    if (e.leftFace && e.rightFace) continue;
    const a = mesh.vertices[e.a].point,
      b = mesh.vertices[e.b].point;
    if (![0, 1].some(k => Math.abs(Math.abs(a[k]) - half) <= eps && Math.abs(a[k] - b[k]) <= eps))
      throw new Error(`K6 interior crack ${e.id}`);
  }
  // Remove tiny overlay fragments through their longest unconstrained side.
  // Constraint edges are never removed, including narrow river-bank segments.
  const constraints = lines
    .flatMap(meshSegments)
    .map(s => clipMeshSegment(s, half))
    .filter(s => s !== null);
  const constraintGrid = new SegmentGrid(constraints, cellSize, eps * 2);
  const protectedEdge = (id: string) => {
    const e = mesh.edges[id],
      a = mesh.vertices[e.a].point,
      b = mesh.vertices[e.b].point;
    return constraintGrid.near(a).some(s => segmentDistance(a, s) <= eps * 2 && segmentDistance(b, s) <= eps * 2);
  };
  const pointsOf = (refs: EdgeRef[]) =>
    refs.map(r => {
      const e = mesh.edges[r.edgeId];
      return mesh.vertices[r.forward ? e.a : e.b].point;
    });
  for (const face of Object.values(mesh.faces)) {
    if (!mesh.faces[face.id] || Math.abs(polygonArea(pointsOf(face.boundary))) >= 1) continue;
    const sides = face.boundary
      .filter(r => !protectedEdge(r.edgeId))
      .sort((a, b) => {
        const length = (r: EdgeRef) => {
          const e = mesh.edges[r.edgeId];
          return dist(mesh.vertices[e.a].point, mesh.vertices[e.b].point);
        };
        return length(b) - length(a);
      });
    for (const side of sides) {
      const edge = mesh.edges[side.edgeId],
        otherId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
      if (!otherId) continue;
      const other = mesh.faces[otherId];
      const shared = new Set(
        face.boundary.filter(r => other.boundary.some(q => q.edgeId === r.edgeId)).map(r => r.edgeId)
      );
      if ([...shared].some(protectedEdge)) continue;
      const remaining = [...other.boundary, ...face.boundary].filter(r => !shared.has(r.edgeId));
      const start = (r: EdgeRef) => {
        const e = mesh.edges[r.edgeId];
        return r.forward ? e.a : e.b;
      };
      const end = (r: EdgeRef) => {
        const e = mesh.edges[r.edgeId];
        return r.forward ? e.b : e.a;
      };
      const ordered: EdgeRef[] = [remaining[0]];
      const byStart = new Map(remaining.slice(1).map(r => [start(r), r]));
      while (ordered.length < remaining.length) {
        const next = byStart.get(end(ordered.at(-1)!));
        if (!next) break;
        byStart.delete(start(next));
        ordered.push(next);
      }
      if (ordered.length !== remaining.length || end(ordered.at(-1)!) !== start(ordered[0])) continue;
      if (!isSimplePolygon(pointsOf(ordered))) continue;
      other.boundary = ordered;
      other.site = polygonCentroid(pointsOf(ordered));
      for (const r of face.boundary) {
        const e = mesh.edges[r.edgeId];
        if (shared.has(e.id)) {
          delete mesh.edges[e.id];
          meshEdgesChanged(mesh);
          continue;
        }
        if (e.leftFace === face.id) e.leftFace = otherId;
        if (e.rightFace === face.id) e.rightFace = otherId;
      }
      delete mesh.faces[face.id];
      break;
    }
  }
  const edgeList = Object.values(mesh.edges);
  const activeVertices = new Set(edgeList.flatMap(e => [e.a, e.b]));
  // Spatial indexes over the final topology; `order` keeps the original scan order for tie-breaking.
  const edgeOrder = new Map(edgeList.map((e, i) => [e.id, i]));
  const vertexOrder = new Map([...activeVertices].map((id, i) => [id, i]));
  const edgesAt = new Map<string, typeof edgeList>();
  for (const e of edgeList)
    for (const v of [e.a, e.b === e.a ? [] : e.b].flat()) edgesAt.set(v, [...(edgesAt.get(v) ?? []), e]);
  const vertexBins = new Map<string, string[]>();
  for (const id of activeVertices) {
    const p = mesh.vertices[id].point;
    const k = key(Math.floor(p[0] / cellSize), Math.floor(p[1] / cellSize));
    vertexBins.set(k, [...(vertexBins.get(k) ?? []), id]);
  }
  const verticesNear = (s: MeshSegment, margin: number) => {
    const out: string[] = [];
    for (
      let x = Math.floor((Math.min(s.a[0], s.b[0]) - margin) / cellSize);
      x <= Math.floor((Math.max(s.a[0], s.b[0]) + margin) / cellSize);
      x++
    )
      for (
        let y = Math.floor((Math.min(s.a[1], s.b[1]) - margin) / cellSize);
        y <= Math.floor((Math.max(s.a[1], s.b[1]) + margin) / cellSize);
        y++
      )
        out.push(...(vertexBins.get(key(x, y)) ?? []));
    return out;
  };
  const nearestVertex = (p: Point): string => {
    const cx = Math.floor(p[0] / cellSize),
      cy = Math.floor(p[1] / cellSize);
    let best: string | null = null,
      bestD = Infinity;
    for (let ring = 0; ring < 100000; ring++) {
      // Every vertex in ring r is at least (r - 1) cells away.
      if (best !== null && (ring - 1) * cellSize > bestD) break;
      if (ring > 0 && vertexBins.size === 0) break;
      for (let x = cx - ring; x <= cx + ring; x++)
        for (let y = cy - ring; y <= cy + ring; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== ring) continue;
          for (const id of vertexBins.get(key(x, y)) ?? []) {
            const d = dist(mesh.vertices[id].point, p);
            if (d < bestD || (d === bestD && vertexOrder.get(id)! < vertexOrder.get(best!)!)) {
              best = id;
              bestD = d;
            }
          }
        }
      if (best === null && ring > 2000) break;
    }
    return best ?? [...activeVertices][0];
  };
  const chains = lines.map(line => {
    const refs: EdgeRef[] = [];
    for (const raw of meshSegments(line)) {
      const s = clipMeshSegment(raw, half);
      if (!s || dist(s.a, s.b) <= eps) continue;
      const near = new Map<string, (typeof edgeList)[number]>();
      for (const v of verticesNear(s, eps * 2)) for (const e of edgesAt.get(v) ?? []) near.set(e.id, e);
      const candidates = [...near.values()]
        .sort((x, y) => edgeOrder.get(x.id)! - edgeOrder.get(y.id)!)
        .flatMap(e => {
          const a = mesh.vertices[e.a].point,
            b = mesh.vertices[e.b].point;
          if (segmentDistance(a, s) > eps * 2 || segmentDistance(b, s) > eps * 2) return [];
          const ta = segmentParameter(a, s),
            tb = segmentParameter(b, s);
          if (Math.abs(ta - tb) < 1e-14) return [];
          return [{ edgeId: e.id, forward: ta < tb, t: Math.min(ta, tb) }];
        })
        .sort((a, b) => a.t - b.t);
      // Near-collinear corner fragments can also lie inside the tolerance.
      // Follow shared endpoints rather than concatenating every nearby edge.
      const startOf = (c: EdgeRef) => {
        const e = mesh.edges[c.edgeId];
        return c.forward ? e.a : e.b;
      };
      const endOf = (c: EdgeRef) => {
        const e = mesh.edges[c.edgeId];
        return c.forward ? e.b : e.a;
      };
      const outgoing = new Map<string, EdgeRef[]>();
      for (const c of candidates) {
        const id = startOf(c);
        outgoing.set(id, [...(outgoing.get(id) ?? []), c]);
      }
      const first = nearestVertex(s.a),
        last = nearestVertex(s.b);
      const visited = new Set<string>();
      const walk = (id: string): EdgeRef[] | null => {
        if (id === last) return [];
        if (visited.has(id)) return null;
        visited.add(id);
        for (const c of outgoing.get(id) ?? []) {
          const tail = walk(endOf(c));
          if (tail) return [{ edgeId: c.edgeId, forward: c.forward }, ...tail];
        }
        return null;
      };
      const path = walk(first);
      if (!path || dist(mesh.vertices[first].point, s.a) > eps * 2 || dist(mesh.vertices[last].point, s.b) > eps * 2)
        throw new Error(`K6 missing segment ${line.id}`);
      refs.push(...path);
    }
    const runs: EdgeRef[][] = [];
    for (const ref of refs) {
      const prev = runs.at(-1)?.at(-1);
      const from = mesh.edges[ref.edgeId][ref.forward ? "a" : "b"];
      const to = prev ? mesh.edges[prev.edgeId][prev.forward ? "b" : "a"] : null;
      if (from !== to) runs.push([]);
      runs.at(-1)!.push(ref);
    }
    return { ...line, edges: refs, runs };
  });
  const used = new Set(Object.values(mesh.edges).flatMap(e => [e.a, e.b]));
  for (const id of Object.keys(mesh.vertices)) if (!used.has(id)) delete mesh.vertices[id];
  meshEdgesChanged(mesh);
  return { mesh, lines: chains };
}
