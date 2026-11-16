import { describe, expect, it } from "vitest";
import { polygonOverlaps } from "../../fortifications";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";

const frame = { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 };
describe("civic furniture of a Christian town (B6b)", () => {
  it.each([
    [600, "pillory-and-stocks"],
    [2000, "market-cross-stepped"],
    [5000, "market-cross-canopied"]
  ] as const)("a town of %i gets %s on its square and a churchyard cross and lych-gate", (population, square) => {
    const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(population),
      historicalPeriod: "lateMedieval" as const,
      buildingPattern: "medieval" as const
    };
    const doc = generateVectorSkeleton(vectorInputFromEditor({ settings, seed: "b6b", frame, lotOccupancy: 1 }), {
      ...DEFAULT_VECTOR_GENERATION,
      seed: "b6b",
      wall: "ellipse"
    }).document;
    const plaza = doc.environment!.features["feature:civic-plaza"],
      yard = doc.environment!.landscape!.cemeteries[0],
      pieces = {
        square: doc.placements["civic:plaza-furniture"],
        gate: doc.placements["civic:churchyard-gate"],
        cross: doc.placements["civic:churchyard-cross"]
      };
    expect(pieces.square.modelId).toBe(square);
    expect(pieces.gate.modelId).toBe("lych-gate");
    expect(pieces.cross.modelId).toBe("churchyard-cross");
    expect(pieces.square.site.outer.every(p => pointInPolygon(p, plaza.boundary.outer))).toBe(true);
    for (const piece of [pieces.gate, pieces.cross])
      expect(piece.site.outer.every(p => pointInPolygon(p, yard.boundary))).toBe(true);
    // Each stands clear of every other placement: stalls, the church, each other.
    for (const piece of Object.values(pieces))
      for (const other of Object.values(doc.placements))
        if (other.id !== piece.id) expect(polygonOverlaps(piece.site.outer, other.site.outer), other.id).toBe(false);
  });
});
