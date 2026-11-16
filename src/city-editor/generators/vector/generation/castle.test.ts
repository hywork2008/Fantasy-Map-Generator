import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { CASTLE_FEATURE_ID, CASTLE_SITE_ID } from "./castle";
import { vectorCastleChoice } from "./castleChoice";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function city(seed: string, moat = false) {
  const settings = {
    ...defaultGenerationSettings(),
    population: defaultPopulationSettings(5000),
    historicalPeriod: "highMedieval" as const,
    moats: { castle: moat }
  };
  settings.config = { ...settings.config, features: { ...settings.config.features, citadel: true } };
  const wall = vectorWallChoice(settings, seed, "highMedieval"),
    skeleton = generateVectorSkeleton(vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }), {
      ...DEFAULT_VECTOR_GENERATION,
      seed,
      ...wall
    });
  return {
    wall,
    skeleton,
    urban: generateVectorUrban(skeleton.document, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 })
  };
}

describe("meshless castle from the mesh editor's citadel settings (feature parity P4e)", () => {
  it("reads the citadel, castle settings and castle moat", () => {
    const base = defaultGenerationSettings();
    expect(vectorCastleChoice(base)).toBeUndefined();
    base.config.features.citadel = true;
    expect(
      vectorCastleChoice({
        ...base,
        moats: { castle: true },
        castle: { position: "edge", relationship: "auto", form: "auto", size: "small" }
      })
    ).toEqual({
      position: "edge",
      size: "small",
      moat: true
    });
  });

  it("raises a walled castle with a gate inside the town and keeps the town housed", () => {
    const { wall, skeleton, urban } = city("k2", true),
      castle = urban.environment!.features[CASTLE_FEATURE_ID];
    expect(wall.castle).toBeDefined();
    expect(urban.regions[CASTLE_SITE_ID]).toBeUndefined();
    expect(castle.kind).toBe("castle");
    expect(urban.paths[`${CASTLE_FEATURE_ID}:curtain`].role).toBe("wall");
    expect(urban.paths[`${CASTLE_FEATURE_ID}:moat`].role).toBe("river");
    expect(Object.values(urban.connections.gates).some(g => g.wallPathId === `${CASTLE_FEATURE_ID}:curtain`)).toBe(
      true
    );
    expect(castle.pieces.filter(p => p.role === "structure").length).toBeGreaterThan(0);
    // The castle's paths are generation output, so a new generation removes it with them.
    for (const id of castle.pathIds) expect(skeleton.document.generation!.pathRevisions[id]).toBe(0);
    expect(urban.urban!.report.unplacedPopulation).toBe(0);
  });
});
