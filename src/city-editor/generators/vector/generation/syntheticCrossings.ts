import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { planSkeletonCrossings } from "../../generation/skeleton/crossings";
import { rebuildRoadGraph } from "../editing/network";
import { curveSource, removeVectorPath } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { pathIntersections } from "../geometry/intersections";
import { bridgeGeometry, distance, nearestRoadAnchor, unit } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater, vectorWaterSurfaces } from "../geometry/water";
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
  // Each crossing gets a straight leg a little longer than its bridge, laid along the road's course there.
  const planned: { roadId: string; riverId: string; at: Point; span: number }[] = [];
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
      along = unit(evaluateAnchor(road, hit.b, true)),
      // The leg is laid square to the river where it crosses, the direction the planner turned it toward.
      normal: Point = [-tangent[1], tangent[0]],
      axis: Point = normal[0] * along[0] + normal[1] * along[1] >= 0 ? normal : [-normal[0], -normal[1]],
      sine = Math.max(0.1, Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0])),
      halfWater = inputs.rivers[bridge.riverIndex].halfWidth,
      half = Math.max(road.width.leftMeters, road.width.rightMeters),
      cosine = Math.sqrt(Math.max(0, 1 - sine * sine)),
      span = (halfWater + 1.2 + (half * cosine) / sine) / sine + 0.5,
      leg = span + 2,
      points = samplePath(road)
        .map(s => s.point)
        .filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 1e-6);
    // Distances along the road from the crossing, so a winding road is cut by its own course.
    const cumulative = points.map((_, i) => (i ? 0 : 0));
    for (let i = 1; i < points.length; i++) cumulative[i] = cumulative[i - 1] + distance(points[i - 1], points[i]);
    let k = 0;
    for (let i = 0; i < points.length; i++) if (distance(points[i], at) < distance(points[k], at)) k = i;
    const atDistance =
        cumulative[k] +
        (points[k + 1] && distance(points[k + 1], at) < distance(points[k], points[k + 1])
          ? distance(points[k], at)
          : -distance(points[k], at)),
      before = points.filter((_, i) => cumulative[i] < atDistance - leg),
      after = points.filter((_, i) => cumulative[i] > atDistance + leg);
    if (!before.length || !after.length) continue;
    const a: Point = [at[0] - axis[0] * leg, at[1] - axis[1] * leg],
      b: Point = [at[0] + axis[0] * leg, at[1] + axis[1] * leg];
    doc.paths[road.id] = { ...road, source: curveSource([...before, a, b, ...after], "polyline", false) };
    planned.push({ roadId: road.id, riverId: river.id, at, span });
  }
  // Anchors are taken once every leg is laid, so two bridges on one road keep their own legs. A bridge the
  // document would refuse (a mouth reaching the sea, a bank too close) is not built; the road is then cut back.
  const waters = vectorWaterSurfaces(doc),
    water = allVectorWater(doc);
  const placeBridges = () => {
    for (const id of Object.keys(doc.connections.bridges))
      if (id.startsWith("site-bridge:")) delete doc.connections.bridges[id];
    let number = 0;
    for (const { roadId, riverId, at, span } of planned) {
      const road = doc.paths[roadId];
      if (!road) continue;
      const anchor = nearestRoadAnchor(road, at),
        segment = road.source.kind === "curve" ? road.source.segments.find(s => s.id === anchor.segmentId) : undefined;
      if (!segment || distance(evaluateAnchor(road, anchor), at) > 0.05) continue;
      // `span` runs from the river's centre to one landing.
      const dt = span / distance(segment.from, segment.to);
      if (anchor.t - dt <= 0 || anchor.t + dt >= 1) continue;
      const id = `site-bridge:${number++}`,
        bridge = {
          id,
          roadPathId: roadId,
          riverAnchor: nearestRoadAnchor(doc.paths[riverId], at),
          from: { ...anchor, t: anchor.t - dt },
          to: { ...anchor, t: anchor.t + dt },
          structure: "stone" as const,
          dryLandingMeters: 1,
          editPolicy: "fixed" as const
        };
      try {
        bridgeGeometry(doc, bridge, waters);
        doc.connections.bridges[id] = bridge;
      } catch {
        // Not built: the road is cut back before the water below.
      }
    }
    return Object.values(doc.connections.bridges).map(b => ({ outer: bridgeGeometry(doc, b, waters).deck, holes: [] }));
  };
  // A road still wet past its bridges (a shore it follows, a crossing with no square site) ends before the water;
  // the bridges on what is left of it stand again. The exact test is the skeleton's own.
  let decks = placeBridges();
  for (let pass = 0; pass < 4; pass++) {
    let cut = false;
    for (const road of Object.values(doc.paths).filter(p => p.role === "road" && relaid.has(p.id))) {
      const exposed = regionBoolean(
        regionBoolean(regionBoolean([pathSurface(road)], input.site!.domain, "intersection"), decks, "difference"),
        water,
        "intersection"
      );
      if (!exposed.some(r => regionArea(r) > 1e-5)) continue;
      cut = true;
      const dry = dryPrefix(road, input.site!.center, water, decks, 1 + pass * 2);
      if (!dry || dry === "whole") {
        doc.site!.fixedPaths = doc.site!.fixedPaths.filter(p => p.id !== road.id);
        doc.paths[road.id].editPolicy = "editable";
        for (const b of Object.values(doc.connections.bridges))
          if (b.roadPathId === road.id) delete doc.connections.bridges[b.id];
        doc = removeVectorPath(doc, road.id);
        relaid.delete(road.id);
        continue;
      }
      doc.paths[road.id] = { ...road, source: curveSource(dry, "polyline", false) };
    }
    if (!cut) break;
    decks = placeBridges();
  }
  // Junctions keep their positions; anchors on a re-laid road move to the same point on its new course, and a
  // junction left off a road that was cut back loses that road.
  for (const node of Object.values(doc.connections.nodes)) {
    node.anchors = node.anchors.flatMap(a => {
      const path = doc.paths[a.pathId];
      if (!path) return [];
      if (path.role !== "road" || !relaid.has(a.pathId)) return [a];
      const moved = nearestRoadAnchor(path, node.position);
      return distance(evaluateAnchor(path, moved), node.position) < 0.05 ? [moved] : [];
    });
    if (!node.anchors.length) delete doc.connections.nodes[node.id];
  }
  rebuildRoadGraph(doc);
  doc.site!.fixedPaths = Object.values(doc.paths)
    .filter(p => p.editPolicy === "fixed" && p.origin === "imported")
    .map(p => structuredClone(p));
  return doc;
}

/**
 * The road from its centre end up to just before the first water its surface would touch outside a bridge deck:
 * "whole" when it stays dry, undefined when too little is left to be a road.
 */
function dryPrefix(
  road: VectorPath,
  center: Point,
  water: VectorPolygon[],
  decks: VectorPolygon[],
  margin = 1
): Point[] | "whole" | undefined {
  let points = samplePath(road)
    .map(s => s.point)
    .filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 1e-6);
  if (distance(points[0], center) > distance(points.at(-1)!, center)) points = points.reverse();
  const reach = Math.max(road.width.leftMeters, road.width.rightMeters) + margin,
    rings = water.flatMap(w => [w.outer, ...w.holes]),
    near = (p: Point) =>
      rings.some(ring =>
        ring.some((a, i) => {
          const b = ring[(i + 1) % ring.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < reach;
        })
      ),
    wet = (p: Point) => !decks.some(d => containsRegion([d], p)) && (containsRegion(water, p) || near(p));
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(distance(a, b)));
    let lastDry = a;
    for (let k = 1; k <= n; k++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      if (wet(p)) {
        if (distance(lastDry, out.at(-1)!) > 0.05) out.push(lastDry);
        let length = 0;
        for (let j = 1; j < out.length; j++) length += distance(out[j - 1], out[j]);
        return out.length >= 2 && length >= 30 ? out : undefined;
      }
      lastDry = p;
    }
    out.push(b);
  }
  return "whole";
}
