import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/aute-20261009.json";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

// Aute: an FMG fort (62 dwellings, 54 m radius) with a citadel. Its whole
// urban area (~10 000 m², ten cells) is smaller than a "small" castle with its
// clearances, so every attempt failed with castle-no-site before streets.
describe("Aute (fort hamlet with a citadel)", () => {
  it("steps the castle down to a tiny keep and generates the town", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed);
    expect(city).not.toBeNull();
    expect(city!.castles?.length ?? 0).toBeGreaterThan(0);
  }, 120000);
});
