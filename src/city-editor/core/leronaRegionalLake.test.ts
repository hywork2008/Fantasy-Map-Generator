import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/lerona-20261010.json";
import { pointInPolygon } from "./gen/geom";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { regionalCoastalWaterPolygons } from "./regionalCoast";

// Lerona: a lake port whose FMG shore crosses the whole frame north of town.
// Only ocean shores used to close into regional water, so the frame beyond the
// mesh fell back to the burg's biome and showed land across the open lake.
describe("Lerona (lake shore across the frame)", () => {
  it("carries the lake out to the frame beyond the mesh", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;
    expect(city).not.toBeNull();
    const h = input.descriptor.frame.extentMeters / 2 - 5;
    const wet = (point: [number, number]) =>
      regionalCoastalWaterPolygons(city).some(poly => pointInPolygon(point, poly));
    // Local Y is north-positive: the lake fills the northern frame corners.
    expect(wet([-h, h])).toBe(true);
    expect(wet([h, h])).toBe(true);
    expect(wet([0, -h])).toBe(false);
  }, 120000);
});
