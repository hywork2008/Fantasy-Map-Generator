import { describe, expect, it } from "vitest";
import { incidentEdges } from "./mesh";
import {
  addBridge,
  joinWallRiverCrossings,
  kindEdgeIds,
  openBarrierPassage,
  orderedIncidentEdges,
  straightenBridge,
  straightenBridges,
  vertexHasCrossing,
  vertexHasKindPassage
} from "./passages";
import type { CityDocument } from "./types";

describe("openBarrierPassage", () => {
  it("merges the nearest wall neighbour so a 3-way gate vertex becomes a 4-way passage", () => {
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
      mesh: {
        vertices: {
          g: { id: "g", point: [0, 0], locked: false },
          w1: { id: "w1", point: [-10, 0], locked: false },
          w2: { id: "w2", point: [10, 0], locked: false },
          w0: { id: "w0", point: [-20, 0], locked: false },
          p: { id: "p", point: [0, 10], locked: false },
          a: { id: "a", point: [-10, -10], locked: false }
        },
        edges: {
          wallA: { id: "wallA", a: "g", b: "w1", leftFace: null, rightFace: null, locked: false },
          wallB: { id: "wallB", a: "g", b: "w2", leftFace: null, rightFace: null, locked: false },
          wallPrev: { id: "wallPrev", a: "w0", b: "w1", leftFace: null, rightFace: null, locked: false },
          passage: { id: "passage", a: "g", b: "p", leftFace: null, rightFace: null, locked: false },
          exitA: { id: "exitA", a: "w1", b: "a", leftFace: null, rightFace: null, locked: false }
        },
        faces: {}
      },
      featureGroups: [
        {
          id: "wall-1",
          kind: "wall",
          name: "Wall #1",
          segments: [
            { edgeId: "wallPrev", forward: true },
            { edgeId: "wallA", forward: false },
            { edgeId: "wallB", forward: true }
          ],
          style: { widthMeters: 7, color: "#342a22" },
          locked: false
        }
      ],
      gates: [{ id: "gate-1", vertexId: "g", locked: false }],
      elements: []
    };

    expect(incidentEdges(document.mesh, "g")).toHaveLength(3);
    expect(vertexHasKindPassage(document, "g", "wall")).toBe(false);

    const next = openBarrierPassage(document, "g", "wall");
    expect(next).not.toBeNull();
    if (!next) return;
    expect(incidentEdges(next.mesh, "g").length).toBeGreaterThanOrEqual(4);
    expect(vertexHasKindPassage(next, "g", "wall")).toBe(true);
    expect(orderedIncidentEdges(next, "g")).toHaveLength(incidentEdges(next.mesh, "g").length);
    const sameSide = structuredClone(next);
    sameSide.mesh.vertices.a.point = [-10, 10];
    expect(incidentEdges(sameSide.mesh, "g")).toHaveLength(4);
    expect(vertexHasKindPassage(sameSide, "g", "wall")).toBe(false);
  });

  it("splits the incident cell instead of merging neighbours so a 3-way gate vertex becomes a 4-way passage", () => {
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
      mesh: {
        vertices: {
          w1: { id: "w1", point: [-20, 0], locked: false },
          g: { id: "g", point: [0, 0], locked: false },
          w2: { id: "w2", point: [20, 0], locked: false },
          p: { id: "p", point: [0, 20], locked: false },
          t1: { id: "t1", point: [-20, 20], locked: false },
          t2: { id: "t2", point: [20, 20], locked: false },
          b1: { id: "b1", point: [-20, -20], locked: false },
          b2: { id: "b2", point: [20, -20], locked: false }
        },
        edges: {
          eWall1: { id: "eWall1", a: "w1", b: "g", leftFace: "fIn1", rightFace: "fOut", locked: false },
          eWall2: { id: "eWall2", a: "g", b: "w2", leftFace: "fIn2", rightFace: "fOut", locked: false },
          eInMid: { id: "eInMid", a: "g", b: "p", leftFace: "fIn2", rightFace: "fIn1", locked: false },
          eInTop1: { id: "eInTop1", a: "w1", b: "t1", leftFace: "fIn1", rightFace: null, locked: false },
          eInTop2: { id: "eInTop2", a: "t1", b: "p", leftFace: "fIn1", rightFace: null, locked: false },
          eInTop3: { id: "eInTop3", a: "p", b: "t2", leftFace: "fIn2", rightFace: null, locked: false },
          eInTop4: { id: "eInTop4", a: "t2", b: "w2", leftFace: "fIn2", rightFace: null, locked: false },
          eOutR: { id: "eOutR", a: "w2", b: "b2", leftFace: "fOut", rightFace: null, locked: false },
          eOutB: { id: "eOutB", a: "b2", b: "b1", leftFace: "fOut", rightFace: null, locked: false },
          eOutL: { id: "eOutL", a: "b1", b: "w1", leftFace: "fOut", rightFace: null, locked: false }
        },
        faces: {
          fIn1: {
            id: "fIn1",
            boundary: [
              { edgeId: "eWall1", forward: true },
              { edgeId: "eInMid", forward: true },
              { edgeId: "eInTop2", forward: false },
              { edgeId: "eInTop1", forward: false }
            ],
            properties: { water: "land", buildable: true, locked: false }
          },
          fIn2: {
            id: "fIn2",
            boundary: [
              { edgeId: "eInMid", forward: false },
              { edgeId: "eWall2", forward: true },
              { edgeId: "eInTop4", forward: false },
              { edgeId: "eInTop3", forward: false }
            ],
            properties: { water: "land", buildable: true, locked: false }
          },
          fOut: {
            id: "fOut",
            boundary: [
              { edgeId: "eWall2", forward: false },
              { edgeId: "eWall1", forward: false },
              { edgeId: "eOutL", forward: false },
              { edgeId: "eOutB", forward: false },
              { edgeId: "eOutR", forward: false }
            ],
            properties: { water: "land", buildable: true, locked: false }
          }
        }
      },
      featureGroups: [
        {
          id: "wall-1",
          kind: "wall",
          name: "Wall #1",
          segments: [
            { edgeId: "eWall1", forward: true },
            { edgeId: "eWall2", forward: true }
          ],
          style: { widthMeters: 7, color: "#342a22" },
          locked: false
        }
      ],
      gates: [{ id: "gate-1", vertexId: "g", locked: false }],
      elements: []
    };

    expect(incidentEdges(document.mesh, "g")).toHaveLength(3);
    expect(vertexHasKindPassage(document, "g", "wall")).toBe(false);

    const next = openBarrierPassage(document, "g", "wall");
    expect(next).not.toBeNull();
    if (!next) return;

    // Both wall neighbors must NOT be merged or deleted
    expect(next.mesh.vertices.w1).toBeDefined();
    expect(next.mesh.vertices.w2).toBeDefined();
    expect(next.mesh.vertices.w1.point).toEqual([-20, 0]);
    expect(next.mesh.vertices.w2.point).toEqual([20, 0]);

    // The gate vertex g must have degree >= 4
    expect(incidentEdges(next.mesh, "g").length).toBeGreaterThanOrEqual(4);
    // It must form a valid 4-way wall passage (alternating pairs)
    expect(vertexHasKindPassage(next, "g", "wall")).toBe(true);
  });

  it("raises a 3-way river vertex to 4+ edges by merging the nearest river neighbour", () => {
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
      mesh: {
        vertices: {
          g: { id: "g", point: [0, 0], locked: false },
          w1: { id: "w1", point: [-10, 0], locked: false },
          w2: { id: "w2", point: [10, 0], locked: false },
          w0: { id: "w0", point: [-20, 0], locked: false },
          p: { id: "p", point: [0, 10], locked: false },
          a: { id: "a", point: [-10, -10], locked: false }
        },
        edges: {
          wallA: { id: "wallA", a: "g", b: "w1", leftFace: null, rightFace: null, locked: false },
          wallB: { id: "wallB", a: "g", b: "w2", leftFace: null, rightFace: null, locked: false },
          wallPrev: { id: "wallPrev", a: "w0", b: "w1", leftFace: null, rightFace: null, locked: false },
          passage: { id: "passage", a: "g", b: "p", leftFace: null, rightFace: null, locked: false },
          exitA: { id: "exitA", a: "w1", b: "a", leftFace: null, rightFace: null, locked: false }
        },
        faces: {}
      },
      featureGroups: [
        {
          id: "river-1",
          kind: "river",
          name: "River #1",
          vertices: ["w0", "w1", "g", "w2"],
          source: { vertexId: "w0", kind: "spring" },
          mouth: null,
          style: { widthMeters: 12, color: "#4f8aad" },
          locked: false
        }
      ],
      gates: [],
      elements: []
    };

    expect(incidentEdges(document.mesh, "g")).toHaveLength(3);
    const next = openBarrierPassage(document, "g", "river");
    expect(next).not.toBeNull();
    if (!next) return;
    expect(incidentEdges(next.mesh, "g").length).toBeGreaterThanOrEqual(4);
    expect(vertexHasKindPassage(next, "g", "river")).toBe(true);
    const bridged = addBridge(next, "g", "gc:bridge-test")!;
    expect(vertexHasCrossing(bridged, "g", "river", "road")).toBe(true);
    expect([...kindEdgeIds(bridged, "road")].some(id => kindEdgeIds(bridged, "river").has(id))).toBe(false);
  });

  it("collapses offset wall/river junctions into one centred four-way intersection", () => {
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
      mesh: { vertices: {}, edges: {}, faces: {} },
      featureGroups: [],
      gates: [],
      elements: []
    };
    for (const [id, x, y] of [
      ["a", 0, -4],
      ["b", 0, 4],
      ["n", 0, 20],
      ["s", 0, -20],
      ["w", -20, -4],
      ["e", 20, 4]
    ] as const) {
      document.mesh.vertices[id] = { id, point: [x, y], locked: false };
    }
    for (const [id, a, b] of [
      ["west", "w", "a"],
      ["shared", "a", "b"],
      ["east", "b", "e"],
      ["south", "s", "a"],
      ["north", "b", "n"]
    ]) {
      document.mesh.edges[id] = { id, a, b, leftFace: null, rightFace: null, locked: false };
    }
    document.featureGroups.push({
      id: "gc:wall",
      kind: "wall",
      name: "Wall",
      locked: false,
      style: { widthMeters: 4, color: "black" },
      segments: ["west", "shared", "east"].map(edgeId => ({ edgeId, forward: true }))
    });
    document.featureGroups.push({
      id: "gc:river",
      kind: "river",
      name: "River",
      locked: false,
      style: { widthMeters: 8, color: "blue" },
      vertices: ["s", "a", "b", "n"],
      source: null,
      mouth: null
    });
    const next = joinWallRiverCrossings(document);
    expect(next.mesh.vertices.a.point).toEqual([0, 0]);
    expect(next.mesh.vertices.b).toBeUndefined();
    expect(incidentEdges(next.mesh, "a")).toHaveLength(4);
    expect(vertexHasCrossing(next, "a", "wall", "river")).toBe(true);
    expect(document.mesh.vertices.b).toBeDefined();
  });

  describe("straightenBridges", () => {
    it("straightens an L-shaped river bridge along the perpendicular crossing arm", () => {
      // River runs south-to-north along x = 0: (0, -20) -> (0, 0) -> (0, 20)
      // Arm A approaches perpendicular from west: (-15, 0) -> (0, 0)
      // Arm B bends along the river northward: (0, 0) -> (5, 15)  (L-shaped)
      const document: CityDocument = {
        format: "fmg-city-editor",
        version: 1,
        frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
        mesh: {
          vertices: {
            s: { id: "s", point: [0, -20], locked: false },
            m: { id: "m", point: [0, 0], locked: false },
            n: { id: "n", point: [0, 20], locked: false },
            a: { id: "a", point: [-15, 0], locked: false },
            b: { id: "b", point: [5, 15], locked: false }
          },
          edges: {
            r1: { id: "r1", a: "s", b: "m", leftFace: null, rightFace: null, locked: false },
            r2: { id: "r2", a: "m", b: "n", leftFace: null, rightFace: null, locked: false },
            b1: { id: "b1", a: "a", b: "m", leftFace: null, rightFace: null, locked: false },
            b2: { id: "b2", a: "m", b: "b", leftFace: null, rightFace: null, locked: false }
          },
          faces: {}
        },
        featureGroups: [
          {
            id: "gc:river-1",
            kind: "river",
            name: "River",
            locked: false,
            style: { widthMeters: 8, color: "blue" },
            vertices: ["s", "m", "n"],
            source: null,
            mouth: null
          },
          {
            id: "gc:bridge-1",
            kind: "road",
            name: "Bridge",
            locked: false,
            style: { widthMeters: 4, color: "#735238" },
            segments: [
              { edgeId: "b1", forward: true },
              { edgeId: "b2", forward: true }
            ]
          }
        ],
        gates: [],
        elements: []
      };

      const straightened = straightenBridge(document, "gc:bridge-1");
      const ptB = straightened.mesh.vertices.b.point;
      // b should be straightened to the east along the vector from a -> m (y ≈ 0, x > 0)
      expect(ptB[0]).toBeGreaterThan(10);
      expect(Math.abs(ptB[1])).toBeLessThan(0.1);
    });

    it("straightens a V-shaped river bridge by projecting the junction onto the line connecting endpoints", () => {
      // River runs south-to-north: (0, -20) -> (3, 0) -> (0, 20) with a slight bend at m (3, 0)
      // Endpoints A (-15, 0) and B (15, 0)
      // Crossing vertex m is at (3, 3), forming a V-shape
      const document: CityDocument = {
        format: "fmg-city-editor",
        version: 1,
        frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
        mesh: {
          vertices: {
            s: { id: "s", point: [0, -20], locked: false },
            m: { id: "m", point: [2, 6], locked: false },
            n: { id: "n", point: [0, 20], locked: false },
            a: { id: "a", point: [-15, 0], locked: false },
            b: { id: "b", point: [15, 0], locked: false }
          },
          edges: {
            r1: { id: "r1", a: "s", b: "m", leftFace: null, rightFace: null, locked: false },
            r2: { id: "r2", a: "m", b: "n", leftFace: null, rightFace: null, locked: false },
            b1: { id: "b1", a: "a", b: "m", leftFace: null, rightFace: null, locked: false },
            b2: { id: "b2", a: "m", b: "b", leftFace: null, rightFace: null, locked: false }
          },
          faces: {}
        },
        featureGroups: [
          {
            id: "gc:river-1",
            kind: "river",
            name: "River",
            locked: false,
            style: { widthMeters: 8, color: "blue" },
            vertices: ["s", "m", "n"],
            source: null,
            mouth: null
          },
          {
            id: "gc:bridge-1",
            kind: "road",
            name: "Bridge",
            locked: false,
            style: { widthMeters: 4, color: "#735238" },
            segments: [
              { edgeId: "b1", forward: true },
              { edgeId: "b2", forward: true }
            ]
          }
        ],
        gates: [],
        elements: []
      };

      const straightened = straightenBridges(document);
      const ptM = straightened.mesh.vertices.m.point;
      // m should be projected onto the line from a (-15, 0) to b (15, 0), so y ≈ 0
      expect(Math.abs(ptM[1])).toBeLessThan(0.1);
    });

    it("straightens the L-shaped bridge in reference file ce-20260916-142259.json", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const filePath = path.resolve("temp/ce-20260916-142259.json");
      if (!fs.existsSync(filePath)) return;

      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CityDocument;
      const straightened = straightenBridges(raw);

      const pA = straightened.mesh.vertices.v289.point;
      const pM = straightened.mesh.vertices.v316.point;
      const pB = straightened.mesh.vertices.v346.point;

      // Check alignment of v289 -> v316 and v316 -> v346
      const vA = [pM[0] - pA[0], pM[1] - pA[1]];
      const vB = [pB[0] - pM[0], pB[1] - pM[1]];
      const lenA = Math.hypot(vA[0], vA[1]);
      const lenB = Math.hypot(vB[0], vB[1]);
      const dot = (vA[0] * vB[0] + vA[1] * vB[1]) / (lenA * lenB);

      // Dot product should be 1.0 (straight line)
      expect(dot).toBeGreaterThan(0.999);
    });

    it("straightens the L-shaped road crossing in reference file ce-20260916-185939.json", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const filePath = path.resolve("temp/ce-20260916-185939.json");
      if (!fs.existsSync(filePath)) return;

      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CityDocument;
      const straightened = straightenBridges(raw);

      const pA = straightened.mesh.vertices.v148.point;
      const pM = straightened.mesh.vertices.v147.point;
      const pB = straightened.mesh.vertices.v138.point;

      // Check alignment of v148 -> v147 and v147 -> v138
      const vA = [pM[0] - pA[0], pM[1] - pA[1]];
      const vB = [pB[0] - pM[0], pB[1] - pM[1]];
      const lenA = Math.hypot(vA[0], vA[1]);
      const lenB = Math.hypot(vB[0], vB[1]);
      const dot = (vA[0] * vB[0] + vA[1] * vB[1]) / (lenA * lenB);

      // Dot product should be 1.0 (straight line, was 0.395 / 66.7 degrees)
      expect(dot).toBeGreaterThan(0.999);
    });
  });
});
