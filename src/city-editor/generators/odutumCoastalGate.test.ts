import { describe, expect, it } from "vitest";
import input from "../data/fixtures/odutum-20261010.json";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { generateCityOnDocument } from "./generation/generateCity";

// Odutum (large frame, 1827 people): the east gate's only outer arm ran along
// the river bank, too close to the water for a road, and the ferry landing lay
// a few metres from the burg centre. Every attempt used to be rejected.
describe("Odutum (bank-side gate and a ferry landing at the market)", () => {
  it("connects every FMG road on the first attempt", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed);
    expect(city).not.toBeNull();
    expect(city!.generationSeed).toBe(value.seed);
    const routes = city!.featureGroups.flatMap(g => (g.kind === "road" && g.sourceRoad ? [g.sourceRoad.routeId] : []));
    expect(routes.sort((a, b) => a - b)).toEqual([7, 9, 506]);
  }, 120000);
});
