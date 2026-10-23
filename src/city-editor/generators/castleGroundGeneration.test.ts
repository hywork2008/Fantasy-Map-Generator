import { describe, expect, it } from "vitest";
import input from "../data/fixtures/aute-20261009.json";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { generateCityOnDocument } from "./generation/generateCity";

// Aute: an FMG fort hamlet with a citadel (see auteTinyCastle.test.ts).
describe("castle ground requested in the generation settings", () => {
  it("raises the generated castle on a cliff platform with a ramp, kept in the recipe", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const settings = cityEditorSettings(value);
    settings.castle = { ...settings.castle, ground: "cliff", groundRiseMeters: 10 };
    const city = generateCityOnDocument(cityEditorDocument(value), settings, value.seed)!;
    expect(city).not.toBeNull();
    const castle = city.castles![0];
    const platform = city.terrain!.features.find(feature => feature.ownerId === castle.id)!;
    expect(platform.edge).toEqual({ kind: "cliff" });
    expect(city.terrain!.ramps?.some(ramp => ramp.ownerId === castle.id)).toBe(true);
    expect(city.fabric?.generation?.settings.castle?.ground).toBe("cliff");
  }, 120000);
});
