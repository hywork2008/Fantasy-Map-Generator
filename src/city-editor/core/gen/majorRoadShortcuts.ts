import { featureGroupVertices } from "../features";
import { edgeBetween, facePoints, faceVertices, splitFace } from "../mesh";
import { validGeneratedCrossings } from "../passages";
import type { CityDocument, Id } from "../types";
import { pointInPolygon, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";

/** Add only useful major-road diagonals; local infill roads never use this path.
 * A shortcut keeps all shared junctions and protected feature geometry intact. */
export function shortcutMajorRoads(source: CityDocument): CityDocument {
  let next = source;
  const roads = source.featureGroups.filter(g => g.kind === "road" && g.id.startsWith("gc:road-")).map(g => g.id);
  for (const roadId of roads) {
    for (let pass = 0; pass < 4; pass++) {
      const road = next.featureGroups.find(g => g.id === roadId);
      if (road?.kind !== "road" || road.locked) break;
      const vertices = featureGroupVertices(next, road);
      const gateVertices = new Set(next.gates.map(g => g.vertexId));
      if (vertices.length >= 3 && gateVertices.has(vertices[0]) && gateVertices.has(vertices[vertices.length - 1])) {
        const chord = Math.hypot(
          next.mesh.vertices[vertices[0]].point[0] - next.mesh.vertices[vertices[vertices.length - 1]].point[0],
          next.mesh.vertices[vertices[0]].point[1] - next.mesh.vertices[vertices[vertices.length - 1]].point[1]
        );
        const pathLength = vertices.slice(1).reduce((sum, id, i) => {
          const p = next.mesh.vertices[vertices[i]].point;
          const q = next.mesh.vertices[id].point;
          return sum + Math.hypot(p[0] - q[0], p[1] - q[1]);
        }, 0);
        // Wall-hugging ring arcs are longer than the chord; cutting diagonals
        // onto the curtain wall / river is not a useful major-road shortcut.
        if (chord > 4 && pathLength > chord * 1.25) break;
      }
      const protectedVertices = new Set<Id>(next.gates.map(g => g.vertexId));
      for (const group of next.featureGroups) {
        if (group.id !== roadId) for (const id of featureGroupVertices(next, group)) protectedVertices.add(id);
      }
      for (const edge of Object.values(next.mesh.edges))
        if (edge.locked) {
          protectedVertices.add(edge.a);
          protectedVertices.add(edge.b);
        }
      let changed = false;
      outer: for (let i = 0; i < vertices.length - 2; i++) {
        if (next.mesh.vertices[vertices[i]].locked || protectedVertices.has(vertices[i])) continue;
        for (let j = Math.min(vertices.length - 1, i + 6); j >= i + 2; j--) {
          if (vertices.slice(i + 1, j + 1).some(id => protectedVertices.has(id) || next.mesh.vertices[id].locked))
            continue;
          const a = next.mesh.vertices[vertices[i]].point,
            b = next.mesh.vertices[vertices[j]].point;
          const chord = Math.hypot(a[0] - b[0], a[1] - b[1]);
          const pathLength = vertices.slice(i + 1, j + 1).reduce((sum, id, k) => {
            const p = next.mesh.vertices[vertices[i + k]].point,
              q = next.mesh.vertices[id].point;
            return sum + Math.hypot(p[0] - q[0], p[1] - q[1]);
          }, 0);
          if (chord < 4 || pathLength < chord * 1.2 || edgeBetween(next.mesh, vertices[i], vertices[j])) continue;
          const face = Object.values(next.mesh.faces).find(f => {
            if (
              f.properties.water !== "land" ||
              f.properties.locked ||
              next.elements.some(e => e.faceIds.includes(f.id))
            )
              return false;
            const ids = faceVertices(next.mesh, f);
            if (!ids.includes(vertices[i]) || !ids.includes(vertices[j])) return false;
            const points = facePoints(next.mesh, f);
            if (!pointInPolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], points)) return false;
            return points.every((p, k) => {
              if (
                [vertices[i], vertices[j]].includes(ids[k]) ||
                [vertices[i], vertices[j]].includes(ids[(k + 1) % ids.length])
              )
                return true;
              return !segmentSegmentHit(a, b, p, points[(k + 1) % points.length]);
            });
          });
          if (!face) continue;
          const split = splitFace(next, face.id, vertices[i], vertices[j]);
          if (!split) continue;
          const added = Object.values(split.mesh.faces).filter(f => f.id === face.id || !next.mesh.faces[f.id]);
          if (added.some(f => Math.abs(polygonArea(facePoints(split.mesh, f))) < 80)) continue;
          const edge = edgeBetween(split.mesh, vertices[i], vertices[j])!;
          const updated = split.featureGroups.find(g => g.id === roadId)!;
          if (updated.kind !== "road") continue;
          updated.segments = [
            ...road.segments.slice(0, i),
            { edgeId: edge.id, forward: edge.a === vertices[i] },
            ...road.segments.slice(j)
          ];
          for (const f of added) f.site = polygonCentroid(facePoints(split.mesh, f));
          if (!validGeneratedCrossings(split)) continue;
          next = split;
          changed = true;
          break outer;
        }
      }
      if (!changed) break;
    }
  }
  return next;
}
