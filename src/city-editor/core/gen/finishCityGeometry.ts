// MIT implementation based on City Editor's shared mesh and reference output.
// No TownGeneratorTS / GPL source is used.
import { featureGroupVertices } from "../features";
import { castleWallIds } from "../fortifications";
import { clone, facePoints, faceVertices, indexMeshEdges } from "../mesh";
import { straightenBridges, straightenGateCrossings } from "../passages";
import type { CityDocument, Id, Point } from "../types";
import { refreshCemeteryLayouts, syncDocumentCemeteries } from "./cemeteryLayout";
import { polygonArea, polygonCentroid, segmentInteriorInPolygon, segmentSegmentHit } from "./geom";

/** Smooth the actual shared vertices, so walls, streets, water and building
 * setbacks keep meeting at exactly the same coordinates after editing/export.
 * Neighbouring blocks absorb the displacement; local line searches prevent
 * collapsed edges, inverted faces and self-intersections. */
export function finishCityGeometry(source: CityDocument, phase: "finish" | "boundaries" = "finish"): CityDocument {
  const next = clone(source);
  const coarse = source.gridKind === "evolution";
  const { mesh } = next;
  const edgeIndex = indexMeshEdges(mesh);
  const original = new Map(Object.values(mesh.vertices).map(v => [v.id, v.point]));
  const desired = new Map<Id, Point>(original);
  const pinned = new Set<Id>();
  const adjacent = new Map<Id, Set<Id>>();
  const facesAt = new Map<Id, Id[]>();
  const faceRings = new Map(Object.values(mesh.faces).map(f => [f.id, faceVertices(mesh, f)]));
  const areas = new Map(Object.values(mesh.faces).map(f => [f.id, polygonArea(facePoints(mesh, f))]));
  const half = next.frame.extentMeters / 2;
  for (const v of Object.values(mesh.vertices)) {
    if (v.locked || Math.abs(v.point[0]) >= half - 0.001 || Math.abs(v.point[1]) >= half - 0.001) pinned.add(v.id);
  }
  const water = new Set<Id>();
  for (const e of Object.values(mesh.edges)) {
    if (!adjacent.has(e.a)) adjacent.set(e.a, new Set());
    if (!adjacent.has(e.b)) adjacent.set(e.b, new Set());
    adjacent.get(e.a)!.add(e.b);
    adjacent.get(e.b)!.add(e.a);
    if (e.locked) pinned.add(e.a).add(e.b);
    const left = e.leftFace ? mesh.faces[e.leftFace] : null;
    const right = e.rightFace ? mesh.faces[e.rightFace] : null;
    if (left && right && (left.properties.water === "land") !== (right.properties.water === "land")) water.add(e.id);
  }
  for (const [fid, ids] of faceRings) {
    for (const id of ids) {
      if (!facesAt.has(id)) facesAt.set(id, []);
      facesAt.get(id)!.push(fid);
      if (mesh.faces[fid].properties.locked) pinned.add(id);
    }
  }
  const walls = new Set<Id>();
  const roads = new Set<Id>();
  const roadWidths = new Map<Id, number>();
  const wallWidths = new Map<Id, number>();
  const rivers = new Set<Id>();
  const riverVertices = new Set<Id>();
  for (const group of next.featureGroups) {
    const ids = featureGroupVertices(next, group);
    if (group.kind === "river") for (const id of ids) riverVertices.add(id);
    if (group.kind === "road" && (group.id.startsWith("gc:bridge-") || group.id.startsWith("gc:bridgeApproach-"))) {
      for (const id of ids) pinned.add(id);
      for (const river of next.featureGroups) {
        if (river.kind !== "river") continue;
        for (let i = 0; i < river.vertices.length; i++)
          if (ids.includes(river.vertices[i]))
            for (const neighbor of river.vertices.slice(Math.max(0, i - 1), i + 2)) pinned.add(neighbor);
      }
    }
    if (group.locked || !group.id.startsWith("gc:")) {
      for (const id of ids) pinned.add(id);
      continue;
    }
    const edges =
      group.kind === "wall" ? walls : group.kind === "road" ? roads : group.kind === "river" ? rivers : null;
    if (!edges) continue;
    for (let i = 1; i < ids.length; i++) {
      const edge = edgeIndex.between(ids[i - 1], ids[i]);
      if (edge) {
        edges.add(edge.id);
        if (group.kind === "road")
          roadWidths.set(edge.id, Math.max(roadWidths.get(edge.id) ?? 0, group.style.widthMeters));
        if (group.kind === "wall")
          wallWidths.set(edge.id, Math.max(wallWidths.get(edge.id) ?? 0, group.style.widthMeters));
      }
    }
  }
  for (const gate of next.gates) if (gate.locked || !gate.id.startsWith("gc:")) pinned.add(gate.vertexId);
  // A gate and a river that already share a wall edge keep that spacing.
  // Either end may still move away; neither may close the gap.
  for (const group of next.featureGroups)
    if (group.kind === "wall" && castleWallIds(next).has(group.id))
      for (const ref of group.segments) {
        const edge = mesh.edges[ref.edgeId];
        pinned.add(edge.a);
        pinned.add(edge.b);
      }
  const cemeteryFaces = Object.values(mesh.faces).filter(f => f.properties.ward === "cemetery");
  const cemeteryEdges = new Set(cemeteryFaces.flatMap(f => (f.boundary ?? []).map(b => b.edgeId)));

  const riverWidths = new Map<Id, number>();
  for (const group of next.featureGroups) {
    if (group.kind === "river") {
      const ids = featureGroupVertices(next, group);
      for (let i = 1; i < ids.length; i++) {
        const edge = edgeIndex.between(ids[i - 1], ids[i]);
        if (edge) riverWidths.set(edge.id, Math.max(riverWidths.get(edge.id) ?? 0, group.style.widthMeters));
      }
    }
  }

  const bridgeVertices = new Set<Id>();
  for (const group of next.featureGroups) {
    if (group.kind === "road" && (group.id.startsWith("gc:bridge-") || group.id.startsWith("gc:bridgeApproach-"))) {
      for (const id of featureGroupVertices(next, group)) bridgeVertices.add(id);
    }
  }

  // Wall routing has fixed the channel and its clearance before this stage.
  // Smoothing streets must not pull the river back onto the new curtain.
  if (phase === "finish") for (const id of riverVertices) pinned.add(id);

  const gateVertices = new Set((next.gates ?? []).map(gate => gate.vertexId));
  const clearancePairs: { road: Id; obstacle: Id; minimum: number }[] = [];
  const clearanceAt = (roadId: Id, obstacleId: Id): number => {
    const road = mesh.edges[roadId];
    const obstacle = mesh.edges[obstacleId];
    const a = mesh.vertices[road.a].point;
    const b = mesh.vertices[road.b].point;
    const c = mesh.vertices[obstacle.a].point;
    const d = mesh.vertices[obstacle.b].point;
    const pointGap = (p: Point, u: Point, v: Point): number => {
      const dx = v[0] - u[0];
      const dy = v[1] - u[1];
      const t = Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - u[0] - t * dx, p[1] - u[1] - t * dy);
    };
    if (segmentSegmentHit(a, b, c, d)) return 0;
    return Math.min(pointGap(a, c, d), pointGap(b, c, d), pointGap(c, a, b), pointGap(d, a, b));
  };

  // 1. Road vs Wall clearance
  for (const roadId of roads)
    for (const wallId of walls) {
      const road = mesh.edges[roadId];
      const wall = mesh.edges[wallId];
      // A road and curtain are meant to meet at a gate.
      if ([road.a, road.b].some(id => gateVertices.has(id) && (id === wall.a || id === wall.b))) continue;
      const visibleGap = ((roadWidths.get(roadId) ?? 0) + (wallWidths.get(wallId) ?? 0)) / 2 + 1;
      const minimum = Math.min(visibleGap, clearanceAt(roadId, wallId));
      if (minimum > 0.01) clearancePairs.push({ road: roadId, obstacle: wallId, minimum });
    }

  // 2. Road vs River clearance: non-bridge roads must NEVER cross rivers or cut into river water
  for (const roadId of roads)
    for (const riverId of rivers) {
      const road = mesh.edges[roadId];
      const river = mesh.edges[riverId];
      // A road and river are meant to meet at a bridge crossing.
      if ([road.a, road.b].some(id => bridgeVertices.has(id) && (id === river.a || id === river.b))) continue;
      const initial = clearanceAt(roadId, riverId);
      if (initial < 0.01 || initial > 60) continue;
      const visibleGap = ((roadWidths.get(roadId) ?? 4) + (riverWidths.get(riverId) ?? 6)) / 2 + 1;
      const minimum = Math.max(0.5, Math.min(visibleGap, initial));
      if (minimum > 0.01) clearancePairs.push({ road: roadId, obstacle: riverId, minimum });
    }

  // 3. Road vs Cemetery boundary clearance: roads must never cut across cemetery perimeter
  for (const roadId of roads) {
    if (cemeteryEdges.has(roadId)) continue;
    for (const cemEdgeId of cemeteryEdges) {
      const road = mesh.edges[roadId];
      const cemEdge = mesh.edges[cemEdgeId];
      if (road.a === cemEdge.a || road.a === cemEdge.b || road.b === cemEdge.a || road.b === cemEdge.b) continue;
      const initial = clearanceAt(roadId, cemEdgeId);
      if (initial < 0.01 || initial > 50) continue;
      const minimum = Math.max(0.5, Math.min((roadWidths.get(roadId) ?? 4) / 2 + 1, initial));
      if (minimum > 0.01) clearancePairs.push({ road: roadId, obstacle: cemEdgeId, minimum });
    }
  }

  // Preserve the river/curtain clearance through every smoothing sweep.
  // Shared vertices are intentional transverse water passages.
  for (const wallId of walls)
    for (const riverId of rivers) {
      const wall = mesh.edges[wallId],
        river = mesh.edges[riverId];
      if ([wall.a, wall.b].some(id => id === river.a || id === river.b)) continue;
      const initial = clearanceAt(wallId, riverId);
      const visibleGap = (wallWidths.get(wallId) ?? 7) / 2 + (riverWidths.get(riverId) ?? 10) / 2 + 2;
      const minimum = Math.min(visibleGap, initial);
      if (minimum > 0.01) clearancePairs.push({ road: wallId, obstacle: riverId, minimum });
    }

  const clearanceAtVertex = new Map<Id, typeof clearancePairs>();
  for (const pair of clearancePairs) {
    const road = mesh.edges[pair.road];
    const obstacle = mesh.edges[pair.obstacle];
    for (const id of new Set([road.a, road.b, obstacle.a, obstacle.b])) {
      const pairs = clearanceAtVertex.get(id) ?? [];
      pairs.push(pair);
      clearanceAtVertex.set(id, pairs);
    }
  }
  const gateRiverGap = new Map<Id, { anchor: Point; minDist: number }[]>();
  const rememberGap = (id: Id, anchor: Point, minDist: number) => {
    const holds = gateRiverGap.get(id) ?? [];
    holds.push({ anchor, minDist });
    gateRiverGap.set(id, holds);
  };
  for (const edgeId of walls) {
    const edge = mesh.edges[edgeId];
    const hold = (gateId: Id, riverId: Id) => {
      if (!gateVertices.has(gateId) || !riverVertices.has(riverId)) return;
      const gate = original.get(gateId);
      const river = original.get(riverId);
      if (!gate || !river) return;
      const minDist = Math.hypot(gate[0] - river[0], gate[1] - river[1]);
      if (minDist < 1) return;
      rememberGap(gateId, river, minDist);
      rememberGap(riverId, gate, minDist);
    };
    hold(edge.a, edge.b);
    hold(edge.b, edge.a);
  }
  for (const element of next.elements) {
    if (!element.locked) continue;
    for (const fid of element.faceIds) for (const id of faceRings.get(fid) ?? []) pinned.add(id);
  }

  const constrained = new Set(pinned);
  const smoothNetwork = (edges: Set<Id>, passes: number): void => {
    const neighbors = new Map<Id, Set<Id>>();
    for (const eid of edges) {
      const e = mesh.edges[eid];
      if (!neighbors.has(e.a)) neighbors.set(e.a, new Set());
      if (!neighbors.has(e.b)) neighbors.set(e.b, new Set());
      neighbors.get(e.a)!.add(e.b);
      neighbors.get(e.b)!.add(e.a);
    }
    for (let pass = 0; pass < passes; pass++) {
      const updates = new Map<Id, Point>();
      for (const [id, ns] of neighbors) {
        // Branches and endpoints stay connected. Gates can follow their wall
        // during wall smoothing and then anchor the street network.
        if (constrained.has(id) || ns.size !== 2) continue;
        const [a, b] = [...ns].map(n => desired.get(n)!);
        const p = desired.get(id)!;
        updates.set(id, [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]);
      }
      for (const [id, p] of updates) desired.set(id, p);
    }
    for (const id of neighbors.keys()) constrained.add(id);
  };
  // Classify terrain on the original grid. Boundary preparation only rounds
  // the channel and curtain, before routing publishes their clearance.
  smoothNetwork(water, phase === "boundaries" ? 0 : coarse ? 3 : 12);
  smoothNetwork(rivers, coarse ? 3 : 12);
  smoothNetwork(walls, coarse ? 4 : 32);
  // The vertex where a road leaves a gate stays put. A short stub beyond it
  // would otherwise pull that approach back onto the gate; squaring still
  // swings the arm afterwards.
  for (const edgeId of roads) {
    const edge = mesh.edges[edgeId];
    if (gateVertices.has(edge.a)) constrained.add(edge.b);
    if (gateVertices.has(edge.b)) constrained.add(edge.a);
  }
  smoothNetwork(roads, phase === "boundaries" ? 0 : coarse ? 6 : 48);

  // Extend boundary displacements into nearby blocks instead of dragging one
  // vertex through an otherwise frozen Voronoi tessellation.
  for (let pass = 0; pass < 24; pass++) {
    const updates = new Map<Id, Point>();
    for (const [id, ns] of adjacent) {
      if (constrained.has(id)) continue;
      const p = original.get(id)!;
      let dx = 0;
      let dy = 0;
      for (const n of ns) {
        dx += desired.get(n)![0] - original.get(n)![0];
        dy += desired.get(n)![1] - original.get(n)![1];
      }
      updates.set(id, [p[0] + (dx / ns.size) * 0.96, p[1] + (dy / ns.size) * 0.96]);
    }
    for (const [id, p] of updates) desired.set(id, p);
  }

  const minimumCorner = (points: Point[]): number =>
    Math.min(
      ...points.map((p, i) => {
        const a = points[(i + points.length - 1) % points.length];
        const b = points[(i + 1) % points.length];
        const dot =
          ((a[0] - p[0]) * (b[0] - p[0]) + (a[1] - p[1]) * (b[1] - p[1])) /
          (Math.hypot(a[0] - p[0], a[1] - p[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]) || 1);
        return Math.acos(Math.max(-1, Math.min(1, dot)));
      })
    );
  const validAt = (id: Id, cornerFloors: Map<Id, number>): boolean => {
    const p = mesh.vertices[id].point;
    for (const n of adjacent.get(id) ?? []) {
      const q = mesh.vertices[n].point;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.01) return false;
    }
    for (const fid of facesAt.get(id) ?? []) {
      const points = faceRings.get(fid)!.map(v => mesh.vertices[v].point);
      const before = areas.get(fid)!;
      const area = polygonArea(points);
      if (Math.abs(area) < 1.01 || area / before < (coarse ? 0.5 : 0.12)) return false;
      if (minimumCorner(points) < cornerFloors.get(fid)! - 1e-7) return false;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 2; j < points.length; j++) {
          if (i === 0 && j === points.length - 1) continue;
          if (segmentSegmentHit(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]))
            return false;
        }
      }
    }
    return true;
  };
  const keepsGateRiverGap = (id: Id, point: Point): boolean => {
    const holds = gateRiverGap.get(id);
    if (!holds) return true;
    for (const hold of holds)
      if (Math.hypot(point[0] - hold.anchor[0], point[1] - hold.anchor[1]) < hold.minDist - 1e-3) return false;
    return true;
  };
  const entersCemetery = (vertexId: Id): boolean => {
    for (const n of adjacent.get(vertexId) ?? []) {
      const e = edgeIndex.between(vertexId, n);
      if (!e || !roads.has(e.id) || cemeteryEdges.has(e.id)) continue;
      const a = mesh.vertices[vertexId].point;
      const b = mesh.vertices[n].point;
      for (const face of cemeteryFaces) {
        const poly = facePoints(mesh, face);
        if (segmentInteriorInPolygon(a, b, poly)) return true;
      }
    }
    return false;
  };

  // Several small sweeps let neighbouring vertices move together; a difficult
  // local corner must not reduce the smoothing strength of the entire town.
  for (let pass = 0; pass < 10; pass++) {
    for (const [id, target] of desired) {
      if (pinned.has(id)) continue;
      const v = mesh.vertices[id];
      const p = v.point;
      if (Math.hypot(target[0] - p[0], target[1] - p[1]) < 0.01) continue;
      // This is a displacement constraint, not a generation rejection: an
      // already acute cell may improve gradually, but must not become sharper.
      const cornerFloors = new Map(
        (facesAt.get(id) ?? []).map(fid => [
          fid,
          Math.min(Math.PI / 12, minimumCorner(faceRings.get(fid)!.map(vertex => mesh.vertices[vertex].point)))
        ])
      );
      for (let strength = 0.5; strength >= 1 / 128; strength /= 2) {
        v.point = [p[0] + (target[0] - p[0]) * strength, p[1] + (target[1] - p[1]) * strength];
        const candidate = v.point;
        const pairs = clearanceAtVertex.get(id) ?? [];
        // A large first step can jump across a narrow road. Check the path as
        // well as its endpoint so a wall or river cannot pass through it in one sweep.
        let clearsObstacles = true;
        for (const fraction of [0.25, 0.5, 0.75, 1]) {
          v.point = [p[0] + (candidate[0] - p[0]) * fraction, p[1] + (candidate[1] - p[1]) * fraction];
          if (pairs.some(pair => clearanceAt(pair.road, pair.obstacle) < pair.minimum - 1e-3)) {
            clearsObstacles = false;
            break;
          }
        }
        v.point = candidate;
        if (validAt(id, cornerFloors) && keepsGateRiverGap(id, candidate) && clearsObstacles && !entersCemetery(id))
          break;
        v.point = p;
      }
    }
  }
  // Smoothing rounds the curtain and leaves short street stubs oblique to it.
  // Slide the gate along the wall before sites are taken from the faces.
  const aligned = phase === "boundaries" ? next : straightenGateCrossings(next);
  const alignedMesh = aligned.mesh;
  for (const face of Object.values(alignedMesh.faces)) {
    if (!face.properties.locked) face.site = polygonCentroid(facePoints(alignedMesh, face));
  }
  for (const element of aligned.elements) {
    if (!element.id.startsWith("gc:") || element.locked || !element.faceIds.length) continue;
    if (element.kind === "temple") continue;
    const face = alignedMesh.faces[element.faceIds[0]];
    if (face) element.point = polygonCentroid(facePoints(alignedMesh, face));
  }
  const finished = phase === "boundaries" ? aligned : straightenBridges(aligned);
  syncDocumentCemeteries(finished);
  refreshCemeteryLayouts(finished);
  return finished;
}
