import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { polygonArea } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { validateVectorUrban } from "../validation/urban";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { streetBlockOf } from "./wards";

describe("park wards laid out by the mesh editor's park fabric (feature parity P7c)", () => {
  const build = (wall: "ellipse" | "none", seed: string) => {
    const settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(3000),
        historicalPeriod: "lateMedieval" as const,
        buildingPattern: "medieval" as const
      },
      input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      });
    return generateVectorUrban(generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall }).document, {
      ...DEFAULT_VECTOR_URBAN,
      population: 3000,
      lotOccupancy: 1
    });
  };
  it("turns each park ward into a lawn with no house, trees kept off the wall", () => {
    const doc = build("ellipse", "p7c-c"),
      parkBlocks = new Set(doc.urban!.districts.filter(d => d.ward === "park").map(d => streetBlockOf(d.id))),
      parks = doc.urban!.parks ?? [];
    expect(parkBlocks.size).toBeGreaterThan(0);
    // This town houses everyone without its park blocks, so each stays a park.
    expect(new Set(parks.map(p => p.id))).toEqual(parkBlocks);
    expect(validateVectorUrban(doc)).toEqual([]);
    const walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => samplePath(p).map(s => s.point));
    for (const park of parks) {
      const cell = doc.fabric?.cells[park.id];
      expect(cell ? cell.houses.offsets.length - cell.detached.length : 0).toBe(0);
      for (const t of park.trees) {
        for (const line of walls)
          for (let i = 1; i < line.length; i++)
            expect(pointSegmentDistance(t.center, line[i - 1], line[i])).toBeGreaterThanOrEqual(11 - 1e-6);
      }
    }
    // A small park along the wall stays a bare esplanade, as the mesh editor leaves it.
    for (const park of parks)
      if (
        park.lawns.reduce((n, l) => n + Math.abs(polygonArea(l)), 0) < 600 &&
        park.lawns
          .flat()
          .some(q => walls.some(line => line.slice(1).some((b, i) => pointSegmentDistance(q, line[i], b) < 15)))
      )
        expect(park.trees).toEqual([]);
    expect(parks.some(p => p.trees.length > 0)).toBe(true);
    expect(doc.urban!.report.unplacedPopulation).toBe(0);
  });
});
