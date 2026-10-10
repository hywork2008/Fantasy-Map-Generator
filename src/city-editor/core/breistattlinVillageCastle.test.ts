import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/breistattlin-20261009.json";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

// Breistattlin: an FMG village (243 people, 54 dwellings) with walls and a
// citadel but no plaza; ten urban cells. The face-graph C4 test accepted a
// tiny keep in the middle, leaving only a one-cell ring that the street
// router (rim and castle clearances) could not use, so both gate streets
// failed in all eight attempts. After the first unconnected-gates rejection
// the street-level C4 sends the castle to the wall line instead.
describe("Breistattlin (walled village with a citadel)", () => {
  it("keeps the castle off the only street ring and connects both gates", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed);
    expect(city).not.toBeNull();
    expect(city!.castles).toHaveLength(1);
    expect(city!.castles![0]).toMatchObject({ position: "edge", relationship: "integrated" });
  }, 120000);
});
