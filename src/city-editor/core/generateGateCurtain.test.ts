import { expect, it } from "vitest";
import fixture from "./fixtures/gate-curtain-20261002.json";
import { pointInPolygon, polygonCentroid } from "./gen/geom";
import { completeRoadRouter } from "./generate";
import { formatGenerationFailureLog, type RoadRoutingTrace } from "./generationDiagnostics";
import { meshFromCells } from "./mesh";
import { kindEdgeIds, vertexHasCrossing } from "./passages";
import type { CityDocument, Point } from "./types";

it("routes a gate outside the current curtain despite stale urban membership", () => {
  const mesh = meshFromCells(
    fixture.faces.map((face, id) => {
      const polygon = face.polygon as Point[];
      const center = polygonCentroid(polygon);
      return { id, polygon, centroid: center, site: center, neighbors: [], onBorder: false };
    })
  );
  const nearest = (point: Point, allowed?: Set<string>) =>
    Object.values(mesh.vertices)
      .filter(v => !allowed || allowed.has(v.id))
      .sort(
        (a, b) =>
          Math.hypot(a.point[0] - point[0], a.point[1] - point[1]) -
          Math.hypot(b.point[0] - point[0], b.point[1] - point[1])
      )[0]?.id ?? null;
  const edgeId = (id: string) => {
    const [a, b] = fixture.edges[id as keyof typeof fixture.edges];
    const va = nearest(a as Point),
      vb = nearest(b as Point);
    return Object.values(mesh.edges).find(e => [e.a, e.b].includes(va!) && [e.a, e.b].includes(vb!))!.id;
  };
  const gate = nearest(fixture.gate as Point)!;
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 600, cityRadiusMeters: 198, blockSizeMeters: 50 },
    mesh,
    gates: [{ id: "gc:gate-0", vertexId: gate }],
    elements: [],
    featureGroups: fixture.features.map((feature, index) =>
      feature.kind === "river"
        ? {
            id: `gc:river-${index}`,
            kind: "river",
            style: { widthMeters: 10.84 },
            vertices: []
          }
        : {
            id: `gc:wall-${index}`,
            kind: "wall",
            style: { widthMeters: 7 },
            segments: feature.edges.map(id => ({ edgeId: edgeId(id), forward: true }))
          }
    )
  };
  // Reconstruct the river in its exported frame-to-frame order (mesh edge
  // directions do not necessarily follow the feature direction).
  const river = document.featureGroups.find(g => g.kind === "river")!;
  const original = fixture.features.find(g => g.kind === "river")!.edges;
  const start = [-28.41704970434928, 300] as Point;
  river.vertices = [nearest(start)!];
  for (const id of original) {
    const edge = mesh.edges[edgeId(id)];
    river.vertices.push(edge.a === river.vertices.at(-1) ? edge.b : edge.a);
  }
  const faces = Object.keys(mesh.faces);
  const wallEdges = new Set(kindEdgeIds(document, "wall"));
  const firstWall = mesh.edges[[...wallEdges][0]];
  const ring = [firstWall.a, firstWall.b];
  wallEdges.delete(firstWall.id);
  while (wallEdges.size) {
    const next = [...wallEdges].map(id => mesh.edges[id]).find(edge => [edge.a, edge.b].includes(ring.at(-1)!))!;
    wallEdges.delete(next.id);
    ring.push(next.a === ring.at(-1) ? next.b : next.a);
  }
  const polygon = ring.map(id => mesh.vertices[id].point);
  // Retain just the two exterior faces at the gate as stale planned urban
  // cells; the other faces use the actual curtain, isolating the regression.
  const urban = new Set(
    fixture.faces.flatMap((f, i) =>
      ["f40", "f118"].includes(f.id) || pointInPolygon(polygonCentroid(f.polygon as Point[]), polygon) ? [i] : []
    )
  );
  const plan = { urban, gates: [{ point: fixture.gate }], precincts: [], avoidSea: true } as unknown as Parameters<
    typeof completeRoadRouter
  >[1];
  const router = completeRoadRouter(
    document,
    plan,
    faces,
    nearest,
    new Set([...kindEdgeIds(document, "wall"), ...kindEdgeIds(document, "river")])
  );
  const exterior = router([[-135.62787801211783, -300], fixture.gate as Point], true);
  expect(exterior.length).toBeGreaterThan(0);
  expect(exterior.at(-1)?.edgeId).toBe(edgeId("e91"));
  const first = mesh.edges[exterior[0].edgeId];
  expect(mesh.vertices[exterior[0].forward ? first.a : first.b].point.some(v => Math.abs(v) === 300)).toBe(true);
  let trace: RoadRoutingTrace | undefined;
  const blockedRouter = completeRoadRouter(
    document,
    plan,
    faces,
    nearest,
    new Set([...kindEdgeIds(document, "wall"), ...kindEdgeIds(document, "river"), edgeId("e91")]),
    false,
    [],
    new Map([[edgeId("e91"), ["temple: 寺院の身廊"]]])
  );
  expect(
    blockedRouter([[-135.62787801211783, -300], fixture.gate as Point], true, false, diagnostic => {
      trace = diagnostic;
    })
  ).toEqual([]);
  expect(trace!.status).toBe("failed");
  expect(trace!.waypoints.at(-1)).toBe(gate);
  expect(trace!.searches.length).toBeGreaterThan(1);
  expect(trace!.searches.every(search => search.end === gate)).toBe(true);
  expect(trace!.searches.some(search => search.partialEdges.length > 0)).toBe(true);
  expect(trace!.searches.some(search => search.classification === "current-curtain")).toBe(true);
  expect(trace!.searches.flatMap(search => search.blocked)).toContainEqual(
    expect.objectContaining({
      edge: edgeId("e91"),
      to: gate,
      reason: "temple: 寺院の身廊"
    })
  );
  const log = formatGenerationFailureLog([
    {
      phase: "gate-routing",
      attempt: 1,
      elapsedMs: 0,
      failure: { reason: "unconnected-gates", message: "門が未接続", routing: [trace!] }
    }
  ]);
  expect(log).toContain(`終点=${gate}`);
  expect(log).toContain("最も終点に近づいた経路");
  expect(log).toContain("寺院の身廊");
  document.featureGroups.push({
    id: "test:approach",
    kind: "road",
    style: { widthMeters: 3.5 },
    segments: [...exterior, { edgeId: edgeId("e88"), forward: true }]
  });
  expect(vertexHasCrossing(document, gate, "wall", "road")).toBe(true);
  expect(Object.keys(mesh.faces)).toHaveLength(fixture.faces.length);
  // The suggested left-hand route crosses a real river passage, too.
  document.featureGroups.push({
    id: "test:road",
    kind: "road",
    style: { widthMeters: 3.5 },
    segments: ["e135", "e360"].map(id => ({ edgeId: edgeId(id), forward: true }))
  });
  expect(vertexHasCrossing(document, nearest([-91.60995571336184, -140.37582765599984])!, "river", "road")).toBe(true);
});
