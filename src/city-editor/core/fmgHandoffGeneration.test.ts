import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import inputs from "./fixtures/vilealand-fmg-handoff-20261004.json";
import { validateFortifications } from "./fortifications";
import { polygonArea } from "./gen/geom";
import { importedRoadsForSite } from "./gen/site/importedRoads";
import { countExternalApproachRoads, generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { validate } from "./mesh";
import { explainGeneratedCrossingFailures } from "./passages";

// Exact handoffs exported from Vilealand 2026-10-04-15-32.fmg, without
// modifying roads, water, seed, population or the castle requirement.
describe("Vilealand FMG handoff regression", () => {
  it.each(Object.entries(inputs))(
    "generates burg %s with every original entrance",
    (_id, row) => {
      const share = parseIncomingPayload(row.share_json)!;
      const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {});
      expect(city).toBeTruthy();
      if (!city) return;
      const expected = importedRoadsForSite(share.descriptor!)
        .map(road => road.sourceIndex)
        .sort();
      const actual = city.featureGroups
        .filter(g => g.kind === "road" && g.sourceRoad)
        .map(g => g.sourceRoad!.index)
        .sort();
      expect(actual).toEqual(expected);
      expect(countExternalApproachRoads(city)).toBe(expected.length);
      expect(validate(city)).toEqual([]);
      expect(validateFortifications(city)).toEqual([]);
      expect(explainGeneratedCrossingFailures(city)).toEqual([]);
      for (const castle of city.castles ?? [])
        for (const part of castle.parts) expect(Math.abs(polygonArea(part.footprint))).toBeGreaterThanOrEqual(20);
      if (row.burg_id === "304") {
        expect(city.castles).toHaveLength(1);
        expect(city.featureGroups.some(g => g.kind === "road" && g.id === `${city.castles![0].id}:approach`)).toBe(
          true
        );
      }
    },
    60000
  );
});
