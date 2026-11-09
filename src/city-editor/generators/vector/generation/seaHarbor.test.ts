import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { validateVectorHarbor } from "../harbor";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { GENERATED_HARBOR_ID } from "./seaHarbor";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };

describe("generated sea harbour (feature parity P5b)", () => {
  it("raises quays, a crane quay, piers and moored ships on an unwalled bay town", () => {
    const seed = "w1",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "bay",
      rivers: [],
      features: { ...settings.config.features, port: true, walls: false }
    };
    const doc = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "ageOfExploration");
    expect(wall.port).toBe(true);
    const skeleton = generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      harbor = skeleton.environment?.harbor;
    expect(harbor?.id).toBe(GENERATED_HARBOR_ID);
    expect(validateVectorHarbor(skeleton)).toEqual([]);
    expect(harbor!.spaces.some(s => s.kind === "quay")).toBe(true);
    expect(harbor!.piers.length).toBeGreaterThan(0);
    expect(harbor!.quays.length).toBeGreaterThan(0);
    expect(harbor!.ships.some(s => s.cargo)).toBe(true);
    expect(harbor!.accesses.length).toBeGreaterThan(0);
    // The houses keep off the harbour and the whole town is housed.
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.environment?.harbor).toEqual(harbor);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
