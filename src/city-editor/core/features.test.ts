import { describe, expect, it } from "vitest";
import {
  featureGroupVertices,
  groupUsesEdge,
  previewGroupAcrossFace,
  previewRouteAcrossFace,
  rerouteGroupAcrossFace,
  rerouteGroupVertex
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

describe("route group editing", () => {
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
});
