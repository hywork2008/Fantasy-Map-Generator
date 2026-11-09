import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { planSkeletonCrossings } from "../../generation/skeleton/crossings";
import { rebuildRoadGraph } from "../editing/network";
import { curveSource, removeVectorPath } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { pathIntersections } from "../geometry/intersections";
import { distance, nearestRoadAnchor, unit } from "../geometry/network";
import { samplePath } from "../geometry/sampling";
import { vectorSkeletonInputs } from "./skeletonInputs";

/**
 * Bridges for a synthesized site (P5a). A real FMG city brings its certified crossings; a site the mesh editor's
 * generator synthesizes brings roads that simply run over its rivers. The mesh editor squares those crossings on
 * its cell-free skeleton (`planSkeletonCrossings`: each bridge leg turned to the river normal within the period's
 * skew limit); meshless runs the same planner, lays the roads along its routes and spans each leg with a straight
 * bridge. Water the planner cannot cross squarely is left to the skeleton, which then refuses the road.
 */
export function bridgeSyntheticCrossings(input: VectorCityDocument): VectorCityDocument {
  if (!input.site) return input;
  const { inputs, roadIds, droppedRoadIds, riverIds } = vectorSkeletonInputs(input, { walls: false }),
    { routes, bridges } = planSkeletonCrossings(inputs, input.site.center, null);
  let doc = structuredClone(input);
  // A road with no dry run from the centre (all at sea) is not part of the site.
  for (const id of droppedRoadIds) {
    doc.site!.fixedPaths = doc.site!.fixedPaths.filter(p => p.id !== id);
    doc.paths[id].editPolicy = "editable";
    doc = removeVectorPath(doc, id);
  }
  for (const route of routes) {
    if (route.dropped) continue;
    const id = roadIds[route.id],
      road = doc.paths[id],
      points = route.path.filter((p, i) => i === 0 || distance(p, route.path[i - 1]) > 0.05);
    if (!road || points.length < 2) continue;
    doc.paths[id] = { ...road, source: curveSource(points, "polyline", false) };
  }
  // Junctions keep their positions; anchors on a re-laid road move to the same point on its new course.
  const relaid = new Set(routes.filter(r => !r.dropped).map(r => roadIds[r.id]));
  for (const node of Object.values(doc.connections.nodes)) {
    node.anchors = node.anchors.flatMap(a => {
      if (!relaid.has(a.pathId)) return [a];
      const moved = nearestRoadAnchor(doc.paths[a.pathId], node.position);
      // A junction on a stretch cut off at the shore is left by that road.
      return distance(evaluateAnchor(doc.paths[a.pathId], moved), node.position) < 0.05 ? [moved] : [];
    });
    if (!node.anchors.length) delete doc.connections.nodes[node.id];
  }
  rebuildRoadGraph(doc);
  let number = 0;
  for (const bridge of bridges) {
    const road = doc.paths[roadIds[bridge.roadId]],
      river = doc.paths[riverIds[bridge.riverIndex]];
    if (!road || !river || road.source.kind !== "curve") continue;
    const hit = pathIntersections(river, road)
      .map(h => ({ h, d: distance(evaluateAnchor(river, h.a), bridge.point) }))
      .sort((x, y) => x.d - y.d)[0]?.h;
    if (!hit) continue;
    const at = evaluateAnchor(road, hit.b),
      tangent = unit(evaluateAnchor(river, hit.a, true)),
      axis = unit(evaluateAnchor(road, hit.b, true)),
      sine = Math.max(0.1, Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0])),
      halfWater = inputs.rivers[bridge.riverIndex].halfWidth,
      half = Math.max(road.width.leftMeters, road.width.rightMeters),
      cosine = Math.sqrt(Math.max(0, 1 - sine * sine)),
      span = (halfWater + 1.2 + (half * cosine) / sine) / sine + 0.5,
      // The bridge needs one straight leg: the road is re-laid straight for a little more than the span either side.
      leg = span + 2,
      points = samplePath(road)
        .map(s => s.point)
        .filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 1e-6),
      along = (p: Point) => (p[0] - at[0]) * axis[0] + (p[1] - at[1]) * axis[1],
      before = points.filter(p => along(p) < -leg),
      after = points.filter(p => along(p) > leg);
    if (!before.length || !after.length) continue;
    const a: Point = [at[0] - axis[0] * leg, at[1] - axis[1] * leg],
      b: Point = [at[0] + axis[0] * leg, at[1] + axis[1] * leg],
      relaidPoints = [...before, a, b, ...after];
    doc.paths[road.id] = { ...road, source: curveSource(relaidPoints, "polyline", false) };
    const segmentId = `segment:${before.length}`,
      t = 0.5;
    let id = `site-bridge:${number++}`;
    while (Object.hasOwn(doc.connections.bridges, id)) id = `site-bridge:${number++}`;
    doc.connections.bridges[id] = {
      id,
      roadPathId: road.id,
      riverAnchor: nearestRoadAnchor(river, at),
      from: { pathId: road.id, segmentId, t: t - span / (2 * leg) },
      to: { pathId: road.id, segmentId, t: t + span / (2 * leg) },
      structure: "stone",
      dryLandingMeters: 1,
      editPolicy: "fixed"
    };
  }
  // Re-laid legs move junction anchors only along straight stretches; the graph is rebuilt from the nodes.
  for (const node of Object.values(doc.connections.nodes))
    node.anchors = node.anchors.map(a =>
      doc.paths[a.pathId]?.role === "road" && relaid.has(a.pathId)
        ? nearestRoadAnchor(doc.paths[a.pathId], node.position)
        : a
    );
  rebuildRoadGraph(doc);
  doc.site!.fixedPaths = Object.values(doc.paths)
    .filter(p => p.editPolicy === "fixed" && p.origin === "imported")
    .map(p => structuredClone(p));
  return doc;
}
