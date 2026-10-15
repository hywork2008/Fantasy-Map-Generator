import { describe, expect, it } from "vitest";
import fixture from "../data/fixtures/inner-wall-gate-routing-20261015.json";
import { decodeShare } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import { townCircuits } from "./fortifications";
import { generateCityOnDocument, generationInputKey } from "./generation/generateCity";
import { generateStageOnDocument } from "./generation/previews";
import { validate } from "./mesh";
import { preparePopulationGeneration } from "./populationGeneration";
import { auditTownDefenseClosure } from "./townDefenseClosure";

describe("reported inner-wall gate-routing failure", () => {
  it.each([false, true])("keeps both curtains from the exact shared input (matching fallback cache=%s)", cached => {
    const share = decodeShare(fixture.token)!;
    const input = cityEditorDocument(share);
    const settings = cityEditorSettings(share);
    const before = JSON.stringify(input);
    if (cached) {
      const prepared = preparePopulationGeneration(input, settings, share.seed);
      settings.generationRetry = {
        ...settings.generationRetry!,
        inputKey: generationInputKey(prepared.document, prepared.settings)
      };
    }
    const stage = generateStageOnDocument(input, settings, share.seed, 7, undefined, "innerWall")!;
    expect(townCircuits(stage).map(c => c.ring)).toEqual([0, 1]);
    const samples: GenerationSample[] = [];
    const city = generateCityOnDocument(input, settings, share.seed, sample => samples.push(sample));
    expect(city).not.toBeNull();
    expect(townCircuits(city!).map(c => c.ring)).toEqual([0, 1]);
    expect(samples.filter(s => s.failure)).toEqual([]);
    expect(Math.min(...samples.map(s => s.attempt))).toBe(1);
    expect(validate(city!)).toEqual([]);
    for (const circuit of townCircuits(city!))
      expect(auditTownDefenseClosure(city!, circuit.id, true)).toMatchObject({ ok: true, unreachableGates: [] });
    expect(JSON.stringify(input)).toBe(before);
  });
});
