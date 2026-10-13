import type { EdgeRef, Id, Mesh, Point } from "../../types/document";
import type { MeshBorderLoop } from "../../types/generation";
import type { Cell } from "../../types/geometry";
import { orderedBoundaryLoops } from "../features";
import { polygonCentroid, polygonTouchesRectEdge } from "../geom";
import { edgeEnd, faceNeighbors, facePoints } from "../mesh";

export function cellsFromMesh(mesh: Mesh, half: number): { cells: Cell[]; faceIdOf: string[] } {
  const faces = Object.values(mesh.faces);
  const indexOf = new Map<string, number>();
  faces.forEach((face, i) => {
    indexOf.set(face.id, i);
  });
  const rect = { minX: -half, minY: -half, maxX: half, maxY: half };
  const cells: Cell[] = faces.map((face, i) => {
    const polygon = facePoints(mesh, face).map(p => [p[0], p[1]] as Point);
    const centroid = polygonCentroid(polygon);
    return {
      id: i,
      site: face.site ? [face.site[0], face.site[1]] : centroid,
      polygon,
      centroid,
      neighbors: faceNeighbors(mesh, face.id)
        .map(fid => indexOf.get(fid))
        .filter((n): n is number => n !== undefined && n !== i),
      onBorder: polygonTouchesRectEdge(polygon, rect, Math.max(0.5, half * 1e-4))
    };
  });
  return { cells, faceIdOf: faces.map(f => f.id) };
}

export function borderLoopsForFaces(mesh: Mesh, urbanFaces: Set<Id>, cellIdOf?: Map<string, number>): MeshBorderLoop[] {
  if (!urbanFaces.size) return [];

  const seen = new Set<Id>();
  const loops: MeshBorderLoop[] = [];
  for (const start of urbanFaces) {
    if (seen.has(start)) continue;
    const component = new Set<Id>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const fid = queue.pop() as Id;
      for (const nfid of faceNeighbors(mesh, fid)) {
        if (urbanFaces.has(nfid) && !component.has(nfid)) {
          component.add(nfid);
          seen.add(nfid);
          queue.push(nfid);
        }
      }
    }
    const boundary: EdgeRef[] = [];
    for (const fid of component) {
      const face = mesh.faces[fid];
      for (const ref of face.boundary) {
        const edge = mesh.edges[ref.edgeId];
        const other = edge.leftFace === fid ? edge.rightFace : edge.leftFace;
        if (!other || !component.has(other)) boundary.push(ref);
      }
    }
    const ordered = traceBoundaryLoops(mesh, boundary);
    if (!ordered.length) continue;
    const outer = ordered.reduce((a, b) => (loopArea(mesh, a) >= loopArea(mesh, b) ? a : b));
    loops.push({
      segments: outer,
      points: loopPoints(mesh, outer),
      cellIds: cellIdOf ? [...component].map(fid => cellIdOf.get(fid)).filter((n): n is number => n !== undefined) : []
    });
  }
  return loops;
}

/** Component border loops on the mesh edges bounding each connected urban blob
 * (the largest loop — the outer circumference). No mesh mutation. */
export function componentBorderLoops(mesh: Mesh, faceIdOf: string[], urbanCellIds: Set<number>): MeshBorderLoop[] {
  const cellIdOf = new Map(faceIdOf.map((fid, i) => [fid, i]));
  const urbanFaces = new Set<Id>();
  for (const id of urbanCellIds) if (faceIdOf[id]) urbanFaces.add(faceIdOf[id]);
  return borderLoopsForFaces(mesh, urbanFaces, cellIdOf);
}

/** `orderedBoundaryLoops`, but tolerant of pinch vertices (a boundary vertex with
 * >2 incident boundary edges, common when a fine mesh's urban blob has a thin
 * tentacle): follow the directed edges greedily, taking the smallest left turn so
 * the urban material stays on the left, and keep whatever closed loops emerge. */
function traceBoundaryLoops(mesh: Mesh, boundary: EdgeRef[]): EdgeRef[][] {
  const clean = orderedBoundaryLoops(mesh, boundary);
  if (clean?.length) return clean;

  const remaining = new Set(boundary);
  const byStart = new Map<Id, EdgeRef[]>();
  const startOf = (ref: EdgeRef): Id => {
    const e = mesh.edges[ref.edgeId];
    return ref.forward ? e.a : e.b;
  };
  const dir = (ref: EdgeRef): number => {
    const e = mesh.edges[ref.edgeId];
    const a = mesh.vertices[ref.forward ? e.a : e.b].point;
    const b = mesh.vertices[ref.forward ? e.b : e.a].point;
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  for (const ref of boundary) (byStart.get(startOf(ref)) ?? byStart.set(startOf(ref), []).get(startOf(ref))!).push(ref);

  const loops: EdgeRef[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as EdgeRef;
    const start = startOf(first);
    const loop = [first];
    remaining.delete(first);
    let end = edgeEnd(mesh, first);
    let incoming = dir(first);
    let guard = boundary.length + 4;
    while (end !== start && guard-- > 0) {
      const choices = (byStart.get(end) ?? []).filter(r => remaining.has(r));
      if (!choices.length) break;
      const next = choices.sort((a, b) => leftTurn(incoming, dir(a)) - leftTurn(incoming, dir(b)))[0];
      loop.push(next);
      remaining.delete(next);
      incoming = dir(next);
      end = edgeEnd(mesh, next);
    }
    if (loop.length >= 3 && end === start) loops.push(loop);
  }
  return loops;
}

function leftTurn(from: number, to: number): number {
  return (to - from + Math.PI * 2) % (Math.PI * 2);
}

function loopPoints(mesh: Mesh, refs: EdgeRef[]): Point[] {
  return refs.map(ref => {
    const edge = mesh.edges[ref.edgeId];
    const v = mesh.vertices[ref.forward ? edge.a : edge.b];
    return [v.point[0], v.point[1]] as Point;
  });
}

function loopArea(mesh: Mesh, refs: EdgeRef[]): number {
  const pts = loopPoints(mesh, refs);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}
