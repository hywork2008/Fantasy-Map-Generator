import { describe, expect, it } from "vitest";
import { createDocument, createSizedDocument } from "./document";
import { appendEdge, createGroup } from "./features";
import {
  faceNeighbors,
  faceVertices,
  insertEdgeVertex,
  mergeFaces,
  mergeVertices,
  optimizeJunctions,
  scaleDocument,
  setFaceWater,
  splitFace,
  validate
} from "./mesh";

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

  it("cleans short junctions only inside the cleanup brush and centers the survivor", () => {
    const document = {
      format: "fmg-city-editor" as const,
      version: 1 as const,
      frame: { extentMeters: 100, cityRadiusMeters: 30, blockSizeMeters: 10 },
      mesh: {
        vertices: {
          a: { id: "a", point: [0, 0] as [number, number], locked: false },
          b: { id: "b", point: [5, 0] as [number, number], locked: false },
          c: { id: "c", point: [20, 0] as [number, number], locked: false },
          d: { id: "d", point: [0, 10] as [number, number], locked: false },
          e: { id: "e", point: [5, 10] as [number, number], locked: false },
          f: { id: "f", point: [20, 10] as [number, number], locked: false }
        },
        edges: {
          ab: { id: "ab", a: "a", b: "b", leftFace: "f0", rightFace: null, locked: false },
          be: { id: "be", a: "b", b: "e", leftFace: "f0", rightFace: "f1", locked: false },
          de: { id: "de", a: "d", b: "e", leftFace: null, rightFace: "f0", locked: false },
          ad: { id: "ad", a: "a", b: "d", leftFace: null, rightFace: "f0", locked: false },
          bc: { id: "bc", a: "b", b: "c", leftFace: "f1", rightFace: null, locked: false },
          cf: { id: "cf", a: "c", b: "f", leftFace: "f1", rightFace: null, locked: false },
          ef: { id: "ef", a: "e", b: "f", leftFace: "f1", rightFace: null, locked: false }
        },
        faces: {
          f0: {
            id: "f0",
            boundary: [
              { edgeId: "ab", forward: true },
              { edgeId: "be", forward: true },
              { edgeId: "de", forward: false },
              { edgeId: "ad", forward: false }
            ],
            properties: { elevation: 1, water: "land" as const, ward: null, buildable: true, locked: false }
          },
          f1: {
            id: "f1",
            boundary: [
              { edgeId: "bc", forward: true },
              { edgeId: "cf", forward: true },
              { edgeId: "ef", forward: false },
              { edgeId: "be", forward: false }
            ],
            properties: { elevation: 1, water: "land" as const, ward: null, buildable: true, locked: false }
          }
        }
      },
      featureGroups: [],
      gates: [],
      elements: []
    };

    expect(optimizeJunctions(document, [50, 50], 2, 8)).toBeNull();
    const cleaned = optimizeJunctions(document, [2.5, 0], 1, 8);
    expect(cleaned?.mesh.vertices.b).toBeUndefined();
    expect(cleaned?.mesh.vertices.a.point).toEqual([2.5, 0]);
    expect(validate(cleaned!)).toEqual([]);
  });

  it("returns the same document for a no-op edit so history can skip the snapshot", () => {
    const document = createDocument("mesh-noop", 900, 110);
    const landFaceId = Object.keys(document.mesh.faces)[0];

    expect(scaleDocument(document, 1)).toBe(document);
    expect(setFaceWater(document, landFaceId, "land")).toBe(document);

    const sea = setFaceWater(document, landFaceId, "sea");
    expect(sea).not.toBe(document);
    expect(setFaceWater(sea, landFaceId, "sea")).toBe(sea);
  });
});

describe("local edge insertion", () => {
  it("preserves both face directions and feature paths without changing face count", () => {
    const document = createDocument("edge-insert", 900, 110);
    const edge = Object.values(document.mesh.edges).find(e => e.leftFace && e.rightFace)!;
    document.featureGroups.push(
      {
        id: "road",
        kind: "road",
        name: "Road",
        locked: false,
        style: { widthMeters: 4, color: "black" },
        segments: [{ edgeId: edge.id, forward: false }]
      },
      {
        id: "river",
        kind: "river",
        name: "River",
        locked: false,
        style: { widthMeters: 8, color: "blue" },
        vertices: [edge.a, edge.b],
        source: null,
        mouth: null
      }
    );
    const before = JSON.stringify(document);
    const result = insertEdgeVertex(document, edge.id, 0.3)!;
    expect(result).not.toBeNull();
    expect(validate(result.document)).toEqual([]);
    expect(Object.keys(result.document.mesh.faces)).toHaveLength(Object.keys(document.mesh.faces).length);
    for (const id of [edge.leftFace!, edge.rightFace!])
      expect(faceVertices(result.document.mesh, result.document.mesh.faces[id])).toContain(result.vertexId);
    const [road, river] = result.document.featureGroups;
    expect(road.kind !== "river" && road.segments.map(ref => ref.forward)).toEqual([false, false]);
    expect(river.kind === "river" && river.vertices).toEqual([edge.a, result.vertexId, edge.b]);
    expect(JSON.stringify(document)).toBe(before);
    document.featureGroups[0].locked = true;
    expect(insertEdgeVertex(document, edge.id, 0.3)).toBeNull();
    document.featureGroups[0].locked = false;
    document.mesh.faces[edge.leftFace!].properties.locked = true;
    expect(insertEdgeVertex(document, edge.id, 0.3)).toBeNull();
  });
});
