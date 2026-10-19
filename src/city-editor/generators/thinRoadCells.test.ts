import { describe, expect, it } from "vitest";
import type { CityDocument, EdgeFeatureGroup, Point } from "../types/document";
import { finishCityGeometry } from "./finishCityGeometry";
import { polygonArea, polygonCentroid } from "./geom";
import { facePoints, indexMeshEdges, meshFromCells, validate } from "./mesh";
import { minimumCellWidth, roadCellEffectiveWidth, roadCellHousingWidth } from "./roadCellGeometry";
import { consolidateThinRoadCells } from "./thinRoadCells";

function fixture(gap = 3) {
  const xs = [-40, 0, 80, 120],
    ys = [-40, 0, gap, 40];
  const cells = [];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const polygon: Point[] = [
        [xs[x], ys[y]],
        [xs[x + 1], ys[y]],
        [xs[x + 1], ys[y + 1]],
        [xs[x], ys[y + 1]]
      ];
      const center = polygonCentroid(polygon);
      cells.push({ id: cells.length, polygon, site: center, centroid: center, neighbors: [], onBorder: false });
    }
  const mesh = meshFromCells(cells),
    index = indexMeshEdges(mesh);
  const vertex = (x: number, y: number) =>
    Object.values(mesh.vertices).find(v => v.point[0] === x && v.point[1] === y)!.id;
  const road = (id: string, points: Point[]): EdgeFeatureGroup => ({
    id,
    kind: "road",
    name: id,
    locked: false,
    style: { widthMeters: 4 },
    segments: points.slice(1).map((b, i) => {
      const a = vertex(...points[i]),
        end = vertex(...b),
        edge = index.between(a, end)!;
      return { edgeId: edge.id, forward: edge.a === a };
    })
  });
  const city: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 400, cityRadiusMeters: 120, blockSizeMeters: 40 },
    mesh,
    gates: [],
    elements: [],
    featureGroups: [
      road(
        "gc:road-16",
        xs.map(x => [x, 0])
      ),
      road(
        "gc:road-17",
        xs.map(x => [x, gap])
      ),
      road("gc:road-18", [
        [80, 0],
        [80, gap]
      ])
    ]
  };
  return city;
}
const area = (city: CityDocument) =>
  Object.values(city.mesh.faces).reduce((sum, face) => sum + Math.abs(polygonArea(facePoints(city.mesh, face))), 0);

describe("thin road cells", () => {
  it("merges an uninhabitable strip and keeps all branches connected without parallel long sides", () => {
    const city = fixture(),
      before = structuredClone(city);
    expect(validate(city)).toEqual([]);
    const result = consolidateThinRoadCells(city);
    expect(result.mergedCells).toBe(1);
    expect(result.document.mesh.faces.f4).toBeUndefined();
    expect(area(result.document)).toBeCloseTo(area(city));
    expect(validate(result.document)).toEqual([]);
    expect(city).toEqual(before);
    const occupied = new Set(
      result.document.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(r => r.edgeId) : []))
    );
    const longSides = city.mesh.faces.f4.boundary.filter(r => {
      const e = city.mesh.edges[r.edgeId],
        a = city.mesh.vertices[e.a].point,
        b = city.mesh.vertices[e.b].point;
      return Math.hypot(b[0] - a[0], b[1] - a[1]) > 70;
    });
    expect(longSides.filter(r => occupied.has(r.edgeId))).toHaveLength(1);
    const adjacency = new Map<string, Set<string>>();
    for (const id of occupied) {
      const e = result.document.mesh.edges[id];
      for (const [a, b] of [
        [e.a, e.b],
        [e.b, e.a]
      ]) {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        adjacency.get(a)!.add(b);
      }
    }
    const reached = new Set<string>(),
      queue = [adjacency.keys().next().value!];
    for (const id of queue) {
      if (reached.has(id)) continue;
      reached.add(id);
      queue.push(...adjacency.get(id)!);
    }
    expect(reached.size).toBe(adjacency.size);
    expect(consolidateThinRoadCells(result.document).mergedCells).toBe(0);
  });
  it("keeps smoothing from flattening a viable road-facing cell below the housing width", () => {
    const city = fixture();
    const polygon: Point[] = [
      [-40, -1.5],
      [0, -7],
      [40, -1.5],
      [40, 1.5],
      [0, 7],
      [-40, 1.5]
    ];
    const center = polygonCentroid(polygon);
    city.mesh = meshFromCells([{ id: 0, polygon, centroid: center, site: center, neighbors: [], onBorder: false }]);
    for (const vertex of Object.values(city.mesh.vertices)) vertex.locked = Math.abs(vertex.point[0]) === 40;
    const boundary = city.mesh.faces.f0.boundary;
    city.featureGroups = [-1, 1].map((side, i) => ({
      id: `gc:road-${i}`,
      name: "Road",
      kind: "road",
      locked: false,
      style: { widthMeters: 4 },
      segments: boundary.filter(ref => {
        const edge = city.mesh.edges[ref.edgeId],
          a = city.mesh.vertices[edge.a].point,
          b = city.mesh.vertices[edge.b].point;
        return a[1] * side > 0 && b[1] * side > 0;
      })
    }));
    const result = finishCityGeometry(city);
    const width = minimumCellWidth(facePoints(result.mesh, result.mesh.faces.f0));
    expect(width).toBeLessThan(14);
    expect(width).toBeGreaterThanOrEqual(roadCellHousingWidth(4, 4) - 1e-6);
    expect(validate(result)).toEqual([]);
  });
  it("retains a strip wide enough for housing", () => {
    const city = fixture(20);
    expect(consolidateThinRoadCells(city).document).toBe(city);
    expect(minimumCellWidth(facePoints(city.mesh, city.mesh.faces.f4))).toBe(20);
    expect(roadCellHousingWidth(4, 4)).toBeCloseTo(7.2);
  });
  it.each(["locked", "manual", "preserved", "facility"])("protects %s roads and destinations", protection => {
    const city = fixture();
    if (protection === "locked") city.featureGroups[0].locked = true;
    if (protection === "manual") city.featureGroups[0].id = "manual-road";
    if (protection === "facility") city.mesh.faces.f4.properties.ward = "market";
    const result = consolidateThinRoadCells(city, protection === "preserved" ? new Set(["gc:road-16"]) : undefined);
    expect(result.document).toBe(city);
  });
});

it("does not classify compact housing cells as slivers by area/perimeter alone", () => {
  const points: Point[] = [
    [0, 0],
    [8, 0],
    [8, 8],
    [0, 8]
  ];
  expect(roadCellEffectiveWidth(points)).toBe(8);
  expect(
    roadCellEffectiveWidth([
      [0, 0],
      [80, 0],
      [80, 3],
      [0, 3]
    ])
  ).toBeLessThan(3);
});
