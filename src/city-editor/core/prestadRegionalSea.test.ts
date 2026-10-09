import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/prestad-20261010.json";
import { pointInPolygon } from "./gen/geom";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { regionalCoastalWaterPolygons } from "./regionalCoast";

// Prestad: the town mesh's farthest vertex reaches the display frame, but the
// rounded mesh leaves the frame's seaward corners uncovered. FMG has open sea
// there; the corners must not fall back to the burg's biome as phantom land.
describe("Prestad (mesh touches the frame, corners are open sea)", () => {
  it("carries the regional sea into the uncovered frame corners", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;
    expect(city.regionalWaterAreas?.length).toBeGreaterThan(0);
    const sea = regionalCoastalWaterPolygons(city);
    const h = city.frame.extentMeters / 2 - 5;
    // Bottom-left and bottom-right corners (local Y north-positive).
    for (const corner of [
      [-h + 60, -h],
      [h, -h]
    ] as [number, number][])
      expect(sea.some(poly => pointInPolygon(corner, poly))).toBe(true);
  }, 120000);
});
