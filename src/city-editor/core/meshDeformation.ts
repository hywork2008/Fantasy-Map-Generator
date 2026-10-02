import { isSimplePolygon, polygonArea } from "./gen/geom";
import { facePoints, faceVertices, moveVertices, protectedVertex } from "./mesh";
import type { CityDocument, Id, Point } from "./types";

/** Move a corner to its clearance target, spreading the displacement into
 * corners of cells that would otherwise fold. Locked and anchored vertices
 * stay put; all affected cells must remain simple and retain their orientation. */
export function moveVertexWithNeighbors(
  document: CityDocument,
  vertexId: Id,
  target: Point,
  fixed: ReadonlySet<Id>,
  reference: ReadonlyMap<Id, Point>,
  maxDisplacement: number
): CityDocument | null {
  const origin = document.mesh.vertices[vertexId]?.point;
  if (!origin || fixed.has(vertexId) || protectedVertex(document, vertexId)) return null;
  const delta: Point = [target[0] - origin[0], target[1] - origin[1]];
  const half = document.frame.extentMeters / 2;
  const rings = Object.values(document.mesh.faces).map(face => ({
    ids: faceVertices(document.mesh, face),
    area: polygonArea(facePoints(document.mesh, face))
  }));
  const neighbors = new Set<Id>();
  const canMove = (id: Id) => {
    const point = document.mesh.vertices[id].point;
    return (
      !fixed.has(id) &&
      !protectedVertex(document, id) &&
      Math.abs(point[0]) < half - 0.001 &&
      Math.abs(point[1]) < half - 0.001
    );
  };
  // Only expand into cells whose shape failed the previous trial. This keeps
  // the deformation local rather than relaxing the whole settlement.
  for (let sweep = 0; sweep < 4; sweep++) {
    const expand = new Set<Id>();
    for (const strength of neighbors.size ? [0.25, 0.5, 0.75, 1] : [0]) {
      const positions = new Map<Id, Point>([[vertexId, target]]);
      for (const id of neighbors) {
        const point = document.mesh.vertices[id].point;
        const distance = Math.hypot(point[0] - origin[0], point[1] - origin[1]);
        const weight = strength / (1 + distance / document.frame.blockSizeMeters);
        positions.set(id, [point[0] + delta[0] * weight, point[1] + delta[1] * weight]);
      }
      if (
        [...positions].some(([id, point]) => {
          const start = reference.get(id) ?? document.mesh.vertices[id].point;
          return (
            !point.every(Number.isFinite) ||
            Math.abs(point[0]) > half ||
            Math.abs(point[1]) > half ||
            Math.hypot(point[0] - start[0], point[1] - start[1]) > maxDisplacement + 1e-7
          );
        })
      )
        continue;
      let valid = true;
      for (const ring of rings) {
        if (!ring.ids.some(id => positions.has(id))) continue;
        const points = ring.ids.map(id => positions.get(id) ?? document.mesh.vertices[id].point);
        if (
          !isSimplePolygon(points) ||
          polygonArea(points) / ring.area < 0.2 ||
          points.some((point, i) => {
            const other = points[(i + 1) % points.length];
            return Math.hypot(point[0] - other[0], point[1] - other[1]) < 1.01;
          })
        ) {
          valid = false;
          for (const id of ring.ids) if (id !== vertexId && canMove(id)) expand.add(id);
        }
      }
      if (valid) {
        const moved = moveVertices(document, positions);
        if (moved) return moved;
      }
    }
    const count = neighbors.size;
    for (const id of expand) neighbors.add(id);
    if (neighbors.size === count) break;
  }
  return null;
}
