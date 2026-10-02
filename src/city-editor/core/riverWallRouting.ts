import { featureGroupVertices } from "./features";
import { boundaryRings, castleWallIds } from "./fortifications";
import { aStar, type EdgeGraph } from "./gen/edgeGraph";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon, polygonCentroid, segmentSegmentHit } from "./gen/geom";
import { clone, edgeBetween, facePoints, faceVertices, incidentEdges, incidentFaces, splitFace } from "./mesh";
import { kindEdgeIds, openRiverWallPassage, throughEdgesAt, vertexHasCrossing } from "./passages";
import type { CityDocument, EdgeRef, Id, Point } from "./types";

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentSegmentHit(a, b, c, d)) return 0;
  return Math.min(
    nearestOnPolyline(a, [c, d]).dist,
    nearestOnPolyline(b, [c, d]).dist,
    nearestOnPolyline(c, [a, b]).dist,
    nearestOnPolyline(d, [a, b]).dist
  );
}

/** Require an actual transverse crossing rather than a wall that grazes
 * the bank. Oblique crossings are valid; clearance is checked separately. */
function transverseArm(document: CityDocument, edgeId: Id, vertexId: Id): boolean {
  const edge = document.mesh.edges[edgeId];
  const origin = document.mesh.vertices[vertexId].point;
  const other = document.mesh.vertices[edge.a === vertexId ? edge.b : edge.a].point;
  const dx = other[0] - origin[0],
    dy = other[1] - origin[1];
  const riverEdges = kindEdgeIds(document, "river");
  return [...riverEdges].every(id => {
    const river = document.mesh.edges[id];
    if (river.a !== vertexId && river.b !== vertexId) return true;
    const point = document.mesh.vertices[river.a === vertexId ? river.b : river.a].point;
    const rx = point[0] - origin[0],
      ry = point[1] - origin[1];
    return Math.abs(dx * ry - dy * rx) / Math.max(1e-7, Math.hypot(dx, dy) * Math.hypot(rx, ry)) > 1e-5;
  });
}

/** The bank approach may turn at a near-bank corner before reaching full
 * clearance. Follow only dry edges that increase distance from every channel;
 * never follow the river or permit a second geometric channel intersection. */
function bankApproachEdges(document: CityDocument, origin: Id, arms: Id[], gap: number, permitted?: Set<Id>): Set<Id> {
  const mesh = document.mesh;
  const channel = document.featureGroups.flatMap(g =>
    g.kind === "river"
      ? g.vertices.slice(1).map((b, i) => ({ a: g.vertices[i], b, radius: g.style.widthMeters / 2 }))
      : []
  );
  const riverVertices = new Set(channel.flatMap(c => [c.a, c.b]));
  const clearance = (id: Id) =>
    Math.min(
      ...channel.map(
        c =>
          nearestOnPolyline(mesh.vertices[id].point, [mesh.vertices[c.a].point, mesh.vertices[c.b].point]).dist -
          c.radius -
          gap
      )
    );
  const result = new Set(arms);
  const queue = arms.map(id => (mesh.edges[id].a === origin ? mesh.edges[id].b : mesh.edges[id].a));
  const visited = new Set<Id>();
  for (let at = 0; at < queue.length; at++) {
    const vertex = queue[at];
    if (visited.has(vertex) || clearance(vertex) >= 0) continue;
    visited.add(vertex);
    for (const edge of incidentEdges(mesh, vertex)) {
      if (permitted && !permitted.has(edge.id)) continue;
      const other = edge.a === vertex ? edge.b : edge.a;
      if (riverVertices.has(other) || clearance(other) <= clearance(vertex) + 1e-7) continue;
      if (
        channel.some(
          c =>
            segmentDistance(
              mesh.vertices[vertex].point,
              mesh.vertices[other].point,
              mesh.vertices[c.a].point,
              mesh.vertices[c.b].point
            ) < 1e-7
        )
      )
        continue;
      result.add(edge.id);
      queue.push(other);
    }
  }
  return result;
}

/** Face membership from the actual closed town curtain, including new split cells. */
export function enclosedTownFaces(document: CityDocument): Set<Id> | null {
  const castles = castleWallIds(document);
  const refs = document.featureGroups.flatMap(g => (g.kind === "wall" && !castles.has(g.id) ? g.segments : []));
  const rings = boundaryRings(document.mesh, refs);
  if (!rings.length) return null;
  const polygons = rings.map(ring =>
    ring.map(
      ref =>
        document.mesh.vertices[ref.forward ? document.mesh.edges[ref.edgeId].a : document.mesh.edges[ref.edgeId].b]
          .point
    )
  );
  return new Set(
    Object.values(document.mesh.faces)
      .filter(face => {
        const center = polygonCentroid(facePoints(document.mesh, face));
        return polygons.filter(poly => pointInPolygon(center, poly)).length % 2 === 1;
      })
      .map(face => face.id)
  );
}

/** Keep every pre-existing river vertex and its position. Insertions may only
 * subdivide the same river polyline; no channel is collapsed or moved. */
function preservesRivers(before: CityDocument, after: CityDocument): boolean {
  return before.featureGroups.every(group => {
    if (group.kind !== "river") return true;
    const next = after.featureGroups.find(g => g.id === group.id);
    if (next?.kind !== "river") return false;
    const line = group.vertices.map(id => before.mesh.vertices[id].point);
    let at = -1;
    for (const id of group.vertices) {
      const index = next.vertices.indexOf(id, at + 1);
      const point = after.mesh.vertices[id]?.point;
      if (
        index < 0 ||
        !point ||
        Math.hypot(point[0] - before.mesh.vertices[id].point[0], point[1] - before.mesh.vertices[id].point[1]) > 1e-7
      )
        return false;
      at = index;
    }
    return next.vertices.every(id => nearestOnPolyline(after.mesh.vertices[id].point, line).dist < 1e-7);
  });
}

export interface RiverWallRepair {
  document: CityDocument;
  issues: string[];
  preparedPassages: Id[];
  splitFaces: number;
}

/** Replace river-sharing curtain runs by inland mesh paths. Try dry paths
 * first, then existing transverse passages, then a single local chord per
 * crossing run. Failed opening trials are discarded; usable openings survive
 * later routing failures.
 * These passages belong to walls, never to the road-gate list. */
export function repairRiverWalls(
  source: CityDocument,
  urbanRegions: Point[][],
  protectedFaces: Set<Id> = new Set()
): RiverWallRepair {
  let document = clone(source);
  const preparedPassages = new Set<Id>();
  const preparationIssues: string[] = [];
  let routingIssues: string[] = [];
  // All mesh helpers honour face locks. Temporarily protect reserved castle
  // faces too, then restore their persisted lock state before returning.
  for (const id of protectedFaces) if (document.mesh.faces[id]) document.mesh.faces[id].properties.locked = true;
  const protectedPoints = [...protectedFaces].flatMap(id =>
    source.mesh.faces[id] ? [polygonCentroid(facePoints(source.mesh, source.mesh.faces[id]))] : []
  );

  const reroute = (allowCrossings: boolean) => {
    routingIssues = [];
    const mesh = document.mesh;
    const ids = Object.keys(mesh.vertices);
    const index = new Map(ids.map((id, i) => [id, i]));
    const graph: EdgeGraph = { points: ids.map(id => mesh.vertices[id].point), adjacency: ids.map(() => []) };
    const edgeAt = new Map<string, (typeof mesh.edges)[string]>();
    for (const edge of Object.values(mesh.edges)) {
      const a = index.get(edge.a)!,
        b = index.get(edge.b)!;
      const w = Math.hypot(graph.points[a][0] - graph.points[b][0], graph.points[a][1] - graph.points[b][1]);
      graph.adjacency[a].push({ to: b, w });
      graph.adjacency[b].push({ to: a, w });
      edgeAt.set(`${Math.min(a, b)},${Math.max(a, b)}`, edge);
    }
    const rivers = document.featureGroups.filter(g => g.kind === "river");
    const channel = rivers.flatMap(g =>
      g.vertices.slice(1).map((id, i) => ({ a: g.vertices[i], b: id, radius: g.style.widthMeters / 2 }))
    );
    const riverEdges = kindEdgeIds(document, "river"),
      roadEdges = kindEdgeIds(document, "road");
    const riverVertices = new Set(channel.flatMap(e => [e.a, e.b]));
    const passages = new Map(
      [...riverVertices].map(id => [id, new Set(throughEdgesAt(document, id, "river", true).map(e => e.id))])
    );
    const interior = new Set(
      Object.values(mesh.faces)
        .filter(face => urbanRegions.some(poly => pointInPolygon(polygonCentroid(facePoints(mesh, face)), poly)))
        .map(face => face.id)
    );
    const crossingCorridor = new Set(interior);
    for (const edge of Object.values(mesh.edges)) {
      if (edge.leftFace && edge.rightFace && (interior.has(edge.leftFace) || interior.has(edge.rightFace))) {
        crossingCorridor.add(edge.leftFace);
        crossingCorridor.add(edge.rightFace);
      }
    }
    const castles = castleWallIds(document);
    for (const group of document.featureGroups) {
      if (group.kind !== "wall" || group.locked || castles.has(group.id) || !group.id.startsWith("gc:")) continue;
      const gap = group.style.widthMeters / 2 + 2;
      const approachEdges = new Set(
        [...passages].flatMap(([id, arms]) =>
          arms.size === 2 && [...arms].every(edge => transverseArm(document, edge, id))
            ? [...bankApproachEdges(document, id, [...arms], gap)]
            : []
        )
      );
      const clearVertex = (id: Id) =>
        channel.every(
          c =>
            nearestOnPolyline(mesh.vertices[id].point, [mesh.vertices[c.a].point, mesh.vertices[c.b].point]).dist >=
            c.radius + gap
        );
      const allowedEdge = (edgeId: Id, crossings: boolean) => {
        const edge = mesh.edges[edgeId];
        if (riverEdges.has(edgeId)) return false;
        const touching = [edge.a, edge.b].filter(id => riverVertices.has(id));
        if (touching.length > 1) return false;
        if (
          touching.length &&
          (!crossings || !passages.get(touching[0])?.has(edgeId) || !transverseArm(document, edgeId, touching[0]))
        )
          return false;
        const crossingOrigin =
          touching[0] ??
          (crossings
            ? [...passages].find(([id, arms]) => {
                if (arms.size !== 2) return false;
                const origin = mesh.vertices[id].point;
                return [...arms].some(armId => {
                  const arm = mesh.edges[armId];
                  const end = mesh.vertices[arm.a === id ? arm.b : arm.a].point;
                  const dx = end[0] - origin[0],
                    dy = end[1] - origin[1],
                    length = Math.hypot(dx, dy);
                  return (
                    length > 1e-7 &&
                    [edge.a, edge.b].every(vertex => {
                      const p = mesh.vertices[vertex].point;
                      return Math.abs((p[0] - origin[0]) * dy - (p[1] - origin[1]) * dx) / length < 1e-5;
                    })
                  );
                });
              })?.[0]
            : undefined);
        if (crossings && approachEdges.has(edgeId))
          return channel.every(
            c =>
              (touching[0] && (c.a === touching[0] || c.b === touching[0])) ||
              segmentDistance(
                mesh.vertices[edge.a].point,
                mesh.vertices[edge.b].point,
                mesh.vertices[c.a].point,
                mesh.vertices[c.b].point
              ) > 1e-7
          );
        return channel.every(c => {
          if (
            crossingOrigin &&
            nearestOnPolyline(mesh.vertices[crossingOrigin].point, [mesh.vertices[c.a].point, mesh.vertices[c.b].point])
              .dist <
              c.radius + gap
          )
            return true;
          return (
            segmentDistance(
              mesh.vertices[edge.a].point,
              mesh.vertices[edge.b].point,
              mesh.vertices[c.a].point,
              mesh.vertices[c.b].point
            ) >=
            c.radius + gap
          );
        });
      };
      let refs = group.segments.slice();
      let vertices = featureGroupVertices(document, group);
      const closed = vertices[0] === vertices.at(-1);
      if (closed) {
        const pivot = vertices.slice(0, -1).findIndex(clearVertex);
        if (pivot >= 0) {
          refs = [...refs.slice(pivot), ...refs.slice(0, pivot)];
          vertices = refs.map(ref => (ref.forward ? mesh.edges[ref.edgeId].a : mesh.edges[ref.edgeId].b));
          vertices.push(vertices[0]);
        }
      }
      const originalPolygon = closed ? vertices.slice(0, -1).map(id => mesh.vertices[id].point) : null;
      const output: EdgeRef[] = [];
      for (let i = 0; i < refs.length; ) {
        const bad = (at: number) =>
          !allowedEdge(refs[at].edgeId, true) ||
          [vertices[at], vertices[at + 1]].some(
            id => riverVertices.has(id) && !vertexHasCrossing(document, id, "wall", "river")
          );
        if (!bad(i)) {
          output.push(refs[i++]);
          continue;
        }
        // An admissible transverse arm can still end inside the rendered
        // river width. Start the replacement before entering that width,
        // rather than asking A* to start at a forbidden river-bank vertex.
        while (i > 0 && !clearVertex(vertices[i])) {
          i--;
          output.pop();
        }
        let end = i + 1;
        while (end < refs.length && (bad(end) || !clearVertex(vertices[end]))) end++;
        const startId = vertices[i],
          endId = vertices[end];
        const removed = new Set(refs.slice(i, end).map(ref => ref.edgeId));
        const barriers = new Set(
          document.featureGroups.flatMap(g =>
            g.kind === "wall" ? g.segments.filter(ref => !removed.has(ref.edgeId)).map(ref => ref.edgeId) : []
          )
        );
        for (const ref of output) barriers.add(ref.edgeId);
        const reservedVertices = new Set(
          [...barriers].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]).filter(id => id !== startId && id !== endId)
        );
        const nodes =
          clearVertex(startId) && clearVertex(endId)
            ? aStar(graph, index.get(startId)!, index.get(endId)!, (a, b, w) => {
                const edge = edgeAt.get(`${Math.min(a, b)},${Math.max(a, b)}`)!;
                if (
                  barriers.has(edge.id) ||
                  roadEdges.has(edge.id) ||
                  reservedVertices.has(edge.a) ||
                  reservedVertices.has(edge.b) ||
                  !allowedEdge(edge.id, allowCrossings)
                )
                  return Infinity;
                const faces = [edge.leftFace, edge.rightFace].filter((id): id is Id => !!id);
                if (
                  !faces.some(id => crossingCorridor.has(id)) ||
                  faces.some(id => protectedFaces.has(id) || mesh.faces[id].properties.water !== "land")
                )
                  return Infinity;
                const midpoint: Point = [
                  (mesh.vertices[edge.a].point[0] + mesh.vertices[edge.b].point[0]) / 2,
                  (mesh.vertices[edge.a].point[1] + mesh.vertices[edge.b].point[1]) / 2
                ];
                const outside =
                  originalPolygon &&
                  !pointInPolygon(midpoint, originalPolygon) &&
                  nearestOnPolyline(midpoint, [...originalPolygon, originalPolygon[0]]).dist > 1e-5;
                // Prefer the original town side, while permitting a short
                // detour on existing neighbouring land edges before splitting.
                return outside ? w * 4 : w;
              })
            : null;
        if (!nodes) {
          routingIssues.push(
            `城壁の河川迂回に失敗: 始点 ${startId} → 終点 ${endId}（${
              !clearVertex(startId) || !clearVertex(endId) ? "探索端点が河川の離隔内" : "通行可能な辺で接続できない"
            }、元の辺: ${refs
              .slice(i, end)
              .map(ref => ref.edgeId)
              .join(", ")}）`
          );
          // Keep the rejected run editable, but retain successful replacements
          // elsewhere in the same curtain instead of reverting the whole wall.
          output.push(...refs.slice(i, end));
          i = end;
          continue;
        }
        output.push(
          ...nodes.slice(1).map((b, j) => {
            const edge = edgeAt.get(`${Math.min(nodes[j], b)},${Math.max(nodes[j], b)}`)!;
            return { edgeId: edge.id, forward: edge.a === ids[nodes[j]] };
          })
        );
        i = end;
      }
      const points = output.map(
        ref => mesh.vertices[ref.forward ? mesh.edges[ref.edgeId].a : mesh.edges[ref.edgeId].b].point
      );
      if (
        closed &&
        (!isSimplePolygon(points) ||
          (originalPolygon && !pointInPolygon(polygonCentroid(originalPolygon), points)) ||
          protectedPoints.some(
            p => originalPolygon && pointInPolygon(p, originalPolygon) && !pointInPolygon(p, points)
          ))
      ) {
        routingIssues.push(`城壁 ${group.id} の迂回結果を採用できない: 閉路の交差または囲む領域の変化`);
        continue;
      }
      group.segments = output;
    }
  };

  const conflicts = () => {
    const walls = kindEdgeIds(document, "wall"),
      rivers = kindEdgeIds(document, "river");
    const vertices = new Set([...rivers].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
    const result: string[] = [];
    for (const id of walls) if (rivers.has(id)) result.push(`城壁と河川が辺 ${id} を共有している`);
    for (const id of new Set([...walls].flatMap(edge => [document.mesh.edges[edge].a, document.mesh.edges[edge].b])))
      if (vertices.has(id) && !vertexHasCrossing(document, id, "wall", "river"))
        result.push(`頂点 ${id} に河川通過口を確保できない`);
    for (const group of document.featureGroups) {
      if (group.kind !== "wall" || group.locked || !group.id.startsWith("gc:") || castleWallIds(document).has(group.id))
        continue;
      const gap = group.style.widthMeters / 2 + 2;
      const groupEdges = new Set(group.segments.map(ref => ref.edgeId));
      const approaches = new Set(
        featureGroupVertices(document, group).flatMap(id =>
          vertices.has(id) && vertexHasCrossing(document, id, "wall", "river")
            ? [
                ...bankApproachEdges(
                  document,
                  id,
                  [...groupEdges].filter(
                    edge => document.mesh.edges[edge].a === id || document.mesh.edges[edge].b === id
                  ),
                  gap,
                  groupEdges
                )
              ]
            : []
        )
      );
      for (const ref of group.segments) {
        const edge = document.mesh.edges[ref.edgeId];
        if (rivers.has(edge.id) || approaches.has(edge.id)) continue;
        const crossing =
          [edge.a, edge.b].find(
            id =>
              vertices.has(id) &&
              vertexHasCrossing(document, id, "wall", "river") &&
              transverseArm(document, edge.id, id)
          ) ??
          featureGroupVertices(document, group).find(id => {
            if (!vertices.has(id) || !vertexHasCrossing(document, id, "wall", "river")) return false;
            const origin = document.mesh.vertices[id].point;
            const a = document.mesh.vertices[edge.a].point,
              b = document.mesh.vertices[edge.b].point;
            const dx = b[0] - a[0],
              dy = b[1] - a[1],
              length = Math.hypot(dx, dy);
            return (
              length > 1e-7 &&
              Math.abs((origin[0] - a[0]) * dy - (origin[1] - a[1]) * dx) / length < 1e-5 &&
              transverseArm(document, edge.id, id)
            );
          });
        const tooClose = document.featureGroups.some(
          river =>
            river.kind === "river" &&
            river.vertices.slice(1).some((b, i) => {
              const a = river.vertices[i];
              if (
                crossing &&
                nearestOnPolyline(document.mesh.vertices[crossing].point, [
                  document.mesh.vertices[a].point,
                  document.mesh.vertices[b].point
                ]).dist <
                  river.style.widthMeters / 2 + gap
              )
                return false;
              return (
                segmentDistance(
                  document.mesh.vertices[edge.a].point,
                  document.mesh.vertices[edge.b].point,
                  document.mesh.vertices[a].point,
                  document.mesh.vertices[b].point
                ) <
                river.style.widthMeters / 2 + gap - 1e-7
              );
            })
        );
        if (tooClose) result.push(`辺 ${edge.id} の城壁と河川の間隔が不足している`);
      }
    }
    return result;
  };
  reroute(false);
  if (conflicts().length) reroute(true);
  if (conflicts().length) {
    // Prepare the entry/exit crossings together with their consuming curtain
    // path. Unused opening trials remain private and never alter the map.
    const base = clone(document);
    const rivers = kindEdgeIds(base, "river");
    const riverVertices = new Set(base.featureGroups.flatMap(group => (group.kind === "river" ? group.vertices : [])));
    const runs: Id[][] = [];
    for (const group of base.featureGroups) {
      if (group.kind !== "wall" || group.locked || !group.id.startsWith("gc:")) continue;
      let run: Id[] = [];
      for (const ref of group.segments) {
        const edge = base.mesh.edges[ref.edgeId];
        const touching = [edge.a, edge.b].filter(id => riverVertices.has(id));
        const blocked =
          rivers.has(ref.edgeId) ||
          touching.some(id => !vertexHasCrossing(base, id, "wall", "river") || !transverseArm(base, ref.edgeId, id));
        if (blocked) {
          for (const id of touching) if (!run.includes(id)) run.push(id);
        } else if (run.length) {
          runs.push(run);
          run = [];
        }
      }
      if (run.length) runs.push(run);
    }
    for (const run of runs) {
      const beforeRun = document;
      const candidates = [...new Set([run[0], run.at(-1)!, ...run])];
      let usedIds: Id[] = [];
      const trials: { vertex: Id; face?: Id; target?: Id }[] = [];
      for (const vertex of candidates) {
        // Prefer a single diagonal to an existing land corner. A normal ray
        // can cut both banks yet miss the useful v79→v53 replacement entirely.
        for (const face of incidentFaces(beforeRun.mesh, vertex)) {
          if (face.properties.locked || face.properties.water !== "land") continue;
          for (const target of faceVertices(beforeRun.mesh, face)) {
            if (target === vertex || riverVertices.has(target) || edgeBetween(beforeRun.mesh, vertex, target)) continue;
            trials.push({ vertex, face: face.id, target });
          }
        }
      }
      const existingWallVertices = new Set(
        beforeRun.featureGroups.flatMap(group => (group.kind === "wall" ? featureGroupVertices(beforeRun, group) : []))
      );
      const chordLength = (trial: { vertex: Id; target?: Id }) => {
        const a = beforeRun.mesh.vertices[trial.vertex].point,
          b = beforeRun.mesh.vertices[trial.target!].point;
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
      };
      trials.sort(
        (a, b) =>
          Number(existingWallVertices.has(b.target!)) - Number(existingWallVertices.has(a.target!)) ||
          chordLength(a) - chordLength(b)
      );
      // Fall back to the normal corridor at one river vertex only.
      for (const vertex of candidates) trials.push({ vertex });
      for (const trial of trials) {
        document = clone(beforeRun);
        const opened =
          trial.face && trial.target
            ? splitFace(document, trial.face, trial.vertex, trial.target)
            : openRiverWallPassage(document, trial.vertex);
        if (!opened || !preservesRivers(document, opened)) continue;
        const arms = throughEdgesAt(opened, trial.vertex, "river", true);
        if (arms.length !== 2 || !arms.every(edge => transverseArm(opened, edge.id, trial.vertex))) continue;
        document = opened;
        reroute(true);
        if (!vertexHasCrossing(document, trial.vertex, "wall", "river")) continue;
        // A diagonal trial is useful only if the wall uses that exact new
        // edge, not merely a different pre-existing crossing at the vertex.
        if (trial.target) {
          const chord = edgeBetween(document.mesh, trial.vertex, trial.target);
          if (!chord || !kindEdgeIds(document, "wall").has(chord.id)) continue;
        }
        usedIds = [trial.vertex];
        break;
      }
      if (!usedIds.length) {
        // A geometrically open junction is not a prepared wall passage until
        // the curtain actually consumes it. Do not publish unused cell cuts.
        document = beforeRun;
        preparationIssues.push(
          `河川横断の城壁経路を確保できない（進入候補: ${run[0]}、退出候補: ${run.at(-1)}、候補: ${run.join(", ")}）。未使用のセル分割は不採用`
        );
      } else {
        for (const id of usedIds) preparedPassages.add(id);
      }
    }
    reroute(true);
  }
  const riverVertices = new Set(
    [...kindEdgeIds(document, "river")].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b])
  );
  for (const group of document.featureGroups) {
    if (group.kind !== "wall" || group.locked || !group.id.startsWith("gc:")) continue;
    group.riverPassages = [...new Set(featureGroupVertices(document, group))].filter(
      id => riverVertices.has(id) && vertexHasCrossing(document, id, "wall", "river")
    );
  }
  const finalConflicts = conflicts();
  const issues = finalConflicts.length ? [...preparationIssues, ...routingIssues, ...finalConflicts] : [];
  // A rejected wall is still a real, editable feature in the partial city.
  // Failure highlighting belongs to the renderer, never substitutes for or
  // deletes the curtain's segments when the diagnostic overlay is closed.
  for (const id of protectedFaces)
    if (document.mesh.faces[id] && source.mesh.faces[id])
      document.mesh.faces[id].properties.locked = source.mesh.faces[id].properties.locked;
  return {
    document,
    issues,
    preparedPassages: [...preparedPassages],
    splitFaces: Object.keys(document.mesh.faces).length - Object.keys(source.mesh.faces).length
  };
}
