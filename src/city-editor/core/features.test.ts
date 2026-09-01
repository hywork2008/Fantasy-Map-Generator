import { describe, expect, it } from "vitest";
import {
  encloseWardComponentWithWalls,
  featureGroupVertices,
  gateOpeningCandidates,
  groupUsesEdge,
  placeGateOpening,
  previewGroupAcrossFace,
  previewRouteAcrossFace,
  removeGroup,
  rerouteGroupAcrossFace,
  rerouteGroupVertex,
  smoothFeatureGroup,
  smoothFeatureGroups,
  toggleGate
} from "./features";
import type { CityDocument } from "./types";

function routeDocument(): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
    mesh: {
      vertices: {
        a: { id: "a", point: [0, 0], locked: false },
        b: { id: "b", point: [10, 0], locked: false },
        c: { id: "c", point: [20, 0], locked: false },
        d: { id: "d", point: [0, 10], locked: false },
        e: { id: "e", point: [10, 10], locked: false }
      },
      edges: {
        ab: { id: "ab", a: "a", b: "b", leftFace: null, rightFace: null, locked: false },
        bc: { id: "bc", a: "b", b: "c", leftFace: null, rightFace: null, locked: false },
        ad: { id: "ad", a: "a", b: "d", leftFace: null, rightFace: null, locked: false },
        de: { id: "de", a: "d", b: "e", leftFace: null, rightFace: null, locked: false },
        ec: { id: "ec", a: "e", b: "c", leftFace: null, rightFace: null, locked: false }
      },
      faces: {
        f0: {
          id: "f0",
          boundary: [
            { edgeId: "ab", forward: true },
            { edgeId: "bc", forward: true },
            { edgeId: "ec", forward: false },
            { edgeId: "de", forward: false },
            { edgeId: "ad", forward: false }
          ],
          properties: { elevation: 1, water: "land", ward: null, buildable: true, locked: false }
        }
      }
    },
    featureGroups: [
      {
        id: "wall-1",
        kind: "wall",
        name: "Wall #1",
        segments: [
          { edgeId: "ab", forward: true },
          { edgeId: "bc", forward: true }
        ],
        style: { widthMeters: 7, color: "#342a22" },
        locked: false
      }
    ],
    elements: []
  };
}

function closedRouteDocument(): CityDocument {
  const vertex = (id: string, point: [number, number]) => ({ id, point, locked: false });
  const edge = (id: string, a: string, b: string) => ({ id, a, b, leftFace: null, rightFace: null, locked: false });
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
    mesh: {
      vertices: {
        a: vertex("a", [0, 0]),
        b: vertex("b", [2, 0]),
        c: vertex("c", [0, 4]),
        q: vertex("q", [3, 1]),
        r: vertex("r", [2, 3]),
        x: vertex("x", [4, -1]),
        y: vertex("y", [4, 5])
      },
      edges: {
        ab: edge("ab", "a", "b"),
        bx: edge("bx", "b", "x"),
        xy: edge("xy", "x", "y"),
        yc: edge("yc", "y", "c"),
        ca: edge("ca", "c", "a"),
        bq: edge("bq", "b", "q"),
        qr: edge("qr", "q", "r"),
        rc: edge("rc", "r", "c")
      },
      faces: {
        f0: {
          id: "f0",
          boundary: [
            { edgeId: "ab", forward: true },
            { edgeId: "bq", forward: true },
            { edgeId: "qr", forward: true },
            { edgeId: "rc", forward: true },
            { edgeId: "ca", forward: true }
          ],
          properties: { elevation: 1, water: "land", ward: null, buildable: true, locked: false }
        }
      }
    },
    featureGroups: [
      {
        id: "wall-1",
        kind: "wall",
        name: "Wall #1",
        segments: [
          { edgeId: "ab", forward: true },
          { edgeId: "bx", forward: true },
          { edgeId: "xy", forward: true },
          { edgeId: "yc", forward: true },
          { edgeId: "ca", forward: true }
        ],
        style: { widthMeters: 7, color: "#342a22" },
        locked: false
      }
    ],
    elements: []
  };
}

describe("gates", () => {
  it("anchors gates to wall vertices and toggles them there", () => {
    const document = routeDocument();
    const first = toggleGate(document, "a");
    expect(first?.gates).toEqual([{ id: "gate-1", vertexId: "a", locked: false }]);

    const second = first ? toggleGate(first, "a") : null;
    expect(second?.gates).toEqual([]);
    const withGate = toggleGate(document, "a");
    expect(withGate ? removeGroup(withGate, "wall-1").gates : []).toEqual([]);
    expect(toggleGate(document, "d")).toBeNull();
  });

  it("merges a neighboring wall vertex and creates a through-road between the wall runs", () => {
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
      gates: [],
      elements: []
    };

    expect(gateOpeningCandidates(document, "g")).toEqual([{ edgeId: "wallA", vertexId: "w1" }]);
    const next = placeGateOpening(document, "g", "w1");

    expect(next?.gates).toEqual([{ id: "gate-1", vertexId: "g", locked: false }]);
    expect(next?.featureGroups.find(group => group.kind === "road")?.kind).toBe("road");
    expect(Object.values(next?.mesh.edges ?? {}).filter(edge => edge.a === "g" || edge.b === "g")).toHaveLength(4);
  });
});

describe("route group editing", () => {
  it("encloses only the edge-connected Ward component with a closed wall", () => {
    const vertex = (id: string, point: [number, number]) => ({ id, point, locked: false });
    const edge = (id: string, a: string, b: string, leftFace: string | null, rightFace: string | null) => ({
      id,
      a,
      b,
      leftFace,
      rightFace,
      locked: false
    });
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: { extentMeters: 100, cityRadiusMeters: 40, blockSizeMeters: 10 },
      mesh: {
        vertices: {
          a: vertex("a", [0, 0]),
          b: vertex("b", [10, 0]),
          c: vertex("c", [20, 0]),
          d: vertex("d", [0, 10]),
          e: vertex("e", [10, 10]),
          f: vertex("f", [20, 10]),
          g: vertex("g", [40, 0]),
          h: vertex("h", [50, 0]),
          i: vertex("i", [50, 10]),
          j: vertex("j", [40, 10])
        },
        edges: {
          ab: edge("ab", "a", "b", "f0", null),
          be: edge("be", "b", "e", "f0", "f1"),
          de: edge("de", "d", "e", null, "f0"),
          ad: edge("ad", "a", "d", null, "f0"),
          bc: edge("bc", "b", "c", "f1", null),
          cf: edge("cf", "c", "f", "f1", null),
          ef: edge("ef", "e", "f", null, "f1"),
          gh: edge("gh", "g", "h", "f2", null),
          hi: edge("hi", "h", "i", "f2", null),
          ij: edge("ij", "i", "j", "f2", null),
          gj: edge("gj", "g", "j", null, "f2")
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
            properties: { elevation: 1, water: "land", ward: "market", buildable: true, locked: false }
          },
          f1: {
            id: "f1",
            boundary: [
              { edgeId: "bc", forward: true },
              { edgeId: "cf", forward: true },
              { edgeId: "ef", forward: false },
              { edgeId: "be", forward: false }
            ],
            properties: { elevation: 1, water: "land", ward: "market", buildable: true, locked: false }
          },
          f2: {
            id: "f2",
            boundary: [
              { edgeId: "gh", forward: true },
              { edgeId: "hi", forward: true },
              { edgeId: "ij", forward: true },
              { edgeId: "gj", forward: false }
            ],
            properties: { elevation: 1, water: "land", ward: "market", buildable: true, locked: false }
          }
        }
      },
      featureGroups: [],
      elements: []
    };

    const next = encloseWardComponentWithWalls(document, "f0");

    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.featureGroups).toHaveLength(1);
    const wall = next.featureGroups[0];
    expect(wall).toMatchObject({ kind: "wall", name: "Wall #1" });
    expect(wall.kind === "wall" ? wall.segments.map(segment => segment.edgeId) : []).toEqual([
      "ab",
      "bc",
      "cf",
      "ef",
      "de",
      "ad"
    ]);
  });

  it("does not create a wall for a cell without a Ward", () => {
    expect(encloseWardComponentWithWalls(routeDocument(), "f0")).toBeNull();
  });

  it("reports a group's ordered vertices and used edges", () => {
    const document = routeDocument();
    const group = document.featureGroups[0];
    expect(featureGroupVertices(document, group)).toEqual(["a", "b", "c"]);
    expect(groupUsesEdge(document, group, "ab")).toBe(true);
    expect(groupUsesEdge(document, group, "ad")).toBe(false);
  });

  it("reroutes an internal wall vertex over the shortest replacement edges", () => {
    const document = routeDocument();
    const next = rerouteGroupVertex(document, "wall-1", "b", "e");

    expect(next).not.toBeNull();
    if (!next) return;
    const group = next.featureGroups[0];
    expect(featureGroupVertices(next, group)).toEqual(["a", "d", "e", "c"]);
    expect(group.kind === "river" ? [] : group.segments.map(segment => segment.edgeId)).toEqual(["ad", "de", "ec"]);
  });

  it("rejects drops onto a vertex already used by the route", () => {
    expect(rerouteGroupVertex(routeDocument(), "wall-1", "b", "c")).toBeNull();
  });

  it("folds a route's smoothed interior vertices back into the shared mesh", () => {
    const document = routeDocument();
    document.mesh.vertices.b.point = [10, 6];

    const next = smoothFeatureGroups(document);

    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.mesh.vertices.a.point).toEqual([0, 0]);
    expect(next.mesh.vertices.b.point).toEqual([10, 1.5]);
    expect(next.mesh.vertices.c.point).toEqual([20, 0]);
  });

  it("smooths a selected route even when its interior vertex is shared", () => {
    const document = routeDocument();
    document.mesh.vertices.b.point = [10, 6];
    document.featureGroups.push({
      id: "road-2",
      kind: "road",
      name: "Road #2",
      segments: [
        { edgeId: "ab", forward: true },
        { edgeId: "bc", forward: true }
      ],
      style: { widthMeters: 7, color: "#604a3f" },
      locked: false
    });

    expect(smoothFeatureGroups(document)).toBeNull();
    const next = smoothFeatureGroup(document, "wall-1");

    expect(next?.mesh.vertices.b.point).toEqual([10, 1.5]);
  });

  it("smooths a selected closed wall as a cycle", () => {
    const document = closedRouteDocument();
    const next = smoothFeatureGroup(document, "wall-1");

    expect(next).not.toBeNull();
    expect(next?.mesh.vertices.b.point).not.toEqual(document.mesh.vertices.b.point);
  });

  it("replaces a route's face-boundary span with the opposite cell boundary", () => {
    const next = rerouteGroupAcrossFace(routeDocument(), "wall-1", "f0", { edgeId: "bc" });

    expect(next).not.toBeNull();
    if (!next) return;
    expect(featureGroupVertices(next, next.featureGroups[0])).toEqual(["a", "d", "e", "c"]);
  });

  it("creates a face reroute preview without changing the document", () => {
    const document = routeDocument();
    const preview = previewGroupAcrossFace(document, "wall-1", "f0", { edgeId: "bc" });

    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(featureGroupVertices(document, preview)).toEqual(["a", "d", "e", "c"]);
    expect(featureGroupVertices(document, document.featureGroups[0])).toEqual(["a", "b", "c"]);
    expect(previewRouteAcrossFace(document, "wall-1", "f0", { edgeId: "bc" })?.replacementVertices).toEqual([
      "a",
      "d",
      "e",
      "c"
    ]);
  });

  it("replaces a face span that crosses a closed route's serialized boundary", () => {
    const preview = previewRouteAcrossFace(closedRouteDocument(), "wall-1", "f0", { edgeId: "ab" });
    expect(preview?.replacementVertices).toEqual(["c", "r", "q", "b"]);
  });
});
