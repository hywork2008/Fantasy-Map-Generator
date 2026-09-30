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

  it("prevents non-bridge roads from crossing or cutting into rivers during smoothing", () => {
    const document = gateBesideRiver();
    const vertex = (id: string, x: number, y: number) => ({ id, point: [x, y] as [number, number], locked: false });
    const edge = (id: string, a: string, b: string) => ({ id, a, b, leftFace: null, rightFace: null, locked: false });

    // River running vertically along x = 0 from y = -50 to y = 50
    // Road with 3 vertices: (-10, -40) -> (10, 0) -> (-10, 40)
    // If the middle vertex moves towards (a+b)/2 = (-10, 0), it crosses x=0 (the river)!
    document.mesh.vertices = {
      r1: vertex("r1", 0, -50),
      r2: vertex("r2", 0, 50),
      ra: vertex("ra", 10, -40),
      rm: vertex("rm", 10, 0),
      rb: vertex("rb", 10, 40)
    };
    document.mesh.edges = {
      riv: edge("riv", "r1", "r2"),
      rd1: edge("rd1", "ra", "rm"),
      rd2: edge("rd2", "rm", "rb")
    };
    document.featureGroups = [
      {
        id: "gc:river-0",
        kind: "river",
        name: "River",
        vertices: ["r1", "r2"],
        segments: [{ edgeId: "riv", forward: true }],
        style: { widthMeters: 6, color: "#4f8aad" },
        locked: false
      },
      {
        id: "gc:road-0",
        kind: "road",
        name: "Road",
        segments: [
          { edgeId: "rd1", forward: true },
          { edgeId: "rd2", forward: true }
        ],
        style: { widthMeters: 4, color: "#735238" },
        locked: false
      }
    ];
    document.gates = [];

    const next = finishCityGeometry(document);
    // The road vertex rm must stay on the positive X side of the river (x > 0), maintaining clearance
    expect(next.mesh.vertices.rm.point[0]).toBeGreaterThan(3.0);
  });

  it("prevents roads from penetrating cemetery precinct and preserves cemetery vertices", () => {
    const document = gateBesideRiver();
    const vertex = (id: string, x: number, y: number) => ({ id, point: [x, y] as [number, number], locked: false });
    const edge = (
      id: string,
      a: string,
      b: string,
      leftFace: string | null = null,
      rightFace: string | null = null
    ) => ({ id, a, b, leftFace, rightFace, locked: false });

    // Cemetery square from (0, 0) to (30, 30)
    document.mesh.vertices = {
      c1: vertex("c1", 0, 0),
      c2: vertex("c2", 30, 0),
      c3: vertex("c3", 30, 30),
      c4: vertex("c4", 0, 30),
      ra: vertex("ra", -10, 0),
      rm: vertex("rm", -5, 15),
      rb: vertex("rb", -10, 30)
    };
    document.mesh.edges = {
      ce1: edge("ce1", "c1", "c2", "f_cem", null),
      ce2: edge("ce2", "c2", "c3", "f_cem", null),
      ce3: edge("ce3", "c3", "c4", "f_cem", null),
      ce4: edge("ce4", "c4", "c1", "f_cem", null),
      rd1: edge("rd1", "ra", "rm"),
      rd2: edge("rd2", "rm", "rb")
    };
    document.mesh.faces = {
      f_cem: {
        id: "f_cem",
        site: [15, 15],
        boundary: [
          { edgeId: "ce1", forward: true },
          { edgeId: "ce2", forward: true },
          { edgeId: "ce3", forward: true },
          { edgeId: "ce4", forward: true }
        ],
        properties: {
          elevation: 10,
          water: "land",
          ward: "cemetery",
          buildable: false,
          locked: false
        }
      }
    };
    document.featureGroups = [
      {
        id: "gc:road-0",
        kind: "road",
        name: "Road",
        segments: [
          { edgeId: "rd1", forward: true },
          { edgeId: "rd2", forward: true }
        ],
        style: { widthMeters: 4, color: "#735238" },
        locked: false
      }
    ];
    document.gates = [];

    const next = finishCityGeometry(document);
    // Cemetery vertices must not be moved
    expect(next.mesh.vertices.c1.point).toEqual([0, 0]);
    expect(next.mesh.vertices.c4.point).toEqual([0, 30]);

    // Road vertex rm must not penetrate into x >= 0 (cemetery interior)
    expect(next.mesh.vertices.rm.point[0]).toBeLessThan(0);
  });

  it("smooths a wall along a cemetery face and updates the face geometry", () => {
    const document = gateBesideRiver();
    const vertex = (id: string, x: number, y: number) => ({ id, point: [x, y] as [number, number], locked: false });
    const edge = (id: string, a: string, b: string) => ({ id, a, b, leftFace: "cem", rightFace: null, locked: false });
    document.mesh.vertices = {
      a: vertex("a", -30, 0),
      m: vertex("m", 0, 20),
      b: vertex("b", 30, 0),
      c: vertex("c", 30, 40),
      d: vertex("d", -30, 40)
    };
    document.mesh.edges = {
      am: edge("am", "a", "m"),
      mb: edge("mb", "m", "b"),
      bc: edge("bc", "b", "c"),
      cd: edge("cd", "c", "d"),
      da: edge("da", "d", "a")
    };
    document.mesh.faces = {
      cem: {
        id: "cem",
        site: [0, 20],
        boundary: ["am", "mb", "bc", "cd", "da"].map(edgeId => ({ edgeId, forward: true })),
        properties: { elevation: 10, water: "land", ward: "cemetery", buildable: false, locked: false }
      }
    };
    document.featureGroups = [
      {
        id: "gc:wall-0",
        kind: "wall",
        name: "Wall",
        segments: [
          { edgeId: "am", forward: true },
          { edgeId: "mb", forward: true }
        ],
        style: { widthMeters: 7, color: "#342a22" },
        locked: false
      }
    ];
    document.gates = [];

    const next = finishCityGeometry(document);
    expect(next.mesh.vertices.m.point[1]).toBeLessThan(19);
  });
});
