import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { PlotFabric } from "../../../types/contracts/burgage";
import type { VectorCityDocument } from "../../../types/vector/document";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { unpackPoints } from "../fabric/pack";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

/** A walled town of 1,000 people without a river, on compact lots or burgage plots. */
function town(plotFabric: PlotFabric): VectorCityDocument {
  const seed = "burgage-plots",
    settings = { ...defaultGenerationSettings(), wallShape: "polygon" as const, plotFabric };
  settings.config = {
    ...settings.config,
    rivers: [],
    features: { ...settings.config.features, walls: true, port: false, shanty: false }
  };
  settings.population = defaultPopulationSettings(1000);
  const input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 800, cityRadiusMeters: 200, blockSizeMeters: 50 },
      lotOccupancy: 1
    }),
    wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
    skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
  return generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 1000, plotFabric });
}

const rings = (coords: number[], offsets: number[], origin: [number, number]) =>
  offsets.map((start, i) => unpackPoints(coords, origin, start, offsets[i + 1] ?? coords.length / 2));

describe("burgage plots in the meshless CE (docs/plan/ce-burgage-plot-fabric.md B2)", () => {
  it("houses everyone on plots recorded with their street blocks, and keeps them through a save", () => {
    const doc = town("burgage");
    expect(doc.urban!.algorithm).toBe("vector-urban-v19");
    expect(doc.fabric!.algorithm).toBe("vector-urban-v19");
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    const cells = Object.values(doc.fabric!.cells).filter(c => c.houses.offsets.length);
    expect(cells.length).toBeGreaterThan(5);
    for (const cell of cells) {
      expect(cell.plots?.offsets.length).toBeGreaterThan(0);
      const plots = rings(cell.plots!.coords, cell.plots!.offsets, cell.origin);
      // Every house stands at the front of one of its street block's plots.
      for (const house of rings(cell.houses.coords, cell.houses.offsets, cell.origin))
        expect(plots.some(plot => pointInPolygon(polygonCentroid(house), plot))).toBe(true);
    }
    const saved = parseVectorDocument(serializeVectorDocument(doc));
    expect(saved?.fabric).toEqual(doc.fabric);
  });

  it("leaves compact street blocks as they were", () => {
    const doc = town("compact");
    expect(doc.fabric!.algorithm).toBe("vector-urban-v18");
    expect(Object.values(doc.fabric!.cells).some(c => c.plots)).toBe(false);
  });
});
