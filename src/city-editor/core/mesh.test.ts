import { describe, expect, it } from "vitest";
import { createDocument, createGridDocument, createSizedDocument } from "./document";
import { appendEdge, createGroup } from "./features";
import { isSimplePolygon, polygonArea } from "./gen/geom";
import {
  clone,
  faceNeighbors,
  facePoints,
  faceVertices,
  incidentFaces,
  insertEdgeVertex,
  mergeFaces,
  mergeVertices,
  moveVertex,
  optimizeJunctions,
  scaleDocument,
  setFaceDepth,
  setFaceWater,
  splitFace,
  validate
} from "./mesh";
import type { CityDocument } from "./types";

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

  it("shares surveyed rivers across clones and keeps the mesh independent", () => {
    const document = createDocument("mesh-clone-share", 900, 110);
    const rivers = [
      {
        id: 1,
        rings: [
          [
            [0, 0],
            [10, 0],
            [10, 4]
          ]
        ]
      }
    ];
    document.importedFixedCrossings = {
      schemaVersion: 4,
      revision: 1,
      originMeters: [0, 0],
      roadWidthMeters: 4,
      requiredBounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      rivers
    } as CityDocument["importedFixedCrossings"];
    const copy = clone(document);
    expect(copy.importedFixedCrossings).toBe(document.importedFixedCrossings);
    expect(copy.mesh).not.toBe(document.mesh);
    expect(copy.mesh.vertices).not.toBe(document.mesh.vertices);
    const face = Object.values(copy.mesh.faces).find(candidate => candidate.boundary.length >= 4)!;
    const vertices = faceVertices(copy.mesh, face);
    const split = splitFace(copy, face.id, vertices[0], vertices[2]);
    expect(split?.importedFixedCrossings).toBe(rivers && document.importedFixedCrossings);
    expect(Object.keys(document.mesh.faces)).not.toContain(
      Object.keys(split!.mesh.faces).find(id => !copy.mesh.faces[id])
    );
    copy.importedFixedCrossings = undefined;
    expect(document.importedFixedCrossings?.rivers).toBe(rivers);
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

  it("scales the separate town window together with the display and mesh", () => {
    const document = createDocument("mesh-town-scale", 3000, 110);
    document.frame.settlementExtentMeters = 300;
    const scaled = scaleDocument(document, 2)!;
    expect(scaled.frame.extentMeters).toBe(6000);
    expect(scaled.frame.settlementExtentMeters).toBe(600);
    expect(scaled.frame.cityRadiusMeters).toBe(document.frame.cityRadiusMeters * 2);
    expect(scaled.frame.blockSizeMeters).toBe(document.frame.blockSizeMeters * 2);
    expect(document.frame.settlementExtentMeters).toBe(300);
    expect(scaleDocument(scaled, 0.5)!.frame).toEqual(document.frame);
    delete document.frame.settlementExtentMeters;
    expect(scaleDocument(document, 2)!.frame.settlementExtentMeters).toBeUndefined();
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

describe("water depth", () => {
  it("edits depth independently of sea-level elevation and preserves it on save/load", async () => {
    const { parseDocument } = await import("./document");
    const base = createDocument("depth", 200);
    const id = Object.keys(base.mesh.faces)[0];
    const sea = setFaceWater(base, id, "sea");
    expect(sea.mesh.faces[id].properties.depth).toBe(3);
    const deep = setFaceDepth(sea, id, 6);
    expect(deep.mesh.faces[id].properties.elevation).toBe(0);
    expect(parseDocument(JSON.stringify(deep))?.mesh.faces[id].properties.depth).toBe(6);
    expect(setFaceDepth(deep, id, -1)).toBe(deep);
    expect(setFaceDepth(deep, id, NaN)).toBe(deep);
    const locked = structuredClone(deep);
    locked.mesh.faces[id].properties.locked = true;
    expect(setFaceDepth(locked, id, 9)).toBe(locked);
    expect(setFaceWater(deep, id, "land").mesh.faces[id].properties.depth).toBeUndefined();
    delete sea.mesh.faces[id].properties.depth;
    expect(parseDocument(JSON.stringify(sea))?.mesh.faces[id].properties.depth).toBe(3);
  });
});

it("allows debug vertex movement with existing errors, without introducing new errors", () => {
  const source = createSizedDocument("micro", "debug-existing-errors");
  const face = Object.values(source.mesh.faces)[0];
  face.properties.depth = -1;
  const edge = Object.values(source.mesh.edges)[0];
  const vertex = source.mesh.vertices[edge.a];
  const before = structuredClone(source);
  const target: [number, number] = [vertex.point[0] + 0.1, vertex.point[1] + 0.1];
  expect(moveVertex(source, vertex.id, target)).toBeNull();
  const moved = moveVertex(source, vertex.id, target, true);
  expect(moved).not.toBeNull();
  expect(validate(moved!)).toEqual(validate(source));
  const neighbor = source.mesh.vertices[edge.b].point;
  expect(moveVertex(source, vertex.id, [neighbor[0] + 0.1, neighbor[1] + 0.1], true)).toBeNull();
  expect(source).toEqual(before);
});

describe("planar vertex edits (design.md §5)", () => {
  it.each(["voronoi", "hex", "evolution"] as const)(
    "never commits a self-intersecting or inverted cell when dragging a %s vertex",
    grid => {
      const document = createGridDocument({ size: "tiny", seed: "planar-drag", grid });
      const vertices = Object.values(document.mesh.vertices)
        .sort((a, b) => Math.hypot(...a.point) - Math.hypot(...b.point))
        .slice(0, 12);
      let accepted = 0;
      for (const vertex of vertices)
        for (const distance of [10, 30, 60])
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
            [0.7, 0.7],
            [-0.7, -0.7]
          ]) {
            const target: [number, number] = [vertex.point[0] + dx * distance, vertex.point[1] + dy * distance];
            const moved = moveVertex(document, vertex.id, target);
            if (!moved) continue;
            accepted++;
            for (const face of incidentFaces(moved.mesh, vertex.id)) {
              const points = facePoints(moved.mesh, face);
              expect(isSimplePolygon(points)).toBe(true);
              expect(Math.sign(polygonArea(points))).toBe(
                Math.sign(polygonArea(facePoints(document.mesh, document.mesh.faces[face.id])))
              );
            }
          }
      // Small nudges must stay editable.
      expect(accepted).toBeGreaterThan(0);
    }
  );

  it("rejects a vertex jumping into a cell it does not belong to", () => {
    const document = createGridDocument({ size: "tiny", seed: "planar-jump", grid: "voronoi" });
    const vertex = Object.values(document.mesh.vertices).sort(
      (a, b) => Math.hypot(...a.point) - Math.hypot(...b.point)
    )[0];
    const own = new Set(incidentFaces(document.mesh, vertex.id).map(face => face.id));
    const far = Object.values(document.mesh.faces)
      .filter(face => !own.has(face.id))
      .map(face => facePoints(document.mesh, face))
      .sort((a, b) => Math.hypot(...centroid(a)) - Math.hypot(...centroid(b)))[2];
    expect(moveVertex(document, vertex.id, centroid(far))).toBeNull();
  });

  it("rejects a split along a diagonal that leaves a concave cell", () => {
    const document = createDocument("concave-split", 900, 110);
    const face = Object.values(document.mesh.faces).find(candidate => {
      const points = facePoints(document.mesh, candidate);
      return candidate.boundary.length >= 5 && points.every(p => Math.hypot(...p) < 250);
    })!;
    const ids = faceVertices(document.mesh, face);
    // Pull one corner inward past the opposite diagonal to make the cell concave.
    const [a, reflex, b] = [ids[0], ids[1], ids[2]];
    const pa = document.mesh.vertices[a].point;
    const pb = document.mesh.vertices[b].point;
    const inner = centroid(facePoints(document.mesh, face));
    const mid: [number, number] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    const concave = structuredClone(document);
    concave.mesh.vertices[reflex].point = [mid[0] + (inner[0] - mid[0]) * 0.4, mid[1] + (inner[1] - mid[1]) * 0.4];
    if (!isSimplePolygon(facePoints(concave.mesh, concave.mesh.faces[face.id]))) return;
    expect(splitFace(concave, face.id, a, b)).toBeNull();
  });
});

function centroid(points: [number, number][]): [number, number] {
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}
