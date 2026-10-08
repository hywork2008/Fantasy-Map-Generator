import { featureGroupVertices } from "./features";
import { angleBetween, CLEAN_JUNCTION_DEGREES, exteriorDirection, frameRoadApproachBend } from "./frameRoadConnection";
import { pointInPolygon, segmentSegmentHit } from "./gen/geom";
import { defaultRoadWidthMeters, townExtentMeters } from "./gen/settlementExtent";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import {
  edgeBetween,
  edgePoints,
  edgeRefFor,
  facePoints,
  faceVertices,
  incidentFaces,
  insertEdgeVertex,
  moveVertices,
  splitFace
} from "./mesh";
import type { CityDocument, EdgeRef, Id, Point } from "./types";
import { lineHitsDocumentWater } from "./waterGeometry";

/** How far the anchor is slid toward the exterior road's axis, tried in order (0 = not at all). */
const SLIDE_FRACTIONS = [1, 0.6, 0.3, 0];
/** How many street vertices back from the perimeter may be re-routed. */
const REROUTE_DEPTH = 4;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];

/** Make each exterior road leave its town street in one straight line.
 *
 * `alignFrameRoadEndpoints` / `snapFrameRoadTerminals` only slide a perimeter
 * vertex. When the street ends a block or more from the exterior road's start,
 * or meets it at an angle, the renderer links them with a sideways stub (L, N,
 * V). Here the exterior start is made a real perimeter vertex (edge split), the
 * street is re-routed from the best of its last few vertices to that vertex
 * (cell split), and that vertex is slid onto the exterior road's axis. Every
 * step is validated by the mesh operations and skipped when it cannot be;
 * locked geometry, gates and walls are never touched. */
export function straightenFrameRoadJunctions(document: CityDocument, descriptor?: BurgSiteDescriptor): void {
  const legs = document.frameRoads;
  if (!legs?.length) return;
  let work = document;
  for (let i = 0; i < legs.length; i++) {
    const next = straightenLeg(work, i, descriptor);
    if (next) work = next;
  }
  if (work !== document) Object.assign(document, work);
}

function straightenLeg(document: CityDocument, legIndex: number, descriptor?: BurgSiteDescriptor): CityDocument | null {
  const leg = document.frameRoads![legIndex];
  const before = frameRoadApproachBend(document, document.frameRoads![legIndex], descriptor);
  if (before <= CLEAN_JUNCTION_DEGREES) return null;
  const target = leg.pieces.flatMap(piece => piece.points)[0];
  const outward = exteriorDirection(leg, descriptor);
  if (!target || !outward) return null;

  // The street whose end is nearest the exterior road start.
  let best: { id: Id; ids: Id[]; reversed: boolean; gap: number } | null = null;
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || group.locked || group.sourceRoad?.index !== leg.sourceIndex) continue;
    if (group.sourceRoad.terminal === "riverLanding") continue;
    const ids = featureGroupVertices(document, group);
    if (ids.length < 3) continue;
    const first = distance(document.mesh.vertices[ids[0]].point, target);
    const last = distance(document.mesh.vertices[ids.at(-1)!].point, target);
    const reversed = first < last;
    const gap = Math.min(first, last);
    if (!best || gap < best.gap)
      best = {
        id: group.id,
        ids: reversed ? [...ids].reverse() : ids,
        reversed,
        gap
      };
  }
  if (!best || best.gap > document.frame.blockSizeMeters * 3) return null;
  const { ids, reversed } = best;
  // Only the tail is re-routed; the first vertex (often the town gate) stays.
  const tail = ids.slice(Math.max(1, ids.length - REROUTE_DEPTH));
  if (document.gates.some(g => tail.includes(g.vertexId)) || tail.some(id => document.mesh.vertices[id].locked))
    return null;

  const goal = goalVertexAt(document, target, best.id, ids.at(-1)!);
  if (!goal) return null;
  const work = goal.document;
  const goalPoint = work.mesh.vertices[goal.vertexId].point;

  // Candidates: the last few street vertices, best straight line first.
  const point = (id: Id) => work.mesh.vertices[id].point;
  const candidates: { index: number; score: number }[] = [];
  for (let k = 0; k < REROUTE_DEPTH; k++) {
    const index = ids.length - 1 - k;
    if (index < 1) break;
    if (ids[index] === goal.vertexId) {
      // Already ends on the goal: its present approach is one candidate, deeper anchors are alternatives.
      candidates.push({ index, score: angleBetween(sub(goalPoint, point(ids[index - 1])), outward) });
      continue;
    }
    const p = point(ids[index]);
    const link = sub(goalPoint, p);
    if (Math.hypot(link[0], link[1]) < 0.25) continue;
    const arrive = angleBetween(link, outward);
    const leave = angleBetween(sub(p, point(ids[index - 1])), link);
    candidates.push({ index, score: Math.max(arrive, leave) });
  }
  candidates.sort((a, b) => a.score - b.score);

  let best2: { document: CityDocument; score: number } | null = null;
  for (const { index } of candidates) {
    for (const slide of SLIDE_FRACTIONS) {
      const tried = connectAndStraighten(
        work,
        best.id,
        ids.slice(0, index + 1),
        reversed,
        goal.vertexId,
        outward,
        slide
      );
      if (!tried) continue;
      const piece = tried.frameRoads![legIndex].pieces[0];
      if (piece.points.length) piece.points[0] = tried.mesh.vertices[goal.vertexId].point; // shared, like the other alignment passes
      const score = frameRoadApproachBend(tried, tried.frameRoads![legIndex], descriptor);
      if (score <= CLEAN_JUNCTION_DEGREES) return tried;
      if (!best2 || score < best2.score) best2 = { document: tried, score };
    }
  }
  return best2 && best2.score < before - 2 ? best2.document : null;
}

/** An exterior road start this close to the outline / shore is reached by a perimeter vertex. */
const NEAR_PERIMETER_METERS = 6;

/** Where the street should end: on the outline when `target` is on it, otherwise
 * the street's own last vertex, moved onto `target` when that keeps the cells valid. */
function goalVertexAt(
  document: CityDocument,
  target: Point,
  groupId: Id,
  endId: Id
): { document: CityDocument; vertexId: Id } | null {
  const end = document.mesh.vertices[endId];
  // Sliding the street's own end onto the start leaves no extra edge to turn on.
  const slide = () => {
    if (end.locked || document.gates.some(g => g.vertexId === endId)) return null;
    if (
      document.featureGroups.some(
        g => g.id !== groupId && g.kind !== "river" && featureGroupVertices(document, g).includes(endId)
      )
    )
      return null;
    if (distance(end.point, target) < 1e-6) return { document, vertexId: endId };
    const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
    if (lineHitsDocumentWater(document, [end.point, target], width, true)) return null;
    const moved = moveVertices(document, new Map([[endId, [target[0], target[1]] as Point]]));
    return moved ? { document: moved, vertexId: endId } : null;
  };
  if (distance(end.point, target) <= document.frame.blockSizeMeters * 1.5) {
    const slid = slide();
    if (slid) return slid;
  }
  return perimeterVertexAt(document, target) ?? slide();
}

/** Mesh outline, or the line where land meets water inside it: the places an exterior road can start. */
function isShoreOrPerimeter(document: CityDocument, edge: CityDocument["mesh"]["edges"][string]): boolean {
  if (edge.leftFace === null || edge.rightFace === null) return true;
  const water = (id: Id) => document.mesh.faces[id].properties.water !== "land";
  return water(edge.leftFace) !== water(edge.rightFace);
}

/** A perimeter vertex placed exactly on `target`: the nearest perimeter vertex,
 * or a new one on the nearest perimeter edge, then slid out to `target` (the
 * mesh outline is ragged, so the exterior road can start a few meters beyond it). */
function perimeterVertexAt(document: CityDocument, target: Point): { document: CityDocument; vertexId: Id } | null {
  let hit: { edgeId: Id; t: number; d: number } | null = null;
  for (const edge of Object.values(document.mesh.edges)) {
    if (!isShoreOrPerimeter(document, edge)) continue;
    const a = document.mesh.vertices[edge.a].point,
      b = document.mesh.vertices[edge.b].point;
    const ab = sub(b, a);
    const len2 = ab[0] * ab[0] + ab[1] * ab[1];
    if (len2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((target[0] - a[0]) * ab[0] + (target[1] - a[1]) * ab[1]) / len2));
    const d = distance([a[0] + ab[0] * t, a[1] + ab[1] * t], target);
    if (!hit || d < hit.d) hit = { edgeId: edge.id, t, d };
  }
  if (!hit || hit.d > NEAR_PERIMETER_METERS) return null;
  const { edgeId, t } = hit;
  if (document.featureGroups.some(g => g.kind === "wall" && g.segments.some(s => s.edgeId === edgeId))) return null;
  const edge = document.mesh.edges[edgeId];
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  let work = document;
  let vertexId: Id | undefined = [edge.a, edge.b].find(end => distance(document.mesh.vertices[end].point, target) < 1);
  if (vertexId === undefined) {
    const [pa, pb] = edgePoints(document.mesh, edge);
    const span = distance(pa, pb);
    const nearEnd = t * span < 1 ? edge.a : (1 - t) * span < 1 ? edge.b : undefined;
    if (nearEnd !== undefined) vertexId = nearEnd;
    else {
      const inserted = insertEdgeVertex(document, edgeId, t);
      if (!inserted) return null;
      work = inserted.document;
      vertexId = inserted.vertexId;
    }
  }
  const at = work.mesh.vertices[vertexId].point;
  if (distance(at, target) > 1e-6) {
    if (lineHitsDocumentWater(work, [at, target], width, true)) return null;
    // A vertex shared with another feature (road, wall, gate) must not move.
    if (
      work.gates.some(g => g.vertexId === vertexId) ||
      work.featureGroups.some(
        g => g.kind !== "river" && featureGroupVertices(work, g).includes(vertexId!) && g.kind !== "road"
      )
    )
      return null;
    const moved = moveVertices(work, new Map([[vertexId, [target[0], target[1]] as Point]]));
    if (!moved) return null;
    work = moved;
  }
  return { document: work, vertexId };
}

/** Re-route `groupId` along `keep` (its first vertices, ending at the anchor),
 * then in a straight cut through the cells to the goal. The anchor is first
 * moved the `slide` fraction of the way onto the exterior road's axis, so the
 * cut runs along it. */
function connectAndStraighten(
  document: CityDocument,
  groupId: Id,
  keep: Id[],
  reversed: boolean,
  goalId: Id,
  outward: Point,
  slide: number
): CityDocument | null {
  const anchor = keep.at(-1)!;
  let work = document;
  if (slide > 0 && anchor !== goalId && keep.length > 1 && !work.gates.some(g => g.vertexId === anchor)) {
    const goal = work.mesh.vertices[goalId].point;
    const p = work.mesh.vertices[anchor].point;
    const back = (goal[0] - p[0]) * outward[0] + (goal[1] - p[1]) * outward[1];
    if (back > 1) {
      const onAxis: Point = [goal[0] - outward[0] * back, goal[1] - outward[1] * back];
      const axis: Point = [p[0] + (onAxis[0] - p[0]) * slide, p[1] + (onAxis[1] - p[1]) * slide];
      const slid = moveVertices(work, new Map([[anchor, axis]]));
      if (!slid) return null;
      work = slid;
    }
  }
  let path = keep;
  if (anchor !== goalId) {
    const cut = cutAlong(work, anchor, goalId);
    if (!cut) return null;
    work = cut.document;
    path = [...keep.slice(0, -1), ...cut.path];
  }
  const group = work.featureGroups.find(g => g.id === groupId);
  if (!group || group.kind === "river") return null;
  const ordered = reversed ? [...path].reverse() : path;
  const segments: EdgeRef[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const edge = edgeBetween(work.mesh, ordered[i - 1], ordered[i]);
    const ref = edge && edgeRefFor(work.mesh, edge.id, ordered[i - 1]);
    if (!ref) return null;
    segments.push(ref);
  }
  group.segments = segments;
  return work;
}

const CUT_SNAP_METERS = 1.5;
const MAX_CUT_STEPS = 14;

/** A straight street from vertex `from` to vertex `to`: every cell the line
 * crosses is split along it (new vertices on the crossed edges), so the street
 * runs on mesh edges yet is exactly straight. Null when the line would leave
 * dry unlocked cells, cross a wall, or any split is rejected by the mesh. */
function cutAlong(document: CityDocument, from: Id, to: Id): { document: CityDocument; path: Id[] } | null {
  let work = document;
  const path: Id[] = [from];
  let current = from;
  for (let step = 0; step < MAX_CUT_STEPS; step++) {
    if (edgeBetween(work.mesh, current, to)) {
      path.push(to);
      return { document: work, path };
    }
    const a = work.mesh.vertices[current].point;
    const b = work.mesh.vertices[to].point;
    const length = distance(a, b);
    if (length < 1e-6) return null;
    const probe: Point = [a[0] + ((b[0] - a[0]) / length) * 0.5, a[1] + ((b[1] - a[1]) / length) * 0.5];
    const face = incidentFaces(work.mesh, current).find(f => pointInPolygon(probe, facePoints(work.mesh, f)));
    if (!face || face.properties.locked || face.properties.water !== "land") return null;
    if (faceVertices(work.mesh, face).includes(to)) {
      const split = splitFace(work, face.id, current, to);
      if (!split) return null;
      path.push(to);
      return { document: split, path };
    }
    let hit: { edgeId: Id; point: Point; t: number } | null = null;
    for (const ref of face.boundary) {
      const edge = work.mesh.edges[ref.edgeId];
      if (edge.a === current || edge.b === current) continue;
      const found = segmentSegmentHit(a, b, work.mesh.vertices[edge.a].point, work.mesh.vertices[edge.b].point);
      if (found && found.t > 1e-6 && (!hit || found.t < hit.t))
        hit = { edgeId: edge.id, point: found.point, t: found.t };
    }
    if (!hit) return null;
    const { edgeId } = hit;
    if (work.featureGroups.some(g => g.kind === "wall" && g.segments.some(s => s.edgeId === edgeId))) return null;
    const edge = work.mesh.edges[edgeId];
    let nextId = [edge.a, edge.b].find(v => distance(work.mesh.vertices[v].point, hit!.point) < CUT_SNAP_METERS);
    if (nextId === undefined) {
      const pa = work.mesh.vertices[edge.a].point;
      const pb = work.mesh.vertices[edge.b].point;
      const inserted = insertEdgeVertex(work, edgeId, distance(pa, hit.point) / distance(pa, pb));
      if (!inserted) return null;
      work = inserted.document;
      nextId = inserted.vertexId;
    }
    if (!edgeBetween(work.mesh, current, nextId)) {
      const split = splitFace(work, face.id, current, nextId);
      if (!split) return null;
      work = split;
    }
    path.push(nextId);
    current = nextId;
  }
  return null;
}
