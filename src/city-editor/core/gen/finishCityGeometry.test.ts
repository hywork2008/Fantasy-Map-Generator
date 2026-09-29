import { describe, expect, it } from "vitest";
import type { CityDocument } from "../types";
import { finishCityGeometry } from "./finishCityGeometry";

/** Corner gate beside a straight river, with a 2 m stub just past the first road vertex. */
function gateBesideRiver(): CityDocument {
  const vertex = (id: string, x: number, y: number) => ({ id, point: [x, y] as [number, number], locked: false });
  const edge = (id: string, a: string, b: string) => ({ id, a, b, leftFace: null, rightFace: null, locked: false });
  return {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    frame: { extentMeters: 400, cityRadiusMeters: 120, blockSizeMeters: 40 },
    mesh: {
      vertices: {
        a: vertex("a", -40, 60),
        r: vertex("r", 0, 60),
        b: vertex("b", 40, 60),
        g: vertex("g", 0, 0),
        w: vertex("w", 50, 0),
        x: vertex("x", 90, 40),
        p: vertex("p", 36, -8),
        q: vertex("q", 38, -8),
        s: vertex("s", 70, -30)
      },
      edges: {
        ra: edge("ra", "a", "r"),
        rb: edge("rb", "r", "b"),
        wg: edge("wg", "r", "g"),
        gw: edge("gw", "g", "w"),
        wx: edge("wx", "w", "x"),
        gp: edge("gp", "g", "p"),
        pq: edge("pq", "p", "q"),
        qs: edge("qs", "q", "s")
      },
      faces: {}
    },
    featureGroups: [
      {
        id: "gc:river-0",
        kind: "river",
        name: "River",
        vertices: ["a", "r", "b"],
        source: { vertexId: "a", kind: "spring" },
        mouth: { vertexId: "b", kind: "mapBoundary" },
        style: { widthMeters: 8, color: "#4f8aad" },
        locked: false
      },
      {
        id: "gc:wall-0",
        kind: "wall",
        name: "Wall",
        segments: [
          { edgeId: "wg", forward: true },
          { edgeId: "gw", forward: true },
          { edgeId: "wx", forward: true }
        ],
        style: { widthMeters: 7, color: "#342a22" },
        locked: false
      },
      {
        id: "gc:road-0",
        kind: "road",
        name: "Road",
        segments: [
          { edgeId: "gp", forward: true },
          { edgeId: "pq", forward: true },
          { edgeId: "qs", forward: true }
        ],
        style: { widthMeters: 4, color: "#735238" },
        locked: false
      }
    ],
    gates: [{ id: "gc:gate-0", vertexId: "g", locked: false }],
    elements: []
  };
}

describe("finishCityGeometry gate-river clearance", () => {
  it("keeps a gate off an adjacent river and leaves the road vertex at the gate", () => {
    const document = gateBesideRiver();
    const next = finishCityGeometry(document);
    const gap = Math.hypot(
      next.mesh.vertices.g.point[0] - next.mesh.vertices.r.point[0],
      next.mesh.vertices.g.point[1] - next.mesh.vertices.r.point[1]
    );
    expect(gap).toBeGreaterThanOrEqual(60 - 0.05);
    expect(next.mesh.vertices.p.point[0]).toBeCloseTo(36, 0);
    expect(next.mesh.vertices.p.point[1]).toBeCloseTo(-8, 0);
    const wall = next.mesh.vertices.w.point;
    expect(Math.hypot(wall[0] - 50, wall[1])).toBeGreaterThan(0.5);
  });

  it("keeps a smoothed wall outside the drawn road width away from gates", () => {
    const document = gateBesideRiver();
    const vertex = (id: string, x: number, y: number) => ({ id, point: [x, y] as [number, number], locked: false });
    const edge = (id: string, a: string, b: string) => ({ id, a, b, leftFace: null, rightFace: null, locked: false });
    document.mesh.vertices = {
      wa: vertex("wa", -40, 0),
      wm: vertex("wm", 0, 30),
      wb: vertex("wb", 40, 0),
      ra: vertex("ra", -10, 20),
      rb: vertex("rb", 10, 20)
    };
    document.mesh.edges = {
      wa: edge("wa", "wa", "wm"),
      wb: edge("wb", "wm", "wb"),
      road: edge("road", "ra", "rb")
    };
    document.featureGroups = [
      {
        id: "gc:wall-0",
        kind: "wall",
        name: "Wall",
        segments: [
          { edgeId: "wa", forward: true },
          { edgeId: "wb", forward: true }
        ],
        style: { widthMeters: 7, color: "#342a22" },
        locked: false
      },
      {
        id: "gc:road-0",
        kind: "road",
        name: "Road",
        segments: [{ edgeId: "road", forward: true }],
        style: { widthMeters: 4, color: "#735238" },
        locked: false
      }
    ];
    document.gates = [];
    const next = finishCityGeometry(document);
    expect(next.mesh.vertices.wm.point[1]).toBeGreaterThan(29.9);
  });
});
