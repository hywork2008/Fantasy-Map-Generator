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
const SLIDE_FRACTIONS = [1, 0.9, 0.8, 0.7, 0.6, 0.45, 0.3, 0];
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
  const leaders: { target: Point; groupId: Id }[] = [];
  for (let i = 0; i < legs.length; i++) {
    const target = work.frameRoads![i].pieces[0]?.points[0];
    if (!target) continue;
    // A second FMG route leaving through the same start (two roads over one
    // bridge) joins the first one's straightened tail instead of cutting a
    // parallel street of its own.
    const leader = leaders.find(l => distance(l.target, target) < 1);
    const next = leader ? followLeader(work, i, leader.groupId) : straightenLeg(work, i, descriptor);
    if (next) work = next;
    const street = streetFor(work, work.frameRoads![i]);
    if (!leader && street) leaders.push({ target, groupId: street.id });
  }
  if (work !== document) Object.assign(document, work);
}

interface Street {
  id: Id;
  /** Vertices ordered so the end nearest the exterior start is last. */
  ids: Id[];
  reversed: boolean;
  gap: number;
}

/** The leg's imported street whose end is nearest the exterior road start. */
function streetFor(document: CityDocument, leg: NonNullable<CityDocument["frameRoads"]>[number]): Street | null {
  const target = leg.pieces[0]?.points[0];
  if (!target) return null;
  let best: Street | null = null;
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || group.locked || group.sourceRoad?.index !== leg.sourceIndex) continue;
    const ids = featureGroupVertices(document, group);
    if (ids.length < 3) continue;
    const first = distance(document.mesh.vertices[ids[0]].point, target);
    const last = distance(document.mesh.vertices[ids.at(-1)!].point, target);
    const reversed = first < last;
    const gap = Math.min(first, last);
    if (!best || gap < best.gap) best = { id: group.id, ids: reversed ? [...ids].reverse() : ids, reversed, gap };
  }
  return best;
}

/** Re-route the leg's street onto the leader street from their last shared vertex on. */
function followLeader(document: CityDocument, legIndex: number, leaderId: Id): CityDocument | null {
  const leg = document.frameRoads![legIndex];
  const street = streetFor(document, leg);
  const leaderGroup = document.featureGroups.find(g => g.id === leaderId);
  if (!street || street.id === leaderId || !leaderGroup) return null;
  const target = leg.pieces[0].points[0];
  let leader = featureGroupVertices(document, leaderGroup);
  if (
    distance(document.mesh.vertices[leader[0]].point, target) <
    distance(document.mesh.vertices[leader.at(-1)!].point, target)
  )
    leader = [...leader].reverse();
  if (distance(document.mesh.vertices[leader.at(-1)!].point, target) > 1e-6) return null;
  const onLeader = new Set(leader);
  let join = -1;
  for (let i = street.ids.length - 2; i >= 1; i--)
    if (onLeader.has(street.ids[i])) {
      join = i;
      break;
    }
  if (join < 1) return null;
  const path = [...street.ids.slice(0, join), ...leader.slice(leader.indexOf(street.ids[join]))];
  if (new Set(path).size !== path.length) return null;
  const next = structuredClone(document);
  if (!setStreetPath(next, street.id, street.reversed ? [...path].reverse() : path)) return null;
  next.frameRoads![legIndex].pieces[0].points[0] = next.mesh.vertices[leader.at(-1)!].point;
  return next;
}

/** Replace a road group's segments with the edges along `ordered`. */
function setStreetPath(document: CityDocument, groupId: Id, ordered: Id[]): boolean {
  const group = document.featureGroups.find(g => g.id === groupId);
  if (!group || group.kind === "river") return false;
  const segments: EdgeRef[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const edge = edgeBetween(document.mesh, ordered[i - 1], ordered[i]);
    const ref = edge && edgeRefFor(document.mesh, edge.id, ordered[i - 1]);
    if (!ref) return false;
    segments.push(ref);
  }
  group.segments = segments;
  return true;
}

function straightenLeg(document: CityDocument, legIndex: number, descriptor?: BurgSiteDescriptor): CityDocument | null {
  const leg = document.frameRoads![legIndex];
  const before = frameRoadApproachBend(document, document.frameRoads![legIndex], descriptor);
  if (before <= CLEAN_JUNCTION_DEGREES) return null;
  const target = leg.pieces.flatMap(piece => piece.points)[0];
  const outward = exteriorDirection(leg, descriptor);
  if (!target || !outward) return null;

  const best = streetFor(document, leg);
  if (!best || best.gap > document.frame.blockSizeMeters * 3) return null;
  const { ids, reversed } = best;
  // Only the tail is re-routed; the first vertex (often the town gate) stays.
  const tail = ids.slice(Math.max(1, ids.length - REROUTE_DEPTH));
  if (document.gates.some(g => tail.includes(g.vertexId)) || tail.some(id => document.mesh.vertices[id].locked))
    return null;

  // A vertex on the start when one can be had; otherwise the start lies inside a
  // cell and each attempt cuts through that cell to it.
  const goal = goalVertexAt(document, target, best.id, ids.at(-1)!);
  const work = goal?.document ?? document;
  const goalPoint = goal ? work.mesh.vertices[goal.vertexId].point : target;

  // Candidates: the last few street vertices, best straight line first.
  const point = (id: Id) => work.mesh.vertices[id].point;
  const candidates: { index: number; score: number }[] = [];
  for (let k = 0; k < REROUTE_DEPTH; k++) {
    const index = ids.length - 1 - k;
    if (index < 1) break;
    if (goal && ids[index] === goal.vertexId) {
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
      const done = connectAndStraighten(
        work,
        best.id,
        ids.slice(0, index + 1),
        reversed,
        goal?.vertexId ?? target,
        outward,
        slide
      );
      if (!done) continue;
      const tried = done.document;
      const piece = tried.frameRoads![legIndex].pieces[0];
      if (piece.points.length) piece.points[0] = tried.mesh.vertices[done.goalId].point; // shared, like the other alignment passes
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
        g =>
          g.id !== groupId &&
          g.kind !== "river" &&
          featureGroupVertices(document, g).includes(endId) &&
          !sharesExteriorStart(document, g, endId, target)
      )
    )
      return null;
    if (distance(end.point, target) < 1e-6) return { document, vertexId: endId };
    const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
    if (wetLink(document, end.point, target, width)) return null;
    const moved = moveVertices(document, new Map([[endId, [target[0], target[1]] as Point]]));
    return moved ? { document: moved, vertexId: endId } : null;
  };
  if (distance(end.point, target) <= document.frame.blockSizeMeters * 1.5) {
    const slid = slide();
    if (slid) return slid;
  }
  return perimeterVertexAt(document, target) ?? slide();
}

/** Another imported road that ends on the same vertex and leaves for the same
 * exterior start (two FMG routes sharing one bridge): moving their common end
 * serves both, so it does not block the move. */
function sharesExteriorStart(
  document: CityDocument,
  group: CityDocument["featureGroups"][number],
  endId: Id,
  target: Point
): boolean {
  if (group.kind !== "road" || !group.sourceRoad || group.locked) return false;
  const ids = featureGroupVertices(document, group);
  if (ids[0] !== endId && ids.at(-1) !== endId) return false;
  return (document.frameRoads ?? []).some(
    leg =>
      leg.sourceIndex === group.sourceRoad!.index &&
      distance(leg.pieces[0]?.points[0] ?? [Infinity, Infinity], target) < 1
  );
}

/** Whether a link to an exterior start crosses water. The start itself often
 * sits on the bank (a bridge or landing approach), so the stroke is stopped one
 * road width short of it: touching the water there is the point of it. */
function wetLink(document: CityDocument, from: Point, to: Point, width: number): boolean {
  const length = distance(from, to);
  if (length <= width) return false;
  const k = (length - width) / length;
  return lineHitsDocumentWater(
    document,
    [from, [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]],
    width,
    true
  );
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
    if (wetLink(work, at, target, width)) return null;
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
  goal: Id | Point,
  outward: Point,
  slide: number
): { document: CityDocument; goalId: Id } | null {
  const anchor = keep.at(-1)!;
  let work = document;
  const goalPoint = typeof goal === "string" ? work.mesh.vertices[goal].point : goal;
  if (slide > 0 && anchor !== goal && keep.length > 1 && !work.gates.some(g => g.vertexId === anchor)) {
    const p = work.mesh.vertices[anchor].point;
    const back = (goalPoint[0] - p[0]) * outward[0] + (goalPoint[1] - p[1]) * outward[1];
    if (back > 1) {
      const onAxis: Point = [goalPoint[0] - outward[0] * back, goalPoint[1] - outward[1] * back];
      const axis: Point = [p[0] + (onAxis[0] - p[0]) * slide, p[1] + (onAxis[1] - p[1]) * slide];
      const slid = moveVertices(work, new Map([[anchor, axis]]));
      if (!slid) return null;
      work = slid;
    }
  }
  let path = keep;
  let goalId: Id;
  if (typeof goal === "string") {
    goalId = goal;
    if (anchor !== goal) {
      const cut = cutAlong(work, anchor, goal);
      if (!cut) return null;
      work = cut.document;
      path = [...keep.slice(0, -1), ...cut.path];
    }
  } else {
    const through = cutThrough(work, anchor, goal);
    if (!through) return null;
    work = through.document;
    goalId = through.path.at(-1)!;
    path = [...keep.slice(0, -1), ...through.path];
  }
  if (!setStreetPath(work, groupId, reversed ? [...path].reverse() : path)) return null;
  return { document: work, goalId };
}

/** A straight street from vertex `from` to `target`, a point inside a cell: the
 * line is cut on through that cell to its far side, and a vertex is placed on
 * the new edge at `target`. The rest of the cut stays a plain cell edge. */
function cutThrough(document: CityDocument, from: Id, target: Point): { document: CityDocument; path: Id[] } | null {
  const a = document.mesh.vertices[from].point;
  const length = distance(a, target);
  if (length < 1) return null;
  const dir: Point = [(target[0] - a[0]) / length, (target[1] - a[1]) / length];
  const face = Object.values(document.mesh.faces).find(
    f => !f.properties.locked && f.properties.water === "land" && pointInPolygon(target, facePoints(document.mesh, f))
  );
  if (!face) return null;
  const reach = document.frame.blockSizeMeters * 2;
  const far: Point = [target[0] + dir[0] * reach, target[1] + dir[1] * reach];
  let hit: { edgeId: Id; point: Point; t: number } | null = null;
  for (const ref of face.boundary) {
    const edge = document.mesh.edges[ref.edgeId];
    const found = segmentSegmentHit(
      target,
      far,
      document.mesh.vertices[edge.a].point,
      document.mesh.vertices[edge.b].point
    );
    if (found && (!hit || found.t < hit.t)) hit = { edgeId: edge.id, point: found.point, t: found.t };
  }
  if (!hit) return null;
  const { edgeId } = hit;
  if (document.featureGroups.some(g => g.kind === "wall" && g.segments.some(s => s.edgeId === edgeId))) return null;
  let work = document;
  const edge = work.mesh.edges[edgeId];
  let exitId = [edge.a, edge.b].find(v => distance(work.mesh.vertices[v].point, hit!.point) < CUT_SNAP_METERS);
  if (exitId === undefined) {
    const pa = work.mesh.vertices[edge.a].point;
    const inserted = insertEdgeVertex(
      work,
      edgeId,
      distance(pa, hit.point) / distance(pa, work.mesh.vertices[edge.b].point)
    );
    if (!inserted) return null;
    work = inserted.document;
    exitId = inserted.vertexId;
  }
  const cut = cutAlong(work, from, exitId);
  if (!cut) return null;
  work = cut.document;
  const before = cut.path.at(-2)!;
  const p = work.mesh.vertices[before].point;
  const q = work.mesh.vertices[exitId].point;
  const span = distance(p, q);
  const along = ((target[0] - p[0]) * (q[0] - p[0]) + (target[1] - p[1]) * (q[1] - p[1])) / (span * span);
  const onEdge: Point = [p[0] + (q[0] - p[0]) * along, p[1] + (q[1] - p[1]) * along];
  if (along <= 0 || distance(onEdge, target) > CUT_SNAP_METERS) return null;
  if (span * (1 - along) < 1) return { document: work, path: cut.path };
  const last = edgeBetween(work.mesh, before, exitId)!;
  const fraction = work.mesh.vertices[last.a].point === p ? along : 1 - along;
  const inserted = insertEdgeVertex(work, last.id, fraction);
  if (!inserted) return null;
  return { document: inserted.document, path: [...cut.path.slice(0, -1), inserted.vertexId] };
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
