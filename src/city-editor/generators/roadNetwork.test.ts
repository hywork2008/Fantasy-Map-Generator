import { describe, expect, it } from "vitest";
import type { CityDocument, EdgeRef, Point } from "../types/document";
import { finishCityGeometry } from "./finishCityGeometry";
import { nearestVertexLookup } from "./generation/planning/meshLookup";
import { completeRoadRouter } from "./generation/routing/completeRoadRouter";
import {
  physicalRoadRuns,
  type RoadGroup,
  RoadNetwork,
  RootedRoadNetwork,
  roadPathVertices,
  simpleRoadPath
} from "./roadNetwork";
import { collectTownRoads } from "./townRoads";

function city(points: Record<string, Point>, edges: string[]): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    frame: { extentMeters: 600, cityRadiusMeters: 160, blockSizeMeters: 40 },
    mesh: {
      vertices: Object.fromEntries(Object.entries(points).map(([id, point]) => [id, { id, point, locked: false }])),
      edges: Object.fromEntries(
        edges.map(id => [id, { id, a: id[0], b: id[1], leftFace: null, rightFace: null, locked: false }])
      ),
      faces: {}
    },
    featureGroups: [],
    gates: [],
    elements: []
  };
}

const refs = (...ids: string[]): EdgeRef[] =>
  ids.map(id => ({ edgeId: id.replace("-", ""), forward: !id.startsWith("-") }));
const road = (id: string, segments: EdgeRef[], widthMeters = 4): RoadGroup => ({
  id,
  kind: "road",
  name: id,
  segments,
  locked: false,
  style: { widthMeters, color: "#735238" }
});
const branch = () => city({ A: [-90, 0], B: [-30, 0], C: [-30, 40], D: [30, 0] }, ["AB", "BC", "BD"]);
const router = (document: CityDocument, banned = new Set<string>()) =>
  completeRoadRouter(
    document,
    { urban: new Set(), avoidSea: true, gates: [], precincts: [] },
    [],
    nearestVertexLookup(document.mesh, 40),
    banned
  );

describe("road route normalization", () => {
  it("removes the waypoint excursion before mesh smoothing", () => {
    const document = branch();
    const p = document.mesh.vertices;
    const segments = router(document)([p.A.point, p.C.point, p.D.point], false, true);
    document.featureGroups = [road("gc:road-0", segments)];
    expect(roadPathVertices(document.mesh, segments)).toEqual(["A", "B", "D"]);
    const smoothed = finishCityGeometry(document);
    expect(smoothed.featureGroups[0]).toEqual(document.featureGroups[0]);
  });

  it("does not silently erase a required stop in an excursion", () => {
    expect(simpleRoadPath(["A", "B", "C", "B", "D"], new Set(["C"]))).toBeNull();
    // The facility receives its own access branch instead of a round trip.
    const document = branch();
    const p = document.mesh.vertices;
    expect(roadPathVertices(document.mesh, router(document)([p.B.point, p.C.point], false, true))).toEqual(["B", "C"]);
  });
});

it("preserves an explicitly requested simple ring", () => {
  const document = city({ A: [-80, 0], B: [40, 0], C: [0, 60] }, ["AB", "BC", "CA"]);
  const points = ["A", "B", "C", "A"].map(id => document.mesh.vertices[id].point);
  const segments = router(document)(points, false, true);
  expect(roadPathVertices(document.mesh, segments)).toEqual(["A", "B", "C", "A"]);
  expect(simpleRoadPath(["A", "B", "C", "B", "A"], new Set(), true)).toBeNull();
});

describe("incremental road network", () => {
  it("rejects contained reverse paths and unserved, detached fragments", () => {
    const document = branch();
    const network = new RoadNetwork(document.mesh);
    network.add(refs("AB", "BD"));
    expect(network.useful(refs("-BD"))).toBe(false);
    expect(network.useful(refs("BC"))).toBe(false);
    expect(network.counts()).toMatchObject({ roadEdges: 2, roadComponents: 1, roadLengthMeters: 120 });
  });

  it("retains even a short access branch when it opens a new buildable frontage", () => {
    const document = branch();
    document.mesh.vertices.C.point = [-30, 3];
    document.mesh.edges.BC.leftFace = "housing";
    document.mesh.faces.housing = {
      id: "housing",
      boundary: [],
      properties: {
        water: "land",
        elevation: 1,
        buildable: true,
        locked: false,
        ward: "merchant"
      }
    };
    const network = new RoadNetwork(document.mesh);
    network.add(refs("AB", "BD"));
    expect(network.useful(refs("AB", "BC"))).toBe(true);
    network.add(refs("BC"));
    expect(network.useful(refs("BC"))).toBe(false);
  });

  it("keeps a useful cycle while discarding a longer parallel alternative", () => {
    const document = city({ A: [0, 0], B: [0, 50], C: [60, 0], D: [30, -5] }, ["AB", "BC", "AC", "AD", "DC"]);
    const network = new RoadNetwork(document.mesh);
    network.add(refs("AB", "BC"));
    expect(network.useful(refs("AC"))).toBe(true);
    network.add(refs("AC"));
    expect(network.useful(refs("AD", "DC"))).toBe(false);
  });

  it("distinguishes a detached fragment from a bridge between existing components", () => {
    const document = city({ A: [0, 0], B: [40, 0], C: [80, 0], D: [120, 0], E: [80, 40], F: [120, 40] }, [
      "AB",
      "BC",
      "CD",
      "EF"
    ]);
    const network = new RoadNetwork(document.mesh);
    network.add(refs("AB", "CD"));
    expect(network.useful(refs("EF"))).toBe(false);
    expect(network.useful(refs("BC"))).toBe(true);
  });

  it("attaches to a reachable network vertex without crossing a banned edge", () => {
    const document = branch();
    const p = document.mesh.vertices;
    const options = { connectTo: new Set(["A", "D"]), startVertex: "C" };
    // Both target vertices are equally far. Blocking BD leaves the AB route.
    expect(
      roadPathVertices(
        document.mesh,
        router(document, new Set(["BD"]))([p.C.point, p.A.point], false, true, undefined, options)
      )
    ).toEqual(["C", "B", "A"]);
    expect(router(document, new Set(["BC"]))([p.C.point, p.A.point], false, true, undefined, options)).toEqual([]);
    expect(
      router(document)([p.C.point, p.A.point], false, true, undefined, { ...options, maxConnectionMeters: 60 })
    ).toEqual([]);
  });

  it.each([10, 100])("reuses roadway only within the travel budget (offset %s)", offset => {
    const document = city({ A: [-100, 0], B: [0, 0], C: [0, offset * 2], D: [100, 0] }, ["AB", "BD", "AC", "CD"]);
    const p = document.mesh.vertices;
    document.mesh.faces.f = {
      id: "f",
      boundary: refs("AB", "BD", "-CD", "-AC"),
      properties: {
        water: "land",
        elevation: 1,
        buildable: true,
        locked: false,
        ward: null
      }
    };
    for (const edge of Object.values(document.mesh.edges)) edge.leftFace = "f";
    const route = completeRoadRouter(
      document,
      { urban: new Set([0]), avoidSea: true, gates: [], precincts: [] },
      ["f"],
      nearestVertexLookup(document.mesh, 40),
      new Set(),
      true
    );
    const segments = route([p.A.point, p.B.point, p.D.point], false, false, undefined, {
      existingEdges: new Set(["AC", "CD"])
    });
    expect(roadPathVertices(document.mesh, segments)).toEqual(offset === 10 ? ["A", "C", "D"] : ["A", "B", "D"]);
  });
});

describe("gate streets rooted at their destination", () => {
  it("stops at a shared junction, but keeps paths to a different destination", () => {
    const document = city({ A: [-90, 0], B: [-30, 0], C: [-30, 40], D: [30, 0], E: [60, 0] }, ["AB", "BC", "BD", "DE"]);
    const network = new RootedRoadNetwork(document);
    expect(network.join(refs("AB", "BD"))).toEqual(refs("AB", "BD"));
    expect(network.join(refs("-BC", "BD"))).toEqual(refs("-BC"));
    expect(network.join(refs("-BC", "BD", "DE"))).toEqual(refs("-BC", "BD", "DE"));
  });

  it.each([null, "river", "wall"])("shares plaza access only within the same dry component (barrier: %s)", barrier => {
    const document = city(
      { A: [-90, 0], B: [-30, 0], C: [-30, 60], D: [30, 0], E: [30, 30], F: [60, 15], G: [0, 15] },
      ["AB", "BC", "BF", "BG", "DE", "EF", "FD", "DG", "GE"]
    );
    for (const [id, boundary] of [
      ["left", refs("DE", "EF", "FD")],
      ["right", refs("-DE", "DG", "GE")]
    ] as const) {
      document.mesh.faces[id] = {
        id,
        boundary,
        properties: {
          water: "land",
          elevation: 1,
          buildable: true,
          locked: false,
          ward: null
        }
      };
    }
    document.mesh.edges.DE.leftFace = "left";
    document.mesh.edges.DE.rightFace = "right";
    document.elements = [{ id: "plaza", kind: "plaza", faceIds: ["left", "right"], locked: false }];
    if (barrier === "wall") document.featureGroups = [{ ...road("wall", refs("DE")), kind: "wall" }];
    if (barrier === "river")
      document.featureGroups = [
        {
          id: "river",
          kind: "river",
          name: "River",
          vertices: ["D", "E"],
          source: null,
          mouth: null,
          style: { widthMeters: 5, color: "#527f8b" },
          locked: false
        }
      ];
    const network = new RootedRoadNetwork(document);
    network.join(refs("AB", "BF"));
    expect(network.join(refs("-BC", "BG"))).toEqual(barrier ? refs("-BC", "BG") : refs("-BC"));
  });
});

describe("physical road ownership", () => {
  it("draws a shared interval once, preserving widths, branches, and route identities", () => {
    const document = city({ A: [-90, 0], B: [-30, 0], C: [30, 0], D: [90, 0] }, ["AB", "BC", "CD"]);
    document.featureGroups = [road("long", refs("AB", "BC", "CD")), road("short", refs("-BC"), 6)];
    const before = structuredClone(document);
    const runs = physicalRoadRuns(document);
    expect(runs.map(run => [run.group.id, run.segments.map(ref => ref.edgeId)])).toEqual([
      ["long", ["AB"]],
      ["long", ["CD"]],
      ["short", ["BC"]]
    ]);
    expect(runs.find(run => run.group.id === "short")!.routeIds).toEqual(["long", "short"]);
    const ribbons = collectTownRoads(document, []);
    expect(ribbons).toHaveLength(3);
    expect(
      ribbons.reduce(
        (sum, ribbon) =>
          sum +
          Math.hypot(
            ribbon.centerline.at(-1)![0] - ribbon.centerline[0][0],
            ribbon.centerline.at(-1)![1] - ribbon.centerline[0][1]
          ),
        0
      )
    ).toBe(180);
    expect(document).toEqual(before);
    document.featureGroups.reverse();
    expect(physicalRoadRuns(document).find(run => run.segments[0].edgeId === "BC")!.group.id).toBe("short");
  });

  it("retains a closed ring and does not let an omitted bridge own its approaches", () => {
    const document = city({ A: [0, 0], B: [60, 0], C: [0, 60] }, ["AB", "BC", "CA"]);
    document.featureGroups = [road("ring", refs("AB", "BC", "CA")), road("gc:bridge-0", refs("AB"), 8)];
    const runs = physicalRoadRuns(document, group => !group.id.startsWith("gc:bridge-"));
    expect(runs).toHaveLength(1);
    expect(roadPathVertices(document.mesh, runs[0].segments)).toEqual(["A", "B", "C", "A"]);
  });
});
