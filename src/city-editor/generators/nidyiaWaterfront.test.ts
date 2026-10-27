import { expect, it } from "vitest";
import { ProcessingProfiler } from "../../utils/processingProfiler";
import inputs from "../data/fixtures/nidyia-waterfront-20261027.json";
import { cityFingerprint } from "../services/analysis/cityGenerationPerformance";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { buildBlockFabric } from "./blockInfill";
import { townGates } from "./fortifications";
import { hasStraightBridgeLead } from "./frameRoads";
import { generateCityOnDocument } from "./generation/generateCity";
import { frameRoadTownConnection } from "./generation/routing/frameRoadConnection";
import { nearestOnPolyline } from "./geom";
import { validate } from "./mesh";
import { explainGeneratedCrossingFailures } from "./passages";
import { measureHousingCapacity } from "./residentialCapacity";
import { clipSurveyedRiverWalls } from "./surveyedRiverWalls";
import { documentWaterTest } from "./waterGeometry";

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
    expect(profiler.snapshot().find(t => t.path === "initial-fabric")?.calls).toBeLessThanOrEqual(_id === "13" ? 2 : 1);
    expect(corrections.length).toBeLessThanOrEqual(_id === "13" ? 1 : 0);
    expect(failures).toEqual([]);
    if (_id === "13") {
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
    if (_id === "93") {
      const recipe = city.fabric!.generation!;
      const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
      expect(cityFingerprint(replay)).toEqual(cityFingerprint(city));
    }
  },
  30000
);
