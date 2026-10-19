import type { CityDocument, EdgeRef, Face, Id, Point } from "../types/document";
import { castleRoadEdgeTest } from "./castles";
import { reservedCastleFaces } from "./fortifications";
import { normalizeGeneratedRoadOwnership } from "./generatedRoadOwnership";
import { isSimplePolygon, polygonCentroid } from "./geom";
import { MIN_HOUSE_SPAN_METERS } from "./houseFootprint";
import { facePoints, indexMeshEdges, mergeFaces, validate } from "./mesh";
import { MoatReservation } from "./moats";
import { onFixedCrossingApproach } from "./passages";
import { removeRedundantRoadDetours } from "./redundantRoadDetours";
import { roadCellEffectiveWidth, roadCellHousingWidth } from "./roadCellGeometry";
import { roadPathVertices } from "./roadNetwork";
import { documentWaterTest, lineHitsDocumentWater } from "./waterGeometry";

function automaticRoad(group: CityDocument["featureGroups"][number], preserved: ReadonlySet<Id>): boolean {
  return (
    group.kind === "road" &&
    /^gc:(road|street|riverRoad|ring-road)-/.test(group.id) &&
    group.roadRole !== "approach" &&
    !group.locked &&
    !group.sourceRoad &&
    !group.beyond &&
    !group.crossing &&
    !preserved.has(group.id)
  );
}

function housingFace(face: Face): boolean {
  return (
    face.properties.water === "land" &&
    face.properties.buildable &&
    !face.properties.locked &&
    !["castle", "market", "park", "farm", "cemetery", "empty", "harbor"].includes(face.properties.ward ?? "")
  );
}

/** Opposing road sides must overlap enough for a house frontage, rather
 * than merely meet at a corner. Sides may contain several mesh edges. */
function parallelSides(a: Point, b: Point, c: Point, d: Point): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const other = Math.hypot(d[0] - c[0], d[1] - c[1]);
  if (length < MIN_HOUSE_SPAN_METERS || other < MIN_HOUSE_SPAN_METERS) return false;
  const ux = (b[0] - a[0]) / length,
    uy = (b[1] - a[1]) / length;
  if (Math.abs(ux * (d[0] - c[0]) + uy * (d[1] - c[1])) / other < Math.cos(Math.PI / 9)) return false;
  const project = (p: Point) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const first = project(c),
    last = project(d);
  const overlap = Math.min(length, Math.max(first, last)) - Math.max(0, Math.min(first, last));
  return overlap >= MIN_HOUSE_SPAN_METERS;
}

function boundaryPath(document: CityDocument, boundary: EdgeRef[], start: Id, end: Id): EdgeRef[] | null {
  if (start === end) return [];
  const adjacency = new Map<Id, { to: Id; ref: EdgeRef }[]>();
  for (const ref of boundary) {
    const edge = document.mesh.edges[ref.edgeId];
    for (const [from, to, forward] of [
      [edge.a, edge.b, true],
      [edge.b, edge.a, false]
    ] as const) {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from)!.push({ to, ref: { edgeId: edge.id, forward } });
    }
  }
  const queue = [start],
    previous = new Map<Id, { from: Id; ref: EdgeRef }>();
  const seen = new Set(queue);
  for (const from of queue)
    for (const link of adjacency.get(from) ?? []) {
      if (seen.has(link.to)) continue;
      seen.add(link.to);
      previous.set(link.to, { from, ref: link.ref });
      if (link.to === end) {
        const path: EdgeRef[] = [];
        for (let at = end; at !== start; ) {
          const step = previous.get(at)!;
          path.push(step.ref);
          at = step.from;
        }
        return path.reverse();
      }
      queue.push(link.to);
    }
  return null;
}

function mergeRoadSide(
  document: CityDocument,
  face: Face,
  keep: Face,
  preserved: ReadonlySet<Id>
): CityDocument | null {
  const shared = new Set(
    face.boundary.filter(ref => keep.boundary.some(other => other.edgeId === ref.edgeId)).map(ref => ref.edgeId)
  );
  // One long side can border several parcels. Extend through its gentle bends
  // so absorbing only the middle parcel cannot strand two parallel end pieces.
  const roadEdges = new Set(
    document.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(r => r.edgeId) : []))
  );
  const vector = (ref: EdgeRef): Point => {
    const e = document.mesh.edges[ref.edgeId],
      a = document.mesh.vertices[e.a].point,
      b = document.mesh.vertices[e.b].point;
    const sign = ref.forward ? 1 : -1;
    return [(b[0] - a[0]) * sign, (b[1] - a[1]) * sign];
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < face.boundary.length; i++) {
      const first = face.boundary[i],
        second = face.boundary[(i + 1) % face.boundary.length];
      if (
        shared.has(first.edgeId) === shared.has(second.edgeId) ||
        !roadEdges.has(first.edgeId) ||
        !roadEdges.has(second.edgeId)
      )
        continue;
      const a = vector(first),
        b = vector(second);
      if ((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b)) < 0.5) continue;
      shared.add(first.edgeId).add(second.edgeId);
      changed = true;
    }
  }
  const neighbors = new Set<Id>();
  const reserved = new Set([...document.elements.flatMap(e => e.faceIds), ...reservedCastleFaces(document)]);
  for (const id of shared) {
    const e = document.mesh.edges[id],
      otherId = e.leftFace === face.id ? e.rightFace : e.leftFace;
    const other = otherId ? document.mesh.faces[otherId] : undefined;
    if (
      !other ||
      !housingFace(other) ||
      reserved.has(other.id) ||
      other.properties.settlement !== face.properties.settlement ||
      other.properties.wallRing !== face.properties.wallRing
    )
      continue;
    neighbors.add(other.id);
  }
  const remaining = face.boundary.filter(ref => !shared.has(ref.edgeId));
  const groups: CityDocument["featureGroups"] = [];
  let width = 0;
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || !group.segments.some(ref => shared.has(ref.edgeId))) {
      groups.push(group);
      continue;
    }
    if (!automaticRoad(group, preserved)) return null;
    width = Math.max(width, group.style.widthMeters);
    const segments: EdgeRef[] = [];
    for (let i = 0; i < group.segments.length; ) {
      if (!shared.has(group.segments[i].edgeId)) {
        segments.push(group.segments[i++]);
        continue;
      }
      const first = group.segments[i];
      const start = document.mesh.edges[first.edgeId][first.forward ? "a" : "b"];
      while (i < group.segments.length && shared.has(group.segments[i].edgeId)) i++;
      const last = group.segments[i - 1];
      const end = document.mesh.edges[last.edgeId][last.forward ? "b" : "a"];
      const replacement = boundaryPath(document, remaining, start, end);
      if (!replacement) return null;
      segments.push(...replacement);
    }
    groups.push({ ...group, segments });
  }
  if (!width) return null;
  const roads = new Set(
    document.featureGroups.flatMap(group => (group.kind === "road" ? group.segments.map(ref => ref.edgeId) : []))
  );
  const moat = new MoatReservation(document, width / 2 + 1);
  const castleClear = castleRoadEdgeTest(document, width);
  const water = documentWaterTest(document);
  for (const ref of remaining) {
    if (roads.has(ref.edgeId)) continue;
    const edge = document.mesh.edges[ref.edgeId];
    const a = document.mesh.vertices[edge.a].point,
      b = document.mesh.vertices[edge.b].point;
    if (
      Math.hypot(b[0] - a[0], b[1] - a[1]) > width + MIN_HOUSE_SPAN_METERS + 0.7 ||
      !moat.roadAllowed(a, b) ||
      !castleClear(edge.id) ||
      lineHitsDocumentWater(document, [a, b], width, true, water)
    )
      return null;
  }
  // mergeFaces remaps face memberships and removes orphan vertices. It only
  // removes the shared mesh edges after their road references have moved.
  let merged = mergeFaces({ ...document, featureGroups: groups }, keep.id, face.id);
  if (!merged) return null;
  neighbors.delete(keep.id);
  for (const id of neighbors) {
    merged = mergeFaces(merged, keep.id, id);
    if (!merged) return null;
  }
  const polygon = facePoints(merged.mesh, merged.mesh.faces[keep.id]);
  if (!isSimplePolygon(polygon, 1)) return null;
  merged.mesh.faces[keep.id].site = polygonCentroid(polygon);
  normalizeGeneratedRoadOwnership(merged, preserved);
  const after = new Set(
    merged.featureGroups.flatMap(group => (group.kind === "road" ? group.segments.map(ref => ref.edgeId) : []))
  );
  if ([...roads].some(id => !shared.has(id) && !after.has(id))) return null;
  for (const group of merged.featureGroups) {
    if (group.kind !== "road" || !automaticRoad(group, preserved)) continue;
    const nodes = roadPathVertices(merged.mesh, group.segments);
    const open = nodes[0] === nodes.at(-1) ? nodes.slice(0, -1) : nodes;
    if (new Set(open).size !== open.length) return null;
  }
  return validate(merged).length ? null : merged;
}

/** Remove uninhabitable islands between parallel automatic road sides.
 * Work on whole cells, not a screen-distance snap between unrelated roads.
 * A protected boundary or destination always wins over simplification. */
export function consolidateThinRoadCells(source: CityDocument, preserved: ReadonlySet<Id> = new Set()) {
  let document = source,
    mergedCells = 0,
    removedParallelEdges = 0;
  const rejected = new Set<string>();
  while (true) {
    const mesh = document.mesh,
      index = indexMeshEdges(mesh);
    const protectedEdges = new Set<Id>(),
      protectedVertices = new Set(document.gates.map(gate => gate.vertexId));
    const widths = new Map<Id, number>();
    const protectedFaces = new Set([
      ...document.elements.flatMap(element => element.faceIds),
      ...reservedCastleFaces(document)
    ]);
    for (const group of document.featureGroups) {
      if (group.kind === "river") {
        for (let i = 1; i < group.vertices.length; i++) {
          const edge = index.between(group.vertices[i - 1], group.vertices[i]);
          if (edge) protectedEdges.add(edge.id);
        }
      } else
        for (const ref of group.segments) {
          if (group.kind === "road")
            widths.set(ref.edgeId, Math.max(widths.get(ref.edgeId) ?? 0, group.style.widthMeters));
          if (!automaticRoad(group, preserved)) protectedEdges.add(ref.edgeId);
        }
    }
    for (const id of protectedEdges) {
      const edge = mesh.edges[id];
      protectedVertices.add(edge.a).add(edge.b);
    }
    const candidates: { face: Face; keep: Face; width: number; length: number }[] = [];
    const thinFaces = new Set<Id>();
    for (const face of Object.values(mesh.faces)) {
      if (!housingFace(face) || protectedFaces.has(face.id)) continue;
      if (
        face.boundary.some(ref => {
          const edge = mesh.edges[ref.edgeId];
          return (
            edge.locked ||
            !edge.leftFace ||
            !edge.rightFace ||
            [edge.a, edge.b].some(
              id =>
                mesh.vertices[id].locked ||
                protectedVertices.has(id) ||
                onFixedCrossingApproach(document, mesh.vertices[id].point)
            )
          );
        })
      )
        continue;
      const points = facePoints(mesh, face),
        width = roadCellEffectiveWidth(points);
      const sides = face.boundary.filter(ref => widths.has(ref.edgeId));
      const paired = new Set<Id>();
      for (let i = 0; i < sides.length; i++)
        for (let j = i + 1; j < sides.length; j++) {
          const first = mesh.edges[sides[i].edgeId],
            second = mesh.edges[sides[j].edgeId];
          if (width >= roadCellHousingWidth(widths.get(first.id)!, widths.get(second.id)!)) continue;
          if (
            parallelSides(
              mesh.vertices[first.a].point,
              mesh.vertices[first.b].point,
              mesh.vertices[second.a].point,
              mesh.vertices[second.b].point
            )
          )
            paired.add(first.id).add(second.id);
        }
      if (paired.size) thinFaces.add(face.id);
      for (const id of paired) {
        const edge = mesh.edges[id];
        const otherId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
        const keep = otherId ? mesh.faces[otherId] : undefined;
        if (
          !keep ||
          !housingFace(keep) ||
          protectedFaces.has(keep.id) ||
          face.properties.settlement !== keep.properties.settlement ||
          face.properties.wallRing !== keep.properties.wallRing ||
          rejected.has(`${face.id}:${keep.id}`)
        )
          continue;
        const shared = new Set(keep.boundary.map(ref => ref.edgeId));
        if (face.boundary.some(ref => shared.has(ref.edgeId) && protectedEdges.has(ref.edgeId))) continue;
        const length = face.boundary
          .filter(ref => !shared.has(ref.edgeId))
          .reduce((sum, ref) => {
            const e = mesh.edges[ref.edgeId],
              a = mesh.vertices[e.a].point,
              b = mesh.vertices[e.b].point;
            return sum + Math.hypot(b[0] - a[0], b[1] - a[1]);
          }, 0);
        candidates.push({ face, keep, width, length });
      }
    }
    // Join contiguous pieces of a bent strip before rerouting either long side.
    // An internal non-road seam can be much longer than a short road connector.
    let joined = false;
    for (const edge of Object.values(mesh.edges)) {
      if (
        !edge.leftFace ||
        !edge.rightFace ||
        widths.has(edge.id) ||
        protectedEdges.has(edge.id) ||
        edge.locked ||
        !thinFaces.has(edge.leftFace) ||
        !thinFaces.has(edge.rightFace)
      )
        continue;
      const first = mesh.faces[edge.leftFace],
        second = mesh.faces[edge.rightFace];
      if (
        first.properties.settlement !== second.properties.settlement ||
        first.properties.wallRing !== second.properties.wallRing
      )
        continue;
      const union = mergeFaces(document, first.id, second.id);
      if (!union || !isSimplePolygon(facePoints(union.mesh, union.mesh.faces[first.id]), 1)) continue;
      document = union;
      document.mesh.faces[first.id].site = polygonCentroid(facePoints(document.mesh, document.mesh.faces[first.id]));
      mergedCells++;
      removedParallelEdges++;
      rejected.clear();
      joined = true;
      break;
    }
    if (joined) continue;
    candidates.sort(
      (a, b) =>
        a.width - b.width ||
        a.length - b.length ||
        a.face.id.localeCompare(b.face.id) ||
        a.keep.id.localeCompare(b.keep.id)
    );
    let changed = false;
    for (const candidate of candidates) {
      const merged = mergeRoadSide(document, candidate.face, candidate.keep, preserved);
      if (!merged) {
        rejected.add(`${candidate.face.id}:${candidate.keep.id}`);
        continue;
      }
      removedParallelEdges += Object.keys(document.mesh.edges).length - Object.keys(merged.mesh.edges).length;
      document = merged;
      rejected.clear();
      mergedCells++;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  document = removeRedundantRoadDetours(document, preserved);
  return { document, mergedCells, removedParallelEdges };
}
