import { facePoints } from "../core/mesh";
import type { Id } from "../core/types";
import type { DocumentsState } from "../state/editorSession";
import { vertexPairKey } from "./editorGeometry";
export interface SpatialIndexContext {
  edgeIdsByVertex: Map<string, string[]>;
  documents: DocumentsState;
  routeEdgesByGroup: Map<string, string[]>;
  routeGroupsByEdge: Map<string, string[]>;
  faceBucketSize: number;
  faceBuckets: Map<string, string[]>;
  vertexBuckets: Map<string, string[]>;
}
export function createSpatialIndexController(ctx: SpatialIndexContext) {
  function rebuildEditorIndexes(): void {
    const edgeByVertices = new Map<string, Id>();
    ctx.edgeIdsByVertex = new Map();
    for (const edge of Object.values(ctx.documents.documentState.mesh.edges)) {
      edgeByVertices.set(vertexPairKey(edge.a, edge.b), edge.id);
      ctx.edgeIdsByVertex.set(edge.a, [...(ctx.edgeIdsByVertex.get(edge.a) ?? []), edge.id]);
      ctx.edgeIdsByVertex.set(edge.b, [...(ctx.edgeIdsByVertex.get(edge.b) ?? []), edge.id]);
    }

    ctx.routeEdgesByGroup = new Map();
    ctx.routeGroupsByEdge = new Map();
    for (const group of ctx.documents.documentState.featureGroups) {
      const edgeIds =
        group.kind === "river"
          ? group.vertices.slice(1).flatMap((vertexId, index) => {
              const edgeId = edgeByVertices.get(vertexPairKey(group.vertices[index], vertexId));
              return edgeId ? [edgeId] : [];
            })
          : group.segments.map(segment => segment.edgeId);
      ctx.routeEdgesByGroup.set(group.id, edgeIds);
      for (const edgeId of edgeIds)
        ctx.routeGroupsByEdge.set(edgeId, [...(ctx.routeGroupsByEdge.get(edgeId) ?? []), group.id]);
    }

    ctx.faceBucketSize = Math.max(
      ctx.documents.documentState.frame.blockSizeMeters * 2,
      ctx.documents.documentState.frame.extentMeters / 32
    );
    ctx.faceBuckets = new Map();
    for (const face of Object.values(ctx.documents.documentState.mesh.faces)) {
      if (face.boundary.some(ref => !ctx.documents.documentState.mesh.edges[ref.edgeId])) continue;
      const points = facePoints(ctx.documents.documentState.mesh, face);
      if (!points.length || points.some(p => !p.every(Number.isFinite))) continue;
      const minX = Math.min(...points.map(point => point[0]));
      const maxX = Math.max(...points.map(point => point[0]));
      const minY = Math.min(...points.map(point => point[1]));
      const maxY = Math.max(...points.map(point => point[1]));
      for (let x = Math.floor(minX / ctx.faceBucketSize); x <= Math.floor(maxX / ctx.faceBucketSize); x++) {
        for (let y = Math.floor(minY / ctx.faceBucketSize); y <= Math.floor(maxY / ctx.faceBucketSize); y++) {
          const key = `${x},${y}`;
          ctx.faceBuckets.set(key, [...(ctx.faceBuckets.get(key) ?? []), face.id]);
        }
      }
    }

    // Same grid, keyed by vertex position, so closestVertexId() can scan a
    // handful of nearby buckets instead of every vertex on each hover move.
    ctx.vertexBuckets = new Map();
    for (const vertex of Object.values(ctx.documents.documentState.mesh.vertices)) {
      const key = `${Math.floor(vertex.point[0] / ctx.faceBucketSize)},${Math.floor(vertex.point[1] / ctx.faceBucketSize)}`;
      ctx.vertexBuckets.set(key, [...(ctx.vertexBuckets.get(key) ?? []), vertex.id]);
    }
  }
  return { rebuildEditorIndexes };
}
