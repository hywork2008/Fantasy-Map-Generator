import type { CityDocument, Id, Point } from "../types/document";

/** Pure label/handle sizing and placement; no DOM. */
const REFERENCE_LABEL_EXTENT_METERS = 1200;
const REFERENCE_LABEL_FONT_SIZE = 14;

/**
 * Label text is expressed in SVG map units. Scale it with the map extent so a
 * freshly opened large/imported map has the same screen size as a new small
 * (1200 m) map; compensate for the current zoom afterwards.
 */
export function selectionLabelFontSize(extentMeters: number, zoom: number): number {
  return (REFERENCE_LABEL_FONT_SIZE * Math.max(1, extentMeters)) / (REFERENCE_LABEL_EXTENT_METERS * Math.max(1, zoom));
}

/**
 * Keep a vertex label directly on its point unless it would cover a nearby
 * vertex. In that case, shift it away from the closest point just far enough
 * for the text to clear it.
 */
export function vertexLabelPoint(vertexId: Id, document: CityDocument, fontSize: number): Point {
  const vertex = document.mesh.vertices[vertexId];
  if (!vertex) return [0, 0];
  let closest: Point | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.values(document.mesh.vertices)) {
    if (candidate.id === vertexId) continue;
    const distance = Math.hypot(candidate.point[0] - vertex.point[0], candidate.point[1] - vertex.point[1]);
    if (distance < closestDistance) {
      closest = candidate.point;
      closestDistance = distance;
    }
  }

  // Approximate half the label width, with a small amount of clearance.
  const labelRadius = Math.max(fontSize * 1.25, vertexId.length * fontSize * 0.38);
  if (!closest || closestDistance > labelRadius * 1.5) return vertex.point;
  const dx = vertex.point[0] - closest[0];
  const dy = vertex.point[1] - closest[1];
  const distance = Math.hypot(dx, dy) || 1;
  const displacement = labelRadius + fontSize * 0.3;
  return [vertex.point[0] + (dx / distance) * displacement, vertex.point[1] + (dy / distance) * displacement];
}

/** Vertex handles retain a precise, constant map-space radius at every zoom. */
export function vertexHandleRadius(_zoom: number): number {
  return 2;
}
