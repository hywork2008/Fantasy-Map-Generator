import { editorText } from "../../../../i18n/editorMessages";
import type { RoadRoutingTrace } from "../../../types/contracts/generationDiagnostics";
import type { CityDocument, EdgeRef, Id, Point } from "../../../types/document";
import { castleRoadEdgeTest } from "../../castles";
import { aStar, type EdgeGraph } from "../../edgeGraph";
import { featureGroupVertices } from "../../features";
import { townGates } from "../../fortifications";
import { pointInPolygon, polygonCentroid, polylineLength } from "../../geom";
import { facePoints, faceVertices, indexMeshEdges } from "../../mesh";
import { MoatReservation } from "../../moats";
import { kindEdgeIds, throughEdgesAt } from "../../passages";
import { bramCoreRadiusForCity, bramRoadBanRadiusMeters } from "../../polygonalCirculadeLayout";
import { defaultRoadWidthMeters, townExtentMeters } from "../../settlementExtent";
import { lineHitsDocumentWater } from "../../waterGeometry";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import type { NearestVertex } from "../planning/meshLookup";

/** Re-route against the topology AFTER gates have been opened. Snapping each
 * old Voronoi hop independently can leave a road ending beside its own gate. */
export function completeRoadRouter(
  document: CityDocument,
  plan: Pick<Plan, "urban" | "avoidSea" | "gates" | "layout" | "precincts">,
  faceIdOf: string[],
  nearest: NearestVertex,
  banned: Set<Id>,
  openRim = false,
  urbanRegions: Point[][] = [],
  banReasons: Map<Id, string[]> = new Map()
): (
  polyline: Point[],
  outside: boolean,
  acrossBanks?: boolean,
  onTrace?: (trace: RoadRoutingTrace) => void
) => EdgeRef[] {
  const { mesh } = document;
  const ids = Object.keys(mesh.vertices);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const graph: EdgeGraph = { points: ids.map(id => mesh.vertices[id].point), adjacency: ids.map(() => []) };
  const edgeFor = new Map<string, (typeof mesh.edges)[string]>();
  for (const edge of Object.values(mesh.edges)) {
    const a = indexOf.get(edge.a)!;
    const b = indexOf.get(edge.b)!;
    const p = graph.points[a];
    const q = graph.points[b];
    const w = Math.hypot(q[0] - p[0], q[1] - p[1]);
    graph.adjacency[a].push({ to: b, w });
    graph.adjacency[b].push({ to: a, w });
    edgeFor.set(`${Math.min(a, b)},${Math.max(a, b)}`, edge);
  }
  const urban = new Set([...plan.urban].map(i => faceIdOf[i]));
  // Passage splitting inherits the parent region, including newly allocated faces.
  const originalFaces = new Set(faceIdOf);
  for (const face of Object.values(mesh.faces)) {
    if (originalFaces.has(face.id)) continue;
    const center = polygonCentroid(facePoints(mesh, face));
    if (urbanRegions.some(region => pointInPolygon(center, region))) urban.add(face.id);
  }
  // Membership can become stale when a gate passage or a citadel cuts the
  // curtain into several groups. A face is inside when every path to the map
  // frame crosses a wall, including a castle curtain that replaced a town arc.
  // An open sea wall still reaches the burg, and that flood is not used.
  let curtainInterior: Set<Id> | undefined;
  const barrierWalls = kindEdgeIds(document, "wall");
  const barrierVertices = new Set([...barrierWalls].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
  const wallDegree = new Map<Id, number>();
  for (const id of barrierWalls) {
    const edge = mesh.edges[id];
    for (const vertex of [edge.a, edge.b]) wallDegree.set(vertex, (wallDegree.get(vertex) ?? 0) + 1);
  }
  // A citadel spur or an open sea wall is not a closed curtain. Degree 2 keeps
  // the previous route classification for those towns.
  if (!openRim && barrierWalls.size && [...wallDegree.values()].every(degree => degree === 2)) {
    const exterior = new Set<Id>();
    const queue: Id[] = [];
    for (const edge of Object.values(mesh.edges)) {
      if (edge.leftFace && edge.rightFace) continue;
      for (const id of [edge.leftFace, edge.rightFace]) {
        if (id && !barrierWalls.has(edge.id) && !exterior.has(id)) {
          exterior.add(id);
          queue.push(id);
        }
      }
    }
    for (const id of queue) {
      for (const ref of mesh.faces[id].boundary) {
        if (barrierWalls.has(ref.edgeId)) continue;
        const edge = mesh.edges[ref.edgeId];
        const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
        if (other && !exterior.has(other)) {
          exterior.add(other);
          queue.push(other);
        }
      }
    }
    const originFace = Object.values(mesh.faces).find(face => pointInPolygon([0, 0], facePoints(mesh, face)));
    if (
      exterior.size > 0 &&
      exterior.size < Object.keys(mesh.faces).length &&
      originFace &&
      !exterior.has(originFace.id)
    ) {
      curtainInterior = new Set(Object.keys(mesh.faces).filter(id => !exterior.has(id)));
    }
  }
  const restricted = new Map<Id, Set<Id>>();
  const gateVertices = new Set(townGates(document).map(g => g.vertexId));
  // The document is unchanged here: one mesh index and one river-vertex set serve every vertex.
  const meshIndex = indexMeshEdges(mesh);
  const everyRiverVertex = new Set(document.featureGroups.flatMap(g => (g.kind === "river" ? g.vertices : [])));
  for (const kind of ["wall", "river"] as const) {
    const edges = kindEdgeIds(document, kind, meshIndex);
    const vertices = new Set([...edges].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
    for (const id of vertices) {
      const through = throughEdgesAt(document, id, kind, kind === "river", edges, everyRiverVertex, meshIndex.incident);
      // A gate with more than one arm on a side keeps every arm open: the
      // straightest pair can point the outer arm away from the road that
      // actually arrives (Chalbianos v63: a bridge-head road met the gate on
      // its second outer arm). The gate check still requires the road edges
      // to alternate with the wall around the gate.
      const allowed = new Set(
        kind === "wall" && gateVertices.has(id) && through.length === 2
          ? meshIndex
              .incident(id)
              .filter(e => !edges.has(e.id))
              .map(e => e.id)
          : through.map(e => e.id)
      );
      const previous = restricted.get(id);
      restricted.set(id, previous ? new Set([...allowed].filter(e => previous.has(e))) : allowed);
    }
  }
  const bridgeEdges = new Set(
    document.featureGroups.flatMap(g =>
      g.kind === "road" && g.id.startsWith(`${GEN_PREFIX}bridgeApproach-`) ? g.segments.map(ref => ref.edgeId) : []
    )
  );
  const bridgeInterior = new Map<Id, Set<Id>>();
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || !group.id.startsWith(`${GEN_PREFIX}bridgeApproach-`)) continue;
    const vertices = featureGroupVertices(document, group);
    for (const id of vertices.slice(1, -1))
      bridgeInterior.set(
        id,
        new Set(
          group.segments
            .filter(ref => {
              const edge = mesh.edges[ref.edgeId];
              return edge.a === id || edge.b === id;
            })
            .map(ref => ref.edgeId)
        )
      );
  }
  const moat = new MoatReservation(document, defaultRoadWidthMeters(townExtentMeters(document.frame)) / 2 + 1);
  const castleClear = castleRoadEdgeTest(document, defaultRoadWidthMeters(townExtentMeters(document.frame)));
  const castleBlocked = new Set(
    Object.values(mesh.edges)
      .filter(edge => !castleClear(edge.id))
      .map(edge => edge.id)
  );
  const moatBlocked = new Set(
    Object.values(mesh.edges)
      .filter(edge => !moat.roadAllowed(mesh.vertices[edge.a].point, mesh.vertices[edge.b].point))
      .map(edge => edge.id)
  );
  const gateIds = new Set(townGates(document).map(g => g.vertexId));
  // A coarse cell can put the closest vertex inside a surveyed river. Snap
  // imported approaches only to a usable nearby vertex. Dry surveyed
  // endpoints stay on their bank; wet legacy endpoints may snap within
  // the editing-cell tolerance, without drawing a connector through water.
  // This does not create a crossing or replace an already installed gate.
  const approachVertices = new Set<Id>();
  if (document.importedFixedCrossings) {
    for (const edge of Object.values(mesh.edges)) {
      if (banned.has(edge.id) || castleBlocked.has(edge.id) || moatBlocked.has(edge.id)) continue;
      if ([edge.a, edge.b].some(id => restricted.has(id) && !restricted.get(id)!.has(edge.id))) continue;
      if (plan.avoidSea && [edge.leftFace, edge.rightFace].some(id => id && mesh.faces[id].properties.water !== "land"))
        continue;
      approachVertices.add(edge.a);
      approachVertices.add(edge.b);
    }
  }
  const nearestDryApproach = (point: Point): Id | null => {
    if (!document.importedFixedCrossings) return nearest(point);
    const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
    const endpointWet = lineHitsDocumentWater(document, [point, point], width, true);
    const pool = new Set(approachVertices);
    while (pool.size) {
      const id = nearest(point, pool);
      if (!id) break;
      const at = mesh.vertices[id].point;
      if (Math.hypot(at[0] - point[0], at[1] - point[1]) > document.frame.blockSizeMeters * 2) break;
      if (endpointWet || !lineHitsDocumentWater(document, [point, at], width, true)) return id;
      pool.delete(id);
    }
    // A regional river can drown every coarse vertex near a landing on its
    // bank (Batonykut: the nearest dry vertex lay 2.4 blocks inland). Reach
    // one block further, but only over a connector that stays dry.
    for (const id of pool) {
      const at = mesh.vertices[id].point;
      if (Math.hypot(at[0] - point[0], at[1] - point[1]) > document.frame.blockSizeMeters * 3) pool.delete(id);
    }
    while (pool.size) {
      const id = nearest(point, pool);
      if (!id) return null;
      if (!lineHitsDocumentWater(document, [point, mesh.vertices[id].point], width, true)) return id;
      pool.delete(id);
    }
    return null;
  };
  const plazaFaces = new Set(document.elements.find(e => e.kind === "plaza")?.faceIds ?? []);
  const internalPlazaEdges = new Set(
    Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && plazaFaces.has(e.leftFace) && plazaFaces.has(e.rightFace))
      .map(e => e.id)
  );
  const riverRouteVertices = new Set<Id>();
  for (const group of document.featureGroups)
    if (group.kind === "river") for (const id of group.vertices) riverRouteVertices.add(id);
  const endpoint = (p: Point): Id | null => {
    const plannedIndex = plan.gates.findIndex(g => Math.hypot(g.point[0] - p[0], g.point[1] - p[1]) < 0.01);
    if (plannedIndex >= 0) {
      const placed = townGates(document).find(g => g.id === `${GEN_PREFIX}gate-${plannedIndex}`);
      if (placed) return placed.vertexId;
    }
    const gate = nearest(p, gateIds);
    const dryTo = (q: Point) =>
      !document.importedFixedCrossings ||
      !lineHitsDocumentWater(document, [p, q], defaultRoadWidthMeters(townExtentMeters(document.frame)), true);
    if (gate) {
      const q = mesh.vertices[gate].point;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < document.frame.blockSizeMeters * 0.8 && dryTo(q)) return gate;
    }
    // A road can start at a bridge head ~12 m from the bank, closer than one
    // block, so the plain nearest vertex may be on the far bank (Senia/
    // Kalerythra: a 0.6 m stream stranded the road's start across it).
    return nearestDryApproach(p) ?? nearest(p);
  };
  const interiorVertices = new Set(
    [...(curtainInterior ?? [])].flatMap(fid => (mesh.faces[fid] ? faceVertices(mesh, mesh.faces[fid]) : []))
  );
  return (polyline, outside, acrossBanks = false, onTrace) => {
    const searches: RoadRoutingTrace["searches"] = [];
    if (polyline.length < 2) {
      onTrace?.({
        outside,
        plannedPoints: polyline,
        waypoints: [],
        status: "failed",
        path: [],
        searches,
        get reason() {
          return editorText("cityEditor.messages.plannedRouteHasFewerThanTwoCoordinatePoints");
        }
      });
      return [];
    }
    const snap = (p: Point, gateEnd: boolean) => (gateEnd ? endpoint(p) : outside ? nearestDryApproach(p) : nearest(p));
    const sampled: Point[] = [];
    const stride = Math.max(1, Math.ceil((polyline.length - 1) / 8));
    for (let i = 0; i < polyline.length; i += stride) sampled.push(polyline[i]);
    if (sampled.at(-1) !== polyline.at(-1)) sampled.push(polyline[polyline.length - 1]);
    const waypoints: number[] = [];
    for (let i = 0; i < sampled.length; i++) {
      const onFrame =
        acrossBanks && i === 0 && sampled[i].some(value => Math.abs(value) >= document.frame.extentMeters / 2 - 0.01)
          ? new Set(
              ids.filter(id =>
                mesh.vertices[id].point.some(value => Math.abs(value) >= document.frame.extentMeters / 2 - 0.01)
              )
            )
          : undefined;
      let id = onFrame ? nearest(sampled[i], onFrame) : snap(sampled[i], outside ? i === sampled.length - 1 : i === 0);
      // The nearest plaza corner is often a curtain vertex. An interior street
      // has to end on a town vertex or its only hops are the wall itself.
      const gateEnd = outside ? i === sampled.length - 1 : i === 0;
      if (
        !outside &&
        !gateEnd &&
        id &&
        barrierVertices.has(id) &&
        !gateIds.has(id) &&
        (plan.layout ?? document.layout) !== "bram"
      ) {
        const point = sampled[i];
        const host = Object.values(mesh.faces).find(
          face => (curtainInterior?.has(face.id) || urban.has(face.id)) && pointInPolygon(point, facePoints(mesh, face))
        );
        const pool = host
          ? faceVertices(mesh, host)
          : [...(curtainInterior ?? urban)].flatMap(fid =>
              mesh.faces[fid] ? faceVertices(mesh, mesh.faces[fid]) : []
            );
        let best: Id | undefined;
        let bestDist = Infinity;
        for (const vertexId of pool) {
          if (barrierVertices.has(vertexId) || gateIds.has(vertexId)) continue;
          const at = mesh.vertices[vertexId]?.point;
          if (!at) continue;
          const dist = Math.hypot(at[0] - point[0], at[1] - point[1]);
          if (dist < bestDist) {
            bestDist = dist;
            best = vertexId;
          }
        }
        if (best) id = best;
      }
      // An approach waypoint can snap onto a curtain corner that bulges past
      // it; every hop from there is wall (Yelen v69). Use the nearest vertex
      // off the curtain instead, outside it when the interior is known.
      if (outside && !gateEnd && id && barrierVertices.has(id) && !gateIds.has(id)) {
        const point = sampled[i];
        let best: Id | undefined;
        let bestDist = Infinity;
        for (const vertexId of ids) {
          if (barrierVertices.has(vertexId)) continue;
          if (interiorVertices.has(vertexId)) continue;
          const at = mesh.vertices[vertexId].point;
          const dist = Math.hypot(at[0] - point[0], at[1] - point[1]);
          if (dist < bestDist) {
            bestDist = dist;
            best = vertexId;
          }
        }
        if (best && bestDist < document.frame.blockSizeMeters * 2) id = best;
      }
      const idx = id ? indexOf.get(id) : undefined;
      if (idx === undefined || waypoints.at(-1) === idx) continue;
      waypoints.push(idx);
    }
    // A hamlet plaza can snap onto the gate vertex. One inward passage arm
    // still has to exist or the gate has no town-side road.
    if (!outside && waypoints.length === 1 && gateIds.has(ids[waypoints[0]])) {
      const vertexId = ids[waypoints[0]];
      const inward = throughEdgesAt(document, vertexId, "wall").find(edge =>
        [edge.leftFace, edge.rightFace].some(id => !!id && (curtainInterior?.has(id) || urban.has(id)))
      );
      const other = inward ? (inward.a === vertexId ? inward.b : inward.a) : undefined;
      const otherIndex = other ? indexOf.get(other) : undefined;
      if (otherIndex !== undefined && otherIndex !== waypoints[0]) waypoints.push(otherIndex);
    }
    if (!waypoints.length || (!outside && waypoints.length < 2)) {
      onTrace?.({
        outside,
        plannedPoints: polyline,
        waypoints: waypoints.map(i => ids[i]),
        status: "failed",
        path: [],
        searches,
        get reason() {
          return editorText("cityEditor.messages.notEnoughSnappedVerticesNoVerticesOrIdenticalStartAnd");
        }
      });
      return [];
    }
    const hopEndOf = waypoints[waypoints.length - 1];
    let useCurrentCurtain = false;
    let blocked: RoadRoutingTrace["searches"][number]["blocked"] = [];
    const weight = (a: number, b: number, w: number, hopEnd: number) => {
      const edge = edgeFor.get(`${Math.min(a, b)},${Math.max(a, b)}`)!;
      const rejectEdge = (reason: string) => {
        if (onTrace) blocked.push({ edge: edge.id, from: ids[a], to: ids[b], reason });
        return Infinity;
      };
      if (castleBlocked.has(edge.id))
        return rejectEdge(editorText("cityEditor.messages.castleCastleOrWallExclusionArea"));
      if (moatBlocked.has(edge.id))
        return rejectEdge(editorText("cityEditor.messages.moatEntersTheMoatAwayFromAGatePassage"));
      for (const id of [edge.a, edge.b])
        if (bridgeInterior.has(id) && !gateIds.has(id) && !bridgeInterior.get(id)!.has(edge.id))
          return rejectEdge(editorText("cityEditor.messages.bridgeInteriorBranchesFromBridgeInterior", { value0: id }));
      if (banned.has(edge.id)) {
        const canUsePlazaEdge =
          !outside &&
          internalPlazaEdges.has(edge.id) &&
          (gateIds.has(edge.a) || gateIds.has(edge.b) || a === hopEnd || b === hopEnd);
        if (!canUsePlazaEdge)
          return rejectEdge(
            banReasons.get(edge.id)?.join("; ") ??
              editorText("cityEditor.messages.bannedEdgeEdgeExcludedFromRoadSearch")
          );
      }
      if (riverRouteVertices.has(edge.a) && riverRouteVertices.has(edge.b))
        return rejectEdge(editorText("cityEditor.messages.riverBankBothEndpointsAreRiverVertices"));
      for (const id of [edge.a, edge.b]) {
        if (restricted.has(id) && !restricted.get(id)!.has(edge.id))
          return rejectEdge(
            editorText("cityEditor.messages.barrierPassageNotAPermittedRiverOrWallCrossingAt", {
              value0: id,
              value1: [...restricted.get(id)!].join(", ") || editorText("cityEditor.messages.noneGenerate")
            })
          );
      }
      const faces = [edge.leftFace, edge.rightFace].filter((id): id is Id => id !== null);
      if (plan.avoidSea && faces.some(id => mesh.faces[id].properties.water !== "land"))
        return rejectEdge(editorText("cityEditor.messages.waterFaceEdgeTouchingWater"));
      const inTown = faces.some(id => (useCurrentCurtain ? curtainInterior! : urban).has(id));
      if (!acrossBanks && outside === inTown && !bridgeEdges.has(edge.id)) {
        // An unwalled town has no curtain to separate an approach from local
        // streets. Keep the exact requested entrance; dry/civic/river checks
        // above still apply throughout, including inside built-up cells.
        if (outside && openRim) return w;
        return rejectEdge(
          outside
            ? editorText("cityEditor.messages.townInteriorOuterRoadTouchesAnInnerCell", {
                value0: faces.filter(id => (useCurrentCurtain ? curtainInterior! : urban).has(id)).join(", ")
              })
            : editorText("cityEditor.messages.townExteriorInnerRoadTouchesAnOuterCell", { value0: faces.join(", ") })
        );
      }
      return w;
    };
    const stitch = (points: number[]): number[] | null => {
      const nodes: number[] = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const hopEnd = points[i + 1];
        blocked = [];
        const start = nodes.at(-1)!;
        const hop = aStar(
          graph,
          start,
          hopEnd,
          (a, b, w) => weight(a, b, w, hopEnd),
          onTrace
            ? (partial, reached) => {
                const visited = new Set(reached.map(i => ids[i]));
                const partialPath = [...nodes.slice(0, -1), ...partial];
                searches.push({
                  start: ids[start],
                  end: ids[hopEnd],
                  classification: useCurrentCurtain ? "current-curtain" : "planned",
                  reachedCount: reached.length,
                  partialPath: partialPath.map(i => ids[i]),
                  partialEdges: partialPath.slice(1).map((v, i) => {
                    return edgeFor.get(`${Math.min(partialPath[i], v)},${Math.max(partialPath[i], v)}`)!.id;
                  }),
                  blocked: blocked.filter(block => !visited.has(block.to))
                });
              }
            : undefined
        );
        if (!hop || hop.length < 2) return null;
        nodes.push(...hop.slice(1));
      }
      return nodes.length >= 2 ? nodes : null;
    };
    let nodes = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
    // Passage splits and a citadel can leave the planned urban ids behind the
    // curtain that was actually built. Retry a failed interior street on that
    // curtain; a route that already succeeded keeps its planned membership.
    if (!nodes && !outside && curtainInterior) {
      useCurrentCurtain = true;
      nodes = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
      if (!nodes) useCurrentCurtain = false;
    }
    // An imported road that lands on a fixed bridge head inside the map ends
    // there; the frame road carries it over the river (Myosiasos lost its
    // bridge road to a detour along the bank to the frame).
    const landsInside =
      !!document.importedFixedCrossings &&
      polyline[0].every(value => Math.abs(value) < document.frame.extentMeters / 2 - 0.01);
    // Keep successful planned routes unchanged. Only retry a failed exterior
    // approach against the repaired closed curtain.
    for (let pass = 0; outside && pass < (curtainInterior ? 2 : 1); pass++) {
      // The current-curtain pass covers the dry-exit search below as well; it
      // falls back to the planned classification only when it found nothing.
      const planned = nodes;
      let foundThisPass = false;
      if (pass > 0) {
        useCurrentCurtain = true;
        const retried = stitch(waypoints) ?? stitch([waypoints[0], hopEndOf]);
        if (retried) {
          nodes = retried;
          foundThisPass = true;
        }
      }
      if (
        outside &&
        (!nodes ||
          (!landsInside &&
            graph.points[nodes[0]].every(value => Math.abs(value) < document.frame.extentMeters / 2 - 0.01)))
      ) {
        // The bearing can snap to an unusable river mouth. Search dry frame
        // exits in bearing order before giving up the already placed gate.
        const half = document.frame.extentMeters / 2;
        const target = graph.points[waypoints[0]];
        const exits = ids.map((_, i) => i).filter(i => graph.points[i].some(v => Math.abs(v) >= half - 0.01));
        exits.sort(
          (a, b) =>
            Math.hypot(graph.points[a][0] - target[0], graph.points[a][1] - target[1]) -
            Math.hypot(graph.points[b][0] - target[0], graph.points[b][1] - target[1])
        );
        for (const exit of exits) {
          const extended = stitch([exit, hopEndOf]);
          if (extended) {
            nodes = extended;
            foundThisPass = true;
            break;
          }
        }
      }
      if (pass > 0 && !foundThisPass) {
        useCurrentCurtain = false;
        nodes = planned;
      }
      if (nodes && graph.points[nodes[0]].some(value => Math.abs(value) >= document.frame.extentMeters / 2 - 0.01))
        break;
    }
    // A ferry landing just outside the gate leaves no room for an approach
    // between the curtain and the bank (Toyora: ~15 m). The gate is the
    // landing; its outward arm is the whole approach road.
    if (
      outside &&
      !nodes &&
      gateIds.has(ids[hopEndOf]) &&
      polylineLength(polyline) < document.frame.blockSizeMeters * 1.5
    ) {
      const start = polyline[0];
      let best: number | undefined;
      let bestDist = Infinity;
      for (const { to, w } of graph.adjacency[hopEndOf]) {
        if (!Number.isFinite(weight(to, hopEndOf, w, hopEndOf))) continue;
        const at = graph.points[to];
        const dist = Math.hypot(at[0] - start[0], at[1] - start[1]);
        if (dist < bestDist) {
          bestDist = dist;
          best = to;
        }
      }
      if (best !== undefined) nodes = [best, hopEndOf];
    }
    if (!nodes && !outside && gateIds.has(ids[waypoints[0]])) {
      // A coastal plaza corner may itself touch water or a wall. Connect to
      // another vertex of the same square instead of dropping the gate road.
      const plaza = document.elements.find(element => element.kind === "plaza");
      const targets = new Set(
        (plaza?.faceIds ?? []).flatMap(id =>
          (mesh.faces[id]?.boundary ?? []).flatMap(ref => {
            const edge = mesh.edges[ref.edgeId];
            return [indexOf.get(edge.a)!, indexOf.get(edge.b)!];
          })
        )
      );
      // Polygonal plazas (circulade/bram) have no face IDs. Their nearest
      // corner can snap into a temple footprint; try the other plaza corners
      // rather than treating that blocked snap as an unreachable gate.
      if (!plaza?.faceIds.length) {
        const precinct = plan.precincts.find(p => p.kind === "plaza");
        for (const point of precinct?.polygon ?? []) {
          const id = nearest(point);
          const index = id ? indexOf.get(id) : undefined;
          if (index !== undefined) targets.add(index);
        }
      }
      if ((plan.layout ?? document.layout) === "bram") {
        // A spoke ends outside the reserved core, but its nearest mesh vertex
        // can lie inside it. Try nearby exterior vertices before rejecting the
        // gate; all wall, river, sea, castle and moat restrictions still apply.
        const hub = plan.precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0];
        const core = bramCoreRadiusForCity(document.frame.cityRadiusMeters, !openRim);
        const minimumRadius = bramRoadBanRadiusMeters(core);
        const aim = polyline.at(-1)!;
        for (const [index, point] of graph.points.entries()) {
          if (
            Math.hypot(point[0] - hub[0], point[1] - hub[1]) >= minimumRadius &&
            Math.hypot(point[0] - aim[0], point[1] - aim[1]) <= document.frame.blockSizeMeters
          )
            targets.add(index);
        }
      }
      const target = graph.points[hopEndOf];
      const candidates = [...targets].sort(
        (a, b) =>
          Math.hypot(graph.points[a][0] - target[0], graph.points[a][1] - target[1]) -
          Math.hypot(graph.points[b][0] - target[0], graph.points[b][1] - target[1])
      );
      for (const candidate of candidates) {
        nodes = stitch([waypoints[0], candidate]);
        if (nodes) break;
      }
    }
    const emitTrace = () =>
      onTrace?.({
        outside,
        plannedPoints: polyline,
        waypoints: waypoints.map(i => ids[i]),
        status: nodes ? "connected" : "failed",
        path: nodes?.map(i => ids[i]) ?? [],
        edges:
          nodes?.slice(1).map((b, i) => edgeFor.get(`${Math.min(nodes![i], b)},${Math.max(nodes![i], b)}`)!.id) ?? [],
        searches
      });
    if (!nodes) {
      emitTrace();
      return [];
    }
    if (outside) {
      const half = document.frame.extentMeters / 2;
      const onFrame = (node: number) => graph.points[node].some(value => Math.abs(value) >= half - 0.01);
      // Routes are stored frame → town. Keep the first frame contact seen
      // from town, even when the discarded tail briefly returns inland.
      const firstContactFromTown = nodes.findLastIndex(onFrame);
      if (firstContactFromTown >= 0) nodes = nodes.slice(firstContactFromTown);
    }
    emitTrace();
    return nodes.slice(1).map((b, i) => {
      const edge = edgeFor.get(`${Math.min(nodes[i], b)},${Math.max(nodes[i], b)}`)!;
      return { edgeId: edge.id, forward: edge.a === ids[nodes[i]] };
    });
  };
}
