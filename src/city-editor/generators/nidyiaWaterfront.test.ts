import { expect, it } from "vitest";
import { ProcessingProfiler } from "../../utils/processingProfiler";
import inputs from "../data/fixtures/nidyia-waterfront-20261027.json";
import { cityFingerprint } from "../services/analysis/cityGenerationPerformance";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import type { CityDocument, Id } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { oceanShoreSegments } from "./coastalSuitability";
import { townGates } from "./fortifications";
import { hasStraightBridgeLead } from "./frameRoads";
import { generateCityOnDocument } from "./generation/generateCity";
import { generateStageOnDocument } from "./generation/previews";
import { frameRoadTownConnection } from "./generation/routing/frameRoadConnection";
import { nearestOnPolyline } from "./geom";
import { validate } from "./mesh";
import { explainGeneratedCrossingFailures } from "./passages";
import { measureHousingCapacity } from "./residentialCapacity";
import { clipSurveyedRiverWalls } from "./surveyedRiverWalls";
import { documentWaterTest } from "./waterGeometry";

function expectNobraCurtainConnectedToSea(city: CityDocument): void {
  const edges = new Set(
    city.featureGroups
      .filter(g => g.kind === "wall" && g.id.startsWith("gc:wall-"))
      .flatMap(g => (g.kind === "wall" ? g.segments.map(ref => ref.edgeId) : []))
  );
  expect(edges.size).toBeGreaterThan(0);
  const remaining = new Set(edges);
  const vertices = new Set<Id>();
  const queue = [remaining.values().next().value!];
  remaining.delete(queue[0]);
  for (let i = 0; i < queue.length; i++) {
    const edge = city.mesh.edges[queue[i]];
    vertices.add(edge.a);
    vertices.add(edge.b);
    for (const id of remaining) {
      const candidate = city.mesh.edges[id];
      if (vertices.has(candidate.a) || vertices.has(candidate.b)) {
        remaining.delete(id);
        queue.push(id);
      }
    }
  }
  expect(remaining.size).toBe(0);
  const degrees = new Map<Id, number>();
  for (const id of edges) {
    const edge = city.mesh.edges[id];
    for (const vertex of [edge.a, edge.b]) degrees.set(vertex, (degrees.get(vertex) ?? 0) + 1);
  }
  const shores = oceanShoreSegments(city);
  expect(shores.length).toBeGreaterThan(0);
  expect(
    [...degrees].some(
      ([id, degree]) =>
        degree === 1 && shores.some(shore => nearestOnPolyline(city.mesh.vertices[id].point, shore).dist < 1e-6)
    )
  ).toBe(true);
}

it.each(Object.entries(inputs))(
  "preserves dry housing and usable waterfront approaches for Nidyia burg %s",
  (_id, input) => {
    const share = parseIncomingPayload(JSON.stringify(input))!;
    const profiler = new ProcessingProfiler();
    const corrections: number[] = [];
    const failures: string[] = [];
    const city = generateCityOnDocument(
      cityEditorDocument(share),
      cityEditorSettings(share),
      share.seed,
      sample => {
        if (sample.failure) failures.push(sample.failure.reason);
        if (sample.counts?.housingAreaPass) corrections.push(sample.counts.housingAreaPass);
      },
      undefined,
      profiler
    )!;
    expect(city).toBeTruthy();
    expect(profiler.snapshot().find(t => t.path === "initial-fabric")?.calls).toBe(1);
    expect(corrections).toEqual([]);
    expect(failures).toEqual([]);
    if (_id === "13") {
      expectNobraCurtainConnectedToSea(city);
      const stage = generateStageOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, 5)!;
      expect(stage).toBeTruthy();
      expectNobraCurtainConnectedToSea(stage);
      expect(clipSurveyedRiverWalls(city, true).featureGroups).toEqual(city.featureGroups);
      const shores = [
        ...share.descriptor!.fixedCrossings!.rivers.flatMap(river =>
          river.rings.map(ring => [...ring.map(p => [...p] as [number, number]), [...ring[0]] as [number, number]])
        ),
        ...(share.descriptor!.waterbody?.shoreline ?? []).map(line => line.map(p => [...p] as [number, number]))
      ];
      for (const gate of townGates(city)) {
        const point = city.mesh.vertices[gate.vertexId].point;
        expect(Math.min(...shores.map(shore => nearestOnPolyline(point, shore).dist))).toBeGreaterThan(24);
      }
      for (const leg of city.frameRoads ?? []) {
        expect(hasStraightBridgeLead(leg)).toBe(true);
        expect(frameRoadTownConnection(city, leg)).not.toBeNull();
      }
    }
    expect(validate(city)).toEqual([]);
    expect(explainGeneratedCrossingFailures(city)).toEqual([]);
    const lots = buildBlockFabric(city).buildings;
    const housing = measureHousingCapacity(city, lots, share.descriptor!.burg.dwellings);
    expect(housing.unplacedDwellings).toBe(0);
    expect(housing.assignedOutside).toBeLessThanOrEqual(housing.outsideCap);
    const hitsWater = documentWaterTest(city);
    expect(lots.filter(lot => hitsWater(lot.polygon))).toEqual([]);
    expect(city.importedFixedCrossings?.rivers).toEqual(share.descriptor!.fixedCrossings!.rivers);
    const recipe = city.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
    expect(cityFingerprint(replay)).toEqual(cityFingerprint(city));
  },
  30000
);
