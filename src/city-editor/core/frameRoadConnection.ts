import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { featureGroupVertices } from "./features";
import { wallRunsOutsideGates } from "./fortifications";
import { isSimplePolygon, polygonArea, segmentSegmentHit } from "./gen/geom";
import { defaultRoadWidthMeters, townExtentMeters } from "./gen/settlementExtent";
import { facePoints } from "./mesh";
import type { CityDocument, Point } from "./types";
import { lineHitsDocumentWater } from "./waterGeometry";

type Leg = NonNullable<CityDocument["frameRoads"]>[number];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The renderer and audit use the same full-width, dry attachment to a source street. */
export function frameRoadTownConnection(document: CityDocument, leg: Leg): [Point, Point] | null {
  const target = leg.pieces[0]?.points[0];
  if (!target) return null;
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const points = document.featureGroups
    .flatMap(group => {
      if (group.kind !== "road" || group.sourceRoad?.index !== leg.sourceIndex) return [];
      const path = featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point);
      if (path.length < 2 || lineHitsDocumentWater(document, path, group.style.widthMeters, true)) return [];
      return path;
    })
    .sort((a, b) => distance(a, target) - distance(b, target));
  const curtains = document.featureGroups.flatMap(group =>
    group.kind === "wall"
      ? wallRunsOutsideGates(
          document,
          featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point)
        )
      : []
  );
  for (const point of points) {
    if (distance(point, target) > Math.max(40, document.frame.blockSizeMeters * 3)) break;
    if (curtains.some(run => run.slice(1).some((end, index) => segmentSegmentHit(point, target, run[index], end))))
      continue;
    if (!lineHitsDocumentWater(document, [point, target], width, true)) return [point, target];
  }
  return null;
}

/** Check actual continuity through dry arms and certified fixed E→E spans.
 * Merely having a far-away rendered endpoint is not a connected road. */
export function frameRoadConnectedToTown(document: CityDocument, leg: Leg): boolean {
  const connection = frameRoadTownConnection(document, leg);
  if (!connection) return false;
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const fixed = document.importedFixedCrossings;
  const lines: Point[][] = [connection];
  for (const piece of leg.pieces) {
    if (!piece.points.length) continue;
    if (piece.kind === "bridge") return false; // An unregistered CE guess is not a certified crossing.
    if (piece.points.length >= 2 && lineHitsDocumentWater(document, piece.points, width, true)) return false;
    lines.push(piece.points);
  }
  if (fixed && validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS))
    for (const c of fixed.crossings) lines.push([c.approachA, c.deckA, c.deckB, c.approachB].map(p => [p[0], p[1]]));
  const reached: Point[] = [connection[0]];
  const pending = [...lines];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const line = pending[i];
      if (!line.some(p => reached.some(q => distance(p, q) < 1e-5))) continue;
      reached.push(...line);
      pending.splice(i, 1);
      changed = true;
    }
  }
  const end = leg.pieces.at(-1)?.points.at(-1);
  return !!end && reached.some(p => distance(p, end) < 1e-5);
}

/** Align the generated street's last mesh edge and the first exterior road leg.
 * Only a movable vertex on a straight, dry mesh boundary is changed. The two
 * sides share its coordinate; there is no separate boundary-following link.
 * Fixed decks, their approaches, gates and edited/locked geometry stay fixed.
 */
export function alignFrameRoadEndpoints(document: CityDocument): void {
  const epsilon = 1e-5;
  const boundaryEdges = Object.values(document.mesh.edges).filter(e => e.leftFace === null || e.rightFace === null);
  const boundaryVertices = new Set(boundaryEdges.flatMap(e => [e.a, e.b]));
  const touched = new Set<string>();
  for (const leg of document.frameRoads ?? []) {
    const piece = leg.pieces[0];
    if (piece?.kind !== "road" || piece.points.length < 2) continue;
    const target = piece.points[0],
      outward = piece.points[1];
    const groups = document.featureGroups.filter(g => g.kind === "road" && g.sourceRoad?.index === leg.sourceIndex);
    for (const group of groups) {
      if (group.kind !== "road" || group.locked || group.sourceRoad?.terminal === "riverLanding") continue;
      const ids = featureGroupVertices(document, group);
      if (ids.length < 2) continue;
      const reverse =
        distance(document.mesh.vertices[ids[0]].point, target) <
        distance(document.mesh.vertices[ids.at(-1)!].point, target);
      const ordered = reverse ? ids : [...ids].reverse();
      let tail = 0;
      while (tail + 1 < ordered.length && boundaryVertices.has(ordered[tail + 1])) tail++;
      const id = ordered[tail],
        innerId = ordered[tail + 1];
      if (!innerId || !boundaryVertices.has(id) || touched.has(id)) continue;
      const vertex = document.mesh.vertices[id],
        inner = document.mesh.vertices[innerId].point;
      if (vertex.locked || distance(vertex.point, target) > Math.max(40, document.frame.blockSizeMeters * 3)) continue;
      if (
        (document.gates ?? []).some(g => g.vertexId === id) ||
        document.featureGroups.some(g => g.id !== group.id && featureGroupVertices(document, g).includes(id))
      )
        continue;
      const neighbors = boundaryEdges
        .filter(e => e.a === id || e.b === id)
        .map(e => document.mesh.vertices[e.a === id ? e.b : e.a].point);
      if (neighbors.length !== 2) continue;
      const axis = [0, 1].find(a =>
        neighbors.every(p => Math.abs(p[a] - vertex.point[a]) < Math.max(1, document.frame.blockSizeMeters / 2))
      );
      if (axis === undefined) continue;
      const delta = outward[axis] - inner[axis];
      if (Math.abs(delta) < epsilon) continue;
      const t = (vertex.point[axis] - inner[axis]) / delta;
      if (t <= 0 || t >= 1) continue;
      let next: Point = [inner[0] + t * (outward[0] - inner[0]), inner[1] + t * (outward[1] - inner[1])];
      const along = 1 - axis;
      let movedVertex = vertex;
      // A very short perimeter edge can prevent moving the terminal. In that
      // case straighten its unshared interior neighbor instead.
      if (
        next[along] <= Math.min(neighbors[0][along], neighbors[1][along]) + 1 ||
        next[along] >= Math.max(neighbors[0][along], neighbors[1][along]) - 1
      ) {
        movedVertex = document.mesh.vertices[innerId];
        if (
          movedVertex.locked ||
          touched.has(innerId) ||
          document.featureGroups.some(g => g.id !== group.id && featureGroupVertices(document, g).includes(innerId))
        )
          continue;
        const dx = outward[0] - vertex.point[0],
          dy = outward[1] - vertex.point[1];
        const u = ((inner[0] - vertex.point[0]) * dx + (inner[1] - vertex.point[1]) * dy) / (dx * dx + dy * dy);
        if (u >= 0) continue;
        next = [vertex.point[0] + u * dx, vertex.point[1] + u * dy];
      }
      if (
        distance(movedVertex.point, next) > document.frame.blockSizeMeters ||
        (document.gates ?? []).some(g => g.vertexId === movedVertex.id) ||
        Object.values(document.mesh.edges).some(e => e.locked && (e.a === movedVertex.id || e.b === movedVertex.id))
      )
        continue;
      const width = Math.max(group.style.widthMeters, defaultRoadWidthMeters(townExtentMeters(document.frame)));
      if (
        lineHitsDocumentWater(
          document,
          movedVertex === vertex ? [inner, next, outward] : [next, vertex.point, outward],
          width,
          true
        )
      )
        continue;
      const incident = Object.values(document.mesh.faces).filter(face =>
        face.boundary.some(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          return edge.a === movedVertex.id || edge.b === movedVertex.id;
        })
      );
      if (incident.some(face => face.properties.locked || face.properties.water !== "land")) continue;
      const oldAreas = incident.map(face => polygonArea(facePoints(document.mesh, face)));
      const previous = movedVertex.point;
      movedVertex.point = next;
      const valid = incident.every((face, index) => {
        const polygon = facePoints(document.mesh, face);
        return isSimplePolygon(polygon) && polygonArea(polygon) * oldAreas[index] > 0;
      });
      if (!valid) {
        movedVertex.point = previous;
        continue;
      }
      // Remove only the terminal walk along the mesh perimeter, not city streets.
      if (tail) group.segments = reverse ? group.segments.slice(tail) : group.segments.slice(0, -tail);
      piece.points[0] = vertex.point;
      touched.add(movedVertex.id);
      break;
    }
  }
}

/** After `alignFrameRoadEndpoints`: a street whose terminal still stops short of
 * the exterior road's start (a mesh corner, or a perimeter step longer than one
 * block) gets that terminal moved onto the start itself. Otherwise the renderer
 * links them with a short sideways stub and the road turns into an N
 * (Brarovelum v250). Same guards as the alignment: dry, unlocked, not a gate. */
export function snapFrameRoadTerminals(document: CityDocument): void {
  const epsilon = 1e-5;
  const boundaryVertices = new Set(
    Object.values(document.mesh.edges)
      .filter(e => e.leftFace === null || e.rightFace === null)
      .flatMap(e => [e.a, e.b])
  );
  const touched = new Set<string>();
  for (const leg of document.frameRoads ?? []) {
    const piece = leg.pieces[0];
    if (piece?.kind !== "road" || piece.points.length < 2) continue;
    const target = piece.points[0],
      outward = piece.points[1];
    for (const group of document.featureGroups) {
      if (group.kind !== "road" || group.sourceRoad?.index !== leg.sourceIndex) continue;
      if (group.locked || group.sourceRoad?.terminal === "riverLanding") continue;
      const ids = featureGroupVertices(document, group);
      if (ids.length < 2) continue;
      const atStart =
        distance(document.mesh.vertices[ids[0]].point, target) <
        distance(document.mesh.vertices[ids.at(-1)!].point, target);
      const id = atStart ? ids[0] : ids.at(-1)!;
      const inner = document.mesh.vertices[atStart ? ids[1] : ids.at(-2)!].point;
      const vertex = document.mesh.vertices[id];
      const gap = distance(vertex.point, target);
      if (gap < epsilon) break;
      if (gap > document.frame.blockSizeMeters || vertex.locked || touched.has(id) || !boundaryVertices.has(id))
        continue;
      if (
        (document.gates ?? []).some(g => g.vertexId === id) ||
        document.featureGroups.some(g => g.id !== group.id && featureGroupVertices(document, g).includes(id)) ||
        Object.values(document.mesh.edges).some(e => e.locked && (e.a === id || e.b === id))
      )
        continue;
      const width = Math.max(group.style.widthMeters, defaultRoadWidthMeters(townExtentMeters(document.frame)));
      if (lineHitsDocumentWater(document, [inner, target, outward], width, true)) continue;
      const incident = Object.values(document.mesh.faces).filter(face =>
        face.boundary.some(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          return edge.a === id || edge.b === id;
        })
      );
      if (incident.some(face => face.properties.locked || face.properties.water !== "land")) continue;
      const oldAreas = incident.map(face => polygonArea(facePoints(document.mesh, face)));
      const previous = vertex.point;
      vertex.point = [target[0], target[1]];
      const valid = incident.every((face, index) => {
        const polygon = facePoints(document.mesh, face);
        return isSimplePolygon(polygon) && polygonArea(polygon) * oldAreas[index] > 0;
      });
      if (!valid) {
        vertex.point = previous;
        continue;
      }
      piece.points[0] = vertex.point;
      touched.add(id);
      break;
    }
  }
}
