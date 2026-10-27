import { expect, it } from "vitest";
import { ProcessingProfiler } from "../../utils/processingProfiler";
import inputs from "../data/fixtures/nidyia-waterfront-20261027.json";
import { cityFingerprint } from "../services/analysis/cityGenerationPerformance";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { buildBlockFabric } from "./blockInfill";
import { generateCityOnDocument } from "./generation/generateCity";
import { validate } from "./mesh";
import { explainGeneratedCrossingFailures } from "./passages";
import { measureHousingCapacity } from "./residentialCapacity";
import { documentWaterTest } from "./waterGeometry";

it.each(Object.entries(inputs))(
  "reserves enough dry low-rise housing for Nidyia burg %s in one fabric pass",
  (_id, input) => {
    const share = parseIncomingPayload(JSON.stringify(input))!;
    const profiler = new ProcessingProfiler();
    const corrections: number[] = [];
    const city = generateCityOnDocument(
      cityEditorDocument(share),
      cityEditorSettings(share),
      share.seed,
      sample => {
        if (sample.counts?.housingAreaPass) corrections.push(sample.counts.housingAreaPass);
      },
      undefined,
      profiler
    )!;
    expect(city).toBeTruthy();
    expect(profiler.snapshot().find(t => t.path === "initial-fabric")?.calls).toBe(1);
    expect(corrections).toEqual([]);
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
