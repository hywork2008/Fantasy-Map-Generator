import { edgeBetween, faceVertices, splitFace } from "../mesh";
import type { CityDocument, Id } from "../types";

/**
 * When the outermost boundary of the urban core overlaps with river edges,
 * city walls would duplicate river edges and cause topology / crossing failures.
 *
 * This function resolves such overlaps by subdividing the opposite-bank cells
 * along a chord (e.g. connecting the run endpoints or an adjacent non-river core vertex)
 * and adding the river-side wedge to the urban core.
 *
 * This turns river boundary edges into internal core edges and pushes the core
 * boundary slightly outward onto land, without causing cascading domino adoption
 * of whole cells along the river.
 */
export function resolveRiverBoundaryOverlaps(document: CityDocument): CityDocument {
  let current = document;
  const MAX_PASSES = 12;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const coreFaces = Object.values(current.mesh.faces).filter(f => f.properties.settlement === "core");
    if (coreFaces.length === 0) break;

    // 1. Find all edges that belong to the outer boundary of the core
    const edgeUsage = new Map<Id, number>();
    for (const f of coreFaces) {
      for (const b of f.boundary) {
        edgeUsage.set(b.edgeId, (edgeUsage.get(b.edgeId) ?? 0) + 1);
      }
    }
    const boundaryEdgeIds = new Set([...edgeUsage.entries()].filter(([_, count]) => count === 1).map(([eid]) => eid));

    const riverFgs = Object.values(current.featureGroups ?? {}).filter(fg => fg.kind === "river");
    if (riverFgs.length === 0) break;

    const allRiverVerts = new Set<Id>();
    for (const fg of riverFgs) {
      for (const v of fg.vertices) allRiverVerts.add(v);
    }

    // 2. Identify river edges that are currently on the core boundary
    const riverEdgesInBoundary: { eid: Id; a: Id; b: Id }[] = [];
    for (const fg of riverFgs) {
      const verts = fg.vertices;
      for (let i = 0; i < verts.length - 1; i++) {
        const vA = verts[i];
        const vB = verts[i + 1];
        const edge = Object.values(current.mesh.edges).find(
          e => (e.a === vA && e.b === vB) || (e.a === vB && e.b === vA)
        );
        if (edge && boundaryEdgeIds.has(edge.id)) {
          riverEdgesInBoundary.push({ eid: edge.id, a: vA, b: vB });
        }
      }
    }

    if (riverEdgesInBoundary.length === 0) break;

    const coreVerts = new Set<Id>();
    for (const f of coreFaces) {
      for (const v of faceVertices(current.mesh, f)) coreVerts.add(v);
    }

    let splitDone = false;
    for (const { eid } of riverEdgesInBoundary) {
      const edge = current.mesh.edges[eid];
      if (!edge) continue;
      const leftFace = edge.leftFace ? current.mesh.faces[edge.leftFace] : null;
      const rightFace = edge.rightFace ? current.mesh.faces[edge.rightFace] : null;
      const oppFace =
        leftFace?.properties.settlement !== "core"
          ? leftFace
          : rightFace?.properties.settlement !== "core"
            ? rightFace
            : null;
      if (!oppFace || oppFace.properties.locked || oppFace.properties.water === "sea") continue;

      const fVerts = faceVertices(current.mesh, oppFace);
      const N = fVerts.length;
      if (N < 4) continue; // Triangles cannot be split

      const riverEdgeSet = new Set(riverEdgesInBoundary.map(r => r.eid));
      const oppRiverBoundaryIndices: number[] = [];
      for (let i = 0; i < N; i++) {
        const v1 = fVerts[i];
        const v2 = fVerts[(i + 1) % N];
        const e = Object.values(current.mesh.edges).find(
          ed => (ed.a === v1 && ed.b === v2) || (ed.a === v2 && ed.b === v1)
        );
        if (e && riverEdgeSet.has(e.id)) {
          oppRiverBoundaryIndices.push(i);
        }
      }

      if (oppRiverBoundaryIndices.length === 0) continue;

      // Group contiguous indices of river edges on this face
      let startIdx = 0;
      for (let i = 0; i < N; i++) {
        if (!oppRiverBoundaryIndices.includes(i)) {
          startIdx = i;
          break;
        }
      }

      let longestRun: number[] = [];
      let currentRun: number[] = [];
      for (let step = 0; step < N; step++) {
        const idx = (startIdx + step) % N;
        if (oppRiverBoundaryIndices.includes(idx)) {
          currentRun.push(idx);
        } else {
          if (currentRun.length > longestRun.length) longestRun = currentRun;
          currentRun = [];
        }
      }
      if (currentRun.length > longestRun.length) longestRun = currentRun;

      if (longestRun.length === 0) continue;

      const firstEdgeIdx = longestRun[0];
      const lastEdgeIdx = longestRun[longestRun.length - 1];

      let startVertIdx = firstEdgeIdx;
      let endVertIdx = (lastEdgeIdx + 1) % N;

      const isRiverCrossingEndpoint = (vid: Id): boolean => {
        for (const fg of riverFgs) {
          const idx = fg.vertices.indexOf(vid);
          if (idx !== -1) {
            const neighbors = [
              idx > 0 ? fg.vertices[idx - 1] : null,
              idx < fg.vertices.length - 1 ? fg.vertices[idx + 1] : null
            ].filter((v): v is Id => v !== null);
            if (neighbors.length < 2) continue;
            let hasExternal = false;
            let hasInternal = false;
            for (const n of neighbors) {
              const e = edgeBetween(current.mesh, vid, n);
              if (e) {
                const lf = e.leftFace ? current.mesh.faces[e.leftFace] : null;
                const rf = e.rightFace ? current.mesh.faces[e.rightFace] : null;
                if (lf?.properties.settlement !== "core" && rf?.properties.settlement !== "core") {
                  hasExternal = true;
                } else {
                  hasInternal = true;
                }
              }
            }
            if (hasExternal && hasInternal) return true;
          }
        }
        return false;
      };

      // Helper to check if an edge on oppFace is adjacent to a core cell
      const isEdgeCoreAdjacent = (edgeIdx: number) => {
        const v1 = fVerts[edgeIdx];
        const v2 = fVerts[(edgeIdx + 1) % N];
        const edge = Object.values(current.mesh.edges).find(
          ed => (ed.a === v1 && ed.b === v2) || (ed.a === v2 && ed.b === v1)
        );
        if (!edge) return false;
        const otherFid = edge.leftFace === oppFace.id ? edge.rightFace : edge.leftFace;
        return !!otherFid && current.mesh.faces[otherFid]?.properties.settlement === "core";
      };

      // If the edge preceding firstEdge is adjacent to a core cell,
      // expand startVert backward to encompass it, so the wall does not touch
      // the river at fVerts[firstEdgeIdx].
      const prevEdgeIdx = (firstEdgeIdx - 1 + N) % N;
      if (isEdgeCoreAdjacent(prevEdgeIdx)) {
        startVertIdx = prevEdgeIdx;
      }

      // If the edge following lastEdge is adjacent to a core cell,
      // expand endVert forward to encompass it.
      const nextEdgeIdx = (lastEdgeIdx + 1) % N;
      if (isEdgeCoreAdjacent(nextEdgeIdx)) {
        endVertIdx = (lastEdgeIdx + 2) % N;
      }

      // A vertex on the river cannot be a chord endpoint unless it is a valid
      // entrance/exit of the river into the core (where wall and river cross).
      // If startVert is on the river but NOT a crossing endpoint, walk backward to land.
      while (allRiverVerts.has(fVerts[startVertIdx]) && !isRiverCrossingEndpoint(fVerts[startVertIdx])) {
        const prevIdx = (startVertIdx - 1 + N) % N;
        if (prevIdx === endVertIdx) break;
        startVertIdx = prevIdx;
      }

      // If endVert is on the river but NOT a crossing endpoint, walk forward to land.
      while (allRiverVerts.has(fVerts[endVertIdx]) && !isRiverCrossingEndpoint(fVerts[endVertIdx])) {
        const nextIdx = (endVertIdx + 1) % N;
        if (nextIdx === startVertIdx) break;
        endVertIdx = nextIdx;
      }

      // If neither side was expanded and chord is degenerate (e.g. single river edge):
      if (startVertIdx === firstEdgeIdx && endVertIdx === (lastEdgeIdx + 1) % N && longestRun.length < 2) {
        if (isEdgeCoreAdjacent(nextEdgeIdx) && !allRiverVerts.has(fVerts[(lastEdgeIdx + 2) % N])) {
          endVertIdx = (lastEdgeIdx + 2) % N;
        } else if (isEdgeCoreAdjacent(prevEdgeIdx) && !allRiverVerts.has(fVerts[prevEdgeIdx])) {
          startVertIdx = prevEdgeIdx;
        } else if (!allRiverVerts.has(fVerts[(lastEdgeIdx + 2) % N])) {
          endVertIdx = (lastEdgeIdx + 2) % N;
        } else if (!allRiverVerts.has(fVerts[prevEdgeIdx])) {
          startVertIdx = prevEdgeIdx;
        }
      }

      const splitVA: Id | null = fVerts[startVertIdx];
      const splitVB: Id | null = fVerts[endVertIdx];

      if (!splitVA || !splitVB || splitVA === splitVB || edgeBetween(current.mesh, splitVA, splitVB)) {
        continue;
      }

      const initialFaceIds = new Set(Object.keys(current.mesh.faces));
      const nextDoc = splitFace(current, oppFace.id, splitVA, splitVB);
      if (nextDoc) {
        const newFaceId = Object.keys(nextDoc.mesh.faces).find(id => !initialFaceIds.has(id))!;
        const fA = nextDoc.mesh.faces[oppFace.id];
        const fB = nextDoc.mesh.faces[newFaceId];

        // The face containing the river vertices is the wedge to mark as core
        const runVerts = new Set<Id>();
        for (const idx of longestRun) {
          runVerts.add(fVerts[idx]);
          runVerts.add(fVerts[(idx + 1) % N]);
        }
        const wedge =
          [fA, fB].find(f => {
            const fv = faceVertices(nextDoc.mesh, f);
            return [...runVerts].every(rv => fv.includes(rv));
          }) ?? fB;

        wedge.properties.settlement = "core";
        wedge.properties.buildable = true;

        current = nextDoc;
        splitDone = true;
        break; // Advance to next pass
      }
    }

    if (!splitDone) break;
  }

  return current;
}
