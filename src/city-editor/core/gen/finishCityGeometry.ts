// MIT implementation based on City Editor's shared mesh and reference output.
// No TownGeneratorTS / GPL source is used.
import { featureGroupVertices } from "../features";
import { clone, facePoints, faceVertices, indexMeshEdges } from "../mesh";
import { straightenBridges } from "../passages";
import type { CityDocument, Id, Point } from "../types";
import { polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";

/** Smooth the actual shared vertices, so walls, streets, water and building
 * setbacks keep meeting at exactly the same coordinates after editing/export.
 * Neighbouring blocks absorb the displacement; local line searches prevent
 * collapsed edges, inverted faces and self-intersections. */
export function finishCityGeometry(source: CityDocument): CityDocument {
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
  const rivers = new Set<Id>();
  for (const group of next.featureGroups) {
    const ids = featureGroupVertices(next, group);
    if (group.locked || !group.id.startsWith("gc:")) {
      for (const id of ids) pinned.add(id);
      continue;
    }
    const edges =
      group.kind === "wall" ? walls : group.kind === "road" ? roads : group.kind === "river" ? rivers : null;
    if (!edges) continue;
    for (let i = 1; i < ids.length; i++) {
      const edge = edgeIndex.between(ids[i - 1], ids[i]);
      if (edge) edges.add(edge.id);
    }
  }
  for (const gate of next.gates) if (gate.locked || !gate.id.startsWith("gc:")) pinned.add(gate.vertexId);
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
  smoothNetwork(water, coarse ? 3 : 12);
  smoothNetwork(rivers, coarse ? 3 : 12);
  smoothNetwork(walls, coarse ? 4 : 32);
  smoothNetwork(roads, coarse ? 6 : 48);

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

  const validAt = (id: Id): boolean => {
    const p = mesh.vertices[id].point;
    for (const n of adjacent.get(id) ?? []) {
      const q = mesh.vertices[n].point;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.01) return false;
    }
    for (const fid of facesAt.get(id) ?? []) {
      const points = faceRings.get(fid)!.map(v => mesh.vertices[v].point);
      const before = areas.get(fid)!;
      if (polygonArea(points) / before < (coarse ? 0.5 : 0.12)) return false;
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
  // Several small sweeps let neighbouring vertices move together; a difficult
  // local corner must not reduce the smoothing strength of the entire town.
  for (let pass = 0; pass < 10; pass++) {
    for (const [id, target] of desired) {
      if (pinned.has(id)) continue;
      const v = mesh.vertices[id];
      const p = v.point;
      if (Math.hypot(target[0] - p[0], target[1] - p[1]) < 0.01) continue;
      for (let strength = 0.5; strength >= 1 / 128; strength /= 2) {
        v.point = [p[0] + (target[0] - p[0]) * strength, p[1] + (target[1] - p[1]) * strength];
        if (validAt(id)) break;
        v.point = p;
      }
    }
  }
  for (const face of Object.values(mesh.faces)) {
    if (!face.properties.locked) face.site = polygonCentroid(facePoints(mesh, face));
  }
  for (const element of next.elements) {
    if (!element.id.startsWith("gc:") || element.locked || !element.faceIds.length) continue;
    const face = mesh.faces[element.faceIds[0]];
    if (face) element.point = polygonCentroid(facePoints(mesh, face));
  }
  return straightenBridges(next);
}
