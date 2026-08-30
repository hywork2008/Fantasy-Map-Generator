import { describe, expect, it } from "vitest";
import { createDocument, createSizedDocument } from "./document";
import { appendEdge, createGroup } from "./features";
import { faceNeighbors, faceVertices, mergeFaces, mergeVertices, splitFace, validate } from "./mesh";

describe("manual city mesh", () => {
  it("keeps the Small preset near its 24 × 24 macro-block target", () => {
    const document = createSizedDocument("small", "small");
    const count = Object.keys(document.mesh.faces).length;
    expect(count).toBeGreaterThanOrEqual(550);
    expect(count).toBeLessThanOrEqual(600);
    expect(validate(document)).toEqual([]);
  });

  it("splits a cell and merges the two parts back", () => {
    const document = createDocument("mesh-split", 900, 110);
    const face = Object.values(document.mesh.faces).find(candidate => candidate.boundary.length >= 4);
    expect(face).toBeDefined();
    if (!face) return;
    const vertices = faceVertices(document.mesh, face);
    const split = splitFace(document, face.id, vertices[0], vertices[2]);
    expect(split).not.toBeNull();
    if (!split) return;
    expect(Object.keys(split.mesh.faces)).toHaveLength(Object.keys(document.mesh.faces).length + 1);

    const createdId = Object.keys(split.mesh.faces).find(id => !document.mesh.faces[id]);
    expect(createdId).toBeDefined();
    if (!createdId) return;
    const merged = mergeFaces(split, face.id, createdId);
    expect(merged).not.toBeNull();
    expect(Object.keys(merged?.mesh.faces ?? {})).toHaveLength(Object.keys(document.mesh.faces).length);
  });

  it("merges a previously merged cell with a neighbor sharing multiple edges", () => {
    const document = createDocument("mesh-consecutive-merge", 900, 110);
    let firstMerge: ReturnType<typeof mergeFaces> = null;
    let keepFaceId = "";
    let nextNeighborId = "";

    for (const face of Object.values(document.mesh.faces)) {
      for (const neighborId of faceNeighbors(document.mesh, face.id)) {
        const merged = mergeFaces(document, face.id, neighborId);
        if (!merged) continue;
        const keep = merged.mesh.faces[face.id];
        const nextNeighbor = faceNeighbors(merged.mesh, face.id).find(candidateId => {
          const candidate = merged.mesh.faces[candidateId];
          return keep.boundary.filter(ref => candidate.boundary.some(other => other.edgeId === ref.edgeId)).length > 1;
        });
        if (!nextNeighbor) continue;
        firstMerge = merged;
        keepFaceId = face.id;
        nextNeighborId = nextNeighbor;
        break;
      }
      if (firstMerge) break;
    }

    expect(firstMerge).not.toBeNull();
    if (!firstMerge) return;
    const mergedAgain = mergeFaces(firstMerge, keepFaceId, nextNeighborId);
    expect(mergedAgain).not.toBeNull();
    expect(validate(mergedAgain!)).toEqual([]);
    const connectedVertices = new Set(Object.values(mergedAgain!.mesh.edges).flatMap(edge => [edge.a, edge.b]));
    expect(Object.keys(mergedAgain!.mesh.vertices).sort()).toEqual([...connectedVertices].sort());
  });

  it("merges adjacent vertices while keeping the mesh connected", () => {
    const document = createDocument("mesh-vertex-merge", 900, 110);
    const edge = Object.values(document.mesh.edges).find(candidate =>
      mergeVertices(document, candidate.a, candidate.b)
    );
    expect(edge).toBeDefined();
    if (!edge) return;

    const merged = mergeVertices(document, edge.a, edge.b);
    expect(merged).not.toBeNull();
    if (!merged) return;
    expect(merged.mesh.vertices[edge.b]).toBeUndefined();
    expect(Object.values(merged.mesh.edges).every(candidate => candidate.a !== edge.b && candidate.b !== edge.b)).toBe(
      true
    );
    expect(validate(merged)).toEqual([]);
  });

  it("merges vertices across an unlocked route edge and removes that route segment", () => {
    const document = createDocument("mesh-route-vertex-merge", 900, 110);
    const edge = Object.values(document.mesh.edges).find(candidate =>
      mergeVertices(document, candidate.a, candidate.b)
    );
    expect(edge).toBeDefined();
    if (!edge) return;

    const grouped = createGroup(document, "wall");
    const groupId = grouped.featureGroups.at(-1)?.id;
    expect(groupId).toBeDefined();
    if (!groupId) return;
    const withWall = appendEdge(grouped, groupId, edge.id);
    expect(withWall).not.toBeNull();
    if (!withWall) return;

    const merged = mergeVertices(withWall, edge.a, edge.b);

    expect(merged).not.toBeNull();
    if (!merged) return;
    expect(merged.featureGroups.find(group => group.id === groupId)).toBeUndefined();
    expect(validate(merged)).toEqual([]);
  });
});
