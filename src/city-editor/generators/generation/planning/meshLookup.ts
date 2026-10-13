import type { Id, Mesh, Point } from "../../../types/document";
import type { MeshBorderLoop } from "../../../types/generation";
import type { WallSegmentKind } from "../../../types/geometry";
export type NearestVertex = (p: Point, among?: ReadonlySet<Id>) => Id | null;
export function nearestVertexLookup(mesh: Mesh, bucket: number): NearestVertex {
  const B = Math.max(1, bucket);
  const grid = new Map<string, Id[]>();
  const key = (x: number, y: number): string => `${Math.round(x / B)},${Math.round(y / B)}`;
  for (const vertex of Object.values(mesh.vertices)) {
    const k = key(vertex.point[0], vertex.point[1]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(vertex.id);
  }
  return (p, among) => {
    const gx = Math.round(p[0] / B);
    const gy = Math.round(p[1] / B);
    let best: Id | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (let x = gx - 2; x <= gx + 2; x++) {
      for (let y = gy - 2; y <= gy + 2; y++) {
        for (const id of grid.get(`${x},${y}`) ?? []) {
          if (among && !among.has(id)) continue;
          const v = mesh.vertices[id];
          const d = Math.hypot(v.point[0] - p[0], v.point[1] - p[1]);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      }
    }
    if (best) return best;
    // Widen once for a constrained search (e.g. gate → wall vertex).
    for (const id of among ?? Object.keys(mesh.vertices)) {
      const v = mesh.vertices[id];
      if (!v) continue;
      const d = Math.hypot(v.point[0] - p[0], v.point[1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };
}

export function toGeneratorBorder(loop: MeshBorderLoop): {
  points: Point[];
  segments: WallSegmentKind[];
  urbanCellIds: number[];
} {
  return {
    points: loop.points.map(p => [p[0], p[1]] as Point),
    segments: loop.points.map(() => "land" as WallSegmentKind),
    urbanCellIds: loop.cellIds
  };
}
