import { describe, expect, it } from "vitest";
import { incidentEdges } from "./mesh";
import { openBarrierPassage, orderedIncidentEdges, vertexHasKindPassage } from "./passages";
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
          a: { id: "a", point: [-10, 10], locked: false }
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
          a: { id: "a", point: [-10, 10], locked: false }
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
  });
});
